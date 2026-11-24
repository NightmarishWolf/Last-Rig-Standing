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
import { MAP_SIZES, MAP_TYPES, MAP_TYPE_ORDER, PLAYER_COLORS } from '../data/maps.js';
import { SHIPS } from '../data/ships.js';
import { PLATFORMS, BASE_LEVELS } from '../data/bases.js';
import { SPRITES, shipSVG } from '../ui/board/shipart.js';
import { structSVG } from '../ui/board/structart.js';
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
  ['ship', '🚢', 'Ships', 'Pick a side and a ship type in the panel on the right, then click to place it. Q / E or R turns it. Click a placed ship to select it.', 'K'],
  ['build', '🏗️', 'Buildings', 'Bases, platforms and scenery: pick one in the panel on the right, then click to place it.', 'B'],
  ['slick', '⚫', 'Oil slick', 'Click to spread an oil slick (size and how long it lasts in the panel). Right-click one to remove it.', 'N'],
  ['select', '🖱️', 'Select / move', 'Click a ship, building or slick to select it; drag to move it. Delete removes it.', 'V'],
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
const DEFAULT_SIDES = () => [{ id: 1, name: 'You', faction: 'navy', color: PLAYER_COLORS[0] }, { id: 2, name: 'Enemy', faction: 'tide', color: PLAYER_COLORS[1] }];
const blank = (W, H, name = 'Untitled map') => ({ id: newId(), name, W, H, land: new Uint8Array(W * H), pins: [], oil: [], sides: DEFAULT_SIDES(), ships: [], builds: [], slicks: [] });
// (older saves: no sides or pieces yet)
const fill = m => { m.sides ||= DEFAULT_SIDES(); m.ships ||= []; m.builds ||= []; m.slicks ||= []; m.pins ||= []; m.oil ||= []; return m; };
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const clampSize = n => Math.max(MIN, Math.min(MAX, Math.round(+n || 0)));
const rle = land => { const out = []; let v = 0, n = 0; for (let i = 0; i < land.length; i++) { if (land[i] === v) n++; else { out.push(n.toString(36)); v ^= 1; n = 1; } } out.push(n.toString(36)); return out.join(','); };
const unrle = (s, size) => { const a = new Uint8Array(size); let i = 0, v = 0; for (const t of s.split(',')) { const n = parseInt(t, 36) || 0; if (v) a.fill(1, i, i + n); i += n; v ^= 1; } return a; };
const pack = m => JSON.stringify({ id: m.id, name: m.name, W: m.W, H: m.H, land: rle(m.land), pins: m.pins, oil: m.oil, sides: m.sides, ships: m.ships, builds: m.builds, slicks: m.slicks });
const unpack = s => { const o = JSON.parse(s); return fill({ ...o, land: unrle(o.land, o.W * o.H) }); };

