// ============================================================
// LAST RIG STANDING: start-up.
// Wires the engine, UI, menus and tutorial together. See README.md for the file map.
// ============================================================
import * as E from './engine/index.js';
import { gameOver, handoff } from './app/flow.js';
import { showMenu } from './app/menu.js';
import { setup } from './app/settings.js';
import { A } from './app/state.js';
import { load, save } from './app/storage.js';
import { tutorial } from './app/tutorialHost.js';
import { initUI, redraw, setState } from './ui/index.js';
import { S } from './ui/state.js';

A.state = load() || E.newGame(setup);

initUI(A.state, {
  save, handoff, gameOver, showMenu,
  afterRender: (st, ui) => tutorial.afterRender(st, ui),
  markers: () => (A.state.tutorial ? tutorial.markers() : []),
});

// keep tutorial markers glowing
(function tick() { if (A.state.tutorial || S.ping || S.animating) redraw(); requestAnimationFrame(tick); })();

setState(A.state);

showMenu();
