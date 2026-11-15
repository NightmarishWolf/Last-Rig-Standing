// Animations for computer turns: ships gliding to where they moved, shots streaking to their targets.
// Only what the watching player could see is animated (in spectator mode: everything).
import * as E from '../../engine/index.js';
import { centerOn, visibleRange } from '../camera.js';
import { px, py } from '../helpers.js';
import { S } from '../state.js';
import { draw } from './render.js';

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
export async function animateStep(st, a, ms) {
  const viewer = S.spectate ? null : S.viewer;
  const actor = st.current;
  const before = shipsSeen(st, viewer);
  const shotsBefore = st.players[actor].shots.length;
  const shooter = a.type === 'act' ? st.ships.find(s => s.id === a.shipId) : null;
  const shooterCells = shooter ? E.shipCells(shooter) : null;
  const shooterSeen = shooter && before.has(shooter.id);
  const r = E.applyAction(st, a);
  const after = shipsSeen(st, viewer);
  const moves = new Map();
  for (const [id, b] of before) {
    const n = after.get(id);
    if (n && (n.x !== b.x || n.y !== b.y || n.rot !== b.rot)) moves.set(id, { dx: b.cells[0][0] - n.cells[0][0], dy: b.cells[0][1] - n.cells[0][1] });
  }
  const shots = st.players[actor].shots.slice(shotsBefore).filter(s => shooterSeen || seesSquare(st, viewer, s.x, s.y));
  if (!moves.size && !shots.length) return r;
  // bring the action into view
  if (!S.fit) {
    const R = visibleRange();
    const focus = shots.length ? [shots[0].x, shots[0].y] : (() => { const [id] = moves.keys(); const n = after.get(id); return n.cells[0]; })();
    if (focus[0] < R.x0 + 2 || focus[0] > R.x1 - 2 || focus[1] < R.y0 + 2 || focus[1] > R.y1 - 2) centerOn(focus[0], focus[1]);
  }
  const t0 = performance.now();
  const moveDur = moves.size ? ms : 0, shotDur = shots.length ? Math.max(260, ms * 0.9) : 0;
  S.tween = moves.size ? { moves, t0, dur: moveDur } : null;
  S.fx = shots.map(s => ({ from: shooterSeen && shooterCells ? centre(shooterCells) : [s.x, s.y], to: [s.x, s.y], r: s.r, t0: t0 + moveDur * 0.5, dur: shotDur }));
  const total = Math.max(moveDur, moveDur * 0.5 + shotDur) + 60;
  await new Promise(done => {
    const frame = () => { draw(); if (performance.now() - t0 < total) requestAnimationFrame(frame); else done(); };
    requestAnimationFrame(frame);
  });
  S.tween = null; S.fx = [];
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

// Shots in flight: a bright streak, then a burst (red for a hit, white for a miss).
export function drawFx() {
  if (!S.fx?.length) return;
  const ctx = S.ctx, now = performance.now();
  for (const f of S.fx) {
    const k = (now - f.t0) / f.dur;
    if (k < 0 || k > 1.35) continue;
    const [fx, fy] = [px(f.from[0]) + S.cell / 2, py(f.from[1]) + S.cell / 2];
    const [tx, ty] = [px(f.to[0]) + S.cell / 2, py(f.to[1]) + S.cell / 2];
    const hit = f.r === 'hit' || f.r === 'sunk';
    if (k <= 0.6) {
      const q = k / 0.6, hx = fx + (tx - fx) * q, hy = fy + (ty - fy) * q;
      const tq = Math.max(0, q - 0.25), sx = fx + (tx - fx) * tq, sy = fy + (ty - fy) * tq;
      ctx.strokeStyle = 'rgba(255,214,102,0.95)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(hx, hy); ctx.stroke(); ctx.lineCap = 'butt'; ctx.lineWidth = 1;
    } else {
      const q = (k - 0.6) / 0.75, rad = S.cell * (0.3 + q * (hit ? 1.1 : 0.7));
      ctx.globalAlpha = Math.max(0, 1 - q);
      ctx.fillStyle = hit ? (f.r === 'sunk' ? '#ff7a1a' : '#ff4d4d') : '#dfe8f0';
      ctx.beginPath(); ctx.arc(tx, ty, rad, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}
