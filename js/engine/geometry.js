// Grid geometry: ship footprints, distances, map zones and coordinates.
import { SHIPS } from '../data/ships.js';

// ---------- geometry ----------
export function cellsOf(type, x, y, rot = 0) {
  let pts = SHIPS[type].shape.map(([a, b]) => [a, b]);
  for (let i = 0; i < rot; i++) pts = pts.map(([a, b]) => [-b, a]);
  const minX = Math.min(...pts.map(p => p[0]));
  const minY = Math.min(...pts.map(p => p[1]));
  return pts.map(([a, b]) => [a - minX + x, b - minY + y]);
}

export const shipCells = s => cellsOf(s.type, s.x, s.y, s.rot);

export function dist(cellsA, cellsB) {
  let best = Infinity;
  for (const [ax, ay] of cellsA)
    for (const [bx, by] of cellsB) {
      const d = Math.max(Math.abs(ax - bx), Math.abs(ay - by));
      if (d < best) best = d;
    }
  return best;
}

export const inBounds = (st, x, y) => x >= 0 && y >= 0 && x < st.W && y < st.H;

export const isLand = (st, x, y) => st.land[y * st.W + x] === 1;

export const inRect = (r, x, y) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;

export function zoneOf(st, x, y) {
  for (let p = 0; p < st.players.length; p++) if (inRect(st.players[p].home, x, y)) return p;
  return 'middle';
}

export const inSpawn = (st, p, x, y) => inRect(st.players[p].spawn, x, y);

export const isCoast = (st, x, y) => inBounds(st, x, y) && isLand(st, x, y) &&
  [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inBounds(st, x + dx, y + dy) && !isLand(st, x + dx, y + dy));

export const coord = (x, y) => `${y < 26 ? String.fromCharCode(65 + y) : 'A' + String.fromCharCode(39 + y)}${x + 1}`;
