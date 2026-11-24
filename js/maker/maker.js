// ============================================================
// MAP MAKER: a design tool for campaign maps (behind a password, from the main menu's settings row).
// Paint land and sea up to 500 x 500 squares, stamp natural islands, roughen or smooth coasts, drop
// lettered pins ("A = Haven") and oil, check the map, and export it as the text the missions use:
//   .  sea    #  land    s / m / r  small / medium / rich oil    A-Z, 0-9  pins
//   lines starting with ;  comments (the pin labels and where each pin is)
// Maps are kept in this browser (localStorage); the one you're working on autosaves.
// ============================================================
import * as E from '../engine/index.js';
import { drawLand, waterArt } from '../ui/board/landart.js';
import { MAP_SIZES, MAP_TYPES, MAP_TYPE_ORDER } from '../data/maps.js';
import { MISSIONS } from '../campaign/index.js';
import { parseMap } from '../campaign/mapfile.js';

const MAX = 500, MIN = 8;
const PIN_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const OIL = { s: { name: 'Small', col: '#d9a441' }, m: { name: 'Medium', col: '#f08a24' }, r: { name: 'Rich', col: '#ff5a36' } };
const SEA = [22, 58, 87], LANDC = [156, 172, 104];
const KEY_INDEX = 'lrs-maker-index', KEY_MAP = id => 'lrs-maker-map:' + id, KEY_CUR = 'lrs-maker-current', KEY_OK = 'lrs-maker-ok';
const PASS = 0xee7f1dfe; // (an FNV-1a hash: the password itself isn't in the code)

const TOOLS = [
  ['land', '🟩', 'Land brush', 'Paint land. Right-drag paints sea.', 'L'],
  ['sea', '🟦', 'Sea brush', 'Paint sea. Right-drag paints land.', 'S'],
  ['island', '🏝️', 'Island stamp', 'Click to stamp a natural island the size of the brush. Drag to stamp a chain.', 'I'],
  ['rough', '🪨', 'Roughen coast', 'Breaks up straight, man-made-looking coastlines under the brush.', 'R'],
  ['smooth', '🫧', 'Smooth coast', 'Rounds off jagged squares and lone specks under the brush.', 'M'],
  ['fill', '🪣', 'Fill', 'Click a stretch of sea to fill it with land, or a landmass to sink it.', 'F'],
  ['pin', '📍', 'Pin', 'Click to drop a lettered pin, then name it. Right-click a pin to remove it.', 'P'],
  ['oil', '🛢️', 'Oil', 'Click to place oil (pick the size below). Click it again or right-click to remove it.', 'O'],
  ['pan', '✋', 'Move view', 'Drag to move around. (Middle-drag or Space+drag work with any tool.)', 'H'],
];

let M = null;      // the map: { id, name, W, H, land: Uint8Array, pins: [{ ch, x, y, label }], oil: [{ x, y, t }] }
let V = null;      // the view and editor state
let root = null;

// ---------- the password ----------
const fnv = s => { let h = 0x811c9dc5; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h; };
const unlocked = () => { try { return sessionStorage.getItem(KEY_OK) === '1'; } catch { return false; } };
export function openMapMaker() {
  if (unlocked()) return open();
  const box = document.createElement('div');
  box.className = 'mk-gate';
  box.innerHTML = `<form class="mk-gate-card"><h3>🗺️ Map Maker</h3><p class="muted small">A design tool for campaign maps. Enter the password.</p>
    <input type="password" class="text-in" autocomplete="off" placeholder="Password" data-pw>
    <div class="mk-gate-err small" data-err></div>
    <div class="row"><button class="primary" type="submit">Open</button><button type="button" class="ghost" data-cancel>Cancel</button></div></form>`;
  document.body.appendChild(box);
  const pw = box.querySelector('[data-pw]');
  pw.focus();
  box.querySelector('[data-cancel]').onclick = () => box.remove();
  box.querySelector('form').onsubmit = e => {
    e.preventDefault();
    if (fnv(pw.value) === PASS) { try { sessionStorage.setItem(KEY_OK, '1'); } catch { /* private mode */ } box.remove(); open(); }
    else { box.querySelector('[data-err]').textContent = 'Wrong password.'; pw.select(); }
  };
}

// ---------- maps: making, copying, encoding ----------
const blank = (W, H, name = 'Untitled map') => ({ id: newId(), name, W, H, land: new Uint8Array(W * H), pins: [], oil: [] });
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const clampSize = n => Math.max(MIN, Math.min(MAX, Math.round(+n || 0)));
const rle = land => { const out = []; let v = 0, n = 0; for (let i = 0; i < land.length; i++) { if (land[i] === v) n++; else { out.push(n.toString(36)); v ^= 1; n = 1; } } out.push(n.toString(36)); return out.join(','); };
const unrle = (s, size) => { const a = new Uint8Array(size); let i = 0, v = 0; for (const t of s.split(',')) { const n = parseInt(t, 36) || 0; if (v) a.fill(1, i, i + n); i += n; v ^= 1; } return a; };
const pack = m => JSON.stringify({ id: m.id, name: m.name, W: m.W, H: m.H, land: rle(m.land), pins: m.pins, oil: m.oil });
const unpack = s => { const o = JSON.parse(s); return { ...o, land: unrle(o.land, o.W * o.H), pins: o.pins || [], oil: o.oil || [] }; };

// the text the missions read (js/campaign/mapfile.js)
export function mapToText(m) {
  const pinAt = new Map(m.pins.map(p => [p.y * m.W + p.x, p.ch])), oilAt = new Map(m.oil.map(o => [o.y * m.W + o.x, o.t]));
  const head = [`; Last Rig Standing map: ${m.name}`, `; ${m.W} x ${m.H} squares. Key: . sea, # land, s/m/r small/medium/rich oil, letters and digits are pins.`];
  for (const p of [...m.pins].sort((a, b) => PIN_CHARS.indexOf(a.ch) - PIN_CHARS.indexOf(b.ch)))
    head.push(`; ${p.ch} = ${p.label || '(no label)'} (column ${p.x + 1}, row ${E.rowName(p.y)}; x ${p.x}, y ${p.y})${m.land[p.y * m.W + p.x] ? ' [on land]' : ''}`);
  const rows = [];
  for (let y = 0; y < m.H; y++) {
    let r = '';
    for (let x = 0; x < m.W; x++) {
      const i = y * m.W + x;
      r += m.land[i] ? '#' : pinAt.get(i) || oilAt.get(i) || '.'; // (a pin on land stays land: its spot is in the comments)
    }
    rows.push(r);
  }
  return head.join('\n') + '\n' + rows.join('\n') + '\n';
}
export function textToMap(text, name) {
  const lines = text.split(/\r?\n/);
  const labels = {}, spots = {};
  let title = null;
  for (const l of lines.map(l => l.trim())) {
    if (!l.startsWith(';')) continue;
    const t = l.match(/^;\s*Last Rig Standing map:\s*(.+)$/); if (t) title = t[1];
    const p = l.match(/^;\s*(\S)\s*=\s*(.*?)\s*(?:\(column[^;]*;\s*x\s*(\d+),\s*y\s*(\d+)\))?(?:\s*\[on land\])?$/);
    if (p && PIN_CHARS.includes(p[1])) { labels[p[1]] = p[2] === '(no label)' ? '' : p[2]; if (p[3] != null) spots[p[1]] = [+p[3], +p[4]]; }
  }
  const pm = parseMap(text);
  if (!pm.W || !pm.H || pm.W > MAX || pm.H > MAX) throw new Error(`That doesn't look like a map (or it's bigger than ${MAX} x ${MAX}).`);
  const m = blank(pm.W, pm.H, title || name || 'Imported map');
  m.land = Uint8Array.from(pm.land);
  for (const [c, cells] of Object.entries(pm.marks)) {
    if (OIL[c]) cells.forEach(([x, y]) => m.oil.push({ x, y, t: c }));
    else if (PIN_CHARS.includes(c)) { const [x, y] = cells[0]; m.pins.push({ ch: c, x, y, label: labels[c] || '' }); }
    // (anything else, like a mission's own marks, is just sea)
  }
  for (const [c, [x, y]] of Object.entries(spots)) if (!m.pins.some(p => p.ch === c) && x < m.W && y < m.H) m.pins.push({ ch: c, x, y, label: labels[c] || '' });
  return m;
}

