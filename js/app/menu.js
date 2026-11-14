// Main menu and the new-game setup screen.
import * as E from '../engine/index.js';
import { gameOver, handoff, startTutorial } from './flow.js';
import { TIMER_OPTIONS, fmt, setup } from './settings.js';
import { A } from './state.js';
import { load, save } from './storage.js';
import { MAP_SIZES, PLAYER_COLORS } from '../data/maps.js';
import { showConfirm, showOverlay, showRules } from '../ui/dialogs.js';
import { setState } from '../ui/index.js';

export function showMenu() {
  const saved = load();
  const canContinue = saved && saved.phase === 'playing';
  const inGame = A.sessionActive && A.state && !A.state.tutorial && A.state.phase === 'playing' && canContinue;
  showOverlay(`
    <h1>LAST RIG <span style="color:var(--oil)">STANDING</span></h1>
    <p class="muted">A naval war of attrition. Find oil, build rigs, grow your fleet, and outlast everyone else.</p>
    <div class="row" style="margin-top:16px">
      ${inGame ? '<button class="primary big" data-resume>Resume</button>' : ''}
      ${canContinue && !inGame ? `<button class="primary big" data-continue>Continue (${saved.players.length} players, round ${saved.round})</button>` : ''}
      <button class="${canContinue ? '' : 'primary'} big" data-new>New game</button>
      <button class="big" data-tutorial>Tutorial</button>
      <button class="big ghost" data-rules>Rules</button>
      ${inGame ? `<button class="big danger" data-surrender>Surrender (${A.state.players[A.state.current].name})</button>` : ''}
    </div>`, (card, close) => {
    card.querySelector('[data-new]').onclick = () => showSetup(canContinue);
    card.querySelector('[data-rules]').onclick = () => showRules();
    card.querySelector('[data-tutorial]').onclick = () => { close(); startTutorial(); };
    const res = card.querySelector('[data-resume]');
    if (res) res.onclick = () => close(); // timer picks up where it left off
    const c = card.querySelector('[data-continue]');
    if (c) c.onclick = () => { close(); A.state = saved; setState(A.state); handoff(A.state); };
    const sur = card.querySelector('[data-surrender]');
    if (sur) sur.onclick = () => showConfirm('Surrender?',
      `${A.state.players[A.state.current].name} will be knocked out and their whole fleet will sink.`, 'Surrender', () => {
        E.applyAction(A.state, { type: 'surrender' });
        save(A.state); setState(A.state);
        if (A.state.phase === 'over') gameOver(A.state); else handoff(A.state);
      }, showMenu);
  });
}

export function showSetup(overwriting) {
  const max = MAP_SIZES[setup.size].maxPlayers;
  if (setup.players > max) setup.players = max;
  showOverlay(`
    <h2>New game</h2>
    <div class="setup-group">
      <div class="label">Map size</div>
      <div class="seg">${Object.entries(MAP_SIZES).map(([k, m]) => `
        <button data-size="${k}" class="${setup.size === k ? 'on' : ''}">${m.name}<small>${m.w}×${m.h}${m.maxPlayers < 4 ? ` · up to ${m.maxPlayers} players` : ''}</small></button>`).join('')}
      </div>
    </div>
    <div class="setup-group">
      <div class="label">Turn timer</div>
      <div class="seg">${TIMER_OPTIONS.map(t => `
        <button data-timer="${t}" class="${setup.turnTimer === t ? 'on' : ''}">${t ? fmt(t) : 'Off'}</button>`).join('')}
      </div>
    </div>
    <div class="setup-group">
      <div class="label">Domination victory</div>
      <div class="seg">
        <button data-dom="1" class="${setup.domination ? 'on' : ''}">On<small>Hold half of No Man's Sea for 5 rounds to win</small></button>
        <button data-dom="0" class="${!setup.domination ? 'on' : ''}">Off<small>Win only by knocking everyone out</small></button>
      </div>
    </div>
    <div class="setup-group">
      <div class="label">Players</div>
      <div class="seg">${[2, 3, 4].map(n => `
        <button data-players="${n}" class="${setup.players === n ? 'on' : ''}" ${n > max ? 'disabled' : ''}>${n} players</button>`).join('')}
      </div>
      <div class="row">${Array.from({ length: setup.players }, (_, i) => `<span class="chip" style="--c:${PLAYER_COLORS[i]}">Player ${i + 1}</span>`).join('')}</div>
    </div>
    <p class="muted small" style="margin-top:14px">${setup.players === 2 ? 'Homes on the left and right, No Man\'s Sea in the middle.' : 'Homes in the corners' + (setup.players === 3 ? ' and bottom middle' : '') + ', No Man\'s Sea in between.'}
    Everyone shares one screen and passes the device between turns.</p>
    <div class="row" style="margin-top:16px">
      <button class="primary big" data-start>Start game</button>
      <button class="big ghost" data-back>Back</button>
    </div>`, (card, close) => {
    card.querySelectorAll('[data-size]').forEach(b => b.onclick = () => { setup.size = b.dataset.size; showSetup(overwriting); });
    card.querySelectorAll('[data-dom]').forEach(b => b.onclick = () => { setup.domination = b.dataset.dom === '1'; showSetup(overwriting); });
    card.querySelectorAll('[data-timer]').forEach(b => b.onclick = () => { setup.turnTimer = Number(b.dataset.timer); showSetup(overwriting); });
    card.querySelectorAll('[data-players]').forEach(b => b.onclick = () => { setup.players = Number(b.dataset.players); showSetup(overwriting); });
    card.querySelector('[data-back]').onclick = showMenu;
    card.querySelector('[data-start]').onclick = () => {
      const start = () => {
        close();
        A.state = E.newGame({ size: setup.size, players: setup.players, turnTimer: setup.turnTimer, domination: setup.domination });
        save(A.state); setState(A.state); handoff(A.state);
      };
      if (overwriting) showConfirm('Start a new game?', 'Your saved game will be lost.', 'Start new game', start, () => showSetup(overwriting));
      else start();
    };
  });
}
