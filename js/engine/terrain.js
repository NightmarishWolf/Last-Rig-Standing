// World terrain for big maps: continents, archipelagos and open ocean.
// Built from seeded "value noise" so the same seed always makes the same world.
import { rand } from './rng.js';
import { SHAPES, geometry } from './maptypes.js';

const SPAWN_CLEAR = 4; // squares of guaranteed open water around each spawn strip
const SPAWN_FADE = 8;  // then land fades in gradually over this many squares

// Smooth random field: random values on a coarse lattice, blended smoothly in between.
function noiseLayer(st, W, H, spacing, spacingY = spacing) {
  const gw = Math.ceil(W / spacing) + 2, gh = Math.ceil(H / spacingY) + 2;
  const grid = new Float32Array(gw * gh);
  for (let i = 0; i < grid.length; i++) grid[i] = rand(st);
  const out = new Float32Array(W * H);
  const smooth = t => t * t * (3 - 2 * t);
  for (let y = 0; y < H; y++) {
    const gy = y / spacingY, y0 = Math.floor(gy), ty = smooth(gy - y0);
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

// Pack ice (Polar maps): open water only, never in or near the homes; mirrored like the land.
function makeIce(st, shape, g, homeDist, spawnDist) {
  const { W, H } = st;
  const ic = noiseLayer(st, W, H, Math.max(8, W / 12)), fl = noiseLayer(st, W, H, Math.max(3, W / 45));
  const ice = new Array(W * H).fill(0);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (st.land[i] || homeDist(x, y) < 4 || spawnDist(x, y) < 6) continue;
    if (shape.ice(g, x, y, { ic: ic[i], fl: fl[i] })) ice[i] = 1;
  }
  if (st.mirror) {
    for (let y = 0; y < H; y++) for (let x = Math.ceil(W / 2); x < W; x++) ice[y * W + x] = st.land[y * W + x] ? 0 : ice[y * W + (W - 1 - x)];
    if (st.players.length === 4) for (let y = Math.ceil(H / 2); y < H; y++) for (let x = 0; x < W; x++) ice[y * W + x] = st.land[y * W + x] ? 0 : ice[(H - 1 - y) * W + x];
  }
  st.ice = ice;
}

// Fills st.land. Homes stay mostly open water (a few islands), spawn strips are always water,
// and every player's spawn is joined to the same ocean (lakes are filled in).
// Returns true if the world is usable.
export function generateTerrain(st, landShare) {
  const { W, H } = st;
  const shape = SHAPES[st.mapType] || SHAPES.classic, g = geometry(st);
  const [wb, wm, ws] = shape.mix;
  if (shape.landShare != null) landShare = shape.landShare;
  // fjords: noise stretched along the coast's normal, so its middle values make long thin lines
  // (only made for that type: an extra noise layer would change every other type's maps)
  const fj = shape.fjords ? noiseLayer(st, W, H, 6, Math.max(12, H / 5)) : null;
  const big = noiseLayer(st, W, H, Math.max(12, W / 5));    // continents
  const mid = noiseLayer(st, W, H, Math.max(6, W / 14));    // coastlines and big islands
  const small = noiseLayer(st, W, H, Math.max(3, W / 40));  // archipelagos and rocks
  const elev = new Float32Array(W * H);
  const spawnDist = (x, y) => {
    let best = Infinity;
    for (const pl of st.players) {
      const r = pl.spawn;
      const dx = Math.max(r.x0 - x, 0, x - r.x1), dy = Math.max(r.y0 - y, 0, y - r.y1);
      best = Math.min(best, Math.max(dx, dy));
    }
    return best;
  };
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
      let e = big[i] * wb + mid[i] * wm + small[i] * ws;
      // the map type's shape (homes stay mostly open water whatever the type, unless it shapes them itself)
      const hd = homeDist(x, y);
      if (shape.bias) {
        let b = shape.bias(g, x, y, { fj: fj ? fj[i] : 0.5 });
        if (!shape.ownHomes) b = hd === 0 ? Math.min(b, 0) : hd < 6 ? b * (hd / 6) : b;
        e += b;
      }
      // fewer islands inside home waters, fading out over a few squares
      if (hd === 0) e -= 0.15; else if (hd < 6) e -= 0.15 * (1 - hd / 6);
      // keep spawn strips in open water: nothing within SPAWN_CLEAR squares, and land thins out
      // smoothly over the next SPAWN_FADE squares, so coastlines curve away instead of being cut off
      const sd = spawnDist(x, y);
      if (sd <= SPAWN_CLEAR) e -= 2;
      else if (sd < SPAWN_CLEAR + SPAWN_FADE) e -= 0.45 * (1 - (sd - SPAWN_CLEAR) / SPAWN_FADE);
      elev[i] = e;
    }
  // fair maps: every player gets the same coastline (2 or 3 players: left/right mirror; 4: both ways)
  if (st.mirror) {
    for (let y = 0; y < H; y++) for (let x = Math.ceil(W / 2); x < W; x++) elev[y * W + x] = elev[y * W + (W - 1 - x)];
    if (st.players.length === 4) for (let y = Math.ceil(H / 2); y < H; y++) for (let x = 0; x < W; x++) elev[y * W + x] = elev[(H - 1 - y) * W + x];
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
  if (shape.ice) makeIce(st, shape, g, homeDist, spawnDist); else delete st.ice;
  return true;
}
