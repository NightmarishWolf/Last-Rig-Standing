// World terrain for big maps: continents, archipelagos and open ocean.
// Built from seeded "value noise" so the same seed always makes the same world.
import { rand } from './rng.js';

// Smooth random field: random values on a coarse lattice, blended smoothly in between.
function noiseLayer(st, W, H, spacing) {
  const gw = Math.ceil(W / spacing) + 2, gh = Math.ceil(H / spacing) + 2;
  const grid = new Float32Array(gw * gh);
  for (let i = 0; i < grid.length; i++) grid[i] = rand(st);
  const out = new Float32Array(W * H);
  const smooth = t => t * t * (3 - 2 * t);
  for (let y = 0; y < H; y++) {
    const gy = y / spacing, y0 = Math.floor(gy), ty = smooth(gy - y0);
    for (let x = 0; x < W; x++) {
      const gx = x / spacing, x0 = Math.floor(gx), tx = smooth(gx - x0);
      const a = grid[y0 * gw + x0], b = grid[y0 * gw + x0 + 1];
      const c = grid[(y0 + 1) * gw + x0], d = grid[(y0 + 1) * gw + x0 + 1];
      out[y * W + x] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    }
  }
  return out;
}

// Flood fill water squares from a start; returns a Uint8Array mask (1 = reached).
export function floodWater(land, W, H, sx, sy) {
  const seen = new Uint8Array(W * H);
  if (land[sy * W + sx]) return seen;
  const q = [sy * W + sx]; seen[sy * W + sx] = 1;
  while (q.length) {
    const i = q.pop(), x = i % W, y = (i / W) | 0;
    if (x > 0 && !land[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; q.push(i - 1); }
    if (x < W - 1 && !land[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; q.push(i + 1); }
    if (y > 0 && !land[i - W] && !seen[i - W]) { seen[i - W] = 1; q.push(i - W); }
    if (y < H - 1 && !land[i + W] && !seen[i + W]) { seen[i + W] = 1; q.push(i + W); }
  }
  return seen;
}

// Fills st.land. Homes stay mostly open water (a few islands), spawn strips are always water,
// and every player's spawn is joined to the same ocean (lakes are filled in).
// Returns true if the world is usable.
export function generateTerrain(st, landShare) {
  const { W, H } = st;
  const big = noiseLayer(st, W, H, Math.max(12, W / 5));    // continents
  const mid = noiseLayer(st, W, H, Math.max(6, W / 14));    // coastlines and big islands
  const small = noiseLayer(st, W, H, Math.max(3, W / 40));  // archipelagos and rocks
  const elev = new Float32Array(W * H);
  const homeDist = (x, y) => {
    let best = Infinity;
    for (const pl of st.players) {
      const h = pl.home;
      const dx = Math.max(h.x0 - x, 0, x - h.x1), dy = Math.max(h.y0 - y, 0, y - h.y1);
      best = Math.min(best, Math.max(dx, dy));
    }
    return best;
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let e = big[i] * 0.55 + mid[i] * 0.3 + small[i] * 0.15;
      // fewer islands inside home waters, fading out over a few squares
      const hd = homeDist(x, y);
      if (hd === 0) e -= 0.15; else if (hd < 6) e -= 0.15 * (1 - hd / 6);
      elev[i] = e;
    }
  // pick the height that gives roughly `landShare` land
  const sorted = Array.from(elev).sort((a, b) => a - b);
  const sea = sorted[Math.floor(sorted.length * (1 - landShare))];
  for (let i = 0; i < W * H; i++) st.land[i] = elev[i] > sea ? 1 : 0;
  // spawn strips (plus a 2-square buffer) are always open water
  for (const pl of st.players) {
    const s = pl.spawn;
    for (let y = Math.max(0, s.y0 - 2); y <= Math.min(H - 1, s.y1 + 2); y++)
      for (let x = Math.max(0, s.x0 - 2); x <= Math.min(W - 1, s.x1 + 2); x++) st.land[y * W + x] = 0;
  }
  // everything must share one ocean: fill lakes, and check every spawn is on it
  const s0 = st.players[0].spawn;
  const ocean = floodWater(st.land, W, H, s0.x0, s0.y0);
  for (const pl of st.players) if (!ocean[pl.spawn.y0 * W + pl.spawn.x0]) return false;
  for (let i = 0; i < W * H; i++) if (!st.land[i] && !ocean[i]) st.land[i] = 1;
  return true;
}
