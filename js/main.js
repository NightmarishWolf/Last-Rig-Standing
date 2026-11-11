// ============================================================
// Boot, saving, the new-game setup screen and the hot-seat flow
// (menu, pass-the-device, game over).
// For online play later, this is the file that changes: instead of
// saving to localStorage, you send each action to Firebase/Supabase.
// ============================================================
import * as E from './engine.js';
import { MAP_SIZES, PLAYER_COLORS } from './data/ships.js';
import { initUI, setState, refresh, redraw, showOverlay, showRules, showConfirm, endTurnNow } from './ui.js';
import { newTutorialGame, createTutorial } from './tutorial.js';

const SAVE_KEY = 'last-rig-standing-save-v2';
let state = null;
const setup = { size: 'standard', players: 2, turnTimer: 90 };
const TIMER_OPTIONS = [0, 60, 90, 120, 180];
const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ---------- turn timer ----------
// Counts down only while the board is in front of the player (paused behind menus and the
// pass-the-device screen). When it hits zero the turn ends automatically.
const timer = { left: 0, running: false, last: 0 };
function startTimer() {
  const secs = state.turnTimer ?? 90;
  timer.running = !state.tutorial && state.phase === 'playing' && secs > 0;
  timer.left = secs; timer.last = performance.now();
  renderTimer();
}
function stopTimer() { timer.running = false; renderTimer(); }
function renderTimer() {
  const el = document.getElementById('timer');
  if (!timer.running) { el.classList.add('hidden'); return; }
  const paused = !document.getElementById('overlay').classList.contains('hidden');
  el.className = 'timer' + (timer.left <= 10 ? ' danger' : timer.left <= 30 ? ' warn' : '') + (paused ? ' paused' : '');
  el.textContent = (paused ? '⏸ ' : '') + fmt(Math.ceil(timer.left));
  el.title = paused ? 'Timer paused' : 'Time left this turn';
}
setInterval(() => {
  const now = performance.now(), dt = (now - timer.last) / 1000;
  timer.last = now;
  if (!timer.running) return;
  const paused = !document.getElementById('overlay').classList.contains('hidden');
  if (!paused) timer.left -= dt;
  if (timer.left <= 0) {
    const who = state.players[state.current].name;
    timer.running = false;
    endTurnNow(`Time's up for ${who}!`);
    if (state.phase === 'over') renderTimer();
    return;
  }
  renderTimer();
}, 200);

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
      ${inGame ? '<button class="primary big" data-resume>Resume</button>' : ''}
      ${canContinue && !inGame ? `<button class="primary big" data-continue>Continue (${saved.players.length} players, round ${saved.round})</button>` : ''}
      <button class="${canContinue ? '' : 'primary'} big" data-new>New game</button>
      <button class="big" data-tutorial>Tutorial</button>
      <button class="big ghost" data-rules>Rules</button>
      ${inGame ? `<button class="big danger" data-surrender>Surrender (${state.players[state.current].name})</button>` : ''}
    </div>`, (card, close) => {
    card.querySelector('[data-new]').onclick = () => showSetup(canContinue);
    card.querySelector('[data-rules]').onclick = () => showRules();
    card.querySelector('[data-tutorial]').onclick = () => { close(); startTutorial(); };
    const res = card.querySelector('[data-resume]');
    if (res) res.onclick = () => close(); // timer picks up where it left off
    const c = card.querySelector('[data-continue]');
    if (c) c.onclick = () => { close(); state = saved; setState(state); handoff(state); };
    const sur = card.querySelector('[data-surrender]');
    if (sur) sur.onclick = () => showConfirm('Surrender?',
      `${state.players[state.current].name} will be knocked out and their whole fleet will sink.`, 'Surrender', () => {
        E.applyAction(state, { type: 'surrender' });
        save(state); setState(state);
        if (state.phase === 'over') gameOver(state); else handoff(state);
      }, showMenu);
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
      <div class="label">Turn timer</div>
      <div class="seg">${TIMER_OPTIONS.map(t => `
        <button data-timer="${t}" class="${setup.turnTimer === t ? 'on' : ''}">${t ? fmt(t) : 'Off'}</button>`).join('')}
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
    card.querySelectorAll('[data-timer]').forEach(b => b.onclick = () => { setup.turnTimer = Number(b.dataset.timer); showSetup(overwriting); });
    card.querySelectorAll('[data-players]').forEach(b => b.onclick = () => { setup.players = Number(b.dataset.players); showSetup(overwriting); });
    card.querySelector('[data-back]').onclick = showMenu;
    card.querySelector('[data-start]').onclick = () => {
      const start = () => {
        close();
        state = E.newGame({ size: setup.size, players: setup.players, turnTimer: setup.turnTimer });
        save(state); setState(state); handoff(state);
      };
      if (overwriting) showConfirm('Start a new game?', 'Your saved game will be lost.', 'Start new game', start, () => showSetup(overwriting));
      else start();
    };
  });
}

function startTutorial() {
  stopTimer();
  tutorial.reset();
  state = newTutorialGame();
  setState(state);
}
function exitTutorial() {
  stopTimer();
  tutorial.hide();
  state = load() || E.newGame(setup);
  setState(state);
  showMenu();
}

function handoff(st, reason) {
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
  (card, close) => card.querySelector('[data-go]').onclick = () => { close(); refresh(); startTimer(); });
}

function gameOver(st) {
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
