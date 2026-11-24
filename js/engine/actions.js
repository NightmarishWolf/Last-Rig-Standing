// The two public entry points: applyAction() changes the game, getView() is what one player may see.
import { SHIPS } from '../data/ships.js';
import { doPower } from './powers.js';
import { doAct } from './abilities.js';
import { doFixBlowout, worldRound } from './world.js';
import { autoSell, doSell, doSellShip, doSetAutoSell } from './economy.js';
import { doBuyShip, doCancelBuild } from './production.js';
import { doCancelFleetOrder, doDisbandFleet, doFormFleet, doJoinFleet, doLeaveFleet, doReformFleet, doRegroupFleet, doSetFleetOrder, fleetsOf, runFleetOrders, tidyFleets } from './fleets.js';
import { doSetStanding, runStanding } from './standing.js';
import { doBaseStrike, doSatellite } from './strikes.js';
import { baseById, doBuildPlatform, doBuyRig, doUpgradeBase } from './bases.js';
import { doDequeue, doFunding, doQueue, doResearch } from './research.js';
import { doMoveCapital, processLastRig } from './victory.js';
import { shipCells } from './geometry.js';
import { doMove, doRotate } from './movement.js';
import { doCancelOrder, doSetOrder, runVoyages } from './orders.js';
import { doBuyPort } from './ports.js';
import { forwardPorts } from './stats.js';
import { checkWin, eliminate, nextTurn, recordHistory, startTurn } from './turns.js';
import { allied, fail, ok, r2 } from './util.js';
import { visibility, exploreAll } from './visibility.js';
import { burning, tideSources } from './factions.js';

// Every move that works is numbered (st.seq) and shown to whoever listens (the replay recorder).
// Replaying the same moves, in order, on a copy of the starting game gives the same game.
let listener = null;
export const onApplied = fn => { listener = fn; };
// Campaign missions hook in here (js/campaign/runner.js): something that happens as you end your turn,
// before your ships' voyages and standing orders (e.g. an escorted ship sailing on).
export const turnHooks = { beforeEndTurn: null };
// Ships a mission sails for you (st.campaign.locked): you can't give them orders.
const lockedIn = (st, a) => {
  const L = st.campaign?.locked;
  if (!L?.length || a.script) return null;
  const ids = [a.shipId, ...(a.shipIds || [])].filter(Boolean);
  const s = ids.map(id => st.ships.find(x => x.id === id)).find(x => x && L.includes(x.id));
  return s ? `The ${s.name || 'ship'} follows her own orders: you can't command her.` : null;
};

export function applyAction(st, a) {
  if (st.phase !== 'playing') return fail('Game over.');
  let r;
  if (st.simul && a.by != null) {
    // simultaneous rounds: anyone can act at any time; the action says who (a.by). The engine's
    // "acting player" (st.current) is pointed at them for the length of the action.
    if (!st.players[a.by] || st.players[a.by].out) return fail('You are out of the game.');
    if (st.ready[a.by] && a.type !== 'ready') return fail('You are ready: press "Not ready" to keep playing.');
    const prev = st.current;
    st.current = a.by;
    try { r = runAction(st, a); } finally { st.current = st.phase === 'playing' ? prev : st.current; }
  } else r = runAction(st, a);
  tidyFleets(st); // ships sunk along the way leave their fleets
  for (const pl of st.players) { pl.money = r2(pl.money); pl.oil = r2(pl.oil); } // two decimals, no float drift
  if (r.ok && st.exploreFog) exploreAll(st); // reveal fog: whatever is in sight now stays revealed
  if (r.ok) { st.seq = (st.seq || 0) + 1; listener?.(st, a); }
  return r;
}

