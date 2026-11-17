// Game flow: pass-the-device screen, game over, entering and leaving the tutorial.
import * as E from '../engine/index.js';
import { hideHome, showHome, showMenu, showSetup } from './menu.js';
import { fmt, setup } from './settings.js';
import { A } from './state.js';
import { load } from './storage.js';
import { showTurnSummary } from '../ui/summary.js';
import { play } from '../ui/sound.js';
import { startTimer, stopTimer } from './timer.js';
import { tutorial } from './tutorialHost.js';
import { PLAYER_COLORS } from '../data/maps.js';
import { newTutorialGame } from '../tutorial/map.js';
import { closeOverlay, showOverlay } from '../ui/dialogs.js';
import { refresh, setState } from '../ui/index.js';
import { toast } from '../ui/status.js';
import { isBot } from '../ai/index.js';
import { humans, playBotTurns } from './bots.js';
import { onlineHandoff } from './online.js';
import { simulHandoff } from './simul.js';

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
  A.sessionActive = false;
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
  if (st.simul) { simulHandoff(st); return; } // simultaneous rounds: everyone at once (simul.js)
  if (onlineHandoff(st)) return; // online games decide whose screen does what
  // a computer's turn: let the bots play, then come back here for the next human
  if (isBot(st, st.current)) { playBotTurns(s => (s.phase === 'over' ? gameOver(s) : handoff(s, reason))); return; }
  const p = st.current, pl = st.players[p];
  // only one human at the table: no need to pass the device around
  if (humans(st).length === 1) {
    if (document.querySelector('#overlay [data-curtain]')) closeOverlay();
    A.sessionActive = true; refresh(); startTimer();
    if (reason) toast(reason);
    play('chime');
    showTurnSummary(st, p);
    return;
  }
  showOverlay(`
    ${reason ? `<p style="color:#ff6b6b;font-weight:700;margin-top:0">${reason}</p>` : ''}
    <h2><span style="color:${PLAYER_COLORS[p]}">${pl.name}</span>'s turn</h2>
    ${st.turnTimer ? `<p class="muted small">You'll have ${fmt(st.turnTimer)} once you reveal your fleet.</p>` : ''}
    <p class="muted">Pass the device to <b style="color:var(--text)">${pl.name}</b>. Everyone else, look away!</p>
    <div class="row" style="margin-top:16px"><button class="primary big" data-go>I'm ${pl.name}, show my fleet</button></div>`,
  (card, close) => card.querySelector('[data-go]').onclick = () => { close(); A.sessionActive = true; refresh(); startTimer(); play('chime'); showTurnSummary(st, p); });
}

export function gameOver(st) {
  stopTimer();
  refresh();
  if (st.tutorial) {
    showOverlay(`
      <h2>Tutorial complete!</h2>
      <p>You sank the enemy's last ship, and with no rigs or money left, they're out. That's how you win: be the <b>last rig standing</b>.</p>
      <p class="muted">You learned to move, survey, build rigs, sell oil, build ships, research, form fleets, give standing orders, scout and attack. In a real game:</p>
      <ul class="muted">
        <li>Enemies shoot back, and firing reveals your rough position.</li>
        <li>Research unlocks bigger ships, platforms and base upgrades.</li>
        <li>The best oil is in No Man's Sea, so you'll have to fight for it.</li>
        <li>Check <b>Rules</b> any time for the details.</li>
      </ul>
      <div class="row" style="margin-top:16px"><button class="primary big" data-new>Start a real game</button><button class="big ghost" data-menu>Back to menu</button></div>`,
    (card, close) => {
      card.querySelector('[data-new]').onclick = () => { close(); tutorial.hide(); showSetup(); };
      card.querySelector('[data-menu]').onclick = () => { close(); exitTutorial(); };
    });
    return;
  }
  A.sessionActive = false;
  showHome('over');
}
