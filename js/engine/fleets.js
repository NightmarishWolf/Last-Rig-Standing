// Fleets: ships that sail together in formation, like a real task force.
//
// st.fleets = [{ id, owner, name, leader, members: [{ id, dx, dy }], order, standing }]
//   leader:  the flagship (the biggest ship). Members keep their place (dx, dy) relative to it.
//   order:   { points: [{ x, y }, ...] } — where the flagship is headed (waypoints, then destination).
//   standing: a standing order for the whole fleet (see standing.js).
//
// Moving: the fleet sails at the speed of its slowest ship. Every step the flagship takes,
// the rest of the fleet takes the same step alongside it. Ships that get blocked (an island,
// another ship) drop out of step and catch up afterwards with whatever movement they have left.
import { FLEET } from '../data/production.js';
import { SHIPS } from '../data/ships.js';
import { cellsOf, coord, inBounds, shipCells } from './geometry.js';
import { shipStat } from './modifiers.js';
import { sailPath, stepShip } from './movement.js';
import { blockedGrid, findPath } from './pathfind.js';
import { moveCost } from './stats.js';
import { checkWin } from './turns.js';
import { fail, log, ok, passives } from './util.js';

export const fleetsOf = (st, p) => (st.fleets ||= []).filter(f => f.owner === p);
export const fleetById = (st, id) => (st.fleets ||= []).find(f => f.id === id);
export const fleetOf = (st, shipId) => (st.fleets ||= []).find(f => f.members.some(m => m.id === shipId));
export const fleetShips = (st, f) => f.members.map(m => st.ships.find(s => s.id === m.id)).filter(Boolean);
export const flagship = (st, f) => st.ships.find(s => s.id === f.leader);
const canSail = s => !(s.acted && !passives(s).hitAndRun) && s.movesLeft > 0;
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const value = s => SHIPS[s.type].cost;

// The fleet's speed: the slowest ship's full movement this turn.
export const fleetSpeed = (st, f) => Math.min(...fleetShips(st, f).map(s => s.maxMoves ?? shipStat(st, s.owner, s.type, 'move')));

// Where a member should be: its place in formation around the flagship.
export function slotOf(st, f, m) {
  const L = flagship(st, f);
  return L ? { x: L.x + m.dx, y: L.y + m.dy } : null;
}

// Make the biggest remaining ship the flagship, keeping everyone's place in formation.
function promote(st, f) {
  const best = fleetShips(st, f).sort((a, b) => value(b) - value(a))[0];
  if (!best) return;
  const nm = f.members.find(m => m.id === best.id);
  const ox = nm.dx, oy = nm.dy;
  for (const m of f.members) { m.dx -= ox; m.dy -= oy; }
  f.leader = best.id;
}

// Drop sunk ships, pick a new flagship if needed, and disband fleets down to one ship
// (the last ship carries on with the fleet's orders).
export function tidyFleets(st) {
  const list = (st.fleets ||= []);
  if (!list.length) return;
  for (const f of list) {
    f.members = f.members.filter(m => st.ships.some(s => s.id === m.id && s.owner === f.owner));
    if (f.members.length && !f.members.some(m => m.id === f.leader)) promote(st, f);
  }
  for (const f of list.filter(f => f.members.length < 2)) {
    const last = fleetShips(st, f)[0];
    if (!last) continue;
    if (f.order?.points?.length) last.order = { points: f.order.points.map((q, i, a) => ({ x: q.x, y: q.y, rot: i === a.length - 1 ? last.rot : null })) };
    if (f.standing && !(f.standing.kind === 'escort' && f.standing.target === last.id)) last.standing = f.standing;
    if (!st.players[f.owner].out) log(st, f.owner, `Fleet ${f.name} is down to one ship and has disbanded.`);
  }
  st.fleets = list.filter(f => f.members.length >= 2);
}

function farFrom(lead, ships) {
  return ships.find(s => s !== lead && cheb(s, lead) > FLEET.joinRange);
}

function leave(st, shipId) {
  const f = fleetOf(st, shipId);
  if (!f) return;
  f.members = f.members.filter(m => m.id !== shipId);
  if (f.leader === shipId) promote(st, f);
}

