// Early warnings: what next turn's upkeep will do to your fleet, and whether there's oil for the
// voyages and standing orders you've set. Used by the UI to warn before ships are lost by accident.
import { FUNDING } from '../data/research.js';
import { SHIPS } from '../data/ships.js';
import { fleetOf } from './fleets.js';
import { platformUpkeep } from './bases.js';
import { moveCost, upkeepOf } from './stats.js';
import { sellValue } from './economy.js';

// Replays next turn's upkeep (research funding first, then platforms, then ships cheapest first,
// exactly like the engine) without changing anything.
// What happened since p last ended their turn: the messages marked for the turn summary, oldest first.
export function turnSummary(st, p) {
  const pl = st.players[p], from = pl.summaryFrom ?? Infinity;
  return pl.log.filter(l => l.k && (l.n || 0) > from).reverse();
}

export function upkeepForecast(st, p) {
  const me = st.players[p];
  let money = me.money;
  const funding = Math.min(me.research?.funding || 0, Math.floor(money / FUNDING.costPerRp)) * FUNDING.costPerRp;
  money -= funding;
  const plat = platformUpkeep(st, p);
  const ships = st.ships.filter(s => s.owner === p).sort((a, b) => upkeepOf(st, p, a.type) - upkeepOf(st, p, b.type));
  let need = plat + ships.reduce((t, s) => t + upkeepOf(st, p, s.type), 0);
  money -= Math.min(money, plat);
  const unpaid = [];
  for (const s of ships) {
    const u = upkeepOf(st, p, s.type);
    if (money >= u) money -= u; else unpaid.push(s);
  }
  const short = Math.max(0, need + funding - me.money);
  // how much oil would cover it (at today's price)
  let oilToCover = 0;
  if (unpaid.length) {
    while (oilToCover < me.oil && sellValue(st, oilToCover, p).total < need + funding - me.money) oilToCover++;
    if (sellValue(st, oilToCover, p).total < need + funding - me.money) oilToCover = null; // not enough oil
  }
  return {
    need, funding, short, unpaid,
    sinking: unpaid.filter(s => s.hp <= 1),
    oilToCover,
  };
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
