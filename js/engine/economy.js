// Buying ships and rigs, launch zones, and selling oil.
import { MARKET, PORT, RIG, TIER_RIGS } from '../data/economy.js';
import { SHIPS } from '../data/ships.js';
import { cellsOf, coord, dist, inSpawn, shipCells } from './geometry.js';
import { addShip } from './setup.js';
import { forwardPorts, rigCost, tierUnlocked } from './stats.js';
import { depositAt, fail, log, ok, rigAt, shipAt } from './util.js';
import { hiddenBlocker, placementOk, revealBlocker, visibility } from './visibility.js';

export function inLaunchZone(st, p, cells) {
  if (cells.every(([x, y]) => inSpawn(st, p, x, y))) return true;
  return forwardPorts(st, p).some(o => cells.every(([x, y]) => Math.max(Math.abs(x - o.x), Math.abs(y - o.y)) <= PORT.range));
}

// ---------- economy ----------
export function doBuyShip(st, a) {
  const p = st.current, def = SHIPS[a.ship];
  if (!def) return fail('Unknown ship.');
  if (!tierUnlocked(st, p, def.tier)) return fail(`Tier ${def.tier} needs ${TIER_RIGS[def.tier]} rigs.`);
  if (st.players[p].money < def.cost) return fail('Not enough money.');
  const lim = def.passives?.limit;
  if (lim && st.ships.filter(s => s.owner === p && s.type === a.ship).length >= lim) return fail(`Limit ${lim}.`);
  const cells = cellsOf(a.ship, a.x, a.y, a.rot);
  if (!inLaunchZone(st, p, cells)) return fail(`New ships must launch in your spawn zone or within ${PORT.range} squares of one of your forward ports.`);
  if (!placementOk(st, p, cells, null, visibility(st, p))) return fail('That spot is blocked.');
  const blk = hiddenBlocker(st, p, cells, null);
  if (blk) {
    revealBlocker(st, p, blk);
    log(st, p, 'Launch blocked: an enemy is lurking in your spawn zone!');
    return ok();
  }
  st.players[p].money -= def.cost;
  addShip(st, p, a.ship, a.x, a.y, a.rot);
  log(st, p, `Bought a ${def.name}. It will be ready next turn.`);
  return ok();
}

export function rigBuildProblem(st, p, x, y) {
  const dep = depositAt(st, x, y);
  if (!dep || !st.players[p].known[dep.id]) return 'Rigs go on oil deposits you have discovered.';
  const r = rigAt(st, x, y);
  if (r && r.owner === p) return 'You already have a rig here.';
  if (!st.ships.some(s => s.owner === p && dist(shipCells(s), [[x, y]]) <= 1)) return 'One of your ships must be next to the deposit.';
  if (st.players[p].money < rigCost(st, p)) return 'Not enough money.';
  if (shipAt(st, x, y, s => s.owner === p)) return 'Move your ship off the deposit first.';
  return null;
}

export function doBuyRig(st, a) {
  const p = st.current;
  const why = rigBuildProblem(st, p, a.x, a.y);
  if (why) return fail(why);
  const blk = hiddenBlocker(st, p, [[a.x, a.y]], null);
  if (blk) {
    revealBlocker(st, p, blk);
    log(st, p, blk.kind === 'rig' ? 'This deposit is already claimed by an enemy rig!' : 'An unseen enemy is sitting on this deposit!');
    return ok();
  }
  st.players[p].money -= rigCost(st, p);
  const dep = depositAt(st, a.x, a.y);
  st.rigs.push({ id: 'r' + st.nextId++, owner: p, x: a.x, y: a.y, hp: RIG.hp, depId: dep.id });
  log(st, p, `Built an oil rig at ${coord(a.x, a.y)}.`);
  return ok();
}

export function sellValue(st, amount) {
  let price = st.market.price, total = 0;
  for (let i = 0; i < amount; i++) { total += price; price = Math.max(MARKET.minPrice, price - MARKET.dropPerUnit); }
  return { total: Math.floor(total), price };
}

export function doSell(st, a) {
  const p = st.current, me = st.players[p];
  const n = Math.min(Math.floor(a.amount), me.oil);
  if (n <= 0) return fail('No oil to sell.');
  const { total, price } = sellValue(st, n);
  me.oil -= n; me.money += total; st.market.price = price;
  log(st, p, `Sold ${n} oil for $${total}.`);
  return ok();
}
