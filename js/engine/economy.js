// Launch zones and selling oil. (Building ships: production.js. Founding bases and rigs: bases.js.)
import { PLATFORMS } from '../data/bases.js';
import { MARKET } from '../data/economy.js';
import { activePlatforms, sellMultOf } from './bases.js';
import { inSpawn } from './geometry.js';
import { pstat } from './modifiers.js';
import { forwardPorts } from './stats.js';
import { fail, log, ok } from './util.js';

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
