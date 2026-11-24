// RTS PROTOTYPE · the map: natural islands, mirrored left to right so both sides start even, oil deposits,
// and a clearance grid (how far each square is from land) that tells a ship of a given size where it fits.
function hash(x, y, seed) { let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
const sm = t => t * t * (3 - 2 * t);
function vnoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = sm(x - xi), fy = sm(y - yi);
  const a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed), c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
const fbm = (x, y, seed, oct = 5) => { let v = 0, amp = 0.5, f = 1, tot = 0; for (let o = 0; o < oct; o++) { v += vnoise(x * f, y * f, seed + o * 31) * amp; tot += amp; amp *= 0.5; f *= 2.03; } return v / tot; };

export function makeMap({ W = 64, H = 40, seed = 7, share = 0.17 } = {}) {
  const half = Math.ceil(W / 2), field = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < half; x++) {
    let u = x / 11, v = y / 11;
    u += (fbm(u + 3.1, v + 7.7, seed + 101, 3) - 0.5) * 2; v += (fbm(u + 11.3, v + 1.9, seed + 202, 3) - 0.5) * 2;
    let h = fbm(u, v, seed, 5);
    const e = Math.min(x, y, H - 1 - y) / 4; h -= Math.max(0, 1 - e) * 0.3; // (open water at the edges)
    field[y * W + x] = field[y * W + (W - 1 - x)] = h;
  }
  const sorted = Float32Array.from(field).sort(), cut = sorted[Math.floor(sorted.length * (1 - share))];
  const land = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) land[i] = field[i] >= cut ? 1 : 0;
  // the two Admiralties, and clear water round them
  const homes = [{ x: 5.5, y: H / 2 + 0.5 }, { x: W - 5.5, y: H / 2 + 0.5 }];
  for (const h of homes) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (Math.hypot(x + 0.5 - h.x, y + 0.5 - h.y) < 6) land[y * W + x] = 0;
  const m = { W, H, land, seed, homes };
  m.clr = clearance(m);
  // oil: spots on the left half (open water, away from home), mirrored to the right
  const spots = [], types = ['medium', 'medium', 'small', 'rich', 'small', 'medium', 'rich', 'small', 'medium'];
  for (let tries = 0; spots.length < types.length && tries < 4000; tries++) {
    const x = 3 + Math.floor(hash(tries, 1, seed) * (half - 5)), y = 2 + Math.floor(hash(tries, 2, seed) * (H - 4));
    if (m.clr[y * W + x] < 2) continue;
    const d = Math.hypot(x - homes[0].x, y - homes[0].y);
    const want = spots.length < 2 ? [4, 8] : [8, 30]; // (two close to home, the rest out in the contested water)
    if (d < want[0] || d > want[1]) continue;
    if (spots.some(s => Math.hypot(s.x - x, s.y - y) < 5)) continue;
    spots.push({ x, y });
  }
  m.deposits = [];
  spots.forEach((s, i) => {
    m.deposits.push({ id: 'd' + i, x: s.x + 0.5, y: s.y + 0.5, type: types[i] });
    m.deposits.push({ id: 'd' + i + 'm', x: W - 1 - s.x + 0.5, y: s.y + 0.5, type: types[i] });
  });
  return m;
}

// squares to the nearest land (8-way), capped at 9; off the map counts as land
export function clearance(m) {
  const { W, H, land } = m, c = new Uint8Array(W * H).fill(9), q = [];
  for (let i = 0; i < W * H; i++) if (land[i]) { c[i] = 0; q.push(i); }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!land[y * W + x] && (x === 0 || y === 0 || x === W - 1 || y === H - 1)) { c[y * W + x] = Math.min(c[y * W + x], 1); q.push(y * W + x); }
  for (let k = 0; k < q.length; k++) {
    const i = q[k], x = i % W, y = (i / W) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx; if (c[j] > c[i] + 1) { c[j] = c[i] + 1; q.push(j); }
    }
  }
  return c;
}
export const clrAt = (m, x, y) => (x < 0 || y < 0 || x >= m.W || y >= m.H ? 0 : m.clr[(y | 0) * m.W + (x | 0)]);
// how much clearance a ship of this radius needs
export const needFor = r => (r <= 0.55 ? 1 : r <= 1.05 ? 2 : 3);
