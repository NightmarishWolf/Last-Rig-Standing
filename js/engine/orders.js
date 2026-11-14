// Voyage orders: send a ship anywhere on the map; it keeps sailing every turn until it arrives.
// Ships on a voyage sail automatically when their owner ends the turn (with whatever
// movement and oil is left), so you can still steer them by hand at any time.
import { SHIPS } from '../data/ships.js';
import { coord } from './geometry.js';
import { sailPath } from './movement.js';
import { findPath } from './pathfind.js';
import { moveCost } from './stats.js';
import { checkWin } from './turns.js';
import { fail, log, ok, passives } from './util.js';

// Move a ship along its voyage as far as its movement and your oil allow.
export function followOrder(st, ship) {
  const o = ship.order;
  if (!o || (ship.acted && !passives(ship).hitAndRun) || ship.movesLeft <= 0) return 0;
  const path = findPath(st, ship, o.x, o.y);
  const name = SHIPS[ship.type].name;
  if (!path) { log(st, ship.owner, `${name} can't find a sea route to ${coord(o.x, o.y)} right now.`); return 0; }
  if (!path.length) { ship.order = null; return 0; }
  let steps = Math.min(ship.movesLeft, path.length);
  while (steps > 0 && moveCost(st, ship, steps) > st.players[ship.owner].oil) steps--;
  if (steps <= 0) { log(st, ship.owner, `${name} is out of oil and waiting on its voyage.`); return 0; }
  const taken = sailPath(st, ship, path.slice(0, steps));
  if (st.ships.includes(ship) && ship.x === o.x && ship.y === o.y) {
    ship.order = null;
    log(st, ship.owner, `${name} arrived at ${coord(o.x, o.y)}.`);
  }
  return taken;
}

export function doSetOrder(st, a) {
  const ship = st.ships.find(s => s.id === a.shipId);
  if (!ship || ship.owner !== st.current) return fail('Not your ship.');
  const path = findPath(st, ship, a.x, a.y);
  if (!path) return fail('No sea route to there (blocked by land or ships).');
  if (!path.length) return fail('Already there.');
  ship.order = { x: a.x, y: a.y };
  log(st, ship.owner, `${SHIPS[ship.type].name} set sail for ${coord(a.x, a.y)} (${path.length} squares).`);
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
