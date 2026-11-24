// Early warnings: what next turn's upkeep will do to your fleet, and whether there's oil for the
// voyages and standing orders you've set. Used by the UI to warn before ships are lost by accident.
import { FUNDING } from '../data/research.js';
import { SHIPS } from '../data/ships.js';
import { fleetOf } from './fleets.js';
import { platformUpkeep } from './bases.js';
import { moveCost, upkeepOf } from './stats.js';
import { sellValue, shipSaleValue } from './economy.js';
import { REPO } from '../data/economy.js';
import { shipStat } from './modifiers.js';

// What happened since p last ended their turn: the messages marked for the turn summary, oldest first.
// (turn summary)
export function turnSummary(st, p) {
  const pl = st.players[p], from = pl.summaryFrom ?? Infinity;
  return pl.log.filter(l => l.k && (l.n || 0) > from).reverse();
}

// Next turn's bills (research funding, then platform and ship upkeep) without changing anything:
// whether they put you in the red, how long until the bank repossesses ships, and which it would take.
export function upkeepForecast(st, p) {
  const me = st.players[p];
  const funding = Math.max(0, Math.min(me.research?.funding || 0, Math.floor(me.money / FUNDING.costPerRp))) * FUNDING.costPerRp;
  const ships = st.ships.filter(s => s.owner === p && !s.onLoan); // (ships on loan: no upkeep, not the bank's to take)
  const need = platformUpkeep(st, p) + ships.reduce((t, s) => t + upkeepOf(st, p, s.type), 0);
  const after = me.money - funding - need;          // money after next turn's bills
  const red = after < 0;
  const redNext = red ? (me.money >= 0 ? 0 : me.redRounds || 0) + 1 : 0; // rounds in the red counting next turn
  const turnsLeft = red ? Math.max(0, REPO.graceRounds - redNext + 1) : null; // turns to fix it before ships go
  // ships the bank would take next turn: most expensive first until back to $0
  const repo = [];
  const worth = ships.reduce((t, s) => t + shipSaleValue(st, s), 0);
  const bankrupt = red && redNext > REPO.graceRounds && after + worth < 0; // game over next turn
  if (red && redNext > REPO.graceRounds && !bankrupt) {
    let m = after;
    const cost = s => shipStat(st, p, s.type, 'cost');
    for (const s of [...ships].sort((a, b) => cost(b) - cost(a) || shipSaleValue(st, b) - shipSaleValue(st, a) || String(a.id).localeCompare(String(b.id)))) {
      if (m >= 0) break; m += shipSaleValue(st, s); repo.push(s);
    }
  }
  // how much oil would cover it (at today's price)
  let oilToCover = 0;
  if (red) {
    while (oilToCover < me.oil && sellValue(st, oilToCover, p).total < -after) oilToCover++;
    if (sellValue(st, oilToCover, p).total < -after) oilToCover = null; // not enough oil
  }
  return { need, funding, after, short: Math.max(0, -after), red, redNext, turnsLeft, repo, bankrupt, worth, oilToCover };
}

// Oil the ships with voyages, fleet orders or standing orders will want at the end of this turn.
export function oilForecast(st, p) {
  const busy = st.ships.filter(s => s.owner === p && (s.order || s.standing || fleetOf(st, s.id)?.order || fleetOf(st, s.id)?.standing));
  const want = busy.reduce((t, s) => t + moveCost(st, s, Math.max(0, s.movesLeft || 0)), 0);
  return { want, have: st.players[p].oil, short: Math.max(0, want - st.players[p].oil), ships: busy.length };
}

export const shipNames = list => {
  const n = {};
  for (const s of list) n[SHIPS[s.type].name] = (n[SHIPS[s.type].name] || 0) + 1;
  return Object.entries(n).map(([k, v]) => (v > 1 ? `${v} ${k}s` : `a ${k}`)).join(', ');
};
