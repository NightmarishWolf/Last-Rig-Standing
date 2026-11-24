// ============================================================
// RTS · world events (data/events.js: the same eight, picked on the New game page: Off, Light, Chaotic or
// Custom). Timings are in turn-based "rounds" of ROUND seconds: Light is an event every 10–15 rounds
// (2–3 minutes), the first after 8; each is announced a round before it starts.
//   storm     drifts across for 4 rounds: ships in it at half speed, nothing flies in or out of it
//   fogbank   3 rounds: nothing inside sees further than a square or so (even with fog of war off)
//   calm      one round: every ship a little faster
//   shock     the oil price jumps or crashes, then drifts back
//   field     a super-rich deposit somewhere in a marked circle of No Man's Sea
//   blowout   a rig stops pumping for 2 rounds unless its owner pays to fix it
//   pirates   a pirate flotilla raids near the richest player for 12 rounds (bounty per ship sunk)
//   rogue     a rogue submarine hunts a patch of No Man's Sea for 15 rounds (a big bounty)
// Pirates and the rogue sub sail for a neutral "Pirates" side that fights everyone.
// ============================================================
import { EVENTS, EVENT_MODES, EVENT_TUNING, FIRST_EVENT_ROUND, EVENT_ORDER } from '../data/events.js';
import { DEPOSITS } from '../data/economy.js';
import { UNITS, ROUND, HP_K, RESERVES_K } from './data.js';
import { newResearch } from './tech.js';
import { addUnit, note, pumpOf, basesOf, players, order, near, enemyOf, seen, TEAM_COLORS } from './sim.js';
import { clrAt } from './map.js';

export { EVENTS };
export const inStorm = (G, x, y) => G.storms.length > 0 && G.storms.some(s => Math.hypot(s.x - x, s.y - y) <= s.r);
export const inFogbank = (G, x, y) => G.fog.some(f => Math.hypot(f.x - x, f.y - y) <= f.r);
export const calmNow = G => G.calmUntil > G.t;
const rnd = (a, b) => a + Math.random() * (b - a);

// the event settings from the New game page: 'off' | 'light' | 'chaotic' | { mode: 'custom', kinds, pace }
export function eventsSetup(opt) {
  const mode = typeof opt === 'object' && opt ? opt.mode : opt || 'off';
  if (mode === 'off' || !EVENT_MODES[mode]) return null;
  const gap = mode === 'custom' ? (EVENT_MODES[opt.pace] || EVENT_MODES.light).gap : EVENT_MODES[mode].gap;
  const kinds = mode === 'custom' ? (opt.kinds || []).filter(k => EVENTS[k]) : EVENT_ORDER;
  if (!kinds.length) return null;
  return { gap, kinds, next: FIRST_EVENT_ROUND * ROUND, pending: null, active: [] };
}

// a random open-water spot well away from everyone's Admiralty (No Man's Sea)
function middleSpot(G, need = 2) {
  const homes = G.structs.filter(s => s.type === 'base' && s.capital), far = Math.min(G.m.W, G.m.H) * 0.28;
  for (let k = 0; k < 400; k++) {
    const x = rnd(G.m.W * 0.1, G.m.W * 0.9), y = rnd(G.m.H * 0.1, G.m.H * 0.9);
    if (clrAt(G.m, x, y) >= need && homes.every(h => Math.hypot(h.x - x, h.y - y) > far)) return { x, y };
  }
  return { x: G.m.W / 2, y: G.m.H / 2 };
}
// the neutral side pirates and the rogue sub sail for
function pirates(G) {
  let P = G.players.find(P => P.neutral);
  if (P) return P;
  const id = G.players.length;
  P = { id, name: 'Pirates', neutral: true, side: 'navy', color: TEAM_COLORS[4], ai: false, human: false, money: 0, oil: 0, allies: [], research: newResearch(), cmd: null };
  G.players.push(P);
  G.vis.push(new Uint8Array(G.m.W * G.m.H)); G.explored.push(new Uint8Array(G.m.W * G.m.H));
  return P;
}

