// Standing orders: jobs a ship or a whole fleet keeps doing on its own, turn after turn.
// They run when you end your turn, with whatever movement and oil is left.
//
//   ship.standing / fleet.standing =
//     { kind: 'patrol', points: [{x, y}, ...], i }   loop through the points
//     { kind: 'escort', target: shipId }             stay within ESCORT_RANGE of that ship
//     { kind: 'guard', x, y }                        hold this spot
//     { kind: 'explore', target?, skip? }            head for unexplored waters
// Patrol, Escort and Guard also fire at enemy ships in range. Explorers survey as they go.
//
// Exploring: each player remembers which chunks of the map (EXPLORE_CHUNK squares across)
// their ships have seen: player.explored = { "cx,cy": 1 }.
import { ESCORT_RANGE, EXPLORE_CHUNK, STANDING } from '../data/production.js';
import { SHIPS } from '../data/ships.js';
import { canUseAction, doAct, actionRange } from './abilities.js';
import { cellsOf, coord, dist, inBounds, isLand, shipCells } from './geometry.js';
import { shipStat } from './modifiers.js';
import { upkeepTotal } from './stats.js';
import { sailToward } from './orders.js';
import { advanceFleet, flagship, fleetById, fleetOf, fleetShips, fleetsOf, tidyFleets } from './fleets.js';
import { checkWin } from './turns.js';
import { autoTargetOk, fail, log, ok, passives } from './util.js';
import { placementOk, visibility } from './visibility.js';

const C = EXPLORE_CHUNK;
const chunkKey = (x, y) => Math.floor(x / C) + ',' + Math.floor(y / C);
const unitName = (st, u, isFleet) => isFleet ? `Fleet ${u.name}` : SHIPS[u.type].name;

// "setStanding" { shipId | fleetId, standing: { kind, ... } | null }
// A ship that belongs to a fleet passes the order to its whole fleet.
export function doSetStanding(st, a) {
  const p = st.current;
  tidyFleets(st);
  const ship = a.shipId ? st.ships.find(s => s.id === a.shipId) : null;
  const fleet = a.fleetId ? fleetById(st, a.fleetId) : ship ? fleetOf(st, ship.id) : null;
  const unit = fleet || ship;
  if (!unit || unit.owner !== p) return fail('Not yours.');
  const lead = fleet ? flagship(st, fleet) : ship;
  const o = a.standing;
  let standing = null, extra = '';
  if (o) {
    switch (o.kind) {
      case 'patrol': {
        const pts = (o.points || []).filter(q => inBounds(st, q.x, q.y)).map(q => ({ x: q.x, y: q.y }));
        if (!pts.length) return fail('Pick at least one patrol point.');
        standing = { kind: 'patrol', points: [{ x: lead.x, y: lead.y }, ...pts], i: 1 };
        extra = ` between ${standing.points.length} points`;
        break;
      }
      case 'escort': {
        const t = st.ships.find(s => s.id === o.target);
        if (!t || t.owner !== p) return fail('Pick one of your ships to escort.');
        if (t === lead || (fleet && fleetOf(st, t.id) === fleet)) return fail("Can't escort itself.");
        standing = { kind: 'escort', target: t.id };
        extra = ` (the ${SHIPS[t.type].name} at ${coord(t.x, t.y)})`;
        break;
      }
      case 'guard': standing = { kind: 'guard', x: o.x ?? lead.x, y: o.y ?? lead.y }; extra = ` at ${coord(standing.x, standing.y)}`; break;
      case 'explore': standing = { kind: 'explore' }; break;
      default: return fail('Unknown standing order.');
    }
  }
  unit.standing = standing;
  if (standing) unit.order = null; // replaces any voyage
  log(st, p, standing
    ? `${unitName(st, unit, !!fleet)}: ${STANDING[standing.kind].name}${extra}. Carried out each time you end your turn.`
    : `${unitName(st, unit, !!fleet)}: standing orders cleared.`);
  return ok();
}

// ---------- shooting ----------
// Fire every weapon that can reach a visible enemy ship, weakest target first.
// Standing orders never spend the money you need for next turn's upkeep.
const affordable = (st, ship, act) => st.players[ship.owner].money - (act.money || 0) >= upkeepTotal(st, ship.owner);