// ---------- natural islands (domain-warped value noise, thresholded to the land share you ask for) ----------
function hash(x, y, seed) { let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
const sm = t => t * t * (3 - 2 * t);
function vnoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = sm(x - xi), fy = sm(y - yi);
  const a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed), c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
function fbm(x, y, seed, oct = 5) { let v = 0, amp = 0.5, f = 1, tot = 0; for (let o = 0; o < oct; o++) { v += vnoise(x * f, y * f, seed + o * 31) * amp; tot += amp; amp *= 0.5; f *= 2.03; } return v / tot; }
// (rotated a little, so nothing lines up with the grid)
const rot = (x, y, a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
export function naturalMap({ W, H, share = 0.22, scale = 'medium', rough = 0.5, openEdges = true, seed = 1 }) {
  const m = blank(W, H, 'Natural islands');
  const feat = { small: 9, medium: 18, large: 34, huge: 60 }[scale] || 18;
  const ang = hash(seed, 7, 3) * Math.PI;
  const field = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let [u, v] = rot(x / feat, y / feat, ang);
    const wx = fbm(u + 3.1, v + 7.7, seed + 101, 3), wy = fbm(u + 11.3, v + 1.9, seed + 202, 3);
    u += (wx - 0.5) * 2.2; v += (wy - 0.5) * 2.2; // (warped: coasts wander instead of making blobs)
    let h = fbm(u, v, seed, 5) + (fbm(u * 3.7, v * 3.7, seed + 9, 3) - 0.5) * 0.25 * rough;
    if (openEdges) { const e = Math.min(x, y, W - 1 - x, H - 1 - y) / Math.max(4, Math.min(W, H) * 0.08); h -= Math.max(0, 1 - e) * 0.35; }
    field[y * W + x] = h;
  }
  const sorted = Float32Array.from(field).sort();
  const cut = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * (1 - share)))];
  for (let i = 0; i < field.length; i++) m.land[i] = field[i] >= cut ? 1 : 0;
  return m;
}
// a map from the game's own generator (any size and map type), land and optionally its oil
function gameMap(size, type, seed, withOil) {
  const st = E.newGame({ size, mapType: type, players: 2, seed, fog: 'on', turnTimer: 0 });
  const m = blank(st.W, st.H, `${MAP_TYPES[type]?.name || type} (${MAP_SIZES[size].name})`);
  for (let i = 0; i < st.W * st.H; i++) m.land[i] = st.land[i] ? 1 : 0;
  if (withOil) for (const d of st.deposits) if (!m.land[d.y * m.W + d.x]) m.oil.push({ x: d.x, y: d.y, t: d.type === 'rich' ? 'r' : d.type === 'small' ? 's' : 'm' });
  return m;
}

// ---------- saving ----------
const readIndex = () => { try { return JSON.parse(localStorage.getItem(KEY_INDEX)) || []; } catch { return []; } };
const writeIndex = l => { try { localStorage.setItem(KEY_INDEX, JSON.stringify(l)); } catch { /* blocked */ } };
function saveNamed() {
  try { localStorage.setItem(KEY_MAP(M.id), pack(M)); } catch { return note('Couldn\'t save: the browser\'s storage is full. Export the map instead.', true); }
  const l = readIndex().filter(e => e.id !== M.id);
  l.unshift({ id: M.id, name: M.name, W: M.W, H: M.H, savedAt: Date.now() });
  writeIndex(l); V.savedVer = V.ver; note(`Saved "${M.name}".`); side();
}
let autoT = 0;
const autosave = () => { clearTimeout(autoT); autoT = setTimeout(() => { try { localStorage.setItem(KEY_CUR, pack(M)); } catch { /* full */ } }, 800); };

// ---------- opening and closing ----------
function open() {
  root?.remove();
  let m = null;
  try { const c = localStorage.getItem(KEY_CUR); if (c) m = unpack(c); } catch { /* none */ }
  M = m || naturalMap({ W: 120, H: 80, seed: 12345 });
  V = { tool: 'land', brush: 5, oil: 'm', display: 'art', cell: 8, cam: { x: 0, y: 0 }, undo: [], redo: [], ver: 0, savedVer: 0, check: null, showCheck: true, sel: null, hover: null };
  root = document.createElement('div');
  root.className = 'mk';
  root.innerHTML = `
    <div class="mk-top">
      <div class="mk-title">🗺️ MAP MAKER <input class="mk-name" data-name maxlength="60" title="The map's name"></div>
      <div class="mk-topbtns">
        <button data-new>📄 New</button><button data-open>📂 Open</button><button data-save>💾 Save</button>
        <button data-export>⬇️ Export .txt</button><button data-copy>📋 Copy text</button><button data-import>⬆️ Import</button>
        <button class="ghost" data-close>✕ Close</button>
      </div>
    </div>
    <div class="mk-body">
      <div class="mk-tools" data-tools></div>
      <div class="mk-stage" data-stage><canvas data-cv></canvas><div class="mk-coord" data-coord></div><div class="mk-note hidden" data-note></div></div>
      <aside class="mk-side" data-side></aside>
    </div>`;
  document.body.appendChild(root);
  document.body.classList.add('mk-open');
  V.cv = root.querySelector('[data-cv]'); V.ctx = V.cv.getContext('2d');
  V.stage = root.querySelector('[data-stage]');
  bindTop(); tools(); side(); newPlain(); fitView(); resize(); scheduleArt(0);
  window.addEventListener('resize', resize);
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKeyUp, true);
  window.addEventListener('beforeunload', onLeave);
  bindStage();
}
function close() {
  if (V.ver !== V.savedVer && !confirm('Close the Map Maker? Unsaved changes stay in the autosave and come back next time you open it.')) return;
  window.removeEventListener('resize', resize);
  window.removeEventListener('keydown', onKey, true);
  window.removeEventListener('keyup', onKeyUp, true);
  window.removeEventListener('beforeunload', onLeave);
  document.body.classList.remove('mk-open');
  root.remove(); root = null;
  clearTimeout(V.artT);
}
const onLeave = () => { try { localStorage.setItem(KEY_CUR, pack(M)); } catch { /* full */ } };
function setMap(m, msg) {
  M = m; V.undo = []; V.redo = []; V.ver++; V.savedVer = V.ver; V.check = null; V.sel = null;
  newPlain(); fitView(); scheduleArt(0); side(); autosave();
  root.querySelector('[data-name]').value = M.name;
  if (msg) note(msg);
}