// the text the missions read (js/campaign/mapfile.js)
export function mapToText(m) {
  const pinAt = new Map(m.pins.map(p => [p.y * m.W + p.x, p.ch])), oilAt = new Map(m.oil.map(o => [o.y * m.W + o.x, o.t]));
  const head = [`; Last Rig Standing map: ${m.name}`, `; ${m.W} x ${m.H} squares. Key: . sea, # land, s/m/r small/medium/rich oil, letters and digits are pins.`];
  for (const p of [...m.pins].sort((a, b) => PIN_CHARS.indexOf(a.ch) - PIN_CHARS.indexOf(b.ch)))
    head.push(`; ${p.ch} = ${p.label || '(no label)'} (column ${p.x + 1}, row ${E.rowName(p.y)}; x ${p.x}, y ${p.y})${m.land[p.y * m.W + p.x] ? ' [on land]' : ''}`);
  // sides and pieces: one line each, fields split by |, the spot always last as "x N, y N"
  const at = (x, y) => `column ${x + 1}, row ${E.rowName(y)}; x ${x}, y ${y}`;
  const q = n => `"${String(n || '').replace(/["|]/g, "'")}"`;
  const sn = id => `side ${id} (${String(m.sides?.find(x => x.id === id)?.name || '').replace(/[|()]/g, '')})`;
  for (const sd of m.sides || []) head.push(`; side ${sd.id} | ${q(sd.name)} | ${sd.faction} | ${sd.color}`);
  for (const sh of m.ships || []) head.push(`; ship | ${sn(sh.side)} | ${sh.type} | turned ${sh.rot} | ${q(sh.name)} | ${at(sh.x, sh.y)}`);
  for (const b of m.builds || []) {
    if (b.what === 'base') head.push(`; base | ${sn(b.side)} | ${b.sub} | level ${b.level}${b.raft ? ' | raft-town' : ''} | ${q(b.name)} | ${at(b.x, b.y)}`);
    else if (b.what === 'platform') head.push(`; platform | ${sn(b.side)} | ${b.sub} | ${q(b.name)} | ${at(b.x, b.y)}`);
    else head.push(`; scenery | ${b.sub} | ${q(b.name)} | ${at(b.x, b.y)}`);
  }
  for (const o of m.slicks || []) head.push(`; slick | radius ${o.r} | ${o.left ? o.left + ' rounds' : 'stays'}${o.burning ? ' | burning' : ''} | ${at(o.x, o.y)}`);
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
  // sides and pieces
  const sides = [];
  for (const l of lines.map(l => l.trim()).filter(l => l.startsWith(';') && l.includes('|'))) {
    const f = l.slice(1).split('|').map(t => t.trim()), xy = l.match(/x (\d+), y (\d+)\s*$/), nm = (f.find(t => /^".*"$/.test(t)) || '""').slice(1, -1);
    const side = +((l.match(/\bside (\d+)/) || [])[1] || 0), x = xy ? +xy[1] : 0, y = xy ? +xy[2] : 0;
    const sd = f[0].match(/^side (\d+)$/);
    if (sd) { sides.push({ id: +sd[1], name: nm || `Side ${sd[1]}`, faction: f[2] === 'tide' ? 'tide' : 'navy', color: f[3] || PLAYER_COLORS[(+sd[1] - 1) % 4] }); continue; }
    if (!xy) continue;
    if (f[0] === 'ship' && SHIPS[f[2]]) m.ships.push({ id: pid(), side, type: f[2], rot: +((f[3].match(/\d/) || [0])[0]), name: nm, x, y });
    else if (f[0] === 'base') m.builds.push({ id: pid(), what: 'base', side, sub: f[2] === 'capital' ? 'capital' : 'outpost', level: +((f[3].match(/\d/) || [1])[0]), raft: f.includes('raft-town'), name: nm, x, y });
    else if (f[0] === 'platform' && PLATFORMS[f[2]]) m.builds.push({ id: pid(), what: 'platform', side, sub: f[2], name: nm, x, y });
    else if (f[0] === 'scenery' && SCENERY[f[1]]) m.builds.push({ id: pid(), what: 'scenery', side: 0, sub: f[1], name: nm, x, y });
    else if (f[0] === 'slick') m.slicks.push({ id: pid(), r: +((f[1].match(/\d+/) || [2])[0]), left: +((f[2].match(/\d+/) || [0])[0]), burning: f.includes('burning'), x, y });
  }
  if (sides.length) m.sides = sides;
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
  M = fill(m || naturalMap({ W: 120, H: 80, seed: 12345 }));
  V = { place: { side: 1, type: 'destroyer', rot: 0 }, bplace: { what: 'base', side: 2, capital: false, level: 2, raft: true, platform: 'gun', scenery: 'village' }, slick: { r: 2, left: 8, burning: false }, piece: null, tool: 'land', brush: 5, oil: 'm', display: 'art', cell: 8, cam: { x: 0, y: 0 }, undo: [], redo: [], ver: 0, savedVer: 0, check: null, showCheck: true, sel: null, hover: null };
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
  M = fill(m); V.piece = null; V.undo = []; V.redo = []; V.ver++; V.savedVer = V.ver; V.check = null; V.sel = null;
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
  renderPieces(g, sx, sy, c);
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
const LISTS = ['pins', 'oil', 'sides', 'ships', 'builds', 'slicks'];
const beginRec = () => ({ cells: new Map(), snap: {} });
const keep = (rec, ...keys) => { for (const k of keys) if (!(k in rec.snap)) rec.snap[k] = JSON.stringify(M[k]); };
const keepPins = rec => keep(rec, 'pins'), keepOil = rec => keep(rec, 'oil');
function commit(rec) {
  if (!rec.cells.size && !Object.keys(rec.snap).length) return;
  rec.after = { cells: new Map([...rec.cells.keys()].map(i => [i, M.land[i]])), snap: Object.fromEntries(Object.keys(rec.snap).map(k => [k, JSON.stringify(M[k])])) };
  V.undo.push(rec); if (V.undo.length > 60) V.undo.shift();
  V.redo = [];
  edited(); side();
}
function applyRec(rec, back) {
  const cells = back ? rec.cells : rec.after.cells;
  for (const [i, v] of cells) setCell(i, v, null);
  for (const k of Object.keys(rec.snap)) M[k] = JSON.parse(back ? rec.snap[k] : rec.after.snap[k]);
  if (V.piece && !findPiece(V.piece)) V.piece = null;
  edited(); side();
}
const undo = () => { const r = V.undo.pop(); if (r) { applyRec(r, true); V.redo.push(r); } };
const redo = () => { const r = V.redo.pop(); if (r) { applyRec(r, false); V.undo.push(r); } };

// ---------- pieces: sides, ships, buildings, oil slicks ----------
const SCENERY = {
  village: { name: 'Fishing village', icon: '🏘️' }, boats: { name: 'Beached boats', icon: '🛶' },
  terminal: { name: 'Terminal tanks and jetty', icon: '🏭' }, derelictRig: { name: 'Derelict rig', icon: '🗼' },
  lighthouse: { name: 'Lighthouse', icon: '🗼' }, wreck: { name: 'Old wreck', icon: '⚓' },
};
const EXTRA_COLORS = ['#e25555', '#5b8def', '#7fd17a', '#e07ad6'];
const sideOf = id => M.sides.find(s => s.id === id);
const sideCol = id => sideOf(id)?.color || '#c9d3dc';
const sideName = id => (id ? sideOf(id)?.name || `side ${id}` : 'Neutral');
const shipTypes = faction => Object.entries(SHIPS).filter(([, t]) => !t.hidden && (!t.faction || t.faction === faction)).sort((a, b) => (a[1].hp || 0) - (b[1].hp || 0));
const shipCellsOf = s => E.shipCells({ type: s.type, x: s.x, y: s.y, rot: s.rot || 0 });
const pid = () => 'p' + Math.random().toString(36).slice(2, 8);
const findPiece = ref => ref && (ref.kind === 'ship' ? M.ships : ref.kind === 'build' ? M.builds : M.slicks).find(o => o.id === ref.id);
const listOf = kind => (kind === 'ship' ? 'ships' : kind === 'build' ? 'builds' : 'slicks');
const takesSquare = b => b.what !== 'scenery';
function occupied(exceptId) {
  const o = new Set();
  for (const s of M.ships) if (s.id !== exceptId) for (const [x, y] of shipCellsOf(s)) o.add(y * M.W + x);
  for (const b of M.builds) if (b.id !== exceptId && takesSquare(b)) o.add(b.y * M.W + b.x);
  return o;
}
// why a piece can't go where it is ('' = fine)
function badSpot(kind, o, exceptId) {
  const inMap = (x, y) => x >= 0 && y >= 0 && x < M.W && y < M.H;
  if (kind === 'ship') {
    const occ = occupied(exceptId), cells = shipCellsOf(o);
    if (!cells.every(([x, y]) => inMap(x, y))) return 'off the map';
    if (cells.some(([x, y]) => M.land[y * M.W + x])) return 'on land';
    if (cells.some(([x, y]) => occ.has(y * M.W + x))) return 'on top of something';
    return '';
  }
  if (kind === 'build') {
    if (!inMap(o.x, o.y)) return 'off the map';
    if (!takesSquare(o)) return '';
    if (M.land[o.y * M.W + o.x]) return 'on land (bases and platforms stand in the sea)';
    if (occupied(exceptId).has(o.y * M.W + o.x)) return 'on top of something';
    return '';
  }
  return inMap(o.x, o.y) ? '' : 'off the map';
}
// (the ship's footprint centred on the square under the cursor)
function shipAt(type, rot, cx, cy) {
  const c = E.shipCells({ type, x: cx, y: cy, rot });
  const mx = Math.round(c.reduce((a, [x]) => a + x, 0) / c.length - 0.0001), my = Math.round(c.reduce((a, [, y]) => a + y, 0) / c.length - 0.0001);
  return { x: cx - (mx - cx), y: cy - (my - cy) };
}
function pieceAt(x, y) {
  for (const b of [...M.builds].reverse()) if (b.x === x && b.y === y) return { kind: 'build', id: b.id };
  for (const s of [...M.ships].reverse()) if (shipCellsOf(s).some(([a, b]) => a === x && b === y)) return { kind: 'ship', id: s.id };
  for (const s of [...M.slicks].reverse()) if (Math.max(Math.abs(s.x - x), Math.abs(s.y - y)) <= s.r) return { kind: 'slick', id: s.id };
  return null;
}
// placing: the ship / building / slick the panel has picked
function placeClick([x, y], right) {
  if (!onMap([x, y])) return;
  const hit = pieceAt(x, y);
  if (right) { if (hit) removePiece(hit); return; }
  const rec = beginRec();
  if (V.tool === 'ship') {
    const P = V.place;
    if (!SHIPS[P.type] || (SHIPS[P.type].faction && SHIPS[P.type].faction !== sideOf(P.side)?.faction)) return note('Pick a ship for that side in the panel.', true);
    const s = { id: pid(), side: P.side, type: P.type, rot: P.rot, ...shipAt(P.type, P.rot, x, y), name: '' };
    const bad = badSpot('ship', s);
    if (bad) return note(`Can't put it there: ${bad}.`, true);
    keep(rec, 'ships'); M.ships.push(s); V.piece = { kind: 'ship', id: s.id };
  } else if (V.tool === 'build') {
    const P = V.bplace;
    const b = { id: pid(), what: P.what, sub: P.what === 'base' ? (P.capital ? 'capital' : 'outpost') : P.what === 'platform' ? P.platform : P.scenery,
      side: P.what === 'scenery' ? 0 : P.side, level: P.level, raft: P.what === 'base' && sideOf(P.side)?.faction === 'tide' ? P.raft : false, x, y, name: '' };
    const bad = badSpot('build', b);
    if (bad) return note(`Can't put it there: ${bad}.`, true);
    keep(rec, 'builds'); M.builds.push(b); V.piece = { kind: 'build', id: b.id };
  } else if (V.tool === 'slick') {
    keep(rec, 'slicks'); const o = { id: pid(), x, y, r: V.slick.r, left: V.slick.left, burning: V.slick.burning }; M.slicks.push(o); V.piece = { kind: 'slick', id: o.id };
  }
  commit(rec);
}
function removePiece(ref) {
  const rec = beginRec(), k = listOf(ref.kind); keep(rec, k);
  M[k] = M[k].filter(o => o.id !== ref.id);
  if (V.piece?.id === ref.id) V.piece = null;
  commit(rec);
}
function changePiece(fn, keys) {
  const p = findPiece(V.piece); if (!p) return;
  const rec = beginRec(); keep(rec, listOf(V.piece.kind), ...(keys || []));
  fn(p); commit(rec);
}
function turnPiece(d) {
  const p = findPiece(V.piece);
  if (!p || V.piece.kind !== 'ship') return;
  const was = { x: p.x, y: p.y, rot: p.rot };
  // (turn about the middle of the ship, and only if it still fits)
  const c0 = shipCellsOf(p), cx = Math.round(c0.reduce((a, [x]) => a + x, 0) / c0.length - 0.0001), cy = Math.round(c0.reduce((a, [, y]) => a + y, 0) / c0.length - 0.0001);
  const rot = (p.rot + d + 4) % 4, at = shipAt(p.type, rot, cx, cy);
  const bad = badSpot('ship', { ...p, ...at, rot }, p.id);
  if (bad) return note(`It won't turn there: ${bad}.`, true);
  const rec = beginRec(); keep(rec, 'ships'); Object.assign(p, at, { rot }); commit(rec);
  void was;
}
// ship pictures: the game's own sprites in the side's colour, made once per type and colour
const pics = new Map();
function shipPic(type, color) {
  const k = type + color;
  let e = pics.get(k);
  if (e) return e.ready ? e.c : null;
  e = { ready: false }; pics.set(k, e);
  const img = new Image(), [w, h] = SPRITES[type];
  img.onload = () => { const c = document.createElement('canvas'); c.width = w * 48; c.height = h * 48; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); e.c = c; e.ready = true; redraw(); };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(shipSVG(type, color));
  return null;
}
function drawShip(g, s, sx, sy, c, alpha = 1, tint = null) {
  const cells = shipCellsOf(s), col = sideCol(s.side);
  g.save(); g.globalAlpha = alpha;
  const pic = c >= 6 && SPRITES[s.type] ? shipPic(s.type, col) : null;
  if (pic && !tint) {
    const [w, h] = SPRITES[s.type], r = ((s.rot % 4) + 4) % 4, X = sx(s.x), Y = sy(s.y);
    g.imageSmoothingEnabled = true;
    if (r === 0) g.translate(X, Y); else if (r === 1) { g.translate(X + h * c, Y); g.rotate(Math.PI / 2); } else if (r === 2) { g.translate(X + w * c, Y + h * c); g.rotate(Math.PI); } else { g.translate(X, Y + w * c); g.rotate(-Math.PI / 2); }
    g.drawImage(pic, 0, 0, w * c, h * c);
  } else {
    g.fillStyle = tint || col;
    for (const [x, y] of cells) g.fillRect(sx(x) + c * 0.1, sy(y) + c * 0.1, Math.max(1, c * 0.8), Math.max(1, c * 0.8));
  }
  g.restore();
}
function drawBuild(g, b, sx, sy, c) {
  const X = sx(b.x), Y = sy(b.y), col = sideCol(b.side), m = Math.max(1, c * 0.08);
  if (b.what === 'scenery') {
    const z = Math.max(12, c * 0.95);
    g.font = `${z}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(SCENERY[b.sub]?.icon || '•', X + c / 2, Y + c / 2 + 1);
    return;
  }
  if (c < 4) { g.fillStyle = col; g.fillRect(X - 1.5, Y - 1.5, Math.max(3, c) + 3, Math.max(3, c) + 3); return; }
  // the game's own rig and platform sprites (a base stands on its rig)
  const pic = c >= 8 && structPic(b.what === 'base' ? 'rig' : b.sub, col, sideOf(b.side)?.faction === 'tide');
  if (pic) { g.imageSmoothingEnabled = true; g.drawImage(pic, X, Y, c, c); }
  else { g.fillStyle = '#1c2a36'; g.strokeStyle = col; g.lineWidth = Math.max(1.5, c * 0.08); g.fillRect(X + m, Y + m, c - 2 * m, c - 2 * m); g.strokeRect(X + m, Y + m, c - 2 * m, c - 2 * m); }
  if (b.what === 'base') {
    // its badge: ★ for a capital, else the level; a raft-town gets a ring of lashed hulls
    if (b.raft) { g.strokeStyle = '#6b4a2c'; g.lineWidth = Math.max(2, c * 0.12); g.strokeRect(X - c * 0.08, Y - c * 0.08, c * 1.16, c * 1.16); }
    const r = Math.max(5, c * 0.22);
    g.fillStyle = b.sub === 'capital' ? '#ffd666' : col; g.beginPath(); g.arc(X + c - r * 0.5, Y + r * 0.5, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#10161c'; g.font = `bold ${Math.round(r * 1.3)}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(b.sub === 'capital' ? '★' : String(b.level), X + c - r * 0.5, Y + r * 0.5 + 1);
  }
}
const spics = new Map();
function structPic(kind, color, tide) {
  const k = kind + color + tide;
  let e = spics.get(k);
  if (e) return e.ready ? e.c : null;
  e = { ready: false }; spics.set(k, e);
  const img = new Image();
  img.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 96; c.getContext('2d').drawImage(img, 0, 0, 96, 96); e.c = c; e.ready = true; redraw(); };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(structSVG(kind, color, tide));
  return null;
}
function drawSlick(g, s, sx, sy, c) {
  const x0 = Math.max(0, s.x - s.r), y0 = Math.max(0, s.y - s.r), x1 = Math.min(M.W - 1, s.x + s.r), y1 = Math.min(M.H - 1, s.y + s.r);
  const cx = sx(s.x) + c / 2, cy = sy(s.y) + c / 2, gr = g.createRadialGradient(cx, cy, c * 0.3, cx, cy, c * (s.r + 1));
  if (s.burning) { gr.addColorStop(0, 'rgba(255,140,40,.8)'); gr.addColorStop(0.6, 'rgba(160,40,20,.55)'); gr.addColorStop(1, 'rgba(60,20,10,.25)'); }
  else { gr.addColorStop(0, 'rgba(10,8,6,.75)'); gr.addColorStop(0.6, 'rgba(40,30,60,.55)'); gr.addColorStop(1, 'rgba(60,90,80,.25)'); }
  g.fillStyle = gr; g.fillRect(sx(x0), sy(y0), c * (x1 - x0 + 1), c * (y1 - y0 + 1));
  if (c >= 12) { g.fillStyle = '#e4edf5'; g.font = '600 11px system-ui'; g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillText(`${s.burning ? '🔥' : '🛢️'} ${s.left ? s.left + ' rounds' : 'stays'}`, cx, sy(y0) - 2); }
}
function pieceBox(ref) {
  const p = findPiece(ref); if (!p) return null;
  if (ref.kind === 'ship') { const c = shipCellsOf(p), xs = c.map(a => a[0]), ys = c.map(a => a[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; }
  if (ref.kind === 'slick') return [p.x - p.r, p.y - p.r, p.x + p.r, p.y + p.r];
  return [p.x, p.y, p.x, p.y];
}
function renderPieces(g, sx, sy, c) {
  for (const s of M.slicks) drawSlick(g, s, sx, sy, c);
  for (const b of M.builds) drawBuild(g, b, sx, sy, c);
  for (const s of M.ships) drawShip(g, s, sx, sy, c, V.drag?.kind === 'move' && V.drag.ref.id === s.id && V.drag.bad ? 0.5 : 1);
  // names, close up
  if (c >= 14) {
    g.font = '600 11px system-ui'; g.textAlign = 'center'; g.textBaseline = 'top';
    for (const p of [...M.ships, ...M.builds]) if (p.name) {
      const box = pieceBox({ kind: M.ships.includes(p) ? 'ship' : 'build', id: p.id });
      const X = sx((box[0] + box[2] + 1) / 2), Y = sy(box[3] + 1) + 2, tw = g.measureText(p.name).width;
      g.fillStyle = 'rgba(7,19,31,.8)'; g.fillRect(X - tw / 2 - 4, Y - 1, tw + 8, 15); g.fillStyle = '#e4edf5'; g.fillText(p.name, X, Y);
    }
  }
  // the selected piece (and a base's claim: where its platforms can go)
  if (V.piece) {
    const p = findPiece(V.piece), box = pieceBox(V.piece);
    if (box) {
      g.strokeStyle = V.drag?.bad ? '#ff6b6b' : '#ffd666'; g.lineWidth = 2; g.setLineDash([5, 3]);
      g.strokeRect(sx(box[0]) - 2, sy(box[1]) - 2, (box[2] - box[0] + 1) * c + 4, (box[3] - box[1] + 1) * c + 4);
      if (V.piece.kind === 'build' && p.what === 'base') { const r = BASE_LEVELS[p.level]?.radiusCap || 2; g.strokeStyle = 'rgba(255,214,102,.45)'; g.strokeRect(sx(p.x - r), sy(p.y - r), (2 * r + 1) * c, (2 * r + 1) * c); }
      g.setLineDash([]);
    }
  }
  // what the ship tool would place
  if (V.hover && V.tool === 'ship' && !V.drag && SHIPS[V.place.type]) {
    const s = { side: V.place.side, type: V.place.type, rot: V.place.rot, ...shipAt(V.place.type, V.place.rot, V.hover[0], V.hover[1]) };
    const bad = badSpot('ship', s);
    drawShip(g, s, sx, sy, c, 0.55, bad ? 'rgba(255,80,80,.8)' : null);
  }
}

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
    if (['ship', 'build', 'slick', 'select'].includes(V.tool)) {
      // (a piece under the cursor: select it and drag it; otherwise place a new one)
      const hit = onMap(at) && pieceAt(at[0], at[1]);
      const mine = hit && (V.tool === 'select' || hit.kind === V.tool);
      if (right) { if (hit) removePiece(hit); return; }
      if (mine) {
        const p = findPiece(hit); V.piece = hit;
        V.drag = { kind: 'move', ref: hit, from: at, x: p.x, y: p.y, rec: (() => { const r = beginRec(); keep(r, listOf(hit.kind)); return r; })(), moved: false };
        side(); redraw(); return;
      }
      if (V.tool === 'select') { V.piece = null; side(); redraw(); return; }
      placeClick(at, false); side(); return;
    }
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
    if (d?.kind === 'move') {
      const p = findPiece(d.ref);
      if (p) { p.x = d.x + at[0] - d.from[0]; p.y = d.y + at[1] - d.from[1]; d.moved = d.moved || at[0] !== d.from[0] || at[1] !== d.from[1]; d.bad = badSpot(d.ref.kind, p, p.id); }
      redraw(); return;
    }
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
  const up = () => {
    const d = V.drag; V.drag = null;
    if (d?.kind === 'paint') { V.painting = false; commit(d.rec); }
    if (d?.kind === 'move') {
      const p = findPiece(d.ref);
      if (p && d.bad) { p.x = d.x; p.y = d.y; note(`Can't put it there: ${d.bad}.`, true); redraw(); }
      else if (p && d.moved) commit(d.rec);
    }
  };
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
  if ((e.key === 'Delete' || e.key === 'Backspace') && V.piece) { removePiece(V.piece); return; }
  if ((k === 'q' || k === 'e' || k === 'r') && !e.ctrlKey && !e.metaKey && (V.tool === 'ship' || V.piece?.kind === 'ship')) {
    const d = k === 'q' ? -1 : 1;
    if (V.piece?.kind === 'ship' && V.tool !== 'ship') turnPiece(d); else { V.place.rot = (V.place.rot + d + 4) % 4; redraw(); }
    return;
  }
  if (e.key === 'Escape' && V.piece) { V.piece = null; side(); redraw(); return; }
  if (e.key === 'Delete' && V.sel) { const rec = beginRec(); keepPins(rec); M.pins = M.pins.filter(p => p.ch !== V.sel); V.sel = null; commit(rec); return; }
  if (k === '0') { fitView(); redraw(); return; }
  const t = TOOLS.find(t => t[4].toLowerCase() === k);
  if (t && !e.ctrlKey && !e.metaKey) { V.tool = t[0]; side(); redraw(); }
}
function onKeyUp(e) { if (e.key === ' ' && V) V.space = false; }
function setBrush(n) { V.brush = Math.max(1, Math.min(60, n)); tools(); redraw(); }

// ---------- sidebar: sides, what to place, the selected piece ----------
function sidesBox() {
  return `<div class="mk-box"><h4>Sides</h4>
    ${M.sides.map(sd => `<div class="mk-sidei">
      <button class="mk-swatch" style="background:${sd.color}" data-scol="${sd.id}" title="Change colour"></button>
      <input class="text-in" data-sname="${sd.id}" value="${esc(sd.name)}" maxlength="40">
      <select data-sfac="${sd.id}" title="Faction"><option value="navy" ${sd.faction === 'navy' ? 'selected' : ''}>Navy</option><option value="tide" ${sd.faction === 'tide' ? 'selected' : ''}>Free Tide</option></select>
      <button class="ghost" data-sdel="${sd.id}" title="Remove this side" ${M.sides.length < 2 ? 'disabled' : ''}>✕</button>
    </div>`).join('')}
    ${M.sides.length < 4 ? '<button class="small-btn" data-sadd>+ Add a side</button>' : ''}
    <p class="muted small">Scenery belongs to nobody (Neutral).</p></div>`;
}
const sidePick = (cur, attr) => `<div class="mk-seg">${M.sides.map(sd => `<button class="${cur === sd.id ? 'on' : ''}" data-${attr}="${sd.id}"><i class="mk-dot" style="background:${sd.color}"></i>${esc(sd.name)}</button>`).join('')}</div>`;
function placeBox() {
  if (V.tool === 'ship') {
    const P = V.place, sd = sideOf(P.side) || M.sides[0]; P.side = sd.id;
    const list = shipTypes(sd.faction);
    if (!list.some(([k]) => k === P.type)) P.type = list[0][0];
    return `<div class="mk-box"><h4>Place a ship</h4>${sidePick(P.side, 'pside')}
      <div class="mk-ships">${list.map(([k, t]) => `<button class="${P.type === k ? 'on' : ''}" data-ptype="${k}" title="${esc(t.name)}: ${t.hp} HP, move ${t.move}"><b>${esc(t.name)}</b><small>${E.shipCells({ type: k, x: 0, y: 0, rot: 0 }).length} sq</small></button>`).join('')}</div>
      <p class="muted small">Q / E turn it (facing: ${['→', '↓', '←', '↑'][P.rot]}). Click a placed ship to select it, drag to move it.</p></div>`;
  }
  if (V.tool === 'build') {
    const P = V.bplace, sd = sideOf(P.side) || M.sides[0]; P.side = sd.id;
    const kind = `<div class="mk-seg">${[['base', '⚓ Base'], ['platform', '🔧 Platform'], ['scenery', '🏘️ Scenery']].map(([k, n]) => `<button class="${P.what === k ? 'on' : ''}" data-bwhat="${k}">${n}</button>`).join('')}</div>`;
    let opts = '';
    if (P.what === 'base') opts = `${sidePick(P.side, 'bside')}
      <div class="mk-seg"><button class="${!P.capital ? 'on' : ''}" data-bcap="0">Outpost</button><button class="${P.capital ? 'on' : ''}" data-bcap="1">★ Capital</button></div>
      <div class="mk-lbl">Level</div><div class="mk-seg">${[1, 2, 3, 4].map(l => `<button class="${P.level === l ? 'on' : ''}" data-blevel="${l}" title="${BASE_LEVELS[l].name}: platforms up to ${BASE_LEVELS[l].radiusCap} squares out">${l} ${BASE_LEVELS[l].name}</button>`).join('')}</div>
      ${sd.faction === 'tide' ? `<label class="mk-lbl"><input type="checkbox" data-braft ${P.raft ? 'checked' : ''}> A raft-town (hulls and decks lashed together)</label>` : ''}
      <p class="muted small">A base sits on its own oil well, in the sea.</p>`;
    else if (P.what === 'platform') opts = `${sidePick(P.side, 'bside')}<div class="mk-plats">${Object.entries(PLATFORMS).map(([k, pl]) => `<button class="${P.platform === k ? 'on' : ''}" data-bplat="${k}" title="${esc(pl.text || '')}"><i>${pl.code}</i>${esc(pl.name)}</button>`).join('')}</div>
      <p class="muted small">Goes inside a base's claim: select a base to see it.</p>`;
    else opts = `<div class="mk-plats">${Object.entries(SCENERY).map(([k, sc]) => `<button class="${P.scenery === k ? 'on' : ''}" data-bscen="${k}"><i>${sc.icon}</i>${sc.name}</button>`).join('')}</div>
      <p class="muted small">Scenery can go on land or sea, and belongs to nobody.</p>`;
    return `<div class="mk-box"><h4>Place a building</h4>${kind}${opts}</div>`;
  }
  if (V.tool === 'slick') {
    const P = V.slick;
    return `<div class="mk-box"><h4>Oil slick</h4>
      <label class="mk-lbl">Size: <b>${2 * P.r + 1} × ${2 * P.r + 1}</b><input type="range" min="0" max="8" value="${P.r}" data-slr></label>
      <label class="mk-lbl">Lasts: <b>${P.left ? P.left + ' rounds' : 'the whole mission'}</b><input type="range" min="0" max="30" value="${P.left}" data-sll></label>
      <label class="mk-lbl"><input type="checkbox" data-slb ${P.burning ? 'checked' : ''}> On fire</label>
      <p class="muted small">In the game a slick doubles the oil it costs to sail through and stops rigs being built on deposits under it.</p></div>`;
  }
  return '';
}
function selectedBox() {
  const ref = V.piece, p = findPiece(ref);
  if (!p) return '';
  const where = `column ${p.x + 1}, row ${E.rowName(p.y)}`;
  let body = '';
  if (ref.kind === 'ship') {
    const t = SHIPS[p.type];
    body = `<div class="mk-stat"><span>Ship</span><b>${esc(t.name)}</b></div><div class="mk-stat"><span>Where</span><b>${where}</b></div>
      <div class="mk-lbl">Side</div>${sidePick(p.side, 'selside')}
      <input class="text-in" data-selname value="${esc(p.name)}" placeholder="Name (optional)" maxlength="50">
      <div class="mk-seg"><button data-selturn="-1">⟲ Turn</button><button data-selturn="1">⟳ Turn</button></div>`;
  } else if (ref.kind === 'build') {
    const label = p.what === 'base' ? `${p.sub === 'capital' ? '★ Capital' : 'Outpost'}${p.raft ? ' raft-town' : ''}` : p.what === 'platform' ? PLATFORMS[p.sub]?.name : SCENERY[p.sub]?.name;
    body = `<div class="mk-stat"><span>${p.what === 'base' ? 'Base' : p.what === 'platform' ? 'Platform' : 'Scenery'}</span><b>${esc(label)}</b></div><div class="mk-stat"><span>Where</span><b>${where}</b></div>
      ${p.what !== 'scenery' ? `<div class="mk-lbl">Side</div>${sidePick(p.side, 'selside')}` : ''}
      ${p.what === 'base' ? `<div class="mk-seg"><button class="${p.sub !== 'capital' ? 'on' : ''}" data-selcap="0">Outpost</button><button class="${p.sub === 'capital' ? 'on' : ''}" data-selcap="1">★ Capital</button></div>
        <div class="mk-seg">${[1, 2, 3, 4].map(l => `<button class="${p.level === l ? 'on' : ''}" data-sellevel="${l}">${l} ${BASE_LEVELS[l].name}</button>`).join('')}</div>
        ${sideOf(p.side)?.faction === 'tide' ? `<label class="mk-lbl"><input type="checkbox" data-selraft ${p.raft ? 'checked' : ''}> Raft-town</label>` : ''}` : ''}
      <input class="text-in" data-selname value="${esc(p.name)}" placeholder="Name (optional), e.g. Haven" maxlength="50">`;
  } else {
    body = `<div class="mk-stat"><span>Oil slick</span><b>${2 * p.r + 1} × ${2 * p.r + 1}</b></div><div class="mk-stat"><span>Where</span><b>${where}</b></div>
      <label class="mk-lbl">Size<input type="range" min="0" max="8" value="${p.r}" data-selr></label>
      <label class="mk-lbl">Lasts: <b>${p.left ? p.left + ' rounds' : 'the whole mission'}</b><input type="range" min="0" max="30" value="${p.left}" data-selleft></label>
      <label class="mk-lbl"><input type="checkbox" data-selburn ${p.burning ? 'checked' : ''}> On fire</label>`;
  }
  return `<div class="mk-box mk-selbox"><h4>Selected</h4>${body}<button class="small-btn danger" data-seldel>🗑 Remove (Delete)</button></div>`;
}
function bindPieceSide(el) {
  const on = (sel, ev, fn) => el.querySelectorAll(sel).forEach(n => n.addEventListener(ev, () => fn(n)));
  // sides
  on('[data-sname]', 'input', n => { const sd = sideOf(+n.dataset.sname); sd.name = n.value || 'Side'; V.ver++; autosave(); redraw(); });
  on('[data-sname]', 'change', () => side());
  on('[data-sfac]', 'change', n => { const rec = beginRec(); keep(rec, 'sides', 'builds'); const sd = sideOf(+n.dataset.sfac); sd.faction = n.value; if (n.value !== 'tide') M.builds.filter(b => b.side === sd.id).forEach(b => { b.raft = false; }); commit(rec); });
  on('[data-scol]', 'click', n => {
    const sd = sideOf(+n.dataset.scol), all = [...PLAYER_COLORS, ...EXTRA_COLORS], used = M.sides.map(x => x.color);
    let i = all.indexOf(sd.color);
    for (let k = 1; k <= all.length; k++) { const c = all[(i + k) % all.length]; if (!used.includes(c)) { i = (i + k) % all.length; break; } }
    const rec = beginRec(); keep(rec, 'sides'); sd.color = all[i]; commit(rec);
  });
  on('[data-sadd]', 'click', () => {
    const rec = beginRec(); keep(rec, 'sides');
    const id = Math.max(0, ...M.sides.map(x => x.id)) + 1, color = [...PLAYER_COLORS, ...EXTRA_COLORS].find(c => !M.sides.some(x => x.color === c));
    M.sides.push({ id, name: `Side ${id}`, faction: 'tide', color }); commit(rec);
  });
  on('[data-sdel]', 'click', n => {
    const id = +n.dataset.sdel, sd = sideOf(id), count = M.ships.filter(s => s.side === id).length + M.builds.filter(b => b.side === id).length;
    if (count && !confirm(`Remove "${sd.name}"? Its ${count} ship${count > 1 ? 's' : ''} and building${count > 1 ? 's' : ''} go too.`)) return;
    const rec = beginRec(); keep(rec, 'sides', 'ships', 'builds');
    M.sides = M.sides.filter(x => x.id !== id); M.ships = M.ships.filter(s => s.side !== id); M.builds = M.builds.filter(b => b.side !== id);
    if (V.piece && !findPiece(V.piece)) V.piece = null;
    commit(rec);
  });
  // placing
  on('[data-pside]', 'click', n => { V.place.side = +n.dataset.pside; side(); });
  on('[data-ptype]', 'click', n => { V.place.type = n.dataset.ptype; side(); });
  on('[data-bwhat]', 'click', n => { V.bplace.what = n.dataset.bwhat; side(); });
  on('[data-bside]', 'click', n => { V.bplace.side = +n.dataset.bside; side(); });
  on('[data-bcap]', 'click', n => { V.bplace.capital = n.dataset.bcap === '1'; side(); });
  on('[data-blevel]', 'click', n => { V.bplace.level = +n.dataset.blevel; side(); });
  on('[data-braft]', 'change', n => { V.bplace.raft = n.checked; });
  on('[data-bplat]', 'click', n => { V.bplace.platform = n.dataset.bplat; side(); });
  on('[data-bscen]', 'click', n => { V.bplace.scenery = n.dataset.bscen; side(); });
  on('[data-slr]', 'input', n => { V.slick.r = +n.value; n.parentElement.querySelector('b').textContent = `${2 * V.slick.r + 1} × ${2 * V.slick.r + 1}`; });
  on('[data-sll]', 'input', n => { V.slick.left = +n.value; n.parentElement.querySelector('b').textContent = V.slick.left ? V.slick.left + ' rounds' : 'the whole mission'; });
  on('[data-slb]', 'change', n => { V.slick.burning = n.checked; });
  // the selected piece
  on('[data-selside]', 'click', n => changePiece(p => { p.side = +n.dataset.selside; if (sideOf(p.side)?.faction !== 'tide') p.raft = false; }));
  on('[data-selname]', 'change', n => changePiece(p => { p.name = n.value.trim(); }));
  on('[data-selturn]', 'click', n => turnPiece(+n.dataset.selturn));
  on('[data-selcap]', 'click', n => changePiece(p => { p.sub = n.dataset.selcap === '1' ? 'capital' : 'outpost'; }));
  on('[data-sellevel]', 'click', n => changePiece(p => { p.level = +n.dataset.sellevel; }));
  on('[data-selraft]', 'change', n => changePiece(p => { p.raft = n.checked; }));
  on('[data-selr]', 'change', n => changePiece(p => { p.r = +n.value; }));
  on('[data-selleft]', 'change', n => changePiece(p => { p.left = +n.value; }));
  on('[data-selburn]', 'change', n => changePiece(p => { p.burning = n.checked; }));
  on('[data-seldel]', 'click', () => removePiece(V.piece));
}

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
  el.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => { V.tool = b.dataset.tool; side(); redraw(); });
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
      <div class="mk-stat"><span>Pieces</span><b>${M.ships.length} ships, ${M.builds.length} buildings, ${M.slicks.length} slicks</b></div>
      <div class="mk-stat"><span>Saved</span><b>${V.ver === V.savedVer ? 'yes' : 'unsaved changes'}</b></div>
      <button data-resize class="small-btn">↔ Resize canvas</button>
    </div>
    ${selectedBox()}${placeBox()}${sidesBox()}
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
  bindPieceSide(el);
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
  fill(m);
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
  // ships and buildings
  if (m.ships) {
    const W_ = W, occ = new Map(), clash = new Set(), inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
    for (const sh of m.ships) for (const [x, y] of E.shipCells({ type: sh.type, x: sh.x, y: sh.y, rot: sh.rot || 0 })) { const k = y * W_ + x; if (occ.has(k)) { clash.add(sh); clash.add(occ.get(k)); } else occ.set(k, sh); }
    for (const b of m.builds.filter(b => b.what !== 'scenery')) { const k = b.y * W + b.x; if (occ.has(k)) { clash.add(b); clash.add(occ.get(k)); } else occ.set(k, b); }
    const onLand = m.ships.filter(sh => E.shipCells({ type: sh.type, x: sh.x, y: sh.y, rot: sh.rot || 0 }).some(([x, y]) => !inb(x, y) || land[y * W + x]));
    if (onLand.length) items.push({ level: 'bad', text: `${onLand.length} ship${onLand.length > 1 ? 's are' : ' is'} on land or off the map.`, where: [onLand[0].x, onLand[0].y] });
    const bLand = m.builds.filter(b => b.what !== 'scenery' && land[b.y * W + b.x]);
    if (bLand.length) items.push({ level: 'bad', text: `${bLand.length} base${bLand.length > 1 ? 's or platforms are' : ' or platform is'} on land.`, where: [bLand[0].x, bLand[0].y] });
    if (clash.size) { const c = [...clash][0]; items.push({ level: 'bad', text: `${clash.size} ships or buildings overlap each other.`, where: [c.x, c.y] }); }
    const bases = m.builds.filter(b => b.what === 'base');
    const loose = m.builds.filter(b => b.what === 'platform' && !bases.some(bs => bs.side === b.side && Math.max(Math.abs(bs.x - b.x), Math.abs(bs.y - b.y)) <= (BASE_LEVELS[bs.level]?.radiusCap || 2)));
    if (loose.length) items.push({ level: 'warn', text: `${loose.length} platform${loose.length > 1 ? 's are' : ' is'} outside every base's claim on its side (a level ${'1–4'} base claims 2, 3, 5 or 6 squares around it).`, where: [loose[0].x, loose[0].y] });
    for (const sd of m.sides) if (!m.ships.some(s => s.side === sd.id) && !m.builds.some(b => b.side === sd.id)) items.push({ level: 'info', text: `${esc(sd.name)} has nothing on the map yet.` });
    for (const sd of m.sides) { const caps = bases.filter(b => b.side === sd.id && b.sub === 'capital'); if (caps.length > 1) items.push({ level: 'warn', text: `${esc(sd.name)} has ${caps.length} capitals; the game allows one.`, where: [caps[1].x, caps[1].y] }); }
  }
  // lone specks of land (one square, nothing next to it): usually brush slips
  let specks = 0, sp = null;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (!land[i]) continue;
    let n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H) n += land[i + dy * W + dx];
    if (!n) { specks++; mark(i, [255, 255, 255, 200]); if (!sp) sp = [x, y]; }
  }
  if (specks) items.push({ level: 'info', text: `${specks} lone square${specks > 1 ? 's' : ''} of land (white). Fine as rocks; the Smooth brush clears them.`, where: sp });
  if (!items.some(i => i.level !== 'info')) items.unshift({ level: 'good', text: 'No problems: every bit of sea joins up, big ships can reach all of it, and everything placed fits.' });
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
    <p class="muted small">New space is open sea. Anything outside the new size is cut off (pins, oil, ships and buildings there too).</p>
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
      m.builds = M.builds.map(o => ({ ...o, x: o.x + ox, y: o.y + oy })).filter(inb);
      m.slicks = M.slicks.map(o => ({ ...o, x: o.x + ox, y: o.y + oy })).filter(inb);
      m.ships = M.ships.map(o => ({ ...o, x: o.x + ox, y: o.y + oy })).filter(o => shipCellsOf(o).every(([x, y]) => x >= 0 && y >= 0 && x < W && y < H));
      close(); setMap(m, `Resized to ${W} × ${H}.`); V.savedVer = -1; side();
    };
  });
}
