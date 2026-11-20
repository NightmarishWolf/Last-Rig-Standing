// Animated surf: waves rolling in against every coastline, on a light canvas laid over the board.
// The coast is traced once per game at several distances out to sea (contour lines of a softened land
// map); each frame a few waves travel inward along those lines, brighten, and break at the shore.
// Ships, rigs, platforms and fog are cut out so the surf never washes over them. Runs only when zoomed
// in enough to see it, while the tab is visible, and when the player hasn't turned it off (🌊 button)
// or asked their system for reduced motion.
import { MARGIN } from '../constants.js';
import { S } from '../state.js';
import * as E from '../../engine/index.js';

const Q = 3;               // samples per square
// out at sea → at the shore: contours of the softened land map; the last one (the waterline) uses a barely
// softened map, so it hugs the painted coast
const LEVELS = [0.04, 0.08, 0.13, 0.19, 0.26, 0.34, 0.42];
const CHUNK = 4;           // squares per bucket (only those in view are drawn; each breaks a little out of step)
const PERIOD = 3400;       // ms for a wave to come in
const WAVES = 2;           // waves in flight at once
const FPS = 24;
const PREF_KEY = 'lrs-prefs';

const prefs = () => { try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch { return {}; } };
export const wavesOn = () => prefs().waves !== false && !(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
export function setWaves(on) { try { localStorage.setItem(PREF_KEY, JSON.stringify({ ...prefs(), waves: !!on })); } catch { /* blocked */ } }

// same noise as the painted land, so the surf hugs the painted coast
function hash(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
const sm = t => t * t * (3 - 2 * t);
function noise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = sm(x - xi), fy = sm(y - yi);
  const a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed), c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
const fbm = (x, y, seed) => noise(x, y, seed) * 0.6 + noise(x * 2.1, y * 2.1, seed + 7) * 0.28 + noise(x * 4.3, y * 4.3, seed + 13) * 0.12;

// ---------- tracing the coast (once per game) ----------
let shore = null;
function trace(st) {
  if (shore && shore.st === st) return shore;
  const { W, H } = st, gw = W * Q, gh = H * Q, seed = (typeof st.seed === 'number' ? st.seed : 1) % 100000;
  const isL = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : st.land[y * W + x] ? 1 : 0);
  // the land map the painting uses (with its wobbly coast), sampled Q times a square
  const F = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++) {
    const fy = (j + 0.5) / Q - 0.5, y0 = Math.floor(fy), ty = fy - y0;
    for (let i = 0; i < gw; i++) {
      const fx = (i + 0.5) / Q - 0.5, x0 = Math.floor(fx), tx = fx - x0;
      const a = isL(x0, y0), b = isL(x0 + 1, y0), c = isL(x0, y0 + 1), d = isL(x0 + 1, y0 + 1);
      const m = a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty + (fbm(fx * 0.9, fy * 0.9, seed) - 0.5) * 0.36;
      F[j * gw + i] = m >= 0.5 ? 1 : 0;
    }
  }
  // soften it (two box blurs ≈ a gentle gaussian about a square wide), so its contours ring the coast
  const blur = (src, r) => {
    const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
    for (let j = 0; j < gh; j++) { let acc = 0; for (let i = -r; i <= r; i++) acc += src[j * gw + Math.min(gw - 1, Math.max(0, i))];
      for (let i = 0; i < gw; i++) { tmp[j * gw + i] = acc / (2 * r + 1); acc += src[j * gw + Math.min(gw - 1, i + r + 1)] - src[j * gw + Math.max(0, i - r)]; } }
    for (let i = 0; i < gw; i++) { let acc = 0; for (let j = -r; j <= r; j++) acc += tmp[Math.min(gh - 1, Math.max(0, j)) * gw + i];
      for (let j = 0; j < gh; j++) { out[j * gw + i] = acc / (2 * r + 1); acc += tmp[Math.min(gh - 1, j + r + 1) * gw + i] - tmp[Math.max(0, j - r) * gw + i]; } }
    return out;
  };
  // (three small box blurs ≈ a gaussian: round rings, not square ones)
  const G = blur(blur(blur(F, 2), 2), 2), Gs = blur(F, 1);
  // marching squares: each level's contour as segments, bucketed by chunk (in squares)
  const cw = Math.ceil(W / CHUNK), ch = Math.ceil(H / CHUNK);
  const levels = LEVELS.map(() => Array.from({ length: cw * ch }, () => []));
  const pt = (i, j) => [(i + 0.5) / Q, (j + 0.5) / Q];
  LEVELS.forEach((L, li) => {
    for (let j = 0; j < gh - 1; j++) for (let i = 0; i < gw - 1; i++) {
      const M = li === LEVELS.length - 1 ? Gs : G;
      const a = M[j * gw + i], b = M[j * gw + i + 1], c = M[(j + 1) * gw + i + 1], d = M[(j + 1) * gw + i];
      // only the sea side of the coast (the contours inside the land are skipped)
      if (F[j * gw + i] && F[j * gw + i + 1] && F[(j + 1) * gw + i] && F[(j + 1) * gw + i + 1]) continue;
      const k = (a > L ? 8 : 0) | (b > L ? 4 : 0) | (c > L ? 2 : 0) | (d > L ? 1 : 0);
      if (k === 0 || k === 15) continue;
      const lerp = (v0, v1, p0, p1) => { const t = (L - v0) / (v1 - v0); return [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t]; };
      const A = pt(i, j), B = pt(i + 1, j), C = pt(i + 1, j + 1), D = pt(i, j + 1);
      const top = () => lerp(a, b, A, B), right = () => lerp(b, c, B, C), bottom = () => lerp(d, c, D, C), left = () => lerp(a, d, A, D);
      const segs = {
        1: [[left, bottom]], 2: [[bottom, right]], 3: [[left, right]], 4: [[top, right]], 5: [[left, top], [bottom, right]],
        6: [[top, bottom]], 7: [[left, top]], 8: [[left, top]], 9: [[top, bottom]], 10: [[left, bottom], [top, right]],
        11: [[top, right]], 12: [[left, right]], 13: [[bottom, right]], 14: [[left, bottom]],
      }[k];
      const bucket = levels[li][Math.min(ch - 1, Math.floor(A[1] / CHUNK)) * cw + Math.min(cw - 1, Math.floor(A[0] / CHUNK))];
      for (const [p, q] of segs) { const P = p(), R = q(); bucket.push(P[0], P[1], R[0], R[1]); }
    }
  });
  shore = { st, levels, cw, ch };
  return shore;
}

