// Turn timer: counts down while the board is showing, ends the turn at zero.
import { fmt } from './settings.js';
import { A } from './state.js';
import { endTurnNow } from '../ui/index.js';

// ---------- turn timer ----------
// Counts down only while the board is in front of the player (paused behind menus and the
// pass-the-device screen). When it hits zero the turn ends automatically.
const timer = { left: 0, running: false, last: 0 };

export function startTimer() {
  const secs = A.state.turnTimer ?? 90;
  timer.running = !A.state.tutorial && A.state.phase === 'playing' && secs > 0;
  timer.left = secs; timer.last = performance.now();
  renderTimer();
}

export function stopTimer() { timer.running = false; renderTimer(); }

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
    const who = A.state.players[A.state.current].name;
    timer.running = false;
    endTurnNow(`Time's up for ${who}!`);
    if (A.state.phase === 'over') renderTimer();
    return;
  }
  renderTimer();
}, 200);
