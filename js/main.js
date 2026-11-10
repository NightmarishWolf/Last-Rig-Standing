// ============================================================
// Boot, saving, the new-game setup screen and the hot-seat flow
// (menu, pass-the-device, game over).
// For online play later, this is the file that changes: instead of
// saving to localStorage, you send each action to Firebase/Supabase.
// ============================================================
import * as E from './engine.js';
import { MAP_SIZES, PLAYER_COLORS } from './data/ships.js';
import { initUI, setState, refresh, redraw, showOverlay, showRules } from './ui.js';
import { newTutorialGame, createTutorial } from './tutorial.js';

const SAVE_KEY = 'last-rig-standing-save-v2';
let state = null;
const setup = { size: 'standard', players: 2 };

function save(st) {
  if (st.tutorial) return; // never overwrite the real save with the tutorial
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(st)); } catch { /* storage full or blocked */ }
}
function load() {
  try { const raw = localStorage.getItem(SAVE_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

function showMenu() {
  const saved = load();
  const canContinue = saved && saved.phase === 'playing';
  const inGame = state && !state.tutorial && state.phase === 'playing' && canContinue;
  showOverlay(`
    <h1>LAST RIG <span style="color:var(--oil)">STANDING</span></h1>
    <p class="muted">A naval war of attrition. Find oil, build rigs, grow your fleet, and outlast everyone else.</p>
    <div class="row" style="margin-top:16px">
      ${canContinue ? `<button class="primary big" data-continue>Continue (${saved.players.length} players, round ${saved.round})</button>` : ''}
      <button class="${canContinue ? '' : 'primary'} big" data-new>New game</button>
      <button class="big" data-tutorial>Tutorial</button>
      <button class="big ghost" data-rules>Rules</button>
      ${inGame ? `<button class="big danger" data-surrender>Surrender (${state.players[state.current].name})</button>` : ''}
    </div>`, (card, close) => {
    card.querySelector('[data-new]').onclick = () => showSetup(canContinue);
    card.querySelector('[data-rules]').onclick = () => showRules();
    card.querySelector('[data-tutorial]').onclick = () => { close(); startTutorial(); };
    const c = card.querySelector('[data-continue]');
    if (c) c.onclick = () => { close(); state = saved; setState(state); handoff(state); };
    const sur = card.querySelector('[data-surrender]');
    if (sur) sur.onclick = () => {
      if (!confirm(`${state.players[state.current].name} surrenders? Their whole fleet will sink.`)) return;
      E.applyAction(state, { type: 'surrender' });
      save(state); setState(state);
      if (state.phase === 'over') gameOver(state); else handoff(state);
    };
  });
}

function showSetup(overwriting) {
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
    card.querySelectorAll('[data-players]').forEach(b => b.onclick = () => { setup.players = Number(b.dataset.players); showSetup(overwriting); });
    card.querySelector('[data-back]').onclick = showMenu;
    card.querySelector('[data-start]').onclick = () => {
      if (overwriting && !confirm('Start a new game? The saved game will be lost.')) return;
      close();
      state = E.newGame({ size: setup.size, players: setup.players });
      save(state); setState(state); handoff(state);
    };
  });
}

function startTutorial() {
  tutorial.reset();
  state = newTutorialGame();
  setState(state);
}
function exitTutorial() {
  tutorial.hide();
  state = load() || E.newGame(setup);
  setState(state);
  showMenu();
}

function handoff(st) {
  if (st.tutorial) {
    // the enemy does nothing in the tutorial: skip straight back to the player
    while (st.phase === 'playing' && st.current !== 0) E.applyAction(st, { type: 'endTurn' });
    refresh();
    return;
  }
  const p = st.current, pl = st.players[p];
  showOverlay(`
    <h2><span style="color:${PLAYER_COLORS[p]}">${pl.name}</span>'s turn</h2>
    <p class="muted">Pass the device to <b style="color:var(--text)">${pl.name}</b>. Everyone else, look away!</p>
    <div class="row" style="margin-top:16px"><button class="primary big" data-go>I'm ${pl.name}, show my fleet</button></div>`,
  (card, close) => card.querySelector('[data-go]').onclick = () => { close(); refresh(); });
}

function gameOver(st) {
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
    <p class="muted">${w === null ? 'Every fleet went down.' : `${st.players[w].name} is the last rig standing after ${st.round} rounds.`}</p>
    <div class="row" style="margin-top:16px"><button class="primary big" data-new>New game</button></div>`,
  (card) => card.querySelector('[data-new]').onclick = () => showSetup(false));
}

const tutorial = createTutorial({
  refresh: () => refresh(),
  restart: () => startTutorial(),
  exit: () => exitTutorial(),
});

state = load() || E.newGame(setup);
initUI(state, {
  save, handoff, gameOver, showMenu,
  afterRender: (st, ui) => tutorial.afterRender(st, ui),
  markers: () => (state.tutorial ? tutorial.markers() : []),
});
// keep tutorial markers glowing
(function tick() { if (state.tutorial) redraw(); requestAnimationFrame(tick); })();
setState(state);
showMenu();
