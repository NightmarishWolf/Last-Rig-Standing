// ============================================================
// LAST RIG STANDING: start-up.
// Wires the engine, UI, menus and tutorial together. See README.md for the file map.
// ============================================================
import * as E from './engine/index.js';
import { gameOver, handoff } from './app/flow.js';
import { hideHome, showHome, showMenu } from './app/menu.js';
import { initOnline, localAction, onlineRole } from './app/online.js';
import { playBotTurns } from './app/bots.js';
import { startTimer, stopTimer } from './app/timer.js';
import { setup } from './app/settings.js';
import { A } from './app/state.js';
import { load, save } from './app/storage.js';
import { tutorial } from './app/tutorialHost.js';
import { initUI, redraw, setState } from './ui/index.js';
import { S } from './ui/state.js';

A.state = load() || E.newGame(setup);

initUI(A.state, {
  // (in an online game only the host keeps the save; players rejoin it)
  save: st => { if (onlineRole() !== 'client') save(st); },
  handoff, gameOver, showMenu,
  onAction: localAction,
  afterRender: (st, ui) => tutorial.afterRender(st, ui),
  markers: () => (A.state.tutorial ? tutorial.markers() : []),
});

// keep tutorial markers glowing
(function tick() { if (A.state.tutorial || S.ping || S.animating) redraw(); requestAnimationFrame(tick); })();

setState(A.state);

initOnline({
  handoff, gameOver, showHome, hideHome, startTimer, stopTimer, playBotTurns,
  lobbyChanged: () => { if (document.getElementById('home').dataset.view === 'lobby' && document.body.classList.contains('at-home')) showHome('lobby'); },
});

// an invite link (?join=CODE) opens the online page with the code filled in
const joinCode = new URLSearchParams(location.search).get('join');
if (joinCode) showHome('online', { code: joinCode });
else showMenu();
