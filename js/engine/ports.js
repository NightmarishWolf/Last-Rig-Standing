// Forward ports: built on island coasts to launch ships near the front.
import { PORT } from '../data/economy.js';
import { coord, dist, inBounds, isCoast, isLand, shipCells } from './geometry.js';
import { portCost } from './stats.js';
import { fail, log, ok, pname, portAt } from './util.js';

export function portBuildProblem(st, p, x, y) {
  if (!inBounds(st, x, y) || !isLand(st, x, y)) return 'Ports go on island land, right at the shoreline.';
  if (!isCoast(st, x, y)) return 'Pick a coast square: island land that touches water.';
  const o = portAt(st, x, y);
  if (o && o.owner === p) return 'You already have a port here.';
  if (!st.ships.some(s => s.owner === p && dist(shipCells(s), [[x, y]]) <= 1)) return 'One of your ships must be right next to that coast square.';
  if (st.players[p].money < portCost(st, p)) return 'Not enough money.';
  return null;
}

export function doBuyPort(st, a) {
  const p = st.current;
  const why = portBuildProblem(st, p, a.x, a.y);
  if (why) return fail(why);
  const o = portAt(st, a.x, a.y);
  if (o) { st.players[p].reveals.ports = [...(st.players[p].reveals.ports || []), o.id]; log(st, p, `${pname(st, o.owner)} already has a port on that spot!`); return ok(); }
  st.players[p].money -= portCost(st, p);
  (st.ports ||= []).push({ id: 'p' + st.nextId++, owner: p, x: a.x, y: a.y, hp: PORT.hp });
  log(st, p, `Built a forward port at ${coord(a.x, a.y)}. New ships can launch within ${PORT.range} squares of it.`);
  return ok();
}
