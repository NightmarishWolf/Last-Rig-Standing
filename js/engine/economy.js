// Launch zones and selling oil. (Building ships: production.js. Founding bases and rigs: bases.js.)
import { PLATFORMS } from '../data/bases.js';
import { MARKET, SHIP_SALE } from '../data/economy.js';
import { SHIPS } from '../data/ships.js';
import { activePlatforms, claimAt, sellMultOf } from './bases.js';
import { inSpawn, shipCells, zoneOf } from './geometry.js';
import { pstat, shipStat } from './modifiers.js';
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

// ---------- selling ships ----------
// Half the price back (less for damaged ships), if the ship has been out of combat for a few rounds
// and is in your home waters or inside one of your base claims.
export function shipSaleValue(st, ship) {
  const max = shipStat(st, ship.owner, ship.type, 'hp');
  return Math.floor(shipStat(st, ship.owner, ship.type, 'cost') * SHIP_SALE.share * Math.max(0, ship.hp) / max);
}
export function shipSaleProblem(st, ship) {
  const p = ship.owner;
  const quiet = st.round - (ship.combatRound ?? -99);
  if (quiet < SHIP_SALE.quietRounds) return `Saw combat recently: can be sold in ${SHIP_SALE.quietRounds - quiet} round${SHIP_SALE.quietRounds - quiet > 1 ? 's' : ''}.`;
  const cells = shipCells(ship);
  const inside = cells.some(([x, y]) => zoneOf(st, x, y) === p || claimAt(st, x, y)?.owner === p);
  if (!inside) return 'Sail it into your home waters or one of your rig bases\' claims to sell it.';
  return null;
}
export function doSellShip(st, a) {
  const ship = st.ships.find(s => s.id === a.shipId);
  if (!ship || ship.owner !== st.current) return fail('Not your ship.');
  const why = shipSaleProblem(st, ship);
  if (why) return fail(why);
  const value = shipSaleValue(st, ship);
  st.ships = st.ships.filter(s => s !== ship);
  st.players[ship.owner].money += value;
  log(st, ship.owner, `Sold a ${SHIPS[ship.type].name} for $${value}.`);
  return ok();
}
