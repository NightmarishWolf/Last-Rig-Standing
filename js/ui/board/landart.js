// Land that looks like land: a picture of the islands drawn once per game (several pixels per square)
// and laid over the water. Coastlines follow the squares but curve between them (each square's centre
// always matches the game: land stays land, sea stays sea), with beaches, grass, forest and hills further
// inland, soft relief shading, and pale shallows around the shores. Polar maps get tundra and snow.
// Transparent over open water, so the water colours (home tints, ice) show through.

const MAX_PIXELS = 3_200_000;

// ---------- deterministic value noise ----------
function hash(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
const smooth = t => t * t * (3 - 2 * t);
function noise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = smooth(x - xi), fy = smooth(y - yi);
  const a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed), c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
const fbm = (x, y, seed) => noise(x, y, seed) * 0.6 + noise(x * 2.1, y * 2.1, seed + 7) * 0.28 + noise(x * 4.3, y * 4.3, seed + 13) * 0.12;

// ---------- palettes (by height: beach → lowland → forest → hills → peaks) ----------
const PAL = {
  temperate: [[0, [214, 196, 140]], [0.6, [200, 188, 130]], [1.0, [146, 172, 96]], [2.0, [116, 152, 74]], [3.2, [86, 128, 60]], [4.6, [70, 108, 52]], [6.2, [104, 112, 74]], [7.6, [134, 126, 102]], [9.5, [170, 164, 150]]],
  polar: [[0, [176, 170, 150]], [0.7, [150, 156, 140]], [1.4, [170, 180, 172]], [2.6, [206, 214, 218]], [4.2, [230, 236, 242]], [8, [250, 252, 255]]],
};
function ramp(pal, h) {
  if (h <= pal[0][0]) return pal[0][1];
  for (let i = 1; i < pal.length; i++) if (h < pal[i][0]) {
    const [h0, c0] = pal[i - 1], [h1, c1] = pal[i], t = (h - h0) / (h1 - h0);
    return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t];
  }
  return pal[pal.length - 1][1];
}

// Distance (in squares) from every land square to the sea, and from every sea square to land (capped).
function distances(st) {
  const { W, H } = st, n = W * H;
  const toSea = new Float32Array(n).fill(1e9), toLand = new Float32Array(n).fill(1e9);
  const qa = [], qb = [];
  for (let i = 0; i < n; i++) { if (st.land[i]) toLand[i] = 0, qb.push(i); else toSea[i] = 0, qa.push(i); }
  const bfs = (dist, q) => {
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % W, y = (i - x) / W, d = dist[i] + 1;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (dist[j] > d) { dist[j] = d; q.push(j); }
      }
    }
  };
  bfs(toSea, qa); bfs(toLand, qb);
  for (let i = 0; i < n; i++) { if (toSea[i] > 1e8) toSea[i] = 20; if (toLand[i] > 1e8) toLand[i] = 20; }
  return { toSea, toLand };
}

