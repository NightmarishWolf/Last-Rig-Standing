// Helpers for missions' scripted ships: sea distances, finding a hidden spot to appear from,
// and moving a ship toward whatever a mission wants.
import * as E from '../engine/index.js';

// Sea distance (in squares; diagonal steps count 1 unless diag is false) from a set of start squares to everywhere.
// (blocked: a Set of 'x,y' squares to route around, e.g. other ships)
export function waterField(st, starts, { diag = true, blocked = null } = {}) {
  const D = new Array(st.W * st.H).fill(1e9), q = [];
  for (const [x, y] of starts) if (!E.isLand(st, x, y)) { D[y * st.W + x] = 0; q.push([x, y]); }
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i];
    for (const [dx, dy] of diag ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] : [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= st.W || ny >= st.H || E.isLand(st, nx, ny) || D[ny * st.W + nx] <= D[y * st.W + x] + 1 || blocked?.has(nx + ',' + ny)) continue;
      D[ny * st.W + nx] = D[y * st.W + x] + 1; q.push([nx, ny]);
    }
  }
  return D;
}
// a sea-distance field for one ship's shape: moves from a spot where the whole ship fits (rotations
// included), seeded where any square of the ship comes within `stop` of the goal (big ships through narrow channels)
export function shapeField(st, s, goal, stop = 0) {
  const D = waterField(st, goal, { diag: false }), F = new Map(), q = [];
  const fit = new Map();
  const fits = (x, y, rot) => {
    const k = x + ',' + y + ',' + rot; if (fit.has(k)) return fit.get(k);
    const ok = E.shipCells({ ...s, x, y, rot }).every(([a, b]) => a >= 0 && b >= 0 && a < st.W && b < st.H && !E.isLand(st, a, b)
      && !st.deposits.some(d => d.x === a && d.y === b) && !(st.platforms || []).some(o => o.x === a && o.y === b));
    fit.set(k, ok); return ok;
  };
  for (let y = 0; y < st.H; y++) for (let x = 0; x < st.W; x++) for (let rot = 0; rot < 4; rot++) {
    if (!fits(x, y, rot)) continue;
    if (Math.min(...E.shipCells({ ...s, x, y, rot }).map(([a, b]) => D[b * st.W + a])) <= stop) { F.set(x + ',' + y + ',' + rot, 0); q.push([x, y, rot]); }
  }
  for (let i = 0; i < q.length; i++) {
    const [x, y, rot] = q[i], d = F.get(x + ',' + y + ',' + rot) + 1;
    for (const [nx, ny, nr] of [[x + 1, y, rot], [x - 1, y, rot], [x, y + 1, rot], [x, y - 1, rot], [x, y, (rot + 1) % 4], [x, y, (rot + 3) % 4]]) {
      const k = nx + ',' + ny + ',' + nr; if (F.has(k) || !fits(nx, ny, nr)) continue;
      F.set(k, d); q.push([nx, ny, nr]);
    }
  }
  return (x, y, rot) => F.get(x + ',' + y + ',' + rot) ?? 1e6;
}
export const fieldAt = (st, D, s) => Math.min(...E.shipCells(s).map(([x, y]) => D[y * st.W + x]));

export const edgeSquares = st => {
  const out = [];
  for (let y = 0; y < st.H; y++) for (let x = 0; x < st.W; x++) if ((x === 0 || y === 0 || x === st.W - 1 || y === st.H - 1) && !E.isLand(st, x, y)) out.push([x, y]);
  return out;
};
export const onEdge = (st, s) => s.x === 0 || s.y === 0 || s.x === st.W - 1 || s.y === st.H - 1;

const occupied = (st, x, y) => st.ships.some(s => E.shipCells(s).some(([a, b]) => a === x && b === y)) || st.deposits.some(d => d.x === x && d.y === y) || (st.blocked || []).includes(x + ',' + y);

// An open-water square player 0 can't see, about `want` squares by sea from `from` (optionally inside a box).
export function fogSpot(st, from, want, box = null) {
  const D = waterField(st, [from]), spots = [];
  for (let y = 0; y < st.H; y++) for (let x = 0; x < st.W; x++) {
    if (box && (x < box.x0 || x > box.x1 || y < box.y0 || y > box.y1)) continue;
    if (!E.isLand(st, x, y) && D[y * st.W + x] < 1e9 && !E.seesSquare(st, 0, x, y) && !occupied(st, x, y)) spots.push([x, y]);
  }
  spots.sort((a, b) => Math.abs(D[a[1] * st.W + a[0]] - want) - Math.abs(D[b[1] * st.W + b[0]] - want) || a[0] - b[0] || a[1] - b[1]);
  return spots[0] || null;
}

// Move ship s (with whatever moves it has left) to the reachable spot that scores lowest; extra goes on the action.
export function moveBest(st, s, score, extra = {}) {
  const here = score(s.x, s.y, s.rot);
  let best = null, bs = here;
  for (const [key] of E.reachable(st, s)) {
    const [x, y, rot] = key.split(',').map(Number);
    const v = score(x, y, rot);
    if (v < bs) { bs = v; best = { x, y, rot }; }
  }
  if (best) return E.applyAction(st, { type: 'move', shipId: s.id, ...best, ...extra }).ok;
  return false;
}
// the same, scoring a spot by a sea-distance field at the ship's nearest square to the goal
export function moveAlong(st, s, D, extra = {}) {
  return moveBest(st, s, (x, y, rot) => Math.min(...E.shipCells({ ...s, x, y, rot }).map(([a, b]) => D[b * st.W + a])), extra);
}
