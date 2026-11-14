// Route finding for long voyages: A* over the whole map, for a ship's full footprint.
import { SHIPS } from '../data/ships.js';
import { cellsOf, shipCells } from './geometry.js';
import { visibility } from './visibility.js';

// 1 = can't sail through: land, your own ships/rigs, and enemies you can currently see.
// (Unseen enemies are only discovered by bumping into them, like normal moves.)
export function blockedGrid(st, owner, ignoreId) {
  const { W, H } = st;
  const g = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) g[i] = st.land[i] ? 1 : 0;
  const vis = visibility(st, owner);
  for (const s of st.ships) {
    if (s.id === ignoreId || (s.owner !== owner && !vis.ships.has(s.id))) continue;
    for (const [x, y] of shipCells(s)) g[y * W + x] = 1;
  }
  for (const r of st.rigs) if (r.owner === owner || vis.rigs.has(r.id)) g[r.y * W + r.x] = 1;
  if (st.blocked) for (const k of st.blocked) { const [x, y] = k.split(',').map(Number); g[y * W + x] = 1; }
  return g;
}

// Small binary heap for A*.
class Heap {
  constructor() { this.a = []; }
  push(k, v) { const a = this.a; a.push([k, v]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
    return top[1];
  }
  get size() { return this.a.length; }
}

// Shortest sea route for `ship` (keeping its current facing) to put its anchor at (tx, ty).
// Returns [{x, y}, ...] steps (not including the start), [] if already there, or null if unreachable.
export function findPath(st, ship, tx, ty, grid = blockedGrid(st, ship.owner, ship.id)) {
  const { W, H } = st;
  const shape = cellsOf(ship.type, 0, 0, ship.rot);
  const fits = (x, y) => {
    for (const [dx, dy] of shape) {
      const cx = x + dx, cy = y + dy;
      if (cx < 0 || cy < 0 || cx >= W || cy >= H || grid[cy * W + cx]) return false;
    }
    return true;
  };
  if (!fits(tx, ty)) return null;
  const start = ship.y * W + ship.x, goal = ty * W + tx;
  if (start === goal) return [];
  const prev = new Int32Array(W * H).fill(-1);
  const cost = new Int32Array(W * H).fill(0x7fffffff);
  const heap = new Heap();
  cost[start] = 0; heap.push(0, start);
  while (heap.size) {
    const i = heap.pop();
    if (i === goal) break;
    const x = i % W, y = (i / W) | 0, c = cost[i] + 1;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (c >= cost[j] || !fits(nx, ny)) continue;
      cost[j] = c; prev[j] = i;
      heap.push(c + Math.abs(nx - tx) + Math.abs(ny - ty), j);
    }
  }
  if (prev[goal] === -1) return null;
  const path = [];
  for (let i = goal; i !== start; i = prev[i]) path.push({ x: i % W, y: (i / W) | 0 });
  return path.reverse();
}

// Turns needed to sail a route at full speed.
export const voyageTurns = (ship, steps) => Math.max(1, Math.ceil(steps / SHIPS[ship.type].move));