export function eventsStep(G, dt) {
  const E = G.ev;
  // weather moves on and runs out
  for (const s of G.storms) { s.x += s.vx * dt; s.y += s.vy * dt; }
  G.storms = G.storms.filter(s => s.until > G.t); G.fog = G.fog.filter(f => f.until > G.t);
  G.fields = G.fields.filter(f => !G.structs.some(s => s.dep === f.dep));
  raiders(G, dt);
  if (!E) return;
  E.active = E.active.filter(a => a.until > G.t);
  if (!E.pending && G.t >= E.next - ROUND) {
    const kind = E.kinds[Math.floor(Math.random() * E.kinds.length)];
    E.pending = { kind, at: E.next };
    note(G, -1, `${EVENTS[kind].icon} Coming up: ${EVENTS[kind].name}.`);
  }
  if (E.pending && G.t >= E.pending.at) {
    start(G, E.pending.kind);
    E.pending = null; E.next = G.t + Math.round(rnd(E.gap[0], E.gap[1] + 1)) * ROUND;
  }
}

function start(G, kind) {
  const T = EVENT_TUNING[kind] || {}, E = G.ev, say = text => note(G, -1, `${EVENTS[kind].icon} ${text}`);
  const until = G.t + (T.rounds || 1) * ROUND;
  switch (kind) {
    case 'storm': {
      const fromLeft = Math.random() < 0.5, y = rnd(G.m.H * 0.2, G.m.H * 0.8);
      const s = { x: fromLeft ? G.m.W * 0.2 : G.m.W * 0.8, y, r: T.r, vx: (fromLeft ? 1 : -1) * T.step / ROUND, vy: rnd(-0.5, 0.5) * T.step / ROUND, until };
      G.storms.push(s); say('A storm front is coming through: half speed inside it, and nothing flies.'); break;
    }
    case 'fogbank': { const p = middleSpot(G, 0); G.fog.push({ ...p, r: T.r, until }); say('A fog bank has rolled in: inside it, nobody sees far.'); break; }
    case 'calm': G.calmUntil = G.t + ROUND * 1.5; say('Calm seas: every ship sails faster for a while.'); break;
    case 'shock': { const up = Math.random() < 0.5; G.market.price *= up ? T.up : T.down; say(up ? 'Oil shock: the price has jumped! It will drift back.' : 'Oil crash: the price has collapsed! It will drift back.'); break; }
    case 'field': {
      const p = middleSpot(G, 1), a = rnd(0, Math.PI * 2), d = rnd(0, T.r * 0.7), x = Math.floor(p.x + Math.cos(a) * d) + 0.5, y = Math.floor(p.y + Math.sin(a) * d) + 0.5;
      const at = clrAt(G.m, x, y) >= 1 ? { x, y } : { x: Math.floor(p.x) + 0.5, y: Math.floor(p.y) + 0.5 };
      const reserves = rnd(T.reserves[0], T.reserves[1]) * RESERVES_K, dep = { id: 'f' + G.nextId++, ...at, type: DEPOSITS.super ? 'super' : 'rich', reserves, max: reserves };
      G.m.deposits.push(dep); G.fields.push({ x: p.x, y: p.y, r: T.r, dep: dep.id });
      say('Geologists report a super-rich oil field inside the marked circle. Survey it and drill it first!'); break;
    }
    case 'blowout': {
      const rigs = G.structs.filter(s => (s.type === 'base' || s.type === 'wellhead') && s.built >= 1 && !G.players[s.team].neutral).map(s => [s, pumpOf(G, s)]).filter(([, r]) => r > 0);
      const total = rigs.reduce((t, [, r]) => t + r, 0); if (!total) return;
      let pick = Math.random() * total, s = rigs[0][0];
      for (const [r, w] of rigs) { pick -= w; if (pick <= 0) { s = r; break; } }
      s.blowUntil = G.t + T.rounds * ROUND;
      G.fx.push({ kind: 'fire', x: s.x, y: s.y, r: 1.5, t: 0, life: 2 });
      say(`A well has blown out: a ${G.players[s.team].name} rig stops pumping for a while.`);
      note(G, s.team, `Your rig blew out! Select it and pay $${T.fixCost} to fix it now.`); break;
    }
    case 'pirates': {
      const P = pirates(G);
      const rich = players(G).filter(Q => !Q.out).sort((a, b) => basesOf(G, b.id).length - basesOf(G, a.id).length)[0];
      const bases = basesOf(G, rich.id).filter(b => !b.capital), b = bases[Math.floor(Math.random() * bases.length)] || basesOf(G, rich.id)[0];
      let spot = null;
      for (let k = 0; k < 200 && !spot; k++) { const a = rnd(0, Math.PI * 2), d = rnd(7, 11), x = b.x + Math.cos(a) * d, y = b.y + Math.sin(a) * d; if (clrAt(G.m, x, y) >= 2) spot = { x, y }; }
      spot ||= middleSpot(G);
      for (const [i, type] of T.ships.entries()) {
        const u = addUnit(G, P.id, type, spot.x + i * 0.9 - 0.9, spot.y, 0);
        u.bounty = T.bounty; u.raid = { x: b.x, y: b.y, r: 12, until };
      }
      E.active.push({ kind, until }); say(`Pirates are raiding near ${rich.name}'s rigs! $${T.bounty} bounty for each one sunk.`); break;
    }
    case 'rogue': {
      const P = pirates(G), p = middleSpot(G, 2), u = addUnit(G, P.id, UNITS.submarine ? 'submarine' : 'smuggler', p.x, p.y, 0);
      u.hp = u.max = T.hp * HP_K; u.bounty = T.bounty; u.raid = { x: p.x, y: p.y, r: T.r, until: G.t + T.rounds * ROUND, rogue: true };
      E.active.push({ kind, until: u.raid.until }); say(`A rogue submarine is hunting No Man's Sea! $${T.bounty} bounty.`); break;
    }
  }
  if (until > G.t && kind !== 'pirates' && kind !== 'rogue' && kind !== 'shock' && kind !== 'field') E.active.push({ kind, until: kind === 'calm' ? G.calmUntil : kind === 'blowout' ? G.t + T.rounds * ROUND : until });
}