export function autoFire(st, ship) {
  const attacks = SHIPS[ship.type].actions.filter(a => a.kind === 'attack').sort((a, b) => (b.dmg || 0) - (a.dmg || 0));
  let fired = 0;
  for (const act of attacks) {
    for (let shot = 0; shot < 12; shot++) {
      if (!st.ships.includes(ship) || canUseAction(st, ship, act) || !affordable(st, ship, act)) break;
      const vis = visibility(st, ship.owner), cells = shipCells(ship), range = actionRange(st, ship, act);
      const targets = st.ships
        .filter(e => e.owner !== ship.owner && vis.ships.has(e.id) && autoTargetOk(st, ship.owner, e, vis.ident) && !(act.subsOnly && !passives(e).submerged) && dist(cells, shipCells(e)) <= range)
        .sort((a, b) => a.hp - b.hp);
      if (!targets.length) break;
      const [tx, ty] = shipCells(targets[0]).find(c => dist(cells, [c]) <= range);
      if (!doAct(st, { shipId: ship.id, actionId: act.id, x: tx, y: ty }).ok) break;
      fired++;
    }
  }
  return fired;
}

// ---------- exploring ----------
// Chunks of the map your ships have seen (a chunk counts once a ship gets near its middle).
export function markExplored(st, p) {
  const ex = (st.players[p].explored ||= {});
  const cw = Math.ceil(st.W / C), ch = Math.ceil(st.H / C);
  for (const s of st.ships.filter(s => s.owner === p)) {
    const reach = shipStat(st, p, s.type, 'sight') + 2, cells = shipCells(s);
    const x0 = Math.max(0, Math.floor((s.x - reach - C) / C)), x1 = Math.min(cw - 1, Math.floor((s.x + reach + C) / C));
    const y0 = Math.max(0, Math.floor((s.y - reach - C) / C)), y1 = Math.min(ch - 1, Math.floor((s.y + reach + C) / C));
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const k = cx + ',' + cy;
      if (ex[k]) continue;
      const mx = Math.floor((cx * C + Math.min(st.W, cx * C + C) - 1) / 2), my = Math.floor((cy * C + Math.min(st.H, cy * C + C) - 1) / 2);
      if (dist(cells, [[mx, my]]) <= reach) ex[k] = 1;
    }
  }
}

// The nearest unexplored chunk: a water spot near its middle where the ship fits.
function exploreTarget(st, p, ship, skip) {
  const ex = (st.players[p].explored ||= {});
  const cw = Math.ceil(st.W / C), ch = Math.ceil(st.H / C);
  const list = [];
  for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) {
    const k = cx + ',' + cy;
    if (ex[k] || skip.includes(k)) continue;
    const mx = Math.floor((cx * C + Math.min(st.W, cx * C + C) - 1) / 2), my = Math.floor((cy * C + Math.min(st.H, cy * C + C) - 1) / 2);
    list.push({ k, cx, cy, mx, my, d: Math.max(Math.abs(mx - ship.x), Math.abs(my - ship.y)) });
  }
  list.sort((a, b) => a.d - b.d);
  for (const c of list) {
    let best = null;
    for (let y = c.cy * C; y < Math.min(st.H, c.cy * C + C); y++) for (let x = c.cx * C; x < Math.min(st.W, c.cx * C + C); x++) {
      if (isLand(st, x, y)) continue;
      const d = Math.abs(x - c.mx) + Math.abs(y - c.my);
      if (best && d >= best.d) continue;
      if ([0, 1, 2, 3].some(r => cellsOf(ship.type, x, y, r).every(([a, b]) => inBounds(st, a, b) && !isLand(st, a, b)))) best = { x, y, d, k: c.k };
    }
    if (best) return best;
    ex[c.k] = 1; // all land: nothing to explore there
  }
  return null;
}

// ---------- escorting ----------
// A free spot within ESCORT_RANGE of the escorted ship, as close as possible to the escort.
function escortSpot(st, ship, t) {
  const vis = visibility(st, ship.owner), tc = shipCells(t), R = ESCORT_RANGE + 4;
  const spots = [];
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const x = t.x + dx, y = t.y + dy, cells = cellsOf(ship.type, x, y, ship.rot);
    const d = dist(cells, tc);
    if (d < 1 || d > ESCORT_RANGE) continue;
    if (!placementOk(st, ship.owner, cells, ship.id, vis)) continue;
    spots.push({ x, y, d: Math.max(Math.abs(x - ship.x), Math.abs(y - ship.y)) });
  }
  return spots.sort((a, b) => a.d - b.d).slice(0, 3);
}