function runAction(st, a) {
  const why = lockedIn(st, a);
  if (why) return fail(why);
  switch (a.type) {
    case 'move': return doMove(st, a);
    case 'rotate': return doRotate(st, a);
    case 'act': return doAct(st, a);
    case 'buyShip': return doBuyShip(st, a);          // { ship, yard }: queue at a shipyard, paid now
    case 'cancelBuild': return doCancelBuild(st, a);
    case 'buyRig': return doBuyRig(st, a);
    case 'fixBlowout': return doFixBlowout(st, a);
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
    case 'power': return doPower(st, a);             // { power, x?, y? } (commander powers)
    case 'sell': return doSell(st, a);
    case 'sellShip': return doSellShip(st, a);      // { shipId }
    case 'setAutoSell': return doSetAutoSell(st, a); // { on?, keep? }
    case 'ready': return doReady(st, a.by ?? st.current, a.ready !== false);
    case 'endTurn':
      if (st.simul) return doReady(st, a.by ?? st.current, true);
      // the turn summary next time shows everything from here on (what your ships do on their own included)
      st.players[st.current].summaryFrom = st.logSeq || 0;
      turnHooks.beforeEndTurn?.(st);
      if (st.phase !== 'playing') return ok();
      // before the turn passes: voyages sail on, then fleets, then standing orders
      runVoyages(st, st.current);
      if (st.phase === 'playing') runFleetOrders(st, st.current);
      if (st.phase === 'playing') runStanding(st, st.current);
      if (st.phase === 'playing') autoSell(st, st.current); // (Automated Trading: oil above what you keep)
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
    // (pirates show what they are; a ship in sight shows if it's burning: badly damaged enough to board; a contact doesn't)
    // (seen with your own eyes: you can tell its type and heading, though a Q-Ship passes for an Oil Barge
    // until it fires)
    enemyShips: st.ships.filter(s => s.owner !== p && !allied(st, p, s.owner) && vis.ships.has(s.id)).map(s => ({ id: s.id, owner: s.owner, cells: shipCells(s), ...(vis.ident.has(s.id) && burning(st, s, p) ? { burning: true } : {}),
      ...(vis.ident.has(s.id) ? { type: seenType(st, s), x: s.x, y: s.y, rot: s.rot } : {}), ...(s.owner < 0 ? { type: s.type, x: s.x, y: s.y, rot: s.rot, hp: s.hp, neutral: s.neutral } : {}) })),
    enemyRigs: st.rigs.filter(r => r.owner !== p && !allied(st, p, r.owner) && vis.rigs.has(r.id)),
    myPorts: forwardPorts(st, p),
    enemyPorts: (st.ports || []).filter(o => o.owner !== p && !allied(st, p, o.owner) && vis.ports.has(o.id)),
    myPlatforms: (st.platforms || []).filter(o => o.owner === p),
    enemyPlatforms: (st.platforms || []).filter(o => o.owner !== p && !allied(st, p, o.owner) && vis.platforms.has(o.id)),
    myBases: (st.bases || []).filter(b => b.owner === p),
    myFleets: fleetsOf(st, p),
    builds: me.builds || [],
    // enemy bases are known once you've seen their central rig (or its wreck)
    enemyBases: (st.bases || []).filter(b => b.owner !== p && !allied(st, p, b.owner) && st.rigs.some(r => r.baseId === b.id && r.center && vis.rigs.has(r.id))),
    deposits: st.deposits.filter(d => me.known[d.id]),
    wrecks: st.wrecks,
    // the Free Tide's raft network: your own, and enemy Tide around bases and ships you can see
    tides: tidesSeen(st, p, vis),
  };
}

// what a ship looks like to someone watching it (disguised ships pass for something else until they fire)
function seenType(st, s) {
  const d = SHIPS[s.type].disguise;
  return d && !((s.firedRound ?? -9) >= st.round - 1) ? d : s.type;
}

function tidesSeen(st, p, vis) {
  const out = [];
  st.players.forEach((pl, o) => {
    if (pl.out || pl.faction !== 'tide') return;
    for (const t of tideSources(st, o)) {
      if (o !== p && !st.noFog) {
        const b = (st.bases || []).find(b => b.id === t.id);
        const seen = b ? st.rigs.some(r => r.baseId === b.id && r.center && vis.rigs.has(r.id)) : vis.ships.has(t.id);
        if (!seen) continue;
      }
      out.push({ owner: o, x: t.x, y: t.y, r: t.r });
    }
  });
  return out;
}

// ---------- simultaneous rounds ----------
// Everyone plays the same round at once; each player says when they're done (ready). When every
// player still in the game is ready, the round ends for all of them together: voyages, fleet orders
// and standing orders run (in seat order), then the next round starts for everyone (oil, upkeep,
// research, launches...). turnCount still goes up once per player, so anything that counts turns
// (cooldowns, memories of sightings) behaves as in turn-by-turn games.
function doReady(st, p, ready) {
  if (!st.simul) return fail('This game takes turns.');
  if (!st.ready) st.ready = st.players.map(pl => !!pl.out);
  if (ready) st.players[p].summaryFrom = st.logSeq || 0;
  st.ready[p] = ready;
  if (st.players.every((pl, i) => pl.out || st.ready[i])) endRound(st);
  return ok();
}
export function endRound(st) {
  const prev = st.current;
  const alive = () => st.players.map((_, i) => i).filter(i => !st.players[i].out);
  // voyages, fleet orders and standing orders (guards firing...) run player by player: whoever goes first
  // gets the first shot, so the order rotates every round
  const n = st.players.length;
  const order = st.players.map((_, i) => (i + st.round) % n).filter(i => !st.players[i].out);
  for (const p of order) {
    st.current = p;
    runVoyages(st, p);
    if (st.phase === 'playing') runFleetOrders(st, p);
    if (st.phase === 'playing') runStanding(st, p);
    if (st.phase === 'playing') autoSell(st, p);
    if (st.phase !== 'playing') return;
  }
  const round0 = st.round;
  recordHistory(st, round0);
  st.round++;
  processLastRig(st);
  if (st.phase !== 'playing') return;
  worldRound(st); // spills fade, world events, pirates, ice
  checkWin(st);
  if (st.phase !== 'playing') return;
  for (const p of alive()) {
    st.turnCount++;
    st.current = p;
    startTurn(st, p, false);
    if (st.phase !== 'playing') return;
  }
  st.ready = st.players.map(pl => !!pl.out);
  st.current = st.players[prev] && !st.players[prev].out ? prev : alive()[0] ?? prev;
}
