// The two public entry points: applyAction() changes the game, getView() is what one player may see.
import { doAct } from './abilities.js';
import { doSell, doSellShip } from './economy.js';
import { doBuyShip, doCancelBuild } from './production.js';
import { doCancelFleetOrder, doDisbandFleet, doFormFleet, doJoinFleet, doLeaveFleet, doReformFleet, doRegroupFleet, doSetFleetOrder, fleetsOf, runFleetOrders, tidyFleets } from './fleets.js';
import { doSetStanding, runStanding } from './standing.js';
import { doBaseStrike, doSatellite } from './strikes.js';
import { baseById, doBuildPlatform, doBuyRig, doUpgradeBase } from './bases.js';
import { doDequeue, doFunding, doQueue, doResearch } from './research.js';
import { doMoveCapital } from './victory.js';
import { shipCells } from './geometry.js';
import { doMove, doRotate } from './movement.js';
import { doCancelOrder, doSetOrder, runVoyages } from './orders.js';
import { doBuyPort } from './ports.js';
import { forwardPorts } from './stats.js';
import { checkWin, eliminate, nextTurn } from './turns.js';
import { fail, ok, r2 } from './util.js';
import { visibility } from './visibility.js';

export function applyAction(st, a) {
  if (st.phase !== 'playing') return fail('Game over.');
  const r = runAction(st, a);
  tidyFleets(st); // ships sunk along the way leave their fleets
  for (const pl of st.players) { pl.money = r2(pl.money); pl.oil = r2(pl.oil); } // two decimals, no float drift
  return r;
}

function runAction(st, a) {
  switch (a.type) {
    case 'move': return doMove(st, a);
    case 'rotate': return doRotate(st, a);
    case 'act': return doAct(st, a);
    case 'buyShip': return doBuyShip(st, a);          // { ship, yard }: queue at a shipyard, paid now
    case 'cancelBuild': return doCancelBuild(st, a);
    case 'buyRig': return doBuyRig(st, a);
    case 'buyPort': return doBuyPort(st, a);
    case 'buildPlatform': return doBuildPlatform(st, a);
    case 'upgradeBase': return doUpgradeBase(st, a);
    case 'research': return doResearch(st, a);
    case 'queueResearch': return doQueue(st, a);
    case 'dequeueResearch': return doDequeue(st, a);
    case 'setFunding': return doFunding(st, a);
    case 'moveCapital': return doMoveCapital(st, a);
    case 'setOrder': return doSetOrder(st, a);
    case 'cancelOrder': return doCancelOrder(st, a);
    case 'formFleet': return doFormFleet(st, a);
    case 'joinFleet': return doJoinFleet(st, a);
    case 'leaveFleet': return doLeaveFleet(st, a);
    case 'disbandFleet': return doDisbandFleet(st, a);
    case 'reformFleet': return doReformFleet(st, a);
    case 'regroupFleet': return doRegroupFleet(st, a);
    case 'setFleetOrder': return doSetFleetOrder(st, a);
    case 'cancelFleetOrder': return doCancelFleetOrder(st, a);
    case 'setStanding': return doSetStanding(st, a);
    case 'baseStrike': return doBaseStrike(st, a);   // { platformId, x, y }: recon drone, cruise missile, bomber sortie
    case 'satellite': return doSatellite(st, a);     // { x, y }
    case 'sell': return doSell(st, a);
    case 'sellShip': return doSellShip(st, a);      // { shipId }
    case 'endTurn':
      // the turn summary next time shows everything from here on (what your ships do on their own included)
      st.players[st.current].summaryFrom = st.logSeq || 0;
      // before the turn passes: voyages sail on, then fleets, then standing orders
      runVoyages(st, st.current);
      if (st.phase === 'playing') runFleetOrders(st, st.current);
      if (st.phase === 'playing') runStanding(st, st.current);
      if (st.phase === 'playing') nextTurn(st);
      return ok();
    case 'surrender': {
      const p = st.current;
      eliminate(st, p, 'has surrendered');
      checkWin(st);
      if (st.phase === 'playing') nextTurn(st);
      return ok();
    }
  }
  return fail('Unknown action.');
}

// What player p is allowed to see. The UI draws only this, so in online
// play you could send each player just their own view.
export function getView(st, p) {
  const vis = visibility(st, p);
  const me = st.players[p];
  return {
    me, p,
    myShips: st.ships.filter(s => s.owner === p),
    myRigs: st.rigs.filter(r => r.owner === p),
    myMines: st.mines.filter(m => m.owner === p),
    enemyShips: st.ships.filter(s => s.owner !== p && vis.ships.has(s.id)).map(s => ({ id: s.id, owner: s.owner, cells: shipCells(s) })),
    enemyRigs: st.rigs.filter(r => r.owner !== p && vis.rigs.has(r.id)),
    myPorts: forwardPorts(st, p),
    enemyPorts: (st.ports || []).filter(o => o.owner !== p && vis.ports.has(o.id)),
    myPlatforms: (st.platforms || []).filter(o => o.owner === p),
    enemyPlatforms: (st.platforms || []).filter(o => o.owner !== p && vis.platforms.has(o.id)),
    myBases: (st.bases || []).filter(b => b.owner === p),
    myFleets: fleetsOf(st, p),
    builds: me.builds || [],
    // enemy bases are known once you've seen their central rig (or its wreck)
    enemyBases: (st.bases || []).filter(b => b.owner !== p && st.rigs.some(r => r.baseId === b.id && r.center && vis.rigs.has(r.id))),
    deposits: st.deposits.filter(d => me.known[d.id]),
    wrecks: st.wrecks,
  };
}