// ---------- the layer ----------
let cv = null, ctx = null, timer = null, cleared = true, last = 0;
function layer() {
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.className = 'waves-layer';
  const board = document.getElementById('board');
  board.insertAdjacentElement('afterend', cv);
  ctx = cv.getContext('2d');
  return cv;
}
function fit() {
  const board = S.canvas, c = layer();
  if (c.width !== board.width || c.height !== board.height) { c.width = board.width; c.height = board.height; }
  c.style.width = board.style.width; c.style.height = board.style.height;
}
const active = () => S.st && S.canvas && S.cell >= 12 && wavesOn() && !document.hidden && !S.st.replayHide;

export function drawWaves(now = performance.now()) {
  if (!active()) { if (!cleared && ctx) { ctx.clearRect(0, 0, cv.width, cv.height); cleared = true; } return; }
  fit();
  const st = S.st, cell = S.cell, dpr = window.devicePixelRatio || 1;
  const sh = trace(st);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.save();
  ctx.beginPath(); ctx.rect(MARGIN, MARGIN, S.view.w, S.view.h); ctx.clip();
  const ox = MARGIN - S.cam.x * cell, oy = MARGIN - S.cam.y * cell;
  const vx0 = Math.floor(S.cam.x / CHUNK), vy0 = Math.floor(S.cam.y / CHUNK);
  const vx1 = Math.min(sh.cw - 1, Math.floor((S.cam.x + S.view.w / cell) / CHUNK)), vy1 = Math.min(sh.ch - 1, Math.floor((S.cam.y + S.view.h / cell) / CHUNK));
  const seg = (b) => { ctx.beginPath(); for (let k = 0; k < b.length; k += 4) { ctx.moveTo(ox + b[k] * cell, oy + b[k + 1] * cell); ctx.lineTo(ox + b[k + 2] * cell, oy + b[k + 3] * cell); } };
  ctx.strokeStyle = '#e6f6ff'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const n = LEVELS.length, k = cell / 34;
  for (let by = Math.max(0, vy0); by <= vy1; by++) for (let bx = Math.max(0, vx0); bx <= vx1; bx++) {
    const idx = by * sh.cw + bx;
    if (!sh.levels[n - 1][idx].length && !sh.levels[0][idx].length) continue;
    // each stretch of coast breaks a little out of step with its neighbours
    const lag = noise(bx * 0.14, by * 0.14, 3) * 0.55;
    for (let w = 0; w < WAVES; w++) {
      // a wave glides in from the outermost line to the shore, building up, then breaks and fades
      const p = ((now / PERIOD) + w / WAVES + lag) % 1;
      const pos = p * (n - 1), i0 = Math.floor(pos), f = pos - i0;
      const env = Math.min(1, p / 0.3) * (p > 0.82 ? Math.max(0, (1 - p) / 0.18) : 1);
      if (env <= 0.02) continue;
      for (const [li, share] of [[i0, 1 - f], [i0 + 1, f]]) {
        if (li >= n || share < 0.05) continue;
        const b = sh.levels[li][idx];
        if (!b.length) continue;
        seg(b);
        // a soft swell, with a brighter crest on top
        ctx.globalAlpha = (0.06 + 0.12 * p) * env * share; ctx.lineWidth = (4 + p * 6) * k; ctx.stroke();
        ctx.globalAlpha = (0.1 + 0.4 * p) * env * share; ctx.lineWidth = (0.9 + p * 1.4) * k; ctx.stroke();
      }
    }
    // the wash at the waterline, breathing in and out
    const b = sh.levels[n - 1][idx];
    if (b.length) { seg(b); ctx.globalAlpha = 0.14 + 0.09 * Math.sin(now / 560 + lag * 9); ctx.lineWidth = 2.2 * k; ctx.stroke(); }
  }
  ctx.globalAlpha = 1;
  // keep the surf off things on the water, and out of fog
  ctx.globalCompositeOperation = 'destination-out';
  const v = S.lastView;
  if (v) {
    const cut = (x, y) => ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell);
    for (const s of v.myShips) for (const [x, y] of E.shipCells(s)) cut(x, y);
    for (const s of v.enemyShips) for (const [x, y] of s.cells) cut(x, y);
    for (const r of [...v.myRigs, ...v.enemyRigs]) cut(r.x, r.y);
    for (const o of [...(v.myPlatforms || []), ...(v.enemyPlatforms || [])]) cut(o.x, o.y);
  }
  if (S.fogCanvas && !S.spectate && !st.noFog) {
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 0.85;
    ctx.drawImage(S.fogCanvas, ox, oy, st.W * cell, st.H * cell);
    ctx.globalAlpha = 1;
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
  cleared = false;
}

// the loop: about 24 frames a second while there's surf to show
export function startWaves() {
  if (timer) return;
  const tick = now => {
    timer = requestAnimationFrame(tick);
    if (now - last < 1000 / FPS) return;
    last = now;
    drawWaves(now);
  };
  timer = requestAnimationFrame(tick);
}
export function stopWaves() {
  if (timer) cancelAnimationFrame(timer);
  timer = null;
  if (ctx) { ctx.clearRect(0, 0, cv.width, cv.height); cleared = true; }
}