// "formFleet" { shipIds }
export function doFormFleet(st, a) {
  const p = st.current;
  tidyFleets(st);
  const ships = [...new Set(a.shipIds || [])].map(id => st.ships.find(s => s.id === id)).filter(Boolean);
  if (ships.some(s => s.owner !== p)) return fail('Not your ship.');
  if (ships.length < 2) return fail('A fleet needs at least 2 ships.');
  if (ships.length > FLEET.maxShips) return fail(`A fleet can have at most ${FLEET.maxShips} ships.`);
  const lead = [...ships].sort((x, y) => value(y) - value(x))[0];
  const far = farFrom(lead, ships);
  if (far) return fail(`The ${SHIPS[far.type].name} is too far away: ships must be within ${FLEET.joinRange} squares of the flagship (the ${SHIPS[lead.type].name}).`);
  for (const s of ships) { leave(st, s.id); s.order = null; s.standing = null; }
  tidyFleets(st);
  const used = new Set(fleetsOf(st, p).map(f => f.name));
  const name = FLEET.names.find(n => !used.has(n)) || `Task Force ${st.nextId}`;
  st.fleets.push({
    id: 'f' + st.nextId++, owner: p, name, leader: lead.id,
    members: ships.map(s => ({ id: s.id, dx: s.x - lead.x, dy: s.y - lead.y })), order: null, standing: null,
  });
  log(st, p, `Formed Fleet ${name}: ${ships.length} ships, flagship ${SHIPS[lead.type].name}.`);
  return ok();
}

// "joinFleet" { fleetId, shipId }
export function doJoinFleet(st, a) {
  const p = st.current, f = fleetById(st, a.fleetId), s = st.ships.find(x => x.id === a.shipId);
  if (!f || f.owner !== p || !s || s.owner !== p) return fail('Not yours.');
  if (f.members.some(m => m.id === s.id)) return fail('Already in this fleet.');
  if (f.members.length >= FLEET.maxShips) return fail(`A fleet can have at most ${FLEET.maxShips} ships.`);
  const L = flagship(st, f);
  if (cheb(s, L) > FLEET.joinRange) return fail(`Too far: sail within ${FLEET.joinRange} squares of the flagship first.`);
  leave(st, s.id); tidyFleets(st);
  s.order = null; s.standing = null;
  f.members.push({ id: s.id, dx: s.x - L.x, dy: s.y - L.y });
  log(st, p, `${SHIPS[s.type].name} joined Fleet ${f.name}.`);
  return ok();
}

// "leaveFleet" { shipId }
export function doLeaveFleet(st, a) {
  const f = fleetOf(st, a.shipId);
  if (!f || f.owner !== st.current) return fail('That ship is not in one of your fleets.');
  leave(st, a.shipId);
  tidyFleets(st);
  return ok();
}

// "disbandFleet" { fleetId }
export function doDisbandFleet(st, a) {
  const f = fleetById(st, a.fleetId);
  if (!f || f.owner !== st.current) return fail('Not your fleet.');
  st.fleets = st.fleets.filter(x => x !== f);
  log(st, f.owner, `Fleet ${f.name} disbanded.`);
  return ok();
}

// "reformFleet" { fleetId }: the formation becomes wherever the ships are now.
export function doReformFleet(st, a) {
  const f = fleetById(st, a.fleetId);
  if (!f || f.owner !== st.current) return fail('Not your fleet.');
  const L = flagship(st, f), ships = fleetShips(st, f);
  const far = farFrom(L, ships);
  if (far) return fail(`The ${SHIPS[far.type].name} is more than ${FLEET.joinRange} squares from the flagship.`);
  f.members = ships.map(s => ({ id: s.id, dx: s.x - L.x, dy: s.y - L.y }));
  log(st, f.owner, `Fleet ${f.name} will keep this formation.`);
  return ok();
}

// "regroupFleet" { fleetId }: stragglers sail back to their places now.
export function doRegroupFleet(st, a) {
  const f = fleetById(st, a.fleetId);
  if (!f || f.owner !== st.current) return fail('Not your fleet.');
  catchUp(st, f);
  tidyFleets(st);
  checkWin(st);
  return ok();
}