// ---------- running the orders ----------
function runUnit(st, p, u, isFleet) {
  const lead = isFleet ? flagship(st, u) : u;
  if (!lead) return;
  const o = u.standing;
  const go = (x, y, maxSteps) => isFleet ? advanceFleet(st, u, { x, y }) : sailToward(st, u, x, y, null, maxSteps);
  switch (o.kind) {
    case 'guard':
      if (lead.x !== o.x || lead.y !== o.y) go(o.x, o.y);
      break;
    case 'patrol':
      for (let k = 0; k < o.points.length + 1; k++) {
        const pt = o.points[o.i % o.points.length];
        const r = go(pt.x, pt.y);
        if (r === 'arrived') { o.i = (o.i + 1) % o.points.length; continue; }
        if (r === 'noroute') log(st, p, `${unitName(st, u, isFleet)} can't reach patrol point ${coord(pt.x, pt.y)}.`);
        break;
      }
      break;
    case 'escort': {
      const t = st.ships.find(s => s.id === o.target);
      if (!t) { u.standing = null; log(st, p, `${unitName(st, u, isFleet)}: the ship it was escorting is gone. Standing orders cleared.`, { k: 'fleet' }); return; }
      if (dist(shipCells(lead), shipCells(t)) <= ESCORT_RANGE) break;
      for (const spot of escortSpot(st, lead, t)) if (go(spot.x, spot.y) !== 'noroute') break;
      break;
    }
    case 'explore': {
      const ex = (st.players[p].explored ||= {});
      o.skip ||= [];
      for (let tries = 0; tries < 3; tries++) {
        if (o.target && ex[chunkKey(o.target.x, o.target.y)]) o.target = null;
        if (!o.target) o.target = exploreTarget(st, p, lead, o.skip);
        if (!o.target) { u.standing = null; log(st, p, `${unitName(st, u, isFleet)} has nothing left to explore. Standing orders cleared.`, { k: 'fleet' }); return; }
        const tg = o.target;
        const r = go(tg.x, tg.y, Math.max(Math.abs(tg.x - lead.x), Math.abs(tg.y - lead.y)) * 3 + 30);
        if (r === 'noroute') { o.skip.push(chunkKey(tg.x, tg.y)); o.target = null; continue; }
        markExplored(st, p);
        if (r === 'arrived') { ex[chunkKey(tg.x, tg.y)] = 1; o.target = null; continue; }
        break;
      }
      // survey on the way, where nobody has surveyed yet
      for (const s of isFleet ? fleetShips(st, u) : [u]) {
        const sv = st.players[p].surveyed || {};
        const act = SHIPS[s.type].actions.find(a => a.kind === 'survey');
        if (act && st.ships.includes(s) && !canUseAction(st, s, act) && affordable(st, s, act) && !sv[s.x + ',' + s.y]) doAct(st, { shipId: s.id, actionId: act.id });
      }
      return;
    }
  }
  for (const s of isFleet ? fleetShips(st, u) : [u]) if (st.ships.includes(s) && st.phase === 'playing') autoFire(st, s);
}

// End of turn: every ship and fleet with a standing order (and no voyage) does its job.
export function runStanding(st, p) {
  tidyFleets(st);
  markExplored(st, p);
  for (const f of fleetsOf(st, p).filter(f => f.standing && !f.order)) {
    if (st.phase !== 'playing') return;
    if (st.fleets.includes(f)) runUnit(st, p, f, true);
  }
  for (const s of st.ships.filter(s => s.owner === p && s.standing && !s.order)) {
    if (st.phase !== 'playing') return;
    if (st.ships.includes(s) && !fleetOf(st, s.id)) runUnit(st, p, s, false);
  }
  markExplored(st, p);
  tidyFleets(st);
  checkWin(st);
}

export const standingOf = (st, ship) => (fleetOf(st, ship.id) || ship).standing || null;
