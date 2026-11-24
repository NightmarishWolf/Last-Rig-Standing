// The world around the players: oil spills, world events (weather, economy, pirates and the rogue
// sub) and Polar maps' pack ice. Everything here is part of the game state and runs on the seeded dice,
// so every copy of a game (online, replays) sees the same storms and the same pirates.
//
//   st.spills = [{ id, x, y, r, left }]                       slicks (square-ish: within r squares)
//   st.events = { kinds, gap, next, pending, active: [...] }   world events (null when Off)
//   st.ice    = [0/1 per square]                              pack ice (Polar maps)
//   ships with owner NEUTRAL (-1)                             pirates and the rogue sub
//
// worldRound(st) runs once at the start of every round (turns.js nextTurn, actions.js endRound).
import { EVENTS, EVENT_MODES, EVENT_ORDER, EVENT_TUNING, FIRST_EVENT_ROUND, SPILLS } from '../data/events.js';
import { DEPOSITS } from '../data/economy.js';
import { SHIPS } from '../data/ships.js';
import { cellsOf, coord, dist, inBounds, isLand, shipCells, zoneOf } from './geometry.js';
import { rand, randInt } from './rng.js';
import { alivePlayers, fail, log, ok, passives } from './util.js';
import { shipStat } from './modifiers.js';
import { findPath } from './pathfind.js';
import { resolveShot, sink } from './combat.js';

export const NEUTRAL = -1;
const NEUTRAL_NAMES = { pirates: 'the pirates', rogue: 'a rogue submarine' };
export const neutralName = st => NEUTRAL_NAMES[st.neutralKind] || 'pirates';
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const tellAll = (st, text, meta) => { for (const p of alivePlayers(st)) log(st, p, text, { k: 'world', ...meta }); };

// ---------- setting up ----------
// opts.events: 'off' | 'light' | 'chaotic' | { mode: 'custom', kinds: [...], pace: 'light' | 'chaotic' }
export function setupEvents(st, opts) {
  const e = opts && typeof opts === 'object' ? opts : { mode: opts || 'off' };
  if (!e.mode || e.mode === 'off') { st.events = null; return; }
  const kinds = e.mode === 'custom' ? EVENT_ORDER.filter(k => (e.kinds || []).includes(k)) : [...EVENT_ORDER];
  if (!kinds.length) { st.events = null; return; }
  const pace = e.mode === 'custom' ? (e.pace === 'chaotic' ? 'chaotic' : 'light') : e.mode;
  st.events = { mode: e.mode, kinds, gap: EVENT_MODES[pace].gap, next: FIRST_EVENT_ROUND + randInt(st, 0, 3), pending: null, active: [], fields: 0 };
}
export const eventActive = (st, kind) => (st.events?.active || []).filter(e => e.kind === kind);

// ---------- each round ----------
export function worldRound(st) {
  // slicks fade
  if (st.spills?.length) {
    for (const s of st.spills) {
      s.left--;
      // (Kade's Ignite: a slick set alight burns for a while, then goes back to plain oil)
      if (s.burnLeft != null && --s.burnLeft <= 0) { delete s.fire; delete s.by; delete s.burnLeft; }
    }
    st.spills = st.spills.filter(s => s.left > 0);
  }
  if (st.ice && st.round % 3 === 0) shiftIce(st);
  const ev = st.events;
  if (!ev) return;
  // events that have run their course
  for (const e of [...ev.active]) if (e.until != null && e.until < st.round) endEvent(st, e);
  // the event announced last round begins
  if (ev.pending && ev.pending.start <= st.round) { const e = ev.pending; ev.pending = null; startEvent(st, e); }
  // ongoing ones
  for (const e of [...ev.active]) {
    if (e.kind === 'storm') { e.x += e.dx; e.y += e.dy; }
    if (e.kind === 'pirates' || e.kind === 'rogue') neutralsAct(st, e);
    if (e.kind === 'field' && st.rigs.some(r => r.depId === e.depId)) endEvent(st, e);
  }
  // announce the next one
  if (!ev.pending && st.round >= ev.next) {
    const e = rollEvent(st);
    ev.next = st.round + randInt(st, ev.gap[0], ev.gap[1]);
    if (e) { ev.pending = e; tellAll(st, `📣 Next round: ${announce(st, e)}`); }
  }
}

