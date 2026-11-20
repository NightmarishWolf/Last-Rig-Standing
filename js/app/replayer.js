// Watching a replay: the recorded moves are played again on a copy of the game, on the normal board.
//
//   ⏮ ◀ ▶/⏸ ▶ ⏭   start, previous turn, play/pause, next turn, end   (keys: Space, comma, full stop)
//   the slider      jump anywhere (by move; the label says the round and whose turn)
//   speed           Slow / Normal / Fast animate each move; Turbo plays a turn at a time; Max as fast as it can
//   view            👁 Everything (no fog), or one admiral's view with their fog of war
//
// Jumping back is quick because a copy of the game is kept every round (made when the replay opens).
// When the replay opens it is also checked: playing every move must end at the same game that was
// recorded. If it doesn't (a bug), a warning says where it went wrong.
import * as E from '../engine/index.js';
import { PLAYER_COLORS } from '../data/maps.js';
import { A } from './state.js';
import { pack, unpack } from './storage.js';
import { downloadReplay } from './replay.js';
import { fingerprint } from '../net/session.js';
import { animateStep } from '../ui/board/fx.js';
import { refresh, setState } from '../ui/index.js';
import { S } from '../ui/state.js';
import { toast } from '../ui/status.js';

let app = {}; // { hideHome, showHome, stopTimer, leaveOnline, load, newGame }
export const initReplayer = a => { app = a; };

const SPEEDS = [
  { id: 'slow', name: 'Slow', ms: 650 }, { id: 'normal', name: 'Normal', ms: 380 }, { id: 'fast', name: 'Fast', ms: 140 },
  { id: 'turbo', name: 'Turbo', ms: 0, pause: 280 }, { id: 'max', name: 'Max', ms: 0, pause: 0 },
];
let R = null; // the replay being watched
export const watching = () => !!R && A.state === R.st;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function fresh(packed) {
  const st = unpack(packed);
  st.replay = true;
  return st;
}

export function openReplay(rec, back = 'main') {
  closeReplay(false);
  app.stopTimer?.(); app.leaveOnline?.();
  const st = fresh(rec.start);
  R = {
    rec, st, i: 0, total: rec.actions.length, back, playing: false, run: 0,
    speed: 'normal', view: 'all',
    cps: [{ i: 0, packed: rec.start }], turns: [{ i: 0, round: st.round, p: st.current }], indexed: 0, problem: null,
  };
  A.state = st; A.sessionActive = false;
  for (const id of ['botbar', 'netbar', 'readybar', 'pausebar']) document.getElementById(id)?.classList.add('hidden'); // the real game's bars
  app.hideHome?.();
  setState(st);
  applyView();
  showBar();
  index(R);
}

// one fast pass through the whole replay: where each turn starts, a copy every round, and the check
async function index(r) {
  const c = fresh(r.rec.start), acts = r.rec.actions;
  let round = c.round;
  for (let j = 0; j < acts.length; j++) {
    if (R !== r) return;
    const before = c.turnCount;
    const res = E.applyAction(c, acts[j]);
    if (!res.ok) { r.problem = `move ${j + 1} (${acts[j].type}) didn't work when played again: ${res.error}`; break; }
    if (c.turnCount !== before || c.round !== round) r.turns.push({ i: j + 1, round: c.round, p: c.current });
    if (c.round !== round) {
      round = c.round;
      if (r.cps.length < 400) r.cps.push({ i: j + 1, packed: pack(c) });
    }
    r.indexed = j + 1;
    if (j % 250 === 0) { renderBar(); await sleep(0); }
    if (c.phase !== 'playing') break;
  }
  if (!r.problem && r.rec.fp && r.indexed === acts.length && fingerprint(c) !== r.rec.fp) r.problem = 'the replay ends slightly differently from the game that was recorded';
  if (r.problem) toast(`⚠️ This replay doesn't play back exactly: ${r.problem}.`);
  r.indexed = acts.length;
  renderBar();
}

