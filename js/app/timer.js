// Turn timer: counts down while the board is showing, ends the turn (or readies you) at zero.
import { fmt } from './settings.js';
import { A } from './state.js';
import { endTurnNow } from '../ui/index.js';

// ---------- turn timer ----------
// Offline it counts down only while the board is in front of the player (paused behind menus and the
// pass-the-device screen). Online it keeps going (the others are waiting), except while the host has
// the game paused; the host also ends turns that run well past the timer (online.js).
// Coming back to the same turn or round (Not ready, a pause) carries on from the time that was left.
const timer = { left: 0, running: false, last: 0, key: null };
let netPaused = () => false, isOnline = () => false;
export const initTimer = o => { netPaused = o.paused || netPaused; isOnline = o.online || isOnline; };

const turnKey = st => `${st.gameId || ''}|${st.simul ? 'r' + st.round : 't' + st.turnCount}`;

export function startTimer() {
  const st = A.state, secs = st.turnTimer ?? 90;
  timer.running = !st.tutorial && st.phase === 'playing' && secs > 0;
  const key = turnKey(st);
  if (key !== timer.key) { timer.left = secs; timer.key = key; }
  timer.last = performance.now();
  renderTimer();
}

export function stopTimer() { timer.running = false; renderTimer(); }

const isPaused = () => (isOnline()
  ? netPaused()
  : !document.getElementById('overlay').classList.contains('hidden') || document.body.classList.contains('at-home'));

function renderTimer() {
  const el = document.getElementById('timer');
  if (!timer.running) { el.classList.add('hidden'); return; }
  const paused = isPaused();
  el.className = 'timer' + (timer.left <= 10 ? ' danger' : timer.left <= 30 ? ' warn' : '') + (paused ? ' paused' : '');
  el.textContent = (paused ? '⏸ ' : '') + fmt(Math.max(0, Math.ceil(timer.left)));
  el.title = paused ? 'Timer paused' : A.state.simul ? 'Time left this round' : 'Time left this turn';
}

setInterval(() => {
  const now = performance.now(), dt = (now - timer.last) / 1000;
  timer.last = now;
  if (!timer.running) return;
  if (!isPaused()) timer.left -= dt;
  if (timer.left <= 0) {
    const st = A.state;
    const who = st.simul ? 'this round' : st.players[st.current].name;
    timer.running = false;
    endTurnNow(st.simul ? 'Time\'s up for this round!' : `Time's up for ${who}!`);
    if (A.state.phase === 'over') renderTimer();
    return;
  }
  renderTimer();
}, 200);