// The map as the flagship plans its route: the fleet's own ships don't count as obstacles.
function fleetGrid(st, f) {
  const g = blockedGrid(st, f.owner, f.leader), W = st.W;
  for (const s of fleetShips(st, f)) for (const [x, y] of shipCells(s)) g[y * W + x] = st.land[y * W + x] ? 1 : 0;
  return g;
}

// Members that aren't in their place sail toward it with the movement they have left.
export function catchUp(st, f) {
  const L = flagship(st, f);
  if (!L) return;
  for (const m of f.members) {
    const s = st.ships.find(x => x.id === m.id);
    if (!s || s === L || !canSail(s)) continue;
    const want = { x: L.x + m.dx, y: L.y + m.dy };
    if (s.x === want.x && s.y === want.y) continue;
    // the exact place, or the nearest free spot around it
    const spots = [want];
    for (let r = 1; r <= 2; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++)
      if (Math.max(Math.abs(dx), Math.abs(dy)) === r) spots.push({ x: want.x + dx, y: want.y + dy });
    const limit = cheb(s, want) * 2 + 12;
    let path = null, tries = 0;
    for (const q of spots) {
      if (!inBounds(st, q.x, q.y)) continue;
      if (s.x === q.x && s.y === q.y) break; // already as close as it can get
      const p = findPath(st, s, q.x, q.y, null, undefined, null, limit);
      if (p) { path = p; break; }
      if (++tries >= 6) break;
    }
    if (!path || !path.length) continue;
    let steps = Math.min(s.movesLeft, path.length);
    while (steps > 0 && moveCost(st, s, steps) > st.players[s.owner].oil) steps--;
    if (steps > 0) sailPath(st, s, path.slice(0, steps));
  }
}

// Move the whole fleet toward a point for this turn (the flagship's anchor goes to pt).
// Returns 'arrived', 'moving', 'stuck', 'waiting', 'nooil', 'noroute' or 'gone'.
export function advanceFleet(st, f, pt) {
  const L = flagship(st, f);
  if (!L) return 'gone';
  if (L.x === pt.x && L.y === pt.y) return 'arrived';
  if (!canSail(L)) return 'waiting';
  const used = f.movedTurn === st.turnCount ? f.moved || 0 : 0;
  const budget = Math.min(fleetSpeed(st, f) - used, L.movesLeft);
  if (budget <= 0) return 'waiting';
  const g0 = fleetGrid(st, f);
  const path = findPath(st, L, pt.x, pt.y, null, g0);
  if (!path) return 'noroute';
  const { W, H } = st;
  const others = fleetShips(st, f).filter(s => s !== L);
  let lock = others.filter(canSail); // ships stepping alongside the flagship
  const steps = new Map([[L, 0], ...others.map(s => [s, 0])]);
  const oil = st.players[f.owner].oil;
  let taken = 0, out = null;
  const n = Math.min(budget, path.length);
  for (let k = 0; k < n; k++) {
    const node = path[k], turning = node.r !== L.rot;
    const dx = node.x - L.x, dy = node.y - L.y;
    let movers = turning ? [] : lock.filter(s => s.movesLeft - steps.get(s) > 0);
    // anyone whose next square is blocked drops out of step (they'll catch up later)
    let staticCells;
    for (let changed = true; changed;) {
      changed = false;
      staticCells = new Set();
      for (const s of others) if (!movers.includes(s)) for (const [x, y] of shipCells(s)) staticCells.add(y * W + x);
      for (const s of movers) {
        const bad = cellsOf(s.type, s.x + dx, s.y + dy, s.rot).some(([x, y]) => x < 0 || y < 0 || x >= W || y >= H || g0[y * W + x] || staticCells.has(y * W + x));
        if (bad) { movers = movers.filter(o => o !== s); lock = lock.filter(o => o !== s); changed = true; break; }
      }
    }
    // the flagship can't sail into one of its own ships that's staying put
    if (cellsOf(L.type, node.x, node.y, node.r).some(([x, y]) => staticCells.has(y * W + x))) { out = 'stuck'; break; }
    // enough oil for everyone's step?
    let cost = 0;
    for (const [s, c] of steps) cost += moveCost(st, s, c + (s === L || movers.includes(s) ? 1 : 0));
    if (cost > oil) { out = 'nooil'; break; }
    const res = stepShip(st, L, node.x, node.y, node.r);
    if (res === 'blocked') { out = 'stuck'; break; }
    steps.set(L, steps.get(L) + 1); taken++;
    if (res === 'stopped') break;
    for (const s of movers) {
      const r2 = stepShip(st, s, s.x + dx, s.y + dy, s.rot);
      if (r2 !== 'blocked') steps.set(s, steps.get(s) + 1);
      if (r2 !== 'ok') lock = lock.filter(o => o !== s);
    }
  }
  for (const [s, c] of steps) if (c) { st.players[f.owner].oil -= moveCost(st, s, c); s.movesLeft -= c; }
  f.movedTurn = st.turnCount; f.moved = used + taken;
  catchUp(st, f);
  tidyFleets(st);
  const L2 = flagship(st, f);
  if (L2 && L2.x === pt.x && L2.y === pt.y) return 'arrived';
  if (out === 'nooil' && !taken) return 'nooil';
  return taken ? 'moving' : 'stuck';
}

