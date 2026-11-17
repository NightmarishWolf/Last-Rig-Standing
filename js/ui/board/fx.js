// Animations for computer turns: ships gliding to where they moved, shots streaking to their targets.
// Only what the watching player could see is animated (in spectator mode: everything).
import * as E from '../../engine/index.js';
import { centerOn, visibleRange } from '../camera.js';
import { px, py } from '../helpers.js';
import { S } from '../state.js';
import { draw } from './render.js';
import { SHIPS } from '../../data/ships.js';
import { drawShots, effectsForAction } from './weapons.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ease = k => (k < 0 ? 0 : k > 1 ? 1 : k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

// Ships the viewer can see right now: id -> { x, y, rot, cells }
function shipsSeen(st, viewer) {
  const vis = viewer == null ? null : E.visibility(st, viewer);
  const m = new Map();
  for (const s of st.ships) if (viewer == null || s.owner === viewer || vis.ships.has(s.id)) m.set(s.id, { x: s.x, y: s.y, rot: s.rot, cells: E.shipCells(s) });
  return m;
}
function seesSquare(st, viewer, x, y) {
  if (viewer == null) return true;
  return E.sightSources(st, viewer).some(([cells, r]) => cells.some(([cx, cy]) => Math.max(Math.abs(cx - x), Math.abs(cy - y)) <= r));
}
const centre = cells => [cells.reduce((t, c) => t + c[0], 0) / cells.length, cells.reduce((t, c) => t + c[1], 0) / cells.length];

// Apply one bot action and animate what the viewer could see of it. Resolves when the animation is done.
// onApplied(r) runs right after the action is applied (before the animation), so online games can pass
// it on in the right order; quiet = don't move the camera (simultaneous rounds: you're busy playing).
export async function animateStep(st, a, ms, onApplied, quiet = false) {
  const viewer = S.spectate ? null : S.viewer;
  const actor = st.simul && a.by != null ? a.by : st.current;
  const before = shipsSeen(st, viewer);
  const shotsBefore = st.players[actor].shots.length;
  const shooter = a.type === 'act' ? st.ships.find(s => s.id === a.shipId) : null;
  const shooterCells = shooter ? E.shipCells(shooter) : null;
  const shooterSeen = shooter && before.has(shooter.id);
  const r = E.applyAction(st, a);
  onApplied?.(r);
  const after = shipsSeen(st, viewer);
  const moves = new Map();
  for (const [id, b] of before) {
    const n = after.get(id);
    if (n && (n.x !== b.x || n.y !== b.y || n.rot !== b.rot)) moves.set(id, { dx: b.cells[0][0] - n.cells[0][0], dy: b.cells[0][1] - n.cells[0][1] });
  }
  const shots = st.players[actor].shots.slice(shotsBefore).filter(s => shooterSeen || seesSquare(st, viewer, s.x, s.y));
  const pingAct = shooter && SHIPS[shooter.type].actions.find(x => x.id === a.actionId);
  const pinged = a.type === 'act' && shooterSeen && (pingAct?.kind === 'scan' || pingAct?.kind === 'survey');
  if (!moves.size && !shots.length && !pinged) return r;
  // bring the action into view
  if (!S.fit && !quiet) {
    const R = visibleRange();
    const focus = shots.length ? [shots[0].x, shots[0].y] : (() => { const [id] = moves.keys(); const n = after.get(id); return n ? n.cells[0] : [shooter.x, shooter.y]; })();
    if (focus[0] < R.x0 + 2 || focus[0] > R.x1 - 2 || focus[1] < R.y0 + 2 || focus[1] > R.y1 - 2) centerOn(focus[0], focus[1]);
  }
  const t0 = performance.now();
  const moveDur = moves.size ? ms : 0;
  S.tween = moves.size ? { moves, t0, dur: moveDur } : null;
  // each weapon's own projectile, sound and impact (only from where the viewer could see it)
  const vis = ([x, y]) => seesSquare(st, viewer, Math.floor(x), Math.floor(y));
  const fxEnd = shots.length || pinged ? effectsForAction(st, a, actor, shotsBefore, t0 + moveDur * 0.5, vis) : 0;
  const total = Math.max(moveDur, (fxEnd || t0) - t0) + 60;
  await new Promise(done => {
    const frame = () => { draw(); if (performance.now() - t0 < total) requestAnimationFrame(frame); else done(); };
    requestAnimationFrame(frame);
  });
  S.tween = null;
  draw();
  await sleep(Math.min(120, ms / 4));
  return r;
}

// Where to draw a ship's cells right now (slid back along its move while it's animating).
export function tweenCells(id, cells) {
  const t = S.tween;
  if (!t) return cells;
  const m = t.moves.get(id);
  if (!m) return cells;
  const k = 1 - ease((performance.now() - t.t0) / t.dur);
  return cells.map(([x, y]) => [x + m.dx * k, y + m.dy * k]);
}

// Shots in flight and their impacts (weapons.js draws each weapon's look).
export function drawFx() {
  drawPing();
  drawShots();
}

// A ring that pulses on a square for a moment (the turn summary's 📍 links point at things this way).
function drawPing() {
  const g = S.ping, now = performance.now();
  if (!g) return;
  if (now > g.until) { S.ping = null; return; }
  const ctx = S.ctx, k = ((g.until - now) / 400) % 1;
  const cx = px(g.x) + S.cell / 2, cy = py(g.y) + S.cell / 2;
  ctx.strokeStyle = `rgba(255,214,102,${0.35 + 0.6 * k})`; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, cy, S.cell * (0.8 + (1 - k) * 1.6), 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 1;
}
