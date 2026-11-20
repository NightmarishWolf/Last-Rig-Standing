// Simultaneous rounds on screen (st.simul): everyone plays the same round at once.
//   - the round starts for you straight away (chime, summary, timer)
//   - bots play their round at the same time, one after another, animating what you can see
//     (they don't move your camera)
//   - Ready ✓ (or Enter, or the timer) says you're done; until the round ends you can take it back
//   - when everyone is ready the engine ends the round, and the next one starts for everyone
// Online, the host runs the bots and decides the order moves happen in (see online.js).
import * as E from '../engine/index.js';
import { isBot, runBotTurn } from '../ai/index.js';
import { PLAYER_COLORS } from '../data/maps.js';
import { BOT_SPEEDS, view } from './settings.js';
import { A } from './state.js';
import { save } from './storage.js';
import { animateStep } from '../ui/board/fx.js';
import { closeResearch } from '../ui/research.js';
import { dispatch, refresh } from '../ui/index.js';
import { S } from '../ui/state.js';
import { play } from '../ui/sound.js';
import { showTurnSummary } from '../ui/summary.js';
import { toast } from '../ui/status.js';

let app = {}; // { handoff, gameOver, startTimer, stopTimer, online, mySeat, role, broadcast }
export const initSimul = a => { app = a; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const speedMs = () => (BOT_SPEEDS.find(s => s.id === view.botSpeed) || BOT_SPEEDS[1]).ms;
const localHumans = st => st.players.map((_, i) => i).filter(i => st.players[i].seat !== 'ai' && !st.players[i].out);

// Who this screen plays: online, your seat; offline, the one human (or nobody: spectating).
export function simulViewer(st) {
  if (app.online?.()) return app.mySeat();
  const hs = localHumans(st);
  return hs.length === 1 ? hs[0] : null;
}

let roundSeen = null; // the round (and game) whose start we've already shown
export function simulHandoff(st) {
  app.stopTimer();
  const me = simulViewer(st);
  S.viewer = me;
  S.spectate = me == null && !app.online?.();
  if (st.phase !== 'playing') return;
  const fresh = roundSeen?.st !== st || roundSeen.round !== st.round;
  roundSeen = { st, round: st.round };
  if (me != null && !st.players[me].out) {
    if (st.ready?.[me]) lockReady(st);
    else {
      unlock();
      A.sessionActive = true;
      refresh();
      app.startTimer();
      if (fresh) { play('chime'); app.notify?.(st); showTurnSummary(st, me); }
    }
  } else refresh();
  // bots play their round alongside (on the host, or on this screen offline)
  if (!app.online?.() || app.role?.() === 'host') runBots(st);
}

// ---------- bots ----------
let botsFor = null;
async function runBots(st) {
  const key = st.round;
  if (botsFor?.st === st && botsFor.round === key) return;
  botsFor = { st, round: key };
  // the bots take turns going first each round (whoever acts first in a round has an edge)
  const n = st.players.length;
  for (const p of st.players.map((_, i) => (i + st.round) % n)) {
    if (st !== A.state || st.round !== key || st.phase !== 'playing') return;
    await runOneBot(st, p, key);
    if (!speedMs()) await sleep(0); // (Instant: a breath between bots)
  }
}
const busy = new Set(); // bots playing right now ("game|round|seat")
let instantSteps = 0;
async function runOneBot(st, p, key = st.round) {
  const id = `${st.gameId}|${key}|${p}`;
  if (!isBot(st, p) || st.players[p].out || st.ready[p] || busy.has(id)) return;
  busy.add(id);
  try {
    await runBotTurn(st, p, async a => {
      // wait while the menu is open (offline) or the online game is paused
      while (((!app.online?.() && (!document.getElementById('overlay').classList.contains('hidden') || document.body.classList.contains('at-home'))) || app.paused?.()) && st === A.state) await sleep(200);
      if (st !== A.state || st.round !== key || st.phase !== 'playing') return { ok: false };
      const ms = S.spectate ? speedMs() : Math.min(speedMs(), 260);
      // at Instant speed, let the page breathe now and then (or a bots-only game would run to the end in one go)
      if (!ms && ++instantSteps % 25 === 0) { await sleep(0); refresh(); }
      if (st !== A.state || st.round !== key || st.phase !== 'playing') return { ok: false };
      const r = ms ? await animateStep(st, a, ms, res => app.broadcast?.(a, res), !S.spectate) : (() => { const res = E.applyAction(st, a); app.broadcast?.(a, res); return res; })();
      return r;
    });
    if (st !== A.state || st.round !== key || st.phase !== 'playing') return;
    act(st, { type: 'ready', by: p, ready: true });
  } finally { busy.delete(id); }
}
// a bot has just taken over a seat mid-round (online): let it play this round now
export function botsNow(st) {
  for (const p of st.players.map((_, i) => i)) runOneBot(st, p);
}

// Apply an action this screen is responsible for (a bot's, or the host's), pass it on, and deal with
// the round ending.
export function act(st, a) {
  const round0 = st.round;
  const r = E.applyAction(st, a);
  app.broadcast?.(a, r);
  afterAction(st, round0);
  return r;
}
// After any action: did the game end, or the round? (everyone runs this on their own copy)
export function afterAction(st, round0) {
  if (st !== A.state) return;
  if (st.phase === 'over') { hideBar(); app.stopTimer(); app.gameOver(st); return; }
  if (st.round !== round0) { hideBar(); save(st); app.roundEnded?.(st); app.handoff(st); return; }
  const me = simulViewer(st);
  if (me != null && st.ready?.[me]) lockReady(st);
  else if (me != null && !document.getElementById('readybar')?.classList.contains('hidden')) { unlock(); app.startTimer(); }
  refresh();
}

// ---------- Ready / Not ready ----------
// (the End turn button, Enter, and the timer all come here in a simultaneous game)
export function simulReady(reason) {
  const st = A.state, me = simulViewer(st);
  if (me == null || st.phase !== 'playing') return;
  closeResearch();
  S.selectedId = null; S.selectedBase = null; S.mode = { kind: 'idle' };
  if (reason) toast(reason);
  const round0 = st.round;
  const r = dispatch({ type: 'ready', ready: true, by: me });
  if (r.pending) { lockReady(st, true); return; } // online player: the host confirms
  if (r.ok) afterAction(st, round0);
}
function notReady() {
  const st = A.state, me = simulViewer(st);
  const r = dispatch({ type: 'ready', ready: false, by: me });
  if (r.ok) { unlock(); app.startTimer(); refresh(); }
}

function barEl() {
  let el = document.getElementById('readybar');
  if (!el) { el = document.createElement('div'); el.id = 'readybar'; el.className = 'botbar hidden'; document.body.appendChild(el); }
  return el;
}
function lockReady(st, pending = false) {
  app.stopTimer();
  S.botTurn = true; S.selectedId = null; S.mode = { kind: 'idle' };
  const waiting = st.players.map((pl, i) => i).filter(i => !st.players[i].out && !st.ready?.[i]);
  const el = barEl();
  el.style.setProperty('--c', PLAYER_COLORS[simulViewer(st)] || '#ffd666');
  el.innerHTML = `<span class="who">✓ Ready${pending ? '' : waiting.length ? `: waiting for ${waiting.map(i => `<b style="color:${PLAYER_COLORS[i]}">${st.players[i].name}</b>`).join(', ')}` : ''}<span class="dots"></span></span>
    <button data-notready title="Take it back and keep playing this round">✋ Not ready</button>`;
  el.onclick = e => { if (e.target.closest('[data-notready]')) notReady(); };
  el.classList.remove('hidden');
  refresh();
}
function unlock() { S.botTurn = false; hideBar(); }
export function hideBar() { barEl().classList.add('hidden'); }