function rollEvent(st) {
  const ev = st.events, busy = k => ev.active.some(e => e.kind === k);
  const can = ev.kinds.filter(k => {
    if (k === 'blowout') return st.rigs.some(r => r.owner >= 0);
    if (k === 'field') return ev.fields < 2 && !busy('field'); // (one at a time, two per game)
    return !busy(k);
  });
  if (!can.length) return null;
  const kind = can[Math.floor(rand(st) * can.length)];
  const e = { id: 'ev' + st.nextId++, kind, start: st.round + 1 };
  const { W, H } = st;
  if (kind === 'storm') {
    // in from one side, across the middle of the map
    const T = EVENT_TUNING.storm, side = randInt(st, 0, 3);
    const along = randInt(st, Math.round((side < 2 ? H : W) * 0.25), Math.round((side < 2 ? H : W) * 0.75));
    Object.assign(e, { r: T.r, until: e.start + T.rounds - 1,
      ...[{ x: -T.r + 2, y: along, dx: T.step, dy: 0 }, { x: W + T.r - 3, y: along, dx: -T.step, dy: 0 },
        { x: along, y: -T.r + 2, dx: 0, dy: T.step }, { x: along, y: H + T.r - 3, dx: 0, dy: -T.step }][side] });
    // big maps: a storm that crosses faster
    const span = side < 2 ? W : H;
    const step = Math.max(T.step, Math.round(span / (T.rounds + 1)));
    e.dx = Math.sign(e.dx) * (e.dx ? step : 0); e.dy = Math.sign(e.dy) * (e.dy ? step : 0);
  }
  if (kind === 'fogbank') {
    const T = EVENT_TUNING.fogbank, spot = waterSpot(st, (x, y) => zoneOf(st, x, y) === 'middle');
    if (!spot) return null;
    Object.assign(e, { ...spot, r: T.r, until: e.start + T.rounds - 1 });
  }
  if (kind === 'calm') e.until = e.start;
  if (kind === 'shock') { e.up = rand(st) < 0.5; e.until = e.start + 1; }
  if (kind === 'field') {
    // fair: the area (and the field) sits on the map's mirror line, the same distance from every home
    const spot = fieldSpot(st);
    if (!spot) return null;
    Object.assign(e, spot, { r: EVENT_TUNING.field.r });
  }
  if (kind === 'blowout') {
    // a random rig, the biggest producers most likely: pick a player by rig count, then one of their rigs
    const rigs = st.rigs.filter(r => r.owner >= 0 && !r.blowout);
    if (!rigs.length) return null;
    const r = rigs[Math.floor(rand(st) * rigs.length)];
    Object.assign(e, { rigId: r.id, owner: r.owner, x: r.x, y: r.y, until: e.start + EVENT_TUNING.blowout.rounds - 1 });
  }
  if (kind === 'pirates') {
    // near the richest player's rigs (by oil income), from the nearest open water outside their claims
    const income = p => st.rigs.filter(r => r.owner === p).length;
    const target = alivePlayers(st).sort((a, b) => income(b) - income(a))[0];
    const rigs = st.rigs.filter(r => r.owner === target);
    const rig = rigs[Math.floor(rand(st) * rigs.length)] || { x: Math.round(W / 2), y: Math.round(H / 2) };
    const spot = waterSpot(st, (x, y) => cheb({ x, y }, rig) >= 9 && cheb({ x, y }, rig) <= 14 && zoneOf(st, x, y) === 'middle' && !st.ships.some(s => cheb(s, { x, y }) < 6))
      || waterSpot(st, (x, y) => zoneOf(st, x, y) === 'middle');
    if (!spot) return null;
    Object.assign(e, { ...spot, target, until: e.start + EVENT_TUNING.pirates.rounds - 1 });
  }
  if (kind === 'rogue') {
    const spot = waterSpot(st, (x, y) => zoneOf(st, x, y) === 'middle' && !st.ships.some(s => cheb(s, { x, y }) < 5));
    if (!spot) return null;
    Object.assign(e, { ...spot, r: EVENT_TUNING.rogue.r, until: e.start + EVENT_TUNING.rogue.rounds - 1 });
  }
  return e;
}
function announce(st, e) {
  const where = e.x != null && inBounds(st, Math.max(0, Math.min(st.W - 1, e.x)), Math.max(0, Math.min(st.H - 1, e.y))) ? ` near ${coord(Math.max(0, Math.min(st.W - 1, e.x)), Math.max(0, Math.min(st.H - 1, e.y)))}` : '';
  switch (e.kind) {
    case 'storm': return `🌩️ a storm front is coming in from the ${e.dx > 0 ? 'west' : e.dx < 0 ? 'east' : e.dy > 0 ? 'north' : 'south'}. Ships in it move at half speed; no aircraft fly in it.`;
    case 'fogbank': return `🌫️ a fog bank is rolling in${where}. Nothing inside it sees further than 1 square.`;
    case 'calm': return '🌤️ flat calm: every ship gets +1 move.';
    case 'shock': return `📈 oil traders are nervous: expect the price to ${e.up ? 'jump' : 'crash'}.`;
    case 'field': return `💎 geologists report a super-rich oil field somewhere${where} (the marked area). Survey it to find the spot.`;
    case 'blowout': return `🔥 pressure is building under ${st.players[e.owner].name}'s rig at ${coord(e.x, e.y)}.`;
    case 'pirates': return `🏴‍☠️ pirates have been sighted${where}, near ${st.players[e.target]?.name || 'the oil fields'}'s rigs.`;
    case 'rogue': return `🦈 a rogue submarine is hunting${where}. It carries a big bounty.`;
    default: return EVENTS[e.kind]?.name || e.kind;
  }
}

