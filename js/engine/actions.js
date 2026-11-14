// The two public entry points: applyAction() changes the game, getView() is what one player may see.
import { doAct } from './abilities.js';
import { doBuyRig, doBuyShip, doSell } from './economy.js';
import { shipCells } from './geometry.js';
import { doMove, doRotate } from './movement.js';
import { doBuyPort } from './ports.js';
import { forwardPorts } from './stats.js';
import { checkWin, eliminate, nextTurn } from './turns.js';
import { fail, ok } from './util.js';
import { visibility } from './visibility.js';

export function applyAction(st, a) {
  if (st.phase !== 'playing') return fail('Game over.');
  switch (a.type) {
    case 'move': return doMove(st, a);
    case 'rotate': return doRotate(st, a);
    case 'act': return doAct(st, a);
    case 'buyShip': return doBuyShip(st, a);
    case 'buyRig': return doBuyRig(st, a);
    case 'buyPort': return doBuyPort(st, a);
    case 'sell': return doSell(st, a);
    case 'endTurn': nextTurn(st); return ok();
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
    deposits: st.deposits.filter(d => me.known[d.id]),
    wrecks: st.wrecks,
  };
}