// ---------- moving through it ----------
function setGame(st) {
  R.st = st; A.state = st;
  const cam = { x: S.cam.x, y: S.cam.y }, cell = S.cell;
  setState(st);
  S.cam.x = cam.x; S.cam.y = cam.y; S.cell = cell; S.camGame = st; // keep looking at the same spot
  applyView();
}
function seek(i) {
  i = Math.max(0, Math.min(R.total, i));
  // start from the nearest saved copy at or before the spot, if going back or skipping well ahead
  const cp = [...R.cps].reverse().find(c => c.i <= i);
  if (cp && (i < R.i || cp.i > R.i + 50)) { setGame(fresh(cp.packed)); R.i = cp.i; }
  while (R.i < i) {
    const r = E.applyAction(R.st, R.rec.actions[R.i]);
    R.i++;
    if (!r.ok || R.st.phase !== 'playing') break;
  }
  S.tween = null; S.fx = [];
  refresh(); renderBar();
}
function turnStep(dir) {
  const ts = R.turns;
  if (dir > 0) { const t = ts.find(x => x.i > R.i); seek(t ? t.i : R.total); }
  else { const t = [...ts].reverse().find(x => x.i < R.i - (R.playing ? 3 : 0)); seek(t ? t.i : 0); }
}

async function play() {
  if (!R || R.playing) return;
  if (R.i >= R.total) seek(0);
  R.playing = true;
  const run = ++R.run, r = R;
  renderBar();
  while (R === r && r.playing && r.run === run && r.i < r.total && A.state === r.st) {
    const sp = SPEEDS.find(s => s.id === r.speed);
    const a = r.rec.actions[r.i], turnBefore = r.st.turnCount, st = r.st;
    const res = sp.ms && a.type !== 'endTurn' && a.type !== 'ready' ? await animateStep(st, a, sp.ms) : E.applyAction(st, a);
    if (R !== r || r.st !== st) return; // jumped meanwhile
    r.i++;
    if (!res.ok || st.phase !== 'playing') { refresh(); break; }
    if (st.turnCount !== turnBefore || !sp.ms) {
      if (st.turnCount !== turnBefore || r.i % 40 === 0) { refresh(); renderBar(); }
      if (st.turnCount !== turnBefore) await sleep(sp.ms ? 350 : sp.pause);
      else if (r.i % 40 === 0) await sleep(0);
    } else renderBar();
  }
  if (R === r && r.run === run) { r.playing = false; refresh(); renderBar(); }
}
const pause = () => { if (R) { R.playing = false; R.run++; renderBar(); } };

function applyView() {
  S.botTurn = true; S.selectedId = null; S.selectedBase = null; S.mode = { kind: 'idle' };
  if (R.view === 'all') { S.spectate = true; S.viewer = null; }
  else { S.spectate = false; S.viewer = R.view; }
  refresh();
}