function startEvent(st, e) {
  const ev = st.events;
  if (e.kind === 'shock') {
    const T = EVENT_TUNING.shock;
    st.market.price = Math.round(st.market.price * (e.up ? T.up : T.down) * 100) / 100;
    tellAll(st, `📈 Oil shock! The price ${e.up ? 'jumped' : 'crashed'} to $${st.market.price.toFixed(2)}. It will drift back over the next rounds.`);
  }
  if (e.kind === 'field') {
    const T = EVENT_TUNING.field;
    const dep = { id: 'd' + st.nextId++, x: e.fx, y: e.fy, type: 'super', reserves: randInt(st, T.reserves[0], T.reserves[1]) };
    dep.max = dep.reserves;
    st.deposits.push(dep);
    st.oilTotal = (st.oilTotal || 0) + dep.reserves;
    e.depId = dep.id; delete e.fx; delete e.fy;
    ev.fields++;
    tellAll(st, `💎 A super-rich oil field is somewhere in the marked area${e.x != null ? ` around ${coord(e.x, e.y)}` : ''}. Survey to find it!`, { x: e.x, y: e.y });
  }
  if (e.kind === 'blowout') {
    const rig = st.rigs.find(r => r.id === e.rigId);
    if (!rig) return;
    rig.blowout = true;
    log(st, rig.owner, `🔥 Blowout! Your rig at ${coord(rig.x, rig.y)} stopped pumping for ${EVENT_TUNING.blowout.rounds} rounds. Fix it now for $${EVENT_TUNING.blowout.fixCost} (select the rig's base, or the 🔥 button by your resources).`, { k: 'hit', x: rig.x, y: rig.y });
  }
  if (e.kind === 'pirates') {
    const T = EVENT_TUNING.pirates;
    e.ships = [];
    T.ships.forEach((type, i) => {
      const spot = nearSpot(st, type, e.x + (i % 2 ? 3 : -3) * Math.ceil(i / 2), e.y + (i % 2 ? 2 : -2));
      if (!spot) return;
      const s = neutralShip(st, type, spot, 'pirates');
      e.ships.push(s.id);
    });
    st.neutralKind = 'pirates';
    tellAll(st, `🏴‍☠️ Pirates! ${e.ships.length} pirate ships appeared around ${coord(e.x, e.y)}. Sinking one pays $${T.bounty}.`, { x: e.x, y: e.y });
  }
  if (e.kind === 'rogue') {
    const T = EVENT_TUNING.rogue, spot = nearSpot(st, 'submarine', e.x, e.y);
    if (!spot) return;
    const s = neutralShip(st, 'submarine', spot, 'rogue');
    s.hp = T.hp; s.maxHp = T.hp;
    e.ships = [s.id];
    tellAll(st, `🦈 A rogue submarine is loose around ${coord(e.x, e.y)}. Sinking it pays $${T.bounty}.`, { x: e.x, y: e.y });
  }
  if (e.kind === 'storm' || e.kind === 'fogbank' || e.kind === 'calm') tellAll(st, `${EVENTS[e.kind].icon} ${EVENTS[e.kind].name}${e.kind === 'calm' ? ': every ship gets +1 move this round.' : ' has arrived.'}`);
  ev.active.push(e);
}
// A mission's own weather (campaign): start an event right now, e.g. { kind: 'fogbank', x, y, r, until }.
// Turns on the event machinery with nothing random in it if the game had events off.
export function scriptEvent(st, e) {
  st.events ||= { mode: 'script', kinds: [], gap: [999, 999], next: 1e9, pending: null, active: [], fields: 0 };
  startEvent(st, { id: 'ev' + st.nextId++, start: st.round, ...e });
}
function endEvent(st, e) {
  const ev = st.events;
  ev.active = ev.active.filter(x => x !== e);
  if (e.kind === 'blowout') { const rig = st.rigs.find(r => r.id === e.rigId); if (rig?.blowout) { delete rig.blowout; log(st, rig.owner, `Your rig at ${coord(rig.x, rig.y)} is pumping again.`, { k: 'oil', x: rig.x, y: rig.y }); } }
  if (e.kind === 'pirates' || e.kind === 'rogue') {
    const left = st.ships.filter(s => (e.ships || []).includes(s.id));
    st.ships = st.ships.filter(s => !left.includes(s));
    if (left.length) tellAll(st, e.kind === 'pirates' ? '🏴‍☠️ The pirates have sailed away.' : '🦈 The rogue submarine has slipped away.');
  }
  if (e.kind === 'storm' || e.kind === 'fogbank') tellAll(st, `${EVENTS[e.kind].icon} The ${EVENTS[e.kind].name.toLowerCase()} has cleared.`);
}