// ---------- drawing ----------
function newPlain() {
  V.plain = document.createElement('canvas'); V.plain.width = M.W; V.plain.height = M.H;
  V.pg = V.plain.getContext('2d'); V.img = V.pg.createImageData(M.W, M.H);
  for (let i = 0; i < M.W * M.H; i++) paintPx(i);
  V.pg.putImageData(V.img, 0, 0);
  V.dirty = document.createElement('canvas'); V.dirty.width = M.W; V.dirty.height = M.H; V.dg = V.dirty.getContext('2d');
  V.art = null; V.check = null;
}
function paintPx(i) { const c = M.land[i] ? LANDC : SEA, d = V.img.data, k = i * 4; d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 255; }
// a land / sea change: the quick picture now, the painted one after you stop
function setCell(i, v, rec) {
  if (M.land[i] === v) return;
  if (rec && !rec.cells.has(i)) rec.cells.set(i, M.land[i]);
  M.land[i] = v; paintPx(i);
  if (V.art) { const x = i % M.W, y = (i / M.W) | 0; V.dg.fillStyle = v ? 'rgb(156,172,104)' : 'rgb(22,58,87)'; V.dg.fillRect(x, y, 1, 1); V.artStale = true; }
}
function edited() { V.pg.putImageData(V.img, 0, 0); V.ver++; V.check = null; autosave(); scheduleArt(); redraw(); }
function scheduleArt(ms = 700) {
  clearTimeout(V.artT);
  if (V.display !== 'art') return;
  V.artT = setTimeout(buildArt, ms);
}
function buildArt() {
  if (!root || V.painting) return scheduleArt(400);
  // (the game's own land and water art, built from a stand-in game state: what you see is what the mission gets)
  const st = { W: M.W, H: M.H, land: Array.from(M.land), seed: 4242, mapType: 'classic' };
  V.art = { st, water: waterArt(st) };
  V.dg.clearRect(0, 0, M.W, M.H); V.artStale = false;
  redraw();
}
function resize() {
  const r = V.stage.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  V.cv.width = Math.round(r.width * dpr); V.cv.height = Math.round(r.height * dpr);
  V.cv.style.width = r.width + 'px'; V.cv.style.height = r.height + 'px';
  V.vw = r.width; V.vh = r.height; V.dpr = dpr;
  redraw();
}
function fitView() {
  const r = V.stage?.getBoundingClientRect() || { width: 900, height: 600 };
  V.cell = Math.max(0.5, Math.min(40, Math.min((r.width - 40) / M.W, (r.height - 40) / M.H)));
  V.cam = { x: -(r.width / V.cell - M.W) / 2, y: -(r.height / V.cell - M.H) / 2 };
}
let rq = false;
const redraw = () => { if (rq) return; rq = true; requestAnimationFrame(() => { rq = false; if (root) render(); }); };
function render() {
  const g = V.ctx, c = V.cell, dpr = V.dpr;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#050d15'; g.fillRect(0, 0, V.vw, V.vh);
  const sx = (x) => (x - V.cam.x) * c, sy = (y) => (y - V.cam.y) * c;
  // the visible squares
  const x0 = Math.max(0, Math.floor(V.cam.x)), y0 = Math.max(0, Math.floor(V.cam.y));
  const x1 = Math.min(M.W, Math.ceil(V.cam.x + V.vw / c)), y1 = Math.min(M.H, Math.ceil(V.cam.y + V.vh / c));
  if (x1 <= x0 || y1 <= y0) return;
  const w = x1 - x0, h = y1 - y0;
  if (V.display === 'art' && V.art) {
    const wa = V.art.water;
    g.imageSmoothingEnabled = true;
    g.drawImage(wa.canvas, x0 * wa.s, y0 * wa.s, w * wa.s, h * wa.s, sx(x0), sy(y0), w * c, h * c);
    drawLand(g, V.art.st, x0, y0, w, h, sx(x0), sy(y0), c);
    if (V.artStale) { g.imageSmoothingEnabled = false; g.drawImage(V.dirty, x0, y0, w, h, sx(x0), sy(y0), w * c, h * c); }
  } else {
    g.imageSmoothingEnabled = false;
    g.drawImage(V.plain, x0, y0, w, h, sx(x0), sy(y0), w * c, h * c);
  }
  // problems the check found
  if (V.check && V.showCheck && V.check.layer) { g.imageSmoothingEnabled = false; g.drawImage(V.check.layer, x0, y0, w, h, sx(x0), sy(y0), w * c, h * c); }
  // grid, close up
  if (c >= 10) {
    g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 1; g.beginPath();
    for (let x = x0; x <= x1; x++) { g.moveTo(Math.round(sx(x)) + .5, sy(y0)); g.lineTo(Math.round(sx(x)) + .5, sy(y1)); }
    for (let y = y0; y <= y1; y++) { g.moveTo(sx(x0), Math.round(sy(y)) + .5); g.lineTo(sx(x1), Math.round(sy(y)) + .5); }
    g.stroke();
  }
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1; g.strokeRect(sx(0) - .5, sy(0) - .5, M.W * c + 1, M.H * c + 1);
  // oil and pins (they stay readable however far out you zoom)
  for (const o of M.oil) {
    const r = Math.max(2.5, c * 0.38), X = sx(o.x + 0.5), Y = sy(o.y + 0.5);
    if (X < -20 || Y < -20 || X > V.vw + 20 || Y > V.vh + 20) continue;
    g.fillStyle = OIL[o.t].col; g.strokeStyle = '#1a1206'; g.lineWidth = 1;
    g.beginPath(); g.arc(X, Y, r, 0, Math.PI * 2); g.fill(); g.stroke();
    if (c >= 14) { g.fillStyle = '#1a1206'; g.font = `bold ${Math.round(c * 0.45)}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(o.t.toUpperCase(), X, Y + 0.5); }
  }
  for (const p of M.pins) {
    const X = sx(p.x + 0.5), Y = sy(p.y + 0.5), on = V.sel === p.ch;
    if (X < -200 || Y < -40 || X > V.vw + 200 || Y > V.vh + 40) continue;
    const bad = M.land[p.y * M.W + p.x];
    g.fillStyle = bad ? '#e25555' : on ? '#ffd666' : '#f4f7fb'; g.strokeStyle = '#0b1724'; g.lineWidth = 2;
    g.beginPath(); g.arc(X, Y, 9, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#0b1724'; g.font = 'bold 11px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(p.ch, X, Y + 0.5);
    if (p.label) {
      g.font = '600 12px system-ui'; g.textAlign = 'left';
      const tw = g.measureText(p.label).width;
      g.fillStyle = 'rgba(7,19,31,0.82)'; g.fillRect(X + 12, Y - 9, tw + 10, 18);
      g.fillStyle = on ? '#ffd666' : '#e4edf5'; g.fillText(p.label, X + 17, Y + 0.5);
    }
  }
  // the brush outline
  if (V.hover && ['land', 'sea', 'island', 'rough', 'smooth'].includes(V.tool)) {
    const r = V.tool === 'island' ? V.brush * 0.75 : V.brush / 2;
    g.strokeStyle = 'rgba(255,214,102,0.9)'; g.lineWidth = 1.5; g.setLineDash([4, 3]);
    g.beginPath(); g.arc(sx(V.hover[0] + 0.5), sy(V.hover[1] + 0.5), Math.max(2, r * c), 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
  } else if (V.hover && c >= 3) {
    g.strokeStyle = 'rgba(255,214,102,0.9)'; g.lineWidth = 1.5; g.strokeRect(sx(V.hover[0]), sy(V.hover[1]), c, c);
  }
}

// ---------- the tools ----------
function dab(cx, cy, tool, value, rec) {
  const R = V.brush / 2, r2 = R * R, W = M.W, H = M.H;
  const xa = Math.max(0, Math.floor(cx - R)), xb = Math.min(W - 1, Math.ceil(cx + R)), ya = Math.max(0, Math.floor(cy - R)), yb = Math.min(H - 1, Math.ceil(cy + R));
  const inside = (x, y) => { const dx = x - cx, dy = y - cy; return dx * dx + dy * dy <= r2 + 0.25; };
  if (tool === 'land' || tool === 'sea') { for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) if (inside(x, y)) setCell(y * W + x, value, rec); return; }
  const L = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : M.land[y * W + x]);
  const todo = [];
  for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
    if (!inside(x, y)) continue;
    let n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) n += L(x + dx, y + dy);
    const v = L(x, y);
    if (tool === 'smooth') { if (v && n <= 3) todo.push([x, y, 0]); else if (!v && n >= 5) todo.push([x, y, 1]); }
    else if (tool === 'rough' && n > 0 && n < 8) {
      // (coast squares only: flip some, by noise so it clumps into coves and spits rather than salt-and-pepper)
      const k = fbm(x / 3.3, y / 3.3, V.roughSeed, 3);
      if (v && k < 0.42 && n <= 6) todo.push([x, y, 0]); else if (!v && k > 0.58 && n >= 2) todo.push([x, y, 1]);
    }
  }
  for (const [x, y, v] of todo) setCell(y * W + x, v, rec);
}
function stampIsland(cx, cy, rec) {
  // a natural-looking island: a noisy, warped blob around the click
  const R = Math.max(1.5, V.brush * 0.75), seed = (Math.random() * 1e6) | 0, f = 1 / Math.max(2.5, R * 0.45), W = M.W, H = M.H;
  const ang = Math.random() * Math.PI, sq = 0.65 + Math.random() * 0.7; // (some long, some round, any angle)
  for (let y = Math.max(0, Math.floor(cy - R * 1.6)); y <= Math.min(H - 1, Math.ceil(cy + R * 1.6)); y++)
    for (let x = Math.max(0, Math.floor(cx - R * 1.6)); x <= Math.min(W - 1, Math.ceil(cx + R * 1.6)); x++) {
      let [u, v] = rot(x - cx, y - cy, ang); v /= sq;
      const wx = (fbm(x * f + 5.2, y * f + 1.3, seed, 3) - 0.5) * R * 0.9, wy = (fbm(x * f + 9.1, y * f + 4.7, seed + 1, 3) - 0.5) * R * 0.9;
      const d = Math.hypot(u + wx, v + wy) / R;
      const k = 1 - d + (fbm(x * f * 2.2, y * f * 2.2, seed + 2, 4) - 0.5) * 0.7;
      if (k > 0.12) setCell(y * W + x, 1, rec);
    }
}
function flood(x0, y0, rec) {
  const W = M.W, from = M.land[y0 * W + x0], to = from ? 0 : 1, q = [y0 * W + x0], seen = new Uint8Array(W * M.H);
  seen[q[0]] = 1;
  for (let k = 0; k < q.length; k++) {
    const i = q[k], x = i % W, y = (i / W) | 0;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= W || ny >= M.H) continue;
      const j = ny * W + nx; if (seen[j] || M.land[j] !== from) continue;
      seen[j] = 1; q.push(j);
    }
  }
  if (!from && q.length > W * M.H * 0.6 && !confirm(`That fills ${q.length.toLocaleString()} squares of sea with land (most of the map). Go ahead?`)) return;
  for (const i of q) setCell(i, to, rec);
}
// undo / redo: each stroke keeps the squares it changed, and the pins and oil if it touched them
const beginRec = () => ({ cells: new Map(), pins: null, oil: null });
function keepPins(rec) { if (!rec.pins) rec.pins = JSON.stringify(M.pins); }
function keepOil(rec) { if (!rec.oil) rec.oil = JSON.stringify(M.oil); }
function commit(rec) {
  if (!rec.cells.size && rec.pins == null && rec.oil == null) return;
  rec.after = { cells: new Map([...rec.cells.keys()].map(i => [i, M.land[i]])), pins: rec.pins != null ? JSON.stringify(M.pins) : null, oil: rec.oil != null ? JSON.stringify(M.oil) : null };
  V.undo.push(rec); if (V.undo.length > 60) V.undo.shift();
  V.redo = [];
  edited(); side();
}
function applyRec(rec, back) {
  const cells = back ? rec.cells : rec.after.cells;
  for (const [i, v] of cells) setCell(i, v, null);
  if (rec.pins != null) M.pins = JSON.parse(back ? rec.pins : rec.after.pins);
  if (rec.oil != null) M.oil = JSON.parse(back ? rec.oil : rec.after.oil);
  edited(); side();
}
const undo = () => { const r = V.undo.pop(); if (r) { applyRec(r, true); V.redo.push(r); } };
const redo = () => { const r = V.redo.pop(); if (r) { applyRec(r, false); V.undo.push(r); } };

// ---------- the mouse ----------
const cellAt = e => { const r = V.cv.getBoundingClientRect(); return [Math.floor((e.clientX - r.left) / V.cell + V.cam.x), Math.floor((e.clientY - r.top) / V.cell + V.cam.y)]; };
const onMap = ([x, y]) => x >= 0 && y >= 0 && x < M.W && y < M.H;
function bindStage() {
  const cv = V.cv;
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    const wx = mx / V.cell + V.cam.x, wy = my / V.cell + V.cam.y;
    V.cell = Math.max(0.5, Math.min(48, V.cell * Math.exp(-e.deltaY * 0.0015)));
    V.cam.x = wx - mx / V.cell; V.cam.y = wy - my / V.cell;
    redraw();
  }, { passive: false });
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId);
    const at = cellAt(e);
    if (e.button === 1 || V.space || V.tool === 'pan') { V.drag = { kind: 'pan', x: e.clientX, y: e.clientY, cam: { ...V.cam } }; return; }
    const right = e.button === 2;
    if (V.tool === 'pin') return pinClick(at, right);
    if (V.tool === 'oil') return oilClick(at, right);
    if (!onMap(at) && V.tool === 'fill') return;
    const rec = beginRec();
    if (V.tool === 'fill') { flood(at[0], at[1], rec); commit(rec); return; }
    V.painting = true; V.roughSeed = (Math.random() * 1e6) | 0;
    const value = V.tool === 'land' ? (right ? 0 : 1) : V.tool === 'sea' ? (right ? 1 : 0) : null;
    V.drag = { kind: 'paint', rec, value, last: at };
    if (V.tool === 'island') stampIsland(at[0], at[1], rec); else dab(at[0], at[1], V.tool, value, rec);
    V.pg.putImageData(V.img, 0, 0); redraw();
  });
  cv.addEventListener('pointermove', e => {
    const at = cellAt(e);
    V.hover = onMap(at) ? at : null;
    root.querySelector('[data-coord]').textContent = V.hover ? `column ${at[0] + 1}, row ${E.rowName(at[1])}   (x ${at[0]}, y ${at[1]})   ${M.land[at[1] * M.W + at[0]] ? 'land' : 'sea'}` : '';
    const d = V.drag;
    if (d?.kind === 'pan') { V.cam.x = d.cam.x - (e.clientX - d.x) / V.cell; V.cam.y = d.cam.y - (e.clientY - d.y) / V.cell; redraw(); return; }
    if (d?.kind === 'paint') {
      // (along the line from the last point, so a quick drag doesn't leave gaps)
      const [lx, ly] = d.last, dist = Math.hypot(at[0] - lx, at[1] - ly);
      const step = V.tool === 'island' ? Math.max(2, V.brush * 0.9) : Math.max(1, V.brush / 3);
      if (dist < step) { redraw(); return; }
      const n = Math.ceil(dist / step);
      for (let k = 1; k <= n; k++) {
        const x = Math.round(lx + (at[0] - lx) * k / n), y = Math.round(ly + (at[1] - ly) * k / n);
        if (V.tool === 'island') stampIsland(x, y, d.rec); else dab(x, y, V.tool, d.value, d.rec);
      }
      d.last = at; V.pg.putImageData(V.img, 0, 0);
    }
    redraw();
  });
  const up = () => { const d = V.drag; V.drag = null; if (d?.kind === 'paint') { V.painting = false; commit(d.rec); } };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.addEventListener('pointerleave', () => { V.hover = null; redraw(); });
}
function pinClick([x, y], right) {
  const hit = M.pins.find(p => Math.abs(p.x - x) <= Math.max(0, Math.ceil(9 / V.cell) - 1) && Math.abs(p.y - y) <= Math.max(0, Math.ceil(9 / V.cell) - 1));
  const rec = beginRec(); keepPins(rec);
  if (right) { if (hit) { M.pins = M.pins.filter(p => p !== hit); commit(rec); } return; }
  if (hit) { V.sel = hit.ch; side(); focusLabel(hit.ch); redraw(); return; }
  if (!onMap([x, y])) return;
  const ch = [...PIN_CHARS].find(c => !M.pins.some(p => p.ch === c));
  if (!ch) return note('All 36 pins are in use.', true);
  M.pins.push({ ch, x, y, label: '' }); V.sel = ch;
  commit(rec); focusLabel(ch);
}
function oilClick([x, y], right) {
  if (!onMap([x, y])) return;
  const rec = beginRec(); keepOil(rec);
  const hit = M.oil.find(o => o.x === x && o.y === y);
  if (hit) M.oil = M.oil.filter(o => o !== hit);
  else if (!right) { if (M.land[y * M.W + x]) return note('Oil goes in the sea.', true); M.oil.push({ x, y, t: V.oil }); }
  else return;
  commit(rec);
}
function focusLabel(ch) { setTimeout(() => { const i = root?.querySelector(`[data-plabel="${ch}"]`); if (i) { i.focus(); i.select(); } }, 0); }

// ---------- keys ----------
function onKey(e) {
  if (!root) return;
  const typing = /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
  if (typing) { if (e.key === 'Escape') e.target.blur(); e.stopImmediatePropagation(); return; }
  e.stopImmediatePropagation(); // (the game's own shortcuts stay quiet while the Map Maker is open)
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); saveNamed(); return; }
  if (e.key === ' ') { e.preventDefault(); V.space = true; return; }
  if (e.key === '[') return setBrush(V.brush - (V.brush > 10 ? 2 : 1));
  if (e.key === ']') return setBrush(V.brush + (V.brush >= 10 ? 2 : 1));
  if (e.key === 'Delete' && V.sel) { const rec = beginRec(); keepPins(rec); M.pins = M.pins.filter(p => p.ch !== V.sel); V.sel = null; commit(rec); return; }
  if (k === '0') { fitView(); redraw(); return; }
  const t = TOOLS.find(t => t[4].toLowerCase() === k);
  if (t && !e.ctrlKey && !e.metaKey) { V.tool = t[0]; tools(); redraw(); }
}
function onKeyUp(e) { if (e.key === ' ' && V) V.space = false; }
function setBrush(n) { V.brush = Math.max(1, Math.min(60, n)); tools(); redraw(); }

// ---------- the toolbar and sidebar ----------
function tools() {
  const el = root.querySelector('[data-tools]');
  el.innerHTML = `
    ${TOOLS.map(([id, ic, name, tip, key]) => `<button class="mk-tool ${V.tool === id ? 'on' : ''}" data-tool="${id}" title="${name} (${key}): ${tip}"><span>${ic}</span><small>${name}</small></button>`).join('')}
    <div class="mk-sep"></div>
    <label class="mk-lbl">Brush <b>${V.brush}</b><input type="range" min="1" max="60" value="${V.brush}" data-brush title="Brush size in squares ([ and ] keys)"></label>
    ${V.tool === 'oil' ? `<div class="mk-lbl">Oil size</div><div class="mk-oilpick">${Object.entries(OIL).map(([k, o]) => `<button class="${V.oil === k ? 'on' : ''}" data-oilt="${k}"><i style="background:${o.col}"></i>${o.name}</button>`).join('')}</div>` : ''}
    <div class="mk-sep"></div>
    <button data-undo ${V.undo.length ? '' : 'disabled'} title="Undo (Ctrl+Z)">↶ Undo</button>
    <button data-redo ${V.redo.length ? '' : 'disabled'} title="Redo (Ctrl+Y)">↷ Redo</button>
    <button data-fit title="See the whole map (0)">🔍 Whole map</button>
    <div class="mk-seg"><button class="${V.display === 'art' ? 'on' : ''}" data-disp="art" title="The game's own land and sea art (refreshes a moment after you stop painting)">🎨 Game look</button><button class="${V.display === 'plain' ? 'on' : ''}" data-disp="plain" title="Flat colours: fastest on huge maps">▦ Plain</button></div>`;
  el.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => { V.tool = b.dataset.tool; tools(); });
  el.querySelector('[data-brush]').oninput = e => { V.brush = +e.target.value; e.target.previousSibling.textContent = V.brush; redraw(); };
  el.querySelector('[data-brush]').onchange = () => tools();
  el.querySelectorAll('[data-oilt]').forEach(b => b.onclick = () => { V.oil = b.dataset.oilt; tools(); });
  el.querySelector('[data-undo]').onclick = () => { undo(); tools(); };
  el.querySelector('[data-redo]').onclick = () => { redo(); tools(); };
  el.querySelector('[data-fit]').onclick = () => { fitView(); redraw(); };
  el.querySelectorAll('[data-disp]').forEach(b => b.onclick = () => { V.display = b.dataset.disp; tools(); if (V.display === 'art' && (!V.art || V.artStale)) scheduleArt(0); redraw(); });
}
function side() {
  if (!root) return;
  tools();
  const landN = M.land.reduce((a, v) => a + v, 0), share = Math.round(landN / (M.W * M.H) * 100);
  const el = root.querySelector('[data-side]');
  const ck = V.check;
  el.innerHTML = `
    <div class="mk-box"><h4>This map</h4>
      <div class="mk-stat"><span>Size</span><b>${M.W} × ${M.H}</b></div>
      <div class="mk-stat"><span>Land</span><b>${share}%</b></div>
      <div class="mk-stat"><span>Oil</span><b>${M.oil.length ? Object.keys(OIL).map(k => `${M.oil.filter(o => o.t === k).length} ${OIL[k].name.toLowerCase()}`).join(', ') : 'none'}</b></div>
      <div class="mk-stat"><span>Saved</span><b>${V.ver === V.savedVer ? 'yes' : 'unsaved changes'}</b></div>
      <button data-resize class="small-btn">↔ Resize canvas</button>
    </div>
    <div class="mk-box"><h4>Pins <span class="muted small">(what goes where)</span></h4>
      ${M.pins.length ? '' : '<p class="muted small">Use the 📍 Pin tool to mark spots: "A = Haven", "B = the Gate forts", "C = player starts here". I build the mission around them.</p>'}
      ${[...M.pins].sort((a, b) => PIN_CHARS.indexOf(a.ch) - PIN_CHARS.indexOf(b.ch)).map(p => `
        <div class="mk-pin ${V.sel === p.ch ? 'on' : ''} ${M.land[p.y * M.W + p.x] ? 'bad' : ''}">
          <button class="mk-pinch" data-pgo="${p.ch}" title="Show it (column ${p.x + 1}, row ${E.rowName(p.y)})">${p.ch}</button>
          <input class="text-in" data-plabel="${p.ch}" value="${esc(p.label)}" placeholder="What is it?" maxlength="80">
          <button class="ghost" data-pdel="${p.ch}" title="Remove">✕</button>
        </div>`).join('')}
    </div>
    <div class="mk-box"><h4>Check the map</h4>
      <button data-check>🔎 Run the check</button>
      ${ck ? `<label class="mk-lbl small"><input type="checkbox" data-showck ${V.showCheck ? 'checked' : ''}> Highlight problems on the map</label>
        <ul class="mk-issues">${ck.items.map((it, i) => `<li class="${it.level}">${it.where ? `<a href="#" data-ckgo="${i}">${it.text}</a>` : it.text}</li>`).join('')}</ul>` : '<p class="muted small">Looks for water cut off from the open sea, channels too narrow for cruisers and carriers, pins and oil on land, and lone specks of land.</p>'}
    </div>
    <div class="mk-box"><h4>Keys</h4><p class="muted small mk-keys">Wheel: zoom · Space+drag or middle-drag: move · [ ]: brush size · Ctrl+Z / Ctrl+Y: undo / redo · Ctrl+S: save · 0: whole map · L S I R M F P O H: tools · right-drag with a brush: paint the opposite</p></div>`;
  el.querySelectorAll('[data-plabel]').forEach(i => {
    i.onfocus = () => { V.sel = i.dataset.plabel; redraw(); };
    i.oninput = () => { const p = M.pins.find(p => p.ch === i.dataset.plabel); if (p) { p.label = i.value; V.ver++; autosave(); redraw(); } };
  });
  el.querySelectorAll('[data-pgo]').forEach(b => b.onclick = () => { const p = M.pins.find(p => p.ch === b.dataset.pgo); V.sel = p.ch; centerOn(p.x, p.y); side(); });
  el.querySelectorAll('[data-pdel]').forEach(b => b.onclick = () => { const rec = beginRec(); keepPins(rec); M.pins = M.pins.filter(p => p.ch !== b.dataset.pdel); commit(rec); });
  el.querySelector('[data-check]').onclick = () => { runCheck(); side(); redraw(); };
  el.querySelector('[data-showck]')?.addEventListener('change', e => { V.showCheck = e.target.checked; redraw(); });
  el.querySelectorAll('[data-ckgo]').forEach(a => a.onclick = e => { e.preventDefault(); const w = ck.items[+a.dataset.ckgo].where; centerOn(w[0], w[1], 12); });
  el.querySelector('[data-resize]').onclick = resizeDialog;
}
function centerOn(x, y, minCell) {
  if (minCell && V.cell < minCell) V.cell = minCell;
  V.cam.x = x + 0.5 - V.vw / V.cell / 2; V.cam.y = y + 0.5 - V.vh / V.cell / 2; redraw();
}
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function note(msg, bad) {
  const n = root?.querySelector('[data-note]'); if (!n) return;
  n.textContent = msg; n.classList.toggle('bad', !!bad); n.classList.remove('hidden');
  clearTimeout(note.t); note.t = setTimeout(() => n.classList.add('hidden'), 3200);
}

// ---------- the check ----------
export function checkMap(m) {
  const { W, H, land } = m, N = W * H, items = [];
  const layer = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  let lg = null, img = null;
  if (layer) { layer.width = W; layer.height = H; lg = layer.getContext('2d'); img = lg.createImageData(W, H); }
  const mark = (i, c) => { if (!img) return; const k = i * 4; img.data[k] = c[0]; img.data[k + 1] = c[1]; img.data[k + 2] = c[2]; img.data[k + 3] = c[3]; };
  // bodies of water (4-connected): the biggest is the open sea, the rest are cut off from it
  const comp = new Int32Array(N).fill(-1), sizes = [];
  for (let s = 0; s < N; s++) {
    if (land[s] || comp[s] >= 0) continue;
    const id = sizes.length, q = [s]; comp[s] = id;
    for (let k = 0; k < q.length; k++) {
      const i = q[k], x = i % W, y = (i / W) | 0;
      if (x > 0 && !land[i - 1] && comp[i - 1] < 0) { comp[i - 1] = id; q.push(i - 1); }
      if (x < W - 1 && !land[i + 1] && comp[i + 1] < 0) { comp[i + 1] = id; q.push(i + 1); }
      if (y > 0 && !land[i - W] && comp[i - W] < 0) { comp[i - W] = id; q.push(i - W); }
      if (y < H - 1 && !land[i + W] && comp[i + W] < 0) { comp[i + W] = id; q.push(i + W); }
    }
    sizes.push(q.length);
  }
  const main = sizes.indexOf(Math.max(0, ...sizes));
  if (main < 0) items.push({ level: 'bad', text: 'There\'s no sea at all.' });
  const lakes = sizes.map((n, id) => [n, id]).filter(([, id]) => id !== main);
  if (lakes.length) {
    let first = null;
    for (let i = 0; i < N; i++) if (comp[i] >= 0 && comp[i] !== main) { mark(i, [255, 90, 70, 170]); if (!first) first = [i % W, (i / W) | 0]; }
    const total = lakes.reduce((a, [n]) => a + n, 0);
    items.push({ level: 'warn', text: `${lakes.length} patch${lakes.length > 1 ? 'es' : ''} of water (${total.toLocaleString()} squares) cut off from the open sea: no ship can get in or out (red). Fine if they're meant as lakes.`, where: first });
  }
  // big ships: they need a 2 x 2 patch of sea to turn and pass, so water only reachable through narrower
  // channels is for small boats only
  if (main >= 0) {
    const ok = new Uint8Array(N); // ok[i]: the 2 x 2 block with i at its top-left is all open sea
    for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) { const i = y * W + x; if (!land[i] && !land[i + 1] && !land[i + W] && !land[i + W + 1]) ok[i] = 1; }
    const bc = new Int32Array(N).fill(-1), bsz = [];
    for (let s = 0; s < N; s++) {
      if (!ok[s] || bc[s] >= 0) continue;
      const id = bsz.length, q = [s]; bc[s] = id;
      for (let k = 0; k < q.length; k++) {
        const i = q[k], x = i % W, y = (i / W) | 0;
        for (const j of [x > 0 ? i - 1 : -1, x < W - 2 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 2 ? i + W : -1]) if (j >= 0 && ok[j] && bc[j] < 0) { bc[j] = id; q.push(j); }
      }
      bsz.push(q.length);
    }
    const big = bsz.indexOf(Math.max(0, ...bsz));
    const reach = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (bc[i] === big) { reach[i] = reach[i + 1] = reach[i + W] = reach[i + W + 1] = 1; }
    let n = 0, first = null;
    for (let i = 0; i < N; i++) if (comp[i] === main && !reach[i]) { n++; mark(i, [255, 190, 60, 150]); if (!first) first = [i % W, (i / W) | 0]; }
    if (n) items.push({ level: 'info', text: `${n.toLocaleString()} squares of sea are only reachable through channels under 2 squares wide: small boats yes, cruisers and carriers no (orange).`, where: first });
  }
  for (const p of m.pins) if (land[p.y * W + p.x]) items.push({ level: 'bad', text: `Pin ${p.ch}${p.label ? ` (${esc(p.label)})` : ''} is on land.`, where: [p.x, p.y] });
  const oilLand = m.oil.filter(o => land[o.y * W + o.x]);
  if (oilLand.length) items.push({ level: 'bad', text: `${oilLand.length} oil marker${oilLand.length > 1 ? 's are' : ' is'} on land.`, where: [oilLand[0].x, oilLand[0].y] });
  // lone specks of land (one square, nothing next to it): usually brush slips
  let specks = 0, sp = null;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (!land[i]) continue;
    let n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H) n += land[i + dy * W + dx];
    if (!n) { specks++; mark(i, [255, 255, 255, 200]); if (!sp) sp = [x, y]; }
  }
  if (specks) items.push({ level: 'info', text: `${specks} lone square${specks > 1 ? 's' : ''} of land (white). Fine as rocks; the Smooth brush clears them.`, where: sp });
  if (!items.length) items.push({ level: 'good', text: 'All clear: every bit of sea joins up, and big ships can reach all of it.' });
  if (lg) lg.putImageData(img, 0, 0);
  return { items, layer };
}
function runCheck() { V.check = checkMap(M); V.showCheck = true; }