// ---------- the control bar ----------
function barEl() {
  let el = document.getElementById('replaybar');
  if (!el) { el = document.createElement('div'); el.id = 'replaybar'; el.className = 'replaybar hidden'; document.body.appendChild(el); }
  return el;
}
function showBar() {
  const el = barEl();
  el.classList.remove('hidden');
  const players = R.st.players;
  el.innerHTML = `
    <div class="rb-row">
      <b class="rb-title">🎬 Replay</b>
      <button data-rb="start" title="Back to the start">⏮</button>
      <button data-rb="prev" title="Previous turn (,)">◀</button>
      <button data-rb="play" class="rb-play" title="Play / pause (Space)">▶</button>
      <button data-rb="next" title="Next turn (.)">▶|</button>
      <button data-rb="end" title="Jump to the end">⏭</button>
      <input type="range" class="rb-slider" data-rbslider min="0" max="${R.total}" value="0">
      <span class="rb-label" data-rblabel></span>
    </div>
    <div class="rb-row small">
      <span class="seg small-seg">${SPEEDS.map(s => `<button data-rbspeed="${s.id}">${s.name}</button>`).join('')}</span>
      <select data-rbview title="Whose eyes to watch through">
        <option value="all">👁 Everything (no fog)</option>
        ${players.map((pl, i) => `<option value="${i}">${pl.name}'s view (fog of war)</option>`).join('')}
      </select>
      <button data-rb="download" class="ghost" title="Download this replay as a file (to share, or to watch on another computer)">⬇️ Download</button>
      <button data-rb="exit" class="ghost">✕ Close</button>
    </div>`;
  el.onclick = e => {
    const b = e.target.closest('button');
    if (!b || !R) return;
    const k = b.dataset.rb;
    if (b.dataset.rbspeed) { R.speed = b.dataset.rbspeed; renderBar(); return; }
    if (k === 'play') { if (R.playing) pause(); else play(); }
    if (k === 'start') { pause(); seek(0); }
    if (k === 'end') { pause(); seek(R.total); }
    if (k === 'prev') turnStep(-1);
    if (k === 'next') turnStep(1);
    if (k === 'download') downloadReplay(R.rec);
    if (k === 'exit') closeReplay(true);
  };
  const slider = el.querySelector('[data-rbslider]');
  slider.oninput = () => { pause(); seek(+slider.value); };
  const sel = el.querySelector('[data-rbview]');
  sel.onchange = () => { R.view = sel.value === 'all' ? 'all' : +sel.value; applyView(); };
  renderBar();
}
function renderBar() {
  if (!R) return;
  const el = barEl(), st = R.st;
  const t = [...R.turns].reverse().find(x => x.i <= R.i);
  const who = st.simul ? 'everyone at once' : `<b style="color:${PLAYER_COLORS[st.current]}">${st.players[st.current]?.name}</b>'s turn`;
  const lab = el.querySelector('[data-rblabel]');
  if (lab) lab.innerHTML = st.phase === 'over'
    ? `Round ${st.round} · <b>game over</b>${st.winner != null ? ` · <b style="color:${PLAYER_COLORS[st.winner]}">${st.players[st.winner].name}</b> wins` : ''}`
    : `Round ${t?.round ?? st.round} · ${who}${R.indexed < R.total ? ` · <span class="muted">reading ${Math.round(100 * R.indexed / Math.max(1, R.total))}%</span>` : ''}`;
  const sl = el.querySelector('[data-rbslider]');
  if (sl && document.activeElement !== sl) sl.value = R.i;
  const pb = el.querySelector('.rb-play');
  if (pb) pb.textContent = R.playing ? '❚❚' : '▶';
  el.querySelectorAll('[data-rbspeed]').forEach(b => b.classList.toggle('on', b.dataset.rbspeed === R.speed));
  const sel = el.querySelector('[data-rbview]');
  if (sel) sel.value = String(R.view);
}

export function closeReplay(goHome = true) {
  if (!R) return;
  const back = R.back;
  pause();
  R = null;
  barEl().classList.add('hidden');
  if (!goHome) return;
  A.state = app.load?.() || app.newGame?.();
  A.sessionActive = false;
  setState(A.state);
  app.showHome?.(back === 'over' && A.state.phase === 'over' ? 'over' : 'main');
}

// the bar goes away if something else takes over the screen (e.g. a game loaded from the menu)
setInterval(() => {
  if (R && A.state !== R.st) { pause(); R = null; barEl().classList.add('hidden'); }
  else if (R) barEl().classList.toggle('hidden', document.body.classList.contains('at-home'));
}, 400);

document.addEventListener('keydown', e => {
  if (!watching() || document.body.classList.contains('at-home') || e.target?.closest?.('input, textarea, select')) return;
  if (e.key === ' ') { e.preventDefault(); if (R.playing) pause(); else play(); }
  else if (e.key === ',') turnStep(-1);
  else if (e.key === '.') turnStep(1);
  else if (e.key === 'Escape') { /* the menu */ }
});