// ---------- places ----------
function waterSpot(st, okFn, tries = 600) {
  for (let i = 0; i < tries; i++) {
    const x = randInt(st, 2, st.W - 3), y = randInt(st, 2, st.H - 3);
    if (!isLand(st, x, y) && !st.ice?.[y * st.W + x] && okFn(x, y)) return { x, y };
  }
  return null;
}
function fieldSpot(st) {
  const { W, H } = st, n = st.players.length;
  const xs = [Math.floor((W - 1) / 2), Math.ceil((W - 1) / 2)];
  const cands = [];
  for (let y = 4; y < H - 4; y++) for (const x of xs) {
    if (n === 4 && Math.abs(y - (H - 1) / 2) > 1) continue;
    if (isLand(st, x, y) || st.ice?.[y * W + x] || zoneOf(st, x, y) !== 'middle') continue;
    if (st.deposits.some(d => cheb(d, { x, y }) < 3)) continue;
    cands.push({ x, y });
  }
  if (!cands.length) return null;
  const f = cands[Math.floor(rand(st) * cands.length)];
  // the marked area: centred near the field, but not exactly on it
  const T = EVENT_TUNING.field;
  return { fx: f.x, fy: f.y, x: f.x + randInt(st, -2, 2), y: Math.max(T.r, Math.min(H - 1 - T.r, f.y + randInt(st, -Math.floor(T.r / 2), Math.floor(T.r / 2)))) };
}
function free(st, cells) {
  return cells.every(([x, y]) => inBounds(st, x, y) && !isLand(st, x, y) && !st.ice?.[y * st.W + x]
    && !st.ships.some(s => shipCells(s).some(([a, b]) => a === x && b === y))
    && !st.rigs.some(r => r.x === x && r.y === y) && !(st.platforms || []).some(o => o.x === x && o.y === y));
}
function nearSpot(st, type, x0, y0) {
  for (let r = 0; r < 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    for (const rot of [0, 1]) if (free(st, cellsOf(type, x0 + dx, y0 + dy, rot))) return { x: x0 + dx, y: y0 + dy, rot };
  }
  return null;
}