// ---------- dialogs: new, open, import, resize ----------
function dialog(html, bind) {
  const d = document.createElement('div');
  d.className = 'mk-gate';
  d.innerHTML = `<div class="mk-gate-card mk-dlg">${html}</div>`;
  root.appendChild(d);
  const close = () => d.remove();
  d.addEventListener('pointerdown', e => { if (e.target === d) close(); });
  bind(d.firstElementChild, close);
}
function bindTop() {
  const q = s => root.querySelector(s);
  q('[data-name]').value = M.name;
  q('[data-name]').oninput = e => { M.name = e.target.value || 'Untitled map'; V.ver++; autosave(); };
  q('[data-close]').onclick = close;
  q('[data-save]').onclick = saveNamed;
  q('[data-export]').onclick = () => {
    const blob = new Blob([mapToText(M)], { type: 'text/plain' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = (M.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'map') + '.txt';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    note('Exported. Send me the .txt file.');
  };
  q('[data-copy]').onclick = async () => {
    const t = mapToText(M);
    if (t.length > 60000 && !confirm(`This map is ${Math.round(t.length / 1000)} KB of text, too long to paste into a chat. Copy it anyway? (Export .txt is the better way to send it.)`)) return;
    try { await navigator.clipboard.writeText(t); note('Copied the map text.'); } catch { note('The browser wouldn\'t let me copy. Use Export .txt instead.', true); }
  };
  q('[data-new]').onclick = newDialog;
  q('[data-open]').onclick = openDialog;
  q('[data-import]').onclick = importDialog;
}
function newDialog() {
  const missions = Object.values(MISSIONS).filter(d => d.map).sort((a, b) => (a.arc || '').localeCompare(b.arc || '') || a.n - b.n);
  dialog(`<h3>📄 New map</h3>
    <div class="mk-tabs"><button class="on" data-tab="nat">🏝️ Natural islands</button><button data-tab="game">🎲 Game generator</button><button data-tab="blank">🌊 Blank sea</button><button data-tab="mis">📜 Mission map</button></div>
    <div data-pane="nat">
      <div class="mk-row"><label>Width <input type="number" class="text-in" data-w value="${M.W}" min="${MIN}" max="${MAX}"></label><label>Height <input type="number" class="text-in" data-h value="${M.H}" min="${MIN}" max="${MAX}"></label></div>
      <label class="mk-lbl">Land <b data-sharev>22%</b><input type="range" min="3" max="60" value="22" data-share></label>
      <div class="mk-lbl">Island size</div><div class="mk-seg" data-scale>${['small', 'medium', 'large', 'huge'].map(s => `<button data-v="${s}" class="${s === 'medium' ? 'on' : ''}">${s[0].toUpperCase() + s.slice(1)}</button>`).join('')}</div>
      <label class="mk-lbl">Rough coasts <b data-roughv>50%</b><input type="range" min="0" max="100" value="50" data-rough></label>
      <label class="mk-lbl"><input type="checkbox" data-edges checked> Open sea around the edges</label>
      <div class="mk-row"><label>Seed <input class="text-in" data-seed placeholder="blank = random"></label></div>
    </div>
    <div data-pane="game" class="hidden">
      <div class="mk-lbl">Size</div><div class="mk-seg" data-gsize>${Object.entries(MAP_SIZES).filter(([, s]) => !s.hidden).map(([k, s], i) => `<button data-v="${k}" class="${i === 0 ? 'on' : ''}">${s.name} <small>${s.w}×${s.h}</small></button>`).join('')}</div>
      <div class="mk-lbl">Map type</div><div class="mk-seg wrap" data-gtype>${MAP_TYPE_ORDER.map((k, i) => `<button data-v="${k}" class="${i === 0 ? 'on' : ''}" title="${esc(MAP_TYPES[k].desc)}">${MAP_TYPES[k].icon} ${MAP_TYPES[k].name}</button>`).join('')}</div>
      <label class="mk-lbl"><input type="checkbox" data-goil checked> Keep its oil deposits</label>
      <div class="mk-row"><label>Seed <input class="text-in" data-gseed placeholder="blank = random"></label></div>
      <p class="muted small">The game's own maps come in its four sizes. For any other size, use Natural islands.</p>
    </div>
    <div data-pane="blank" class="hidden">
      <div class="mk-row"><label>Width <input type="number" class="text-in" data-bw value="${M.W}" min="${MIN}" max="${MAX}"></label><label>Height <input type="number" class="text-in" data-bh value="${M.H}" min="${MIN}" max="${MAX}"></label></div>
      <p class="muted small">Up to ${MAX} × ${MAX}. For reference, the game's maps run from Small (150 × 100) to Huge (320 × 210).</p>
    </div>
    <div data-pane="mis" class="hidden">
      <div class="mk-mis">${missions.map(d => `<button data-mis="${d.id}">${esc(d.arc || '')} ${d.n}: ${esc(d.title)} <small>${parseMap(d.map).W}×${parseMap(d.map).H}</small></button>`).join('')}</div>
      <p class="muted small">Opens a copy: the mission itself doesn't change. Its marks come in as pins.</p>
    </div>
    <p class="mk-warn small">${V.ver !== V.savedVer ? 'The map you have open has unsaved changes: save it first if you want to keep it.' : ''}</p>
    <div class="row"><button class="primary" data-make>Make it</button><button class="ghost" data-x>Cancel</button></div>`, (c, close) => {
    let tab = 'nat';
    const seg = sel => c.querySelectorAll(`${sel} button`).forEach(b => b.onclick = () => { c.querySelectorAll(`${sel} button`).forEach(x => x.classList.remove('on')); b.classList.add('on'); });
    seg('[data-scale]'); seg('[data-gsize]'); seg('[data-gtype]');
    const pick = sel => c.querySelector(`${sel} button.on`)?.dataset.v;
    c.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => {
      tab = b.dataset.tab;
      c.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('on', x === b));
      c.querySelectorAll('[data-pane]').forEach(p => p.classList.toggle('hidden', p.dataset.pane !== tab));
      c.querySelector('[data-make]').classList.toggle('hidden', tab === 'mis');
    });
    c.querySelector('[data-share]').oninput = e => { c.querySelector('[data-sharev]').textContent = e.target.value + '%'; };
    c.querySelector('[data-rough]').oninput = e => { c.querySelector('[data-roughv]').textContent = e.target.value + '%'; };
    c.querySelector('[data-x]').onclick = close;
    const seedOf = v => { v = (v || '').trim(); if (!v) return (Math.random() * 1e9) | 0; return /^\d+$/.test(v) ? +v % 1e9 : fnv(v) % 1e9; };
    c.querySelectorAll('[data-mis]').forEach(b => b.onclick = () => {
      const d = MISSIONS[b.dataset.mis], pm = parseMap(d.map), m = blank(pm.W, pm.H, `${d.title} (copy)`);
      m.land = Uint8Array.from(pm.land);
      for (const [ch, cells] of Object.entries(pm.marks)) if (PIN_CHARS.includes(ch)) m.pins.push({ ch, x: cells[0][0], y: cells[0][1], label: 'mission mark' });
      close(); setMap(m, `Opened a copy of ${d.title}.`);
    });
    c.querySelector('[data-make]').onclick = () => {
      let m;
      if (tab === 'nat') {
        const W = clampSize(c.querySelector('[data-w]').value), H = clampSize(c.querySelector('[data-h]').value);
        note('Making islands…');
        m = naturalMap({ W, H, share: +c.querySelector('[data-share]').value / 100, scale: pick('[data-scale]'), rough: +c.querySelector('[data-rough]').value / 100, openEdges: c.querySelector('[data-edges]').checked, seed: seedOf(c.querySelector('[data-seed]').value) });
      } else if (tab === 'game') m = gameMap(pick('[data-gsize]'), pick('[data-gtype]'), seedOf(c.querySelector('[data-gseed]').value), c.querySelector('[data-goil]').checked);
      else m = blank(clampSize(c.querySelector('[data-bw]').value), clampSize(c.querySelector('[data-bh]').value));
      close(); setMap(m, `New ${m.W} × ${m.H} map.`);
    };
  });
}
function openDialog() {
  const list = readIndex();
  dialog(`<h3>📂 Your maps</h3>
    ${list.length ? `<div class="mk-list">${list.map(e => `<div class="mk-li"><button data-load="${e.id}"><b>${esc(e.name)}</b> <small class="muted">${e.W}×${e.H} · ${new Date(e.savedAt).toLocaleString()}</small></button><button class="ghost" data-del="${e.id}" title="Delete">🗑</button></div>`).join('')}</div>`
      : '<p class="muted">No saved maps yet. 💾 Save keeps the one you have open.</p>'}
    <div class="row"><button class="ghost" data-x>Close</button></div>`, (c, close) => {
    c.querySelector('[data-x]').onclick = close;
    c.querySelectorAll('[data-load]').forEach(b => b.onclick = () => {
      try { const m = unpack(localStorage.getItem(KEY_MAP(b.dataset.load))); close(); setMap(m, `Opened "${m.name}".`); }
      catch { note('That map couldn\'t be read.', true); }
    });
    c.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
      const e = list.find(e => e.id === b.dataset.del);
      if (!confirm(`Delete "${e.name}"? This can't be undone.`)) return;
      try { localStorage.removeItem(KEY_MAP(e.id)); } catch { /* gone */ }
      writeIndex(readIndex().filter(x => x.id !== e.id)); close(); openDialog();
    });
  });
}
function importDialog() {
  dialog(`<h3>⬆️ Import a map</h3>
    <p class="muted small">Open a .txt map file, or paste map text (rows of <b>.</b> and <b>#</b>, like the missions use).</p>
    <input type="file" accept=".txt,text/plain" data-file>
    <textarea class="text-in mk-paste" data-text placeholder="....###....&#10;...#####...&#10;....###...."></textarea>
    <div class="mk-warn small" data-err></div>
    <div class="row"><button class="primary" data-go>Import</button><button class="ghost" data-x>Cancel</button></div>`, (c, close) => {
    c.querySelector('[data-x]').onclick = close;
    const go = (text, name) => { try { const m = textToMap(text, name); close(); setMap(m, `Imported a ${m.W} × ${m.H} map.`); } catch (e) { c.querySelector('[data-err]').textContent = e.message; } };
    c.querySelector('[data-file]').onchange = async e => { const f = e.target.files[0]; if (f) go(await f.text(), f.name.replace(/\.txt$/i, '')); };
    c.querySelector('[data-go]').onclick = () => go(c.querySelector('[data-text]').value);
  });
}
function resizeDialog() {
  dialog(`<h3>↔ Resize the canvas</h3>
    <div class="mk-row"><label>Width <input type="number" class="text-in" data-w value="${M.W}" min="${MIN}" max="${MAX}"></label><label>Height <input type="number" class="text-in" data-h value="${M.H}" min="${MIN}" max="${MAX}"></label></div>
    <div class="mk-lbl">Keep the map</div>
    <div class="mk-anchor" data-anchor>${['↖', '↑', '↗', '←', '•', '→', '↙', '↓', '↘'].map((a, i) => `<button data-v="${i}" class="${i === 4 ? 'on' : ''}">${a}</button>`).join('')}</div>
    <p class="muted small">New space is open sea. Anything outside the new size is cut off (pins and oil there too).</p>
    <div class="row"><button class="primary" data-go>Resize</button><button class="ghost" data-x>Cancel</button></div>`, (c, close) => {
    c.querySelector('[data-x]').onclick = close;
    c.querySelectorAll('[data-anchor] button').forEach(b => b.onclick = () => { c.querySelectorAll('[data-anchor] button').forEach(x => x.classList.remove('on')); b.classList.add('on'); });
    c.querySelector('[data-go]').onclick = () => {
      const W = clampSize(c.querySelector('[data-w]').value), H = clampSize(c.querySelector('[data-h]').value), a = +c.querySelector('[data-anchor] button.on').dataset.v;
      const ox = [0, Math.floor((W - M.W) / 2), W - M.W][a % 3], oy = [0, Math.floor((H - M.H) / 2), H - M.H][(a / 3) | 0];
      const m = { ...M, W, H, land: new Uint8Array(W * H) };
      for (let y = 0; y < M.H; y++) for (let x = 0; x < M.W; x++) { const nx = x + ox, ny = y + oy; if (nx >= 0 && ny >= 0 && nx < W && ny < H) m.land[ny * W + nx] = M.land[y * M.W + x]; }
      const inb = p => p.x >= 0 && p.y >= 0 && p.x < W && p.y < H;
      m.pins = M.pins.map(p => ({ ...p, x: p.x + ox, y: p.y + oy })).filter(inb);
      m.oil = M.oil.map(o => ({ ...o, x: o.x + ox, y: o.y + oy })).filter(inb);
      close(); setMap(m, `Resized to ${W} × ${H}.`); V.savedVer = -1; side();
    };
  });
}
