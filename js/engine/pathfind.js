// Route finding for long voyages: A* over the whole map, for a ship's full footprint.
import { SHIPS } from '../data/ships.js';
import { cellsOf, shipCells, turnDelta } from './geometry.js';
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
  for (const o of st.platforms || []) if (o.owner === owner || vis.platforms.has(o.id)) g[o.y * W + o.x] = 1;
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

// Shortest sea route for `ship` to end with its anchor at (tx, ty) facing `tr`
// (tr = null: any facing is fine, used for waypoints). Turning 90° counts as one step.
// `from` lets you plan from somewhere other than where the ship is now ({x, y, r}).
// `maxSteps` gives up on routes longer than that (keeps short hops cheap on huge maps).
// Returns [{x, y, r}, ...] (not including the start), [] if already there, or null if there is no route.
export function findPath(st, ship, tx, ty, tr = ship.rot, grid = blockedGrid(st, ship.owner, ship.id), from = null, maxSteps = Infinity) {
  const { W, H } = st, N = W * H;
  const shapes = [0, 1, 2, 3].map(r => cellsOf(ship.type, 0, 0, r));
  // for each facing: the two possible 90° turns as [dx, dy, newFacing]
  const turns = [0, 1, 2, 3].map(r => [(r + 1) % 4, (r + 3) % 4].map(nr => [...turnDelta(ship.type, r, nr), nr]));
  const fits = (x, y, r) => {
    for (const [dx, dy] of shapes[r]) {
      const cx = x + dx, cy = y + dy;
      if (cx < 0 || cy < 0 || cx >= W || cy >= H || grid[cy * W + cx]) return false;
    }
    return true;
  };
  const anyFacing = tr === null;
  if (anyFacing ? ![0, 1, 2, 3].some(r => fits(tx, ty, r)) : !fits(tx, ty, tr)) return null;
  const idx = (x, y, r) => r * N + y * W + x;
  const sx = from ? from.x : ship.x, sy = from ? from.y : ship.y, sr = from ? from.r : ship.rot;
  const start = idx(sx, sy, sr);
  const isGoal = i => { const rem = i % N; return rem === ty * W + tx && (anyFacing || Math.floor(i / N) === tr); };
  if (isGoal(start)) return [];
  let goal = -1;
  const prev = new Int32Array(4 * N).fill(-1);
  const cost = new Int32Array(4 * N).fill(0x7fffffff);
  const heap = new Heap();
  cost[start] = 0; heap.push(0, start);
  while (heap.size) {
    const i = heap.pop();
    if (isGoal(i)) { goal = i; break; }
    const r = Math.floor(i / N), rem = i % N, x = rem % W, y = (rem / W) | 0;
    const t1 = turns[r][0], t2 = turns[r][1];
    for (let k = 0; k < 6; k++) {
      let nx = x, ny = y, nr = r;
      if (k === 0) nx++; else if (k === 1) nx--; else if (k === 2) ny++; else if (k === 3) ny--;
      else { const t = k === 4 ? t1 : t2; nx += t[0]; ny += t[1]; nr = t[2]; }
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || !fits(nx, ny, nr)) continue;
      const j = idx(nx, ny, nr), c = cost[i] + (k < 4 ? 1 : 0); // turns are free
      if (c >= cost[j] || c > maxSteps) continue;
      cost[j] = c; prev[j] = i;
      heap.push(c + Math.abs(nx - tx) + Math.abs(ny - ty), j);
    }
  }
  if (goal === -1) return null;
  const path = [];
  for (let i = goal; i !== start; i = prev[i]) { const r = Math.floor(i / N), rem = i % N; path.push({ x: rem % W, y: (rem / W) | 0, r }); }
  return path.reverse();
}

// A route through several points in order (waypoints, then the destination).
// Returns one path per leg, or null if any leg can't be reached.
export function routeThrough(st, ship, points) {
  const grid = blockedGrid(st, ship.owner, ship.id);
  let from = { x: ship.x, y: ship.y, r: ship.rot };
  const legs = [];
  for (const pt of points) {
    const path = findPath(st, ship, pt.x, pt.y, pt.rot ?? null, grid, from);
    if (!path) return null;
    legs.push(path);
    if (path.length) { const e = path[path.length - 1]; from = { x: e.x, y: e.y, r: e.r }; }
  }
  return legs;
}

// Turns needed to sail a route at full speed.
export const voyageTurns = (ship, steps) => Math.max(1, Math.ceil(steps / Math.max(1, ship.maxMoves || SHIPS[ship.type].move)));