// ---------- the neutral side ----------
function neutralShip(st, type, spot, kind) {
  const s = {
    id: 's' + st.nextId++, owner: NEUTRAL, type, x: spot.x, y: spot.y, rot: spot.rot || 0, hp: shipStat(st, null, type, 'hp'),
    movesLeft: 0, acted: false, shotsLeft: 0, activeAction: null, cooldowns: {}, freeUsed: {}, screenUsed: false, adUsed: false, neutral: kind,
  };
  st.ships.push(s);
  return s;
}
// What pirates go after: rigs that aren't central (no base guns) and ships that look weak.
// The rogue sub: any ship in its hunting ground.
function neutralsAct(st, e) {
  const mine = st.ships.filter(s => (e.ships || []).includes(s.id));
  if (!mine.length) { endEvent(st, e); return; }
  st.neutralKind = e.kind;
  for (const s of mine) {
    if (!st.ships.includes(s)) continue;
    const act = SHIPS[s.type].actions.find(a => a.kind === 'attack' && !a.subsOnly && !a.needs);
    if (!act) continue;
    const range = act.range || 1;
    const targets = () => {
      const t = [];
      for (const o of st.ships) if (o.owner >= 0 && !(passives(o).submerged && dist(shipCells(o), shipCells(s)) > 1)) t.push({ x: o.x, y: o.y, cells: shipCells(o), hp: o.hp, ship: o, weak: !SHIPS[o.type].actions.some(a => a.kind === 'attack') });
      // (pirates raid outlying rigs, never a base's central rig: a raid shouldn't knock anyone out of the game)
      if (e.kind === 'pirates') for (const r of st.rigs) if (r.owner >= 0 && !r.center) t.push({ x: r.x, y: r.y, cells: [[r.x, r.y]], hp: r.hp, rig: r, weak: true });
      return e.kind === 'rogue' ? t.filter(x => x.ship && cheb(x, e) <= e.r + 2) : t;
    };
    const inRange = () => targets().filter(t => dist(shipCells(s), t.cells) <= range);
    const pick = list => list.sort((a, b) => (b.weak - a.weak) || a.hp - b.hp)[0];
    let t = pick(inRange());
    if (!t) {
      // sail toward the nearest good target (pirates: weak ones first; the rogue sub stays in its waters)
      const all = targets();
      const goal = all.sort((a, b) => (b.weak - a.weak) * 6 + cheb(a, s) - cheb(b, s))[0]
        || (e.kind === 'rogue' ? { x: e.x + randInt(st, -e.r, e.r), y: e.y + randInt(st, -e.r, e.r) } : null);
      if (goal) sailNeutral(st, s, goal);
      t = pick(inRange());
    }
    if (!t) continue;
    const cell = t.cells.find(c => dist(shipCells(s), [c]) <= range);
    resolveShot(st, s, act, cell[0], cell[1]);
  }
}
function sailNeutral(st, s, goal) {
  const { W, H } = st;
  const g = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) g[i] = st.land[i] || st.ice?.[i] ? 1 : 0;
  for (const o of st.ships) if (o !== s) for (const [x, y] of shipCells(o)) g[y * W + x] = 1;
  for (const r of st.rigs) g[r.y * W + r.x] = 1;
  for (const o of st.platforms || []) g[o.y * W + o.x] = 1;
  // stop next to the goal: aim for the closest free square around it
  let best = null;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const x = Math.round(goal.x) + dx, y = Math.round(goal.y) + dy;
    if (x < 0 || y < 0 || x >= W || y >= H || g[y * W + x]) continue;
    const d = Math.abs(dx) + Math.abs(dy);
    if (!best || d < best.d) best = { x, y, d };
  }
  if (!best) return;
  const path = findPath(st, s, best.x, best.y, null, g, null, 400);
  if (!path) return;
  let moves = shipStat(st, null, s.type, 'move'), r = s.rot;
  for (const n of path) {
    if (n.r === r) { if (moves <= 0) break; moves--; }
    s.x = n.x; s.y = n.y; s.rot = n.r; r = n.r;
  }
}
// Sinking a pirate (or the rogue sub) pays its bounty to whoever did it.
export function payBounty(st, p, ship) {
  if (ship.owner !== NEUTRAL || p == null || p < 0 || !st.players[p]) return;
  const T = ship.neutral === 'rogue' ? EVENT_TUNING.rogue : EVENT_TUNING.pirates;
  st.players[p].money += T.bounty;
  log(st, p, `${ship.neutral === 'rogue' ? '🦈 You sank the rogue submarine' : '🏴‍☠️ You sank a pirate ship'}! Bounty: +$${T.bounty}.`, { k: 'win', x: ship.x, y: ship.y });
  for (const o of alivePlayers(st)) if (o !== p) log(st, o, `${st.players[p].name} sank ${ship.neutral === 'rogue' ? 'the rogue submarine' : 'a pirate ship'}.`, { k: 'world' });
}