// ---------- the sea ----------
// Deep blue out in the open ocean, lighter towards the coasts, with slow swells of light and dark.
// Opaque, a few pixels a square (it's all soft gradients).
let waterCache = null;
export function waterArt(st) {
  if (waterCache && waterCache.st === st) return waterCache;
  const { W, H } = st, s = Math.max(2, Math.min(6, Math.floor(Math.sqrt(1_200_000 / (W * H)))));
  const canvas = document.createElement('canvas');
  canvas.width = W * s; canvas.height = H * s;
  const g = canvas.getContext('2d'), img = g.createImageData(W * s, H * s), px = img.data;
  const seed = ((typeof st.seed === 'number' ? st.seed : 1) % 100000) + 41;
  const { toLand } = distances(st);
  const shoreD = (x, y) => toLand[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))];
  const polar = st.mapType === 'polar' || st.ice;
  const deep = polar ? [8, 22, 38] : [6, 20, 38], mid = polar ? [14, 38, 58] : [10, 34, 62], shore = polar ? [26, 62, 84] : [16, 60, 92];
  for (let py = 0; py < H * s; py++) {
    const fy = (py + 0.5) / s - 0.5;
    for (let pxi = 0; pxi < W * s; pxi++) {
      const fx = (pxi + 0.5) / s - 0.5;
      const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      const a = shoreD(x0, y0), b = shoreD(x0 + 1, y0), c = shoreD(x0, y0 + 1), d = shoreD(x0 + 1, y0 + 1);
      const near = a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
      // depth: 0 at the shore → 1 far out (with the sea floor rising and falling a little)
      const depth = Math.min(1, Math.max(0, (near - 1) / 9 + (fbm(fx * 0.08, fy * 0.08, seed) - 0.5) * 0.5));
      const t1 = Math.min(1, depth * 2), t2 = Math.max(0, depth * 2 - 1);
      let r = shore[0] + (mid[0] - shore[0]) * t1 + (deep[0] - mid[0]) * t2;
      let gg = shore[1] + (mid[1] - shore[1]) * t1 + (deep[1] - mid[1]) * t2;
      let bb = shore[2] + (mid[2] - shore[2]) * t1 + (deep[2] - mid[2]) * t2;
      // long swells
      const swell = 0.93 + fbm(fx * 0.3 + fy * 0.12, fy * 0.3, seed + 5) * 0.14;
      const i = (py * W * s + pxi) * 4;
      px[i] = r * swell; px[i + 1] = gg * swell; px[i + 2] = bb * swell; px[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  waterCache = { st, canvas, s };
  return waterCache;
}

// Close up: faint ripples on the water (a tiled pattern that sticks to the map as you scroll).
let ripples = null;
export function drawRipples(ctx, sx, sy, sw, sh, dx, dy, cell) {
  if (cell < 18) return;
  if (!ripples) {
    const c = document.createElement('canvas'); c.width = c.height = 160;
    const g = c.getContext('2d');
    g.strokeStyle = 'rgba(160, 210, 255, 0.09)'; g.lineWidth = 1.2; g.lineCap = 'round';
    for (let k = 0; k < 38; k++) {
      const x = hash(k, 1, 7) * 160, y = hash(k, 2, 7) * 160, w = 6 + hash(k, 3, 7) * 14;
      for (const [ox, oy] of [[0, 0], [-160, 0], [0, -160], [-160, -160], [160, 0], [0, 160]]) {
        g.beginPath(); g.moveTo(x + ox, y + oy);
        g.quadraticCurveTo(x + ox + w / 2, y + oy - 3, x + ox + w, y + oy); g.stroke();
      }
    }
    ripples = c;
  }
  const pat = ctx.createPattern(ripples, 'repeat'), k = cell / 34;
  pat.setTransform(new DOMMatrix([k, 0, 0, k, dx - sx * cell + 0, dy - sy * cell + 0]));
  ctx.fillStyle = pat; ctx.fillRect(dx, dy, sw * cell, sh * cell);
}

let cache = null;
export function landArt(st) {
  if (cache && cache.st === st) return cache;
  const { W, H } = st;
  const s = Math.max(3, Math.min(12, Math.floor(Math.sqrt(MAX_PIXELS / (W * H)))));
  const canvas = document.createElement('canvas');
  canvas.width = W * s; canvas.height = H * s;
  const g = canvas.getContext('2d');
  const img = g.createImageData(W * s, H * s), px = img.data;
  const seed = (typeof st.seed === 'number' ? st.seed : 1) % 100000;
  const pal = st.mapType === 'polar' || st.ice ? PAL.polar : PAL.temperate;
  const { toSea, toLand } = distances(st);
  const at = (arr, x, y) => arr[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))];
  const isL = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : st.land[y * W + x] ? 1 : 0);
  // a smooth field over the squares: bilinear between square centres
  const field = (arr, fx, fy) => {
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const a = arr(x0, y0), b = arr(x0 + 1, y0), c = arr(x0, y0 + 1), d = arr(x0 + 1, y0 + 1);
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
  const landF = (x, y) => isL(x, y), seaD = (x, y) => at(toSea, x, y), shoreD = (x, y) => at(toLand, x, y);
  // height: rises over the first few squares inland, then rolling country with the odd ridge of hills
  const height = (fx, fy) => {
    const d = Math.min(7, Math.max(0, field(seaD, fx, fy) - 0.5));
    const n = fbm(fx * 0.22, fy * 0.22, seed + 3), ridge = Math.max(0, fbm(fx * 0.12, fy * 0.12, seed + 11) - 0.55);
    return d * 0.62 + (n - 0.5) * 1.4 + ridge * 14 * Math.min(1, d / 4);
  };
  for (let py = 0; py < H * s; py++) {
    const fy = (py + 0.5) / s - 0.5;
    for (let pxi = 0; pxi < W * s; pxi++) {
      const fx = (pxi + 0.5) / s - 0.5;
      const i = (py * W * s + pxi) * 4;
      // wobble the coast a little (never enough to flip a square's centre)
      const wob = (fbm(fx * 0.9, fy * 0.9, seed) - 0.5) * 0.36;
      const m = field(landF, fx, fy) + wob;
      if (m >= 0.5) {
        const h = Math.max(0, height(fx, fy) + (m - 0.5) * 1.2);
        let [r, gg, b] = ramp(pal, h);
        // relief: light from the north-west
        const e = 0.25, dhx = height(fx + e, fy) - height(fx - e, fy), dhy = height(fx, fy + e) - height(fx, fy - e);
        const shade = Math.max(0.8, Math.min(1.16, 1 - (dhx + dhy) * 0.16));
        // fine grain, and wet sand right at the water's edge
        const grain = 0.94 + hash(pxi, py, seed) * 0.08;
        const wet = m < 0.56 ? 0.82 + (m - 0.5) * 3 : 1;
        px[i] = r * shade * grain * wet; px[i + 1] = gg * shade * grain * wet; px[i + 2] = b * shade * grain * wet; px[i + 3] = 255;
      } else {
        // the sea: pale shallows near the shore, a thin line of surf at the edge
        const near = field(shoreD, fx, fy);
        if (near < 2.6) {
          const t = Math.max(0, 1 - near / 2.6);
          const surf = m > 0.44 ? (m - 0.44) / 0.06 : 0;
          px[i] = 70 + 150 * surf; px[i + 1] = 160 + 80 * surf; px[i + 2] = 180 + 60 * surf;
          px[i + 3] = Math.min(255, 255 * (t * t * 0.32 + surf * 0.45));
        }
      }
    }
  }
  g.putImageData(img, 0, 0);
  cache = { st, canvas, s };
  return cache;
}

