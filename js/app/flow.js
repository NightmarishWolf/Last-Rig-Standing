// Game flow: pass-the-device screen, game over, entering and leaving the tutorial.
import * as E from '../engine/index.js';
import { showMenu, showSetup } from './menu.js';
import { fmt, setup } from './settings.js';
import { A } from './state.js';
import { load } from './storage.js';
import { startTimer, stopTimer } from './timer.js';
import { tutorial } from './tutorialHost.js';
import { PLAYER_COLORS } from '../data/maps.js';
import { newTutorialGame } from '../tutorial/map.js';
import { showOverlay } from '../ui/dialogs.js';
import { refresh, setState } from '../ui/index.js';

export function startTutorial() {
  stopTimer(); A.sessionActive = false;
  tutorial.reset();
  A.state = newTutorialGame();
  setState(A.state);
}

export function exitTutorial() {
  stopTimer();
  tutorial.hide();
  A.state = load() || E.newGame(setup);
  setState(A.state);
  showMenu();
}

export function handoff(st, reason) {
  stopTimer();
  if (st.tutorial) {
    // the enemy does nothing in the tutorial: skip straight back to the player
    while (st.phase === 'playing' && st.current !== 0) E.applyAction(st, { type: 'endTurn' });
    refresh();
    return;
  }
  const p = st.current, pl = st.players[p];
  showOverlay(`
    ${reason ? `<p style="color:#ff6b6b;font-weight:700;margin-top:0">${reason}</p>` : ''}
    <h2><span style="color:${PLAYER_COLORS[p]}">${pl.name}</span>'s turn</h2>
    ${st.turnTimer ? `<p class="muted small">You'll have ${fmt(st.turnTimer)} once you reveal your fleet.</p>` : ''}
    <p class="muted">Pass the device to <b style="color:var(--text)">${pl.name}</b>. Everyone else, look away!</p>
    <div class="row" style="margin-top:16px"><button class="primary big" data-go>I'm ${pl.name}, show my fleet</button></div>`,
  (card, close) => card.querySelector('[data-go]').onclick = () => { close(); A.sessionActive = true; refresh(); startTimer(); });
}

export function gameOver(st) {
  stopTimer();
  if (st.tutorial) {
    showOverlay(`
      <h2>Tutorial complete!</h2>
      <p>You sank the enemy's last ship, and with no rigs or money left, they're out. That's how you win: be the <b>last rig standing</b>.</p>
      <p class="muted">You learned to move, survey, build rigs, sell oil, buy ships, scout and attack. In a real game:</p>
      <ul class="muted">
        <li>Enemies shoot back, and firing reveals your rough position.</li>
        <li>Own 3 rigs to unlock Tier 2 ships, 5 rigs for Tier 3.</li>
        <li>The best oil is in No Man's Sea, so you'll have to fight for it.</li>
        <li>Check <b>Rules</b> any time for the details.</li>
      </ul>
      <div class="row" style="margin-top:16px"><button class="primary big" data-new>Start a real game</button><button class="big ghost" data-menu>Back to menu</button></div>`,
    (card, close) => {
      card.querySelector('[data-new]').onclick = () => { tutorial.hide(); showSetup(!!(load() && load().phase === 'playing')); };
      card.querySelector('[data-menu]').onclick = () => { close(); exitTutorial(); };
    });
    return;
  }
  const w = st.winner;
  showOverlay(`
    <h2>${w === null ? 'Nobody' : `<span style="color:${PLAYER_COLORS[w]}">${st.players[w].name}</span>`} wins!</h2>
    <p class="muted">${w === null ? 'Every fleet went down.' : st.winReason === 'domination' ? `${st.players[w].name} held No Man's Sea for 5 rounds straight. Domination victory in round ${st.round}.` : `${st.players[w].name} is the last rig standing after ${st.round} rounds.`}</p>
    <div class="row" style="margin-top:16px"><button class="primary big" data-new>New game</button></div>`,
  (card) => card.querySelector('[data-new]').onclick = () => showSetup(false));
}