// ---------- effects on the rules ----------
export const inZone = (e, x, y) => Math.max(Math.abs(x - e.x), Math.abs(y - e.y)) <= e.r;
// storms: half speed for ships starting their turn in one; no air operations into or out of one
export const inStorm = (st, x, y) => eventActive(st, 'storm').some(e => inZone(e, x, y));
export const stormMoves = (st, ship, moves) => (shipCells(ship).some(([x, y]) => inStorm(st, x, y)) ? Math.ceil(moves / 2) : moves);
export const calmBonus = st => (eventActive(st, 'calm').length ? 1 : 0);
// fog banks: sight 1 inside
export const inFogBank = (st, x, y) => eventActive(st, 'fogbank').some(e => inZone(e, x, y));

// ---------- oil spills ----------
// (kind 'fire': a burning slick that belongs to `by` and hurts other players' ships; `big`: Kade's scorched rigs)
export function addSpill(st, x, y, kind, extra = 0, by = null, big = false) {
  const T = SPILLS[kind];
  st.spills ||= [];
  st.spills.push({ id: 'o' + st.nextId++, x, y, r: T.r + extra + (big ? SPILLS.scorched.r : 0), left: T.rounds + (big ? SPILLS.scorched.rounds : 0), ...(kind === 'fire' ? { fire: true, by } : {}) });
  if (kind === 'fire') return; // (short-lived: no announcement)
  for (const p of alivePlayers(st)) log(st, p, `🛢️ Oil spill at ${coord(x, y)}: no rigs can be built on deposits in the slick until it clears, and sailing through it costs double oil.`, { k: 'world', x, y });
}
export const spillAt = (st, x, y) => (st.spills || []).find(s => Math.max(Math.abs(x - s.x), Math.abs(y - s.y)) <= s.r);
export const inSpill = (st, cells) => !!st.spills?.length && cells.some(([x, y]) => spillAt(st, x, y));
// Clean Up (Drillship, Repair Ship): takes rounds off a slick in range
export function doCleanSpill(st, ship, act, x, y) {
  const s = spillAt(st, x, y);
  if (!s) return fail('No oil slick there.');
  if (dist(shipCells(ship), [[x, y]]) > (act.range || SPILLS.clean.range)) return fail('Too far: get within range of the slick.');
  s.left -= SPILLS.clean.rounds;
  if (s.left <= 0) { st.spills = st.spills.filter(o => o !== s); log(st, ship.owner, `Cleaned up the oil spill at ${coord(s.x, s.y)}.`, { k: 'done', x: s.x, y: s.y }); }
  else log(st, ship.owner, `Cleaned part of the oil spill at ${coord(s.x, s.y)}: ${s.left} round${s.left > 1 ? 's' : ''} left.`);
  return ok();
}