// pirates and rogue subs: go for whatever's weakest nearby, stay in their patch, leave when time's up
function raiders(G, dt) {
  G.raidT = (G.raidT || 0) - dt; if (G.raidT > 0) return; G.raidT = 1;
  for (const u of G.units) {
    if (!u.raid) continue;
    if (u.raid.until <= G.t) { u.gone = true; note(G, -1, u.raid.rogue ? '🦈 The rogue submarine has slipped away.' : '🏴‍☠️ A pirate ship sails off with its loot.'); continue; }
    const cands = near(G, u.raid.x, u.raid.y, u.raid.r).filter(e => enemyOf(G, u.team, e.team) && e.hp > 0 && seen(G, u.team, e) && !(e.type === 'base' && e.capital));
    const t = cands.sort((a, b) => (a.hp / a.max - b.hp / b.max) * 3 + (Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b.x - u.x, b.y - u.y)) / 6)[0];
    if (t) { if (u.order.type !== 'attack' || u.order.target !== t.id) order(G, [u.id], { type: 'attack', target: t.id }); }
    else if (u.order.type === 'idle') { const a = rnd(0, Math.PI * 2), d = rnd(0, u.raid.r * 0.8); order(G, [u.id], { type: 'amove', x: u.raid.x + Math.cos(a) * d, y: u.raid.y + Math.sin(a) * d }); }
  }
  G.units = G.units.filter(u => !u.gone);
}

// pay to fix a blown-out rig
export function fixBlowout(G, id) {
  const s = G.index?.get(id) || G.structs.find(x => x.id === id), cost = EVENT_TUNING.blowout.fixCost;
  if (!s || !(s.blowUntil > G.t)) return { ok: false, why: 'Nothing to fix.' };
  const P = G.players[s.team]; if (P.money < cost) return { ok: false, why: `Needs $${cost}.` };
  P.money -= cost; s.blowUntil = 0; return { ok: true };
}
