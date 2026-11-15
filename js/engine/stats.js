// Derived numbers: prices, upkeep, movement cost and domination counts.
import { ECONOMY, PORT } from '../data/economy.js';
import { SHIPS } from '../data/ships.js';
import { baseFoundCost, platformUpkeep } from './bases.js';
import { dist, shipCells, zoneOf } from './geometry.js';
import { pstat, shipStat } from './modifiers.js';
import { passives } from './util.js';

export const rigsOwned = (st, p) => st.rigs.filter(r => r.owner === p).length;

// Founding a new rig base (kept as "rigCost" for older code).
export const rigCost = (st, p) => baseFoundCost(st, p);

// Ship upkeep: a share of the ship's price each turn (the Nuclear Submarine has its own fixed upkeep).
export const upkeepOf = (st, p, type) =>
  Math.round((SHIPS[type].passives?.upkeep ?? shipStat(st, p, type, 'cost') * ECONOMY.upkeepRate) * pstat(st, p, 'upkeepMult'));

export const upkeepTotal = (st, p) =>
  st.ships.filter(s => s.owner === p).reduce((t, s) => t + upkeepOf(st, p, s.type), 0) + platformUpkeep(st, p);

// Forward ports: built on island coasts, they let you launch ships near the front.
export const forwardPorts = (st, p) => (st.ports || []).filter(o => o.owner === p);

export const portCost = (st, p) => PORT.baseCost + PORT.costPerPort * forwardPorts(st, p).length;

export const middleDeposits = st => st.deposits.filter(d => zoneOf(st, d.x, d.y) === 'middle');

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

// Oil for sailing `steps` squares (turns count as a square). Research can make it cheaper.
export function moveCost(st, ship, steps) {
  const rate = shipStat(st, ship.owner, ship.type, 'oil');
  return Math.ceil((fuelLineActive(st, ship) ? steps * rate / 2 : steps * rate) - 1e-9);
}