// ---------- well blowouts ----------
export function doFixBlowout(st, a) {
  const p = st.current, rig = st.rigs.find(r => r.id === a.rigId);
  if (!rig || rig.owner !== p || !rig.blowout) return fail('No blowout to fix there.');
  const cost = EVENT_TUNING.blowout.fixCost;
  if (st.players[p].money < cost) return fail(`Needs $${cost}.`);
  st.players[p].money -= cost;
  delete rig.blowout;
  const e = eventActive(st, 'blowout').find(x => x.rigId === rig.id);
  if (e) st.events.active = st.events.active.filter(x => x !== e);
  log(st, p, `Fixed the blowout at ${coord(rig.x, rig.y)} (−$${cost}). It pumps again from your next turn.`, { k: 'done', x: rig.x, y: rig.y });
  return ok();
}

// ---------- pack ice (Polar maps) ----------
export const iceAt = (st, x, y) => !!st.ice?.[y * st.W + x];
export const breaksIce = type => !!SHIPS[type]?.passives?.iceBreaker;
// an icebreaker clears the ice it sails over
export function breakIce(st, ship) {
  if (!st.ice || !breaksIce(ship.type)) return;
  for (const [x, y] of shipCells(ship)) if (st.ice[y * st.W + x]) { st.ice[y * st.W + x] = 0; st.iceVer = (st.iceVer || 0) + 1; }
}
// Every 3 rounds the ice shifts: a little open water next to the pack freezes (lanes slowly close up)
// and a little ice at the edges melts. Mirrored, so the map stays fair.
function shiftIce(st) {
  const { W, H } = st, n = Math.max(6, Math.round(W * H / 1500));
  const sym = st.mirror ? (x, y) => (st.players.length === 4 ? [[x, y], [W - 1 - x, y], [x, H - 1 - y], [W - 1 - x, H - 1 - y]] : [[x, y], [W - 1 - x, y]]) : (x, y) => [[x, y]];
  const nextToIce = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => inBounds(st, x + dx, y + dy) && st.ice[(y + dy) * W + x + dx]).length;
  const occupied = (x, y) => st.ships.some(s => shipCells(s).some(([a, b]) => a === x && b === y)) || st.rigs.some(r => r.x === x && r.y === y) || (st.platforms || []).some(o => o.x === x && o.y === y);
  const inHome = (x, y) => st.players.some(pl => x >= pl.home.x0 - 2 && x <= pl.home.x1 + 2 && y >= pl.home.y0 - 2 && y <= pl.home.y1 + 2);
  let froze = 0, melted = 0;
  st.iceVer = (st.iceVer || 0) + 1;
  for (let t = 0; t < n * 30 && (froze < n || melted < n / 2); t++) {
    const x = randInt(st, 0, W - 1), y = randInt(st, 0, H - 1), i = y * W + x;
    if (isLand(st, x, y) || inHome(x, y)) continue;
    if (!st.ice[i] && st.deposits.some(d => d.x === x && d.y === y)) continue; // an opened deposit stays open
    if (!st.ice[i] && froze < n && nextToIce(x, y) >= 2) {
      const imgs = sym(x, y);
      if (imgs.every(([a, b]) => !st.land[b * W + a] && !occupied(a, b))) { for (const [a, b] of imgs) st.ice[b * W + a] = 1; froze++; }
    } else if (st.ice[i] && melted < n / 2 && nextToIce(x, y) <= 2) {
      for (const [a, b] of sym(x, y)) st.ice[b * W + a] = 0;
      melted++;
    }
  }
}

export const DEPOSIT_TYPES = DEPOSITS; // (re-exported for the UI)
