// Derived numbers: prices, upkeep, movement cost and domination counts.
import { DOMINATION, ECONOMY, PORT, RIG, TIER_RIGS } from '../data/economy.js';
import { SHIPS } from '../data/ships.js';
import { dist, shipCells, zoneOf } from './geometry.js';
import { passives } from './util.js';

// ---------- helpers ----------
export const rigsOwned = (st, p) => st.rigs.filter(r => r.owner === p).length;

export const rigCost = (st, p) => RIG.baseCost + RIG.costPerRig * rigsOwned(st, p);

export const tierUnlocked = (st, p, tier) => rigsOwned(st, p) >= TIER_RIGS[tier];

export const upkeepOf = type => SHIPS[type].passives?.upkeep ?? Math.round(SHIPS[type].cost * ECONOMY.upkeepRate);

export const upkeepTotal = (st, p) => st.ships.filter(s => s.owner === p).reduce((t, s) => t + upkeepOf(s.type), 0);

// Rigs outside your own home waters act as forward ports for launching ships.
// Forward ports: built on island coasts, they let you launch ships near the front.
export const forwardPorts = (st, p) => (st.ports || []).filter(o => o.owner === p);

export const portCost = (st, p) => PORT.baseCost + PORT.costPerPort * forwardPorts(st, p).length;

export const middleDeposits = st => st.deposits.filter(d => zoneOf(st, d.x, d.y) === 'middle');

// Domination is about the rich deposits in No Man's Sea.
export const dominationDeposits = st => middleDeposits(st).filter(d => d.type === 'rich');
export const dominationNeed = st => Math.max(1, Math.ceil(dominationDeposits(st).length * DOMINATION.share));

export const middleRigs = (st, p) => {
  const rich = new Set(dominationDeposits(st).map(d => d.id));
  return st.rigs.filter(r => r.owner === p && rich.has(r.depId)).length;
};

export function commandBonus(st, ship) {
  const cells = shipCells(ship);
  return st.ships.some(o => o.owner === ship.owner && o.id !== ship.id && passives(o).command &&
    dist(shipCells(o), cells) <= passives(o).command) ? 1 : 0;
}

function fuelLineActive(st, ship) {
  const cells = shipCells(ship);
  return st.ships.some(o => o.owner === ship.owner && o.id !== ship.id && passives(o).fuelLine &&
    dist(shipCells(o), cells) <= passives(o).fuelLine);
}

export function moveCost(st, ship, steps) {
  const rate = SHIPS[ship.type].oil;
  return fuelLineActive(st, ship) ? Math.ceil((steps * rate) / 2) : steps * rate;
}
