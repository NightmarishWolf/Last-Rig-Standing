// RTS PROTOTYPE · pathfinding: A* over the squares a ship of its size fits in, then the corners pulled
// tight (any waypoint it can see past gets dropped), so ships sail in straight lines, not staircases.
import { clrAt } from './map.js';

const ok = (m, x, y, need) => clrAt(m, x, y) >= need;
// a straight run from a to b stays in water this ship fits in
export function clearLine(m, ax, ay, bx, by, need) {
  const d = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(d / 0.25));
  for (let i = 0; i <= n; i++) { const t = i / n; if (!ok(m, ax + (bx - ax) * t, ay + (by - ay) * t, need)) return false; }
  return true;
}
// the nearest square this ship fits in (for a goal on land or in a channel too tight for it)
export function nearestOpen(m, x, y, need) {
  const cx = Math.max(0, Math.min(m.W - 1, x | 0)), cy = Math.max(0, Math.min(m.H - 1, y | 0));
  if (ok(m, cx + 0.5, cy + 0.5, need)) return [cx, cy];
  for (let r = 1; r < 12; r++) {
    let best = null, bd = 1e9;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= m.W || ny >= m.H || !ok(m, nx + 0.5, ny + 0.5, need)) continue;
      const d = Math.hypot(nx + 0.5 - x, ny + 0.5 - y); if (d < bd) { bd = d; best = [nx, ny]; }
    }
    if (best) return best;
  }
  return null;
}
export function findPath(m, sx, sy, gx, gy, need) {
  if (clearLine(m, sx, sy, gx, gy, need)) return [[gx, gy]];
  const start = nearestOpen(m, sx, sy, need), goal = nearestOpen(m, gx, gy, need);
  if (!start || !goal) return [];
  const W = m.W, N = W * m.H, si = start[1] * W + start[0], gi = goal[1] * W + goal[0];
  const g = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const heap = [], push = (i, f) => { heap.push([f, i]); let k = heap.length - 1; while (k) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let s = k; if (l < heap.length && heap[l][0] < heap[s][0]) s = l; if (r < heap.length && heap[r][0] < heap[s][0]) s = r; if (s === k) break; [heap[s], heap[k]] = [heap[k], heap[s]]; k = s; } } return top; };
  const hx = goal[0], hy = goal[1], h = i => { const dx = Math.abs(i % W - hx), dy = Math.abs(((i / W) | 0) - hy); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
  g[si] = 0; push(si, h(si));
  while (heap.length) {
    const [, i] = pop(); if (closed[i]) continue; closed[i] = 1;
    if (i === gi) break;
    const x = i % W, y = (i / W) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= m.H || !ok(m, nx + 0.5, ny + 0.5, need)) continue;
      if (dx && dy && (!ok(m, x + dx + 0.5, y + 0.5, need) || !ok(m, x + 0.5, y + dy + 0.5, need))) continue; // (no cutting corners round land)
      const j = ny * W + nx, ng = g[i] + (dx && dy ? 1.414 : 1);
      if (ng < g[j]) { g[j] = ng; came[j] = i; push(j, ng + h(j)); }
    }
  }
  if (came[gi] === -1 && gi !== si) return [];
  const cells = []; for (let i = gi; i !== -1 && i !== si; i = came[i]) cells.push([i % W + 0.5, ((i / W) | 0) + 0.5]);
  cells.reverse();
  // the exact goal at the end if it's open water this ship fits, else the open square nearest it
  if (ok(m, gx, gy, need)) cells.push([gx, gy]);
  // pull the corners tight
  const out = []; let ax = sx, ay = sy;
  for (let k = 0; k < cells.length; k++) {
    let far = k;
    for (let j = cells.length - 1; j > k; j--) if (clearLine(m, ax, ay, cells[j][0], cells[j][1], need)) { far = j; break; }
    out.push(cells[far]); [ax, ay] = cells[far]; k = far;
  }
  return out;
}
