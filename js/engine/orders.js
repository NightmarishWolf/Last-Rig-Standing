// Voyage orders: send a ship anywhere on the map, optionally through waypoints (A, then B, then C).
// It keeps sailing every turn until it arrives. Ships on a voyage sail automatically when their
// owner ends the turn (with whatever movement and oil is left), so you can still steer them by hand.
//
// ship.order = { points: [{ x, y, rot }, ...] }  — waypoints first, destination last.
// Waypoints have rot = null (any facing); the destination keeps the facing you planned.
import { SHIPS } from '../data/ships.js';
import { coord } from './geometry.js';
import { sailPath } from './movement.js';
import { findPath, routeThrough } from './pathfind.js';
import { moveCost } from './stats.js';
import { checkWin } from './turns.js';
import { fail, log, ok, passives } from './util.js';

// Older saves stored a single destination as { x, y, rot }.
export const orderPoints = o => (!o ? [] : o.points || [{ x: o.x, y: o.y, rot: o.rot }]);

const at = (ship, pt) => ship.x === pt.x && ship.y === pt.y && (pt.rot == null || ship.rot === pt.rot);

// Move a ship along its voyage as far as its movement and your oil allow,
// passing waypoints along the way.
export function followOrder(st, ship) {
  if (!ship.order || (ship.acted && !passives(ship).hitAndRun)) return 0;
  ship.order = { points: orderPoints(ship.order) };
  const name = SHIPS[ship.type].name;
  let total = 0;
  while (ship.order && ship.movesLeft > 0 && st.ships.includes(ship)) {
    const pts = ship.order.points, pt = pts[0];
    const path = findPath(st, ship, pt.x, pt.y, pt.rot ?? null);
    if (!path) { log(st, ship.owner, `${name} can't find a sea route to ${coord(pt.x, pt.y)} right now.`); break; }
    if (path.length) {
      let steps = Math.min(ship.movesLeft, path.length);
      while (steps > 0 && moveCost(st, ship, steps) > st.players[ship.owner].oil) steps--;
      if (steps <= 0) { log(st, ship.owner, `${name} is out of oil and waiting on its voyage.`); break; }
      const taken = sailPath(st, ship, path.slice(0, steps));
      total += taken;
      if (!st.ships.includes(ship) || taken < steps) break; // sunk, or bumped into something
    }
    if (!at(ship, pt)) break; // ran out of movement this turn
    pts.shift();
    if (!pts.length) { ship.order = null; log(st, ship.owner, `${name} arrived at ${coord(pt.x, pt.y)}.`); }
    else log(st, ship.owner, `${name} reached a waypoint at ${coord(pt.x, pt.y)}.`);
  }
  return total;
}

// Sail one ship toward (x, y) with this turn's movement and oil.
// Returns 'arrived', 'moving', 'stuck', 'waiting' (can't move now), 'nooil', 'noroute' or 'sunk'.
export function sailToward(st, ship, x, y, rot = null, maxSteps = Infinity) {
  const there = () => ship.x === x && ship.y === y && (rot == null || ship.rot === rot);
  if (there()) return 'arrived';
  if ((ship.acted && !passives(ship).hitAndRun) || ship.movesLeft <= 0) return 'waiting';
  const path = findPath(st, ship, x, y, rot, undefined, null, maxSteps);
  if (!path) return 'noroute';
  let steps = Math.min(ship.movesLeft, path.length);
  while (steps > 0 && moveCost(st, ship, steps) > st.players[ship.owner].oil) steps--;
  if (steps <= 0) return 'nooil';
  const taken = sailPath(st, ship, path.slice(0, steps));
  if (!st.ships.includes(ship)) return 'sunk';
  return there() ? 'arrived' : taken ? 'moving' : 'stuck';
}

export function doSetOrder(st, a) {
  const ship = st.ships.find(s => s.id === a.shipId);
  if (!ship || ship.owner !== st.current) return fail('Not your ship.');
  const f = (st.fleets || []).find(f => f.members.some(m => m.id === ship.id));
  if (f) return fail(`This ship sails with Fleet ${f.name}. Give the fleet a destination, or take the ship out of the fleet.`);
  const points = (a.points || [{ x: a.x, y: a.y, rot: a.rot ?? ship.rot }]).map(p => ({ x: p.x, y: p.y, rot: p.rot ?? null }));
  if (!points.length) return fail('No destination.');
  if (points[points.length - 1].rot == null) points[points.length - 1].rot = ship.rot;
  const legs = routeThrough(st, ship, points);
  if (!legs) return fail('No sea route through those points (blocked by land or ships).');
  const len = legs.reduce((t, l) => t + l.length, 0);
  if (!len) return fail('Already there.');
  ship.order = { points };
  ship.standing = null; // a voyage replaces any standing order
  const dest = points[points.length - 1];
  log(st, ship.owner, `${SHIPS[ship.type].name} set sail for ${coord(dest.x, dest.y)}${points.length > 1 ? ` via ${points.length - 1} waypoint${points.length > 2 ? 's' : ''}` : ''} (${len} squares).`);
  followOrder(st, ship);
  checkWin(st);
  return ok();
}

export function doCancelOrder(st, a) {
  const ship = st.ships.find(s => s.id === a.shipId);
  if (!ship || ship.owner !== st.current) return fail('Not your ship.');
  ship.order = null;
  return ok();
}

// End of a player's turn: every ship still on a voyage sails on.
export function runVoyages(st, p) {
  for (const ship of st.ships.filter(s => s.owner === p && s.order)) {
    if (st.phase !== 'playing') return;
    followOrder(st, ship);
  }
  checkWin(st);
}
