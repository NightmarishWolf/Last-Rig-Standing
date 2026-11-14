// Buying ships, launch zones, and selling oil. (Founding bases and building rigs: see bases.js.)
import { PLATFORMS } from '../data/bases.js';
import { MARKET } from '../data/economy.js';
import { SHIPS } from '../data/ships.js';
import { activePlatforms, sellMultOf } from './bases.js';
import { cellsOf, inSpawn } from './geometry.js';
import { pstat, shipStat } from './modifiers.js';
import { shipNeeds, shipUnlocked } from './research.js';
import { addShip } from './setup.js';
import { forwardPorts } from './stats.js';
import { fail, log, ok } from './util.js';
import { hiddenBlocker, placementOk, revealBlocker, visibility } from './visibility.js';
import { TECH } from '../data/research.js';

// Where new ships can appear: your spawn strip, near your forward ports, or near your dry docks.
export function launchSites(st, p) {
  const sites = forwardPorts(st, p).map(o => ({ x: o.x, y: o.y, r: pstat(st, p, 'portRange') }));
  for (const d of activePlatforms(st, p, 'drydock')) sites.push({ x: d.x, y: d.y, r: PLATFORMS.drydock.launch });
  return sites;
}
export function inLaunchZone(st, p, cells) {
  if (cells.every(([x, y]) => inSpawn(st, p, x, y))) return true;
  return launchSites(st, p).some(o => cells.every(([x, y]) => Math.max(Math.abs(x - o.x), Math.abs(y - o.y)) <= o.r));
}

export const shipCost = (st, p, type) => shipStat(st, p, type, 'cost');

export function doBuyShip(st, a) {
  const p = st.current, def = SHIPS[a.ship];
  if (!def) return fail('Unknown ship.');
  if (!shipUnlocked(st, p, a.ship)) return fail(`Research ${TECH[shipNeeds(a.ship)]?.name || '?'} first.`);
  const cost = shipCost(st, p, a.ship);
  if (st.players[p].money < cost) return fail('Not enough money.');
  const lim = def.passives?.limit;
  if (lim && st.ships.filter(s => s.owner === p && s.type === a.ship).length >= lim) return fail(`Limit ${lim}.`);
  const cells = cellsOf(a.ship, a.x, a.y, a.rot);
  if (!inLaunchZone(st, p, cells)) return fail('New ships launch in your spawn zone, or near your forward ports and dry docks.');
  if (!placementOk(st, p, cells, null, visibility(st, p))) return fail('That spot is blocked.');
  const blk = hiddenBlocker(st, p, cells, null);
  if (blk) {
    revealBlocker(st, p, blk);
    log(st, p, 'Launch blocked: an enemy is lurking in your launch zone!');
    return ok();
  }
  st.players[p].money -= cost;
  addShip(st, p, a.ship, a.x, a.y, a.rot);
  log(st, p, `Bought a ${def.name}. It will be ready next turn.`);
  return ok();
}

// Selling: price falls a little per unit sold (slower with some research), refineries and research pay more.
export function sellValue(st, amount, p = st.current) {
  const mult = sellMultOf(st, p), drop = MARKET.dropPerUnit * pstat(st, p, 'priceDropMult');
  let price = st.market.price, total = 0;
  for (let i = 0; i < amount; i++) { total += price * mult; price = Math.max(MARKET.minPrice, price - drop); }
  return { total: Math.floor(total), price };
}

export function doSell(st, a) {
  const p = st.current, me = st.players[p];
  const n = Math.min(Math.floor(a.amount), me.oil);
  if (n <= 0) return fail('No oil to sell.');
  const { total, price } = sellValue(st, n, p);
  me.oil -= n; me.money += total; st.market.price = price;
  log(st, p, `Sold ${n} oil for $${total}.`);
  return ok();
}