// Close up the picture is scaled several times over and looks soft, so a fine grain (specks of
// grass, stones, sand) is laid over the land: the visible part of the picture goes onto a scratch
// canvas, the grain is painted only where it's opaque, and the result goes on the board.
let grain = null, scratch = null;
function grainPattern(ctx) {
  if (!grain) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), img = g.createImageData(128, 128);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      const i = (y * 128 + x) * 4, v = hash(x, y, 99), w = noise(x / 6, y / 6, 5);
      const dark = v < 0.5;
      img.data[i] = dark ? 20 : 255; img.data[i + 1] = dark ? 30 : 250; img.data[i + 2] = dark ? 10 : 220;
      img.data[i + 3] = Math.abs(v - 0.5) * 40 + w * 18;
    }
    g.putImageData(img, 0, 0);
    grain = c;
  }
  return ctx.createPattern(grain, 'repeat');
}
// Draw the land picture over squares sx..sx+sw, sy..sy+sh at (dx, dy) with `cell` pixels a square.
export function drawLand(ctx, st, sx, sy, sw, sh, dx, dy, cell) {
  const art = landArt(st);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  const w = Math.ceil(sw * cell), h = Math.ceil(sh * cell);
  if (cell < 18 || w * h > 6e6) { ctx.drawImage(art.canvas, sx * art.s, sy * art.s, sw * art.s, sh * art.s, dx, dy, sw * cell, sh * cell); return; }
  scratch ||= document.createElement('canvas');
  if (scratch.width < w || scratch.height < h) { scratch.width = Math.max(scratch.width, w); scratch.height = Math.max(scratch.height, h); }
  const g = scratch.getContext('2d');
  g.clearRect(0, 0, w, h);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(art.canvas, sx * art.s, sy * art.s, sw * art.s, sh * art.s, 0, 0, sw * cell, sh * cell);
  // the grain sticks to the map as you scroll (offset by the squares), scaled a little with the zoom
  g.globalCompositeOperation = 'source-atop';
  const pat = grainPattern(g), k = cell / 34;
  pat.setTransform(new DOMMatrix([k, 0, 0, k, -sx * cell % (128 * k), -sy * cell % (128 * k)]));
  g.fillStyle = pat; g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'source-over';
  ctx.drawImage(scratch, 0, 0, w, h, dx, dy, w, h);
}

// ---------- pack ice (Polar maps) ----------
// Soft-edged floes of white and pale blue with darker pressure ridges, transparent over open water.
// Redrawn whenever the ice changes (an Icebreaker cracks some), so it stays cheap: a few pixels a square.
let iceCache = null;
export function iceArt(st) {
  if (!st.ice) return null;
  const ver = st.iceVer || 0;
  if (iceCache && iceCache.st === st && iceCache.ver === ver) return iceCache;
  const { W, H } = st, s = Math.max(2, Math.min(6, Math.floor(Math.sqrt(900_000 / (W * H)))));
  const canvas = iceCache?.st === st ? iceCache.canvas : document.createElement('canvas');
  canvas.width = W * s; canvas.height = H * s;
  const g = canvas.getContext('2d'), img = g.createImageData(W * s, H * s), px = img.data;
  const seed = ((typeof st.seed === 'number' ? st.seed : 1) % 100000) + 77;
  const isI = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : st.ice[y * W + x] && !st.land[y * W + x] ? 1 : 0);
  for (let py = 0; py < H * s; py++) {
    const fy = (py + 0.5) / s - 0.5, y0 = Math.floor(fy), ty = fy - y0;
    for (let pxi = 0; pxi < W * s; pxi++) {
      const fx = (pxi + 0.5) / s - 0.5, x0 = Math.floor(fx), tx = fx - x0;
      const a = isI(x0, y0), b = isI(x0 + 1, y0), c = isI(x0, y0 + 1), d = isI(x0 + 1, y0 + 1);
      if (!(a | b | c | d)) continue;
      const m = a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty + (fbm(fx * 1.1, fy * 1.1, seed) - 0.5) * 0.3;
      if (m < 0.5) continue;
      const i = (py * W * s + pxi) * 4;
      // floes: bright tops, blue-grey cracks between them, a darker rim at the open water
      const floe = fbm(fx * 0.7, fy * 0.7, seed + 3), crack = Math.abs(noise(fx * 0.45, fy * 0.45, seed + 9) - 0.5) < 0.018;
      const rim = m < 0.6 ? 0.82 : 1;
      const v = (0.92 + floe * 0.1) * rim * (crack ? 0.84 : 1);
      px[i] = 214 * v; px[i + 1] = 232 * v; px[i + 2] = 244 * v; px[i + 3] = 240;
    }
  }
  g.putImageData(img, 0, 0);
  iceCache = { st, ver, canvas, s };
  return iceCache;
}
