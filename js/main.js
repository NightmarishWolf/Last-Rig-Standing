// ============================================================
// Boot, saving, and the hot-seat flow (menu, pass-the-device, game over).
// For online play later, this is the file that changes: instead of
// saving to localStorage, you send each action to Firebase/Supabase.
// ============================================================
import * as E from './engine.js';
import { initUI, setState, refresh, showOverlay, showRules } from './ui.js';

const SAVE_KEY = 'last-rig-standing-save-v1';
const PNAME = ['Player 1', 'Player 2'];
let state = null;

function save(st) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(st)); } catch { /* storage full or blocked */ }
}
function load() {
  try { const raw = localStorage.getItem(SAVE_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

function startNew() {
  state = E.newGame();
  save(state);
  setState(state);
  handoff(state);
}

function showMenu() {
  const saved = load();
  const canContinue = saved && saved.phase === 'playing';
  showOverlay(`
    <h1>LAST RIG <span style="color:var(--oil)">STANDING</span></h1>
    <p class="muted">A naval war of attrition. Find oil, build rigs, grow your fleet, and outlast your opponent.</p>
    <p class="muted small">Two players, one screen. Take turns and pass the device. The other player should look away during your turn.</p>
    <div class="row" style="margin-top:16px">
      ${canContinue ? `<button class="primary big" data-continue>Continue game (round ${Math.ceil(saved.turnCount / 2)})</button>` : ''}
      <button class="${canContinue ? '' : 'primary'} big" data-new>New game</button>
      <button class="big ghost" data-rules>Rules</button>
    </div>`, (card, close) => {
    card.querySelector('[data-new]').onclick = () => {
      if (canContinue && !confirm('Start a new game? The saved game will be lost.')) return;
      close(); startNew();
    };
    card.querySelector('[data-rules]').onclick = () => showRules();
    const c = card.querySelector('[data-continue]');
    if (c) c.onclick = () => { close(); state = saved; setState(state); handoff(state); };
  });
}

function handoff(st) {
  const p = st.current;
  showOverlay(`
    <h2>${PNAME[p]}'s turn</h2>
    <p class="muted">Pass the device to <b style="color:var(--text)">${PNAME[p]}</b>. Everyone else, look away!</p>
    <div class="row" style="margin-top:16px"><button class="primary big" data-go>I'm ${PNAME[p]}, show my fleet</button></div>`,
  (card, close) => card.querySelector('[data-go]').onclick = () => { close(); refresh(); });
}

function gameOver(st) {
  showOverlay(`
    <h2>${PNAME[st.winner]} wins!</h2>
    <p class="muted">The enemy has no ships, no rigs, and no money left to rebuild.</p>
    <div class="row" style="margin-top:16px"><button class="primary big" data-new>New game</button></div>`,
  (card, close) => card.querySelector('[data-new]').onclick = () => { close(); startNew(); });
}

state = load() || E.newGame();
initUI(state, { save, handoff, gameOver, showMenu });
setState(state);
showMenu();