// Follow the fleet's order (waypoints, then destination) as far as this turn allows.
export function runFleetOrder(st, f) {
  for (let guard = 0; guard < 8 && f.order && st.fleets.includes(f); guard++) {
    const pt = f.order.points[0];
    const res = advanceFleet(st, f, pt);
    if (res === 'arrived') {
      f.order.points.shift();
      if (!f.order.points.length) { f.order = null; log(st, f.owner, `Fleet ${f.name} arrived at ${coord(pt.x, pt.y)}.`); }
      else log(st, f.owner, `Fleet ${f.name} reached a waypoint at ${coord(pt.x, pt.y)}.`);
      continue;
    }
    if (res === 'noroute') log(st, f.owner, `Fleet ${f.name} can't find a sea route to ${coord(pt.x, pt.y)} right now.`);
    if (res === 'nooil') log(st, f.owner, `Fleet ${f.name} is out of oil and waiting.`);
    break;
  }
}

// "setFleetOrder" { fleetId, points: [{x, y}] } — the flagship's destination (waypoints first).
export function doSetFleetOrder(st, a) {
  const f = fleetById(st, a.fleetId);
  if (!f || f.owner !== st.current) return fail('Not your fleet.');
  const points = (a.points || []).filter(q => q && inBounds(st, q.x, q.y)).map(q => ({ x: q.x, y: q.y }));
  if (!points.length) return fail('No destination.');
  const L = flagship(st, f), g = fleetGrid(st, f);
  let from = null, len = 0;
  for (const q of points) {
    const path = findPath(st, L, q.x, q.y, null, g, from);
    if (!path) return fail('No sea route through those points for the flagship.');
    len += path.length;
    if (path.length) { const e = path[path.length - 1]; from = { x: e.x, y: e.y, r: e.r }; }
  }
  if (!len) return fail('Already there.');
  f.order = { points };
  f.standing = null;
  for (const s of fleetShips(st, f)) { s.order = null; s.standing = null; }
  const dest = points[points.length - 1];
  log(st, f.owner, `Fleet ${f.name} set sail for ${coord(dest.x, dest.y)} (${len} squares at speed ${fleetSpeed(st, f)}).`);
  runFleetOrder(st, f);
  checkWin(st);
  return ok();
}

// "cancelFleetOrder" { fleetId }
export function doCancelFleetOrder(st, a) {
  const f = fleetById(st, a.fleetId);
  if (!f || f.owner !== st.current) return fail('Not your fleet.');
  f.order = null;
  return ok();
}

// End of turn: every fleet with an order sails on.
export function runFleetOrders(st, p) {
  tidyFleets(st);
  for (const f of fleetsOf(st, p).filter(f => f.order)) {
    if (st.phase !== 'playing') return;
    runFleetOrder(st, f);
  }
  checkWin(st);
}
