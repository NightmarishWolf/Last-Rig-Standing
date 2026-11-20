// Top-down ship sprites as SVG, one per ship type, sized to its footprint (C px per square), bow → +x
// (drawn for the ship facing rot 0; the board turns them). Made with tools in the sprites sheet session.
// TEAM is the player colour (stripes, flags, turret caps), set per drawing by shipSVG().
export const C = 56;
let TEAM = '#2bb3a3';

// ---------- palette ----------
const N = { hull: '#7f8c98', hullD: '#5d6873', deck: '#97a3ae', deckD: '#6f7b86', sup: '#c3ccd4', supD: '#a2acb6', dark: '#3a434b', gun: '#4b555e', window: '#24313c' };
const T = { rust: '#7a4a2c', rustD: '#5a3420', wood: '#8a6440', woodD: '#5e4128', woodL: '#a77d52', plate: '#5f6b6b', plateD: '#465050', sail: '#c27a3a', sailD: '#8f5322', tarp: '#3f7f7a', tarpD: '#2c5b58', black: '#1f2326', fire: '#ff8a2a', fireL: '#ffd36a' };

const f = n => +n.toFixed(2);
let uid = 0;

// a hull from (x0, cy) to (x0+len, cy) in squares, `beam` squares wide; pointed bow, squared-off stern
function hullPath(x0, cy, len, beam, { bow = 0.9, stern = 0.12, blunt = 0 } = {}) {
  const x = x0 * C + 3, X = (x0 + len) * C - 3, y = cy * C, h = beam * C / 2, b = Math.min(bow * C, (X - x) * 0.6);
  const s = stern * C;
  return `M${f(x + s)},${f(y - h)} L${f(X - b)},${f(y - h)} C${f(X - b * 0.35)},${f(y - h)} ${f(X)},${f(y - h * blunt)} ${f(X)},${f(y)} C${f(X)},${f(y + h * blunt)} ${f(X - b * 0.35)},${f(y + h)} ${f(X - b)},${f(y + h)} L${f(x + s)},${f(y + h)} Q${f(x)},${f(y + h)} ${f(x)},${f(y + h - s)} L${f(x)},${f(y - h + s)} Q${f(x)},${f(y - h)} ${f(x + s)},${f(y - h)} Z`;
}
const hull = (x0, cy, len, beam, fill, stroke, o = {}) =>
  `<path d="${hullPath(x0, cy, len, beam, o)}" fill="${fill}" stroke="${stroke}" stroke-width="2" stroke-linejoin="round"/>`;
// an inset deck line following the hull
const deck = (x0, cy, len, beam, fill, o = {}) => `<path d="${hullPath(x0 + 0.08, cy, len - 0.16, beam - 0.14, { ...o, bow: (o.bow ?? 0.9) * 0.85 })}" fill="${fill}"/>`;
const rect = (x, y, w, h, fill, r = 3, extra = '') => `<rect x="${f(x * C)}" y="${f(y * C)}" width="${f(w * C)}" height="${f(h * C)}" rx="${r}" fill="${fill}" ${extra}/>`;
const circ = (x, y, r, fill, extra = '') => `<circle cx="${f(x * C)}" cy="${f(y * C)}" r="${f(r * C)}" fill="${fill}" ${extra}/>`;
const line = (x1, y1, x2, y2, stroke, w = 2, extra = '') => `<line x1="${f(x1 * C)}" y1="${f(y1 * C)}" x2="${f(x2 * C)}" y2="${f(y2 * C)}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" ${extra}/>`;
const poly = (pts, fill, extra = '') => `<polygon points="${pts.map(([x, y]) => `${f(x * C)},${f(y * C)}`).join(' ')}" fill="${fill}" ${extra}/>`;

// ---------- parts ----------
// a gun turret at (x, y): round base, barrels toward the bow (+x)
function turret(x, y, r, { barrels = 1, len = 0.42, cap = TEAM, base = N.gun, rot = 0 } = {}) {
  const gap = r * 0.45;
  let s = `<g transform="rotate(${rot} ${f(x * C)} ${f(y * C)})">`;
  for (let i = 0; i < barrels; i++) { const oy = (i - (barrels - 1) / 2) * gap; s += line(x, y + oy, x + r + len, y + oy, N.dark, Math.max(2, r * C * 0.22)); }
  s += `<path d="M${f((x - r) * C)},${f((y - r * 0.8) * C)} L${f((x + r * 0.6) * C)},${f((y - r) * C)} Q${f((x + r * 1.1) * C)},${f(y * C)} ${f((x + r * 0.6) * C)},${f((y + r) * C)} L${f((x - r) * C)},${f((y + r * 0.8) * C)} Z" fill="${base}" stroke="${N.dark}" stroke-width="1.5"/>`;
  s += circ(x - r * 0.15, y, r * 0.38, cap);
  return s + '</g>';
}
const ciws = (x, y) => circ(x, y, 0.11, N.sup, `stroke="${N.dark}" stroke-width="1.5"`) + line(x, y, x + 0.18, y, N.dark, 2);
const radar = (x, y, r = 0.13) => circ(x, y, r, N.supD, `stroke="${N.dark}" stroke-width="1.5"`) + line(x - r * 1.6, y, x + r * 1.6, y, N.dark, 2.5);
function vls(x, y, cols, rows, s = 0.1) {
  let o = rect(x - 0.03, y - 0.03, cols * s + 0.06, rows * s + 0.06, N.deckD, 2);
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) o += rect(x + i * s + 0.012, y + j * s + 0.012, s - 0.024, s - 0.024, N.dark, 1);
  return o;
}
const helipad = (x, y, r = 0.3) => circ(x, y, r, N.deckD, `stroke="#e8edf1" stroke-width="1.5" stroke-dasharray="4 3"`) +
  `<text x="${f(x * C)}" y="${f((y + r * 0.36) * C)}" font-family="Arial" font-weight="700" font-size="${f(r * C)}" fill="#e8edf1" text-anchor="middle">H</text>`;
const funnel = (x, y, w = 0.22, h = 0.16) => rect(x - w / 2, y - h / 2, w, h, N.dark, 5) + rect(x - w / 2 + 0.03, y - h / 2 + 0.03, w - 0.06, h - 0.06, '#2a2f34', 4);
const bridge = (x, y, w, h, fill = N.sup) => rect(x, y - h / 2, w, h, fill, 4, `stroke="${N.dark}" stroke-width="1.5"`) + line(x + w - 0.05, y - h / 2 + 0.05, x + w - 0.05, y + h / 2 - 0.05, N.window, 3);
const stripe = (x, cy, beam) => rect(x, cy - beam / 2 + 0.03, 0.1, beam - 0.06, TEAM, 1);
const wake = (x, cy, w = 0.5) => `<path d="M${f(x * C + 2)},${f((cy - w / 2) * C)} Q${f((x - 0.45) * C)},${f(cy * C)} ${f(x * C + 2)},${f((cy + w / 2) * C)}" fill="none" stroke="rgba(230,245,255,0.55)" stroke-width="3" stroke-linecap="round"/>`;
const flag = (x, y) => line(x, y, x, y - 0.2, '#2b2b2b', 1.5) + poly([[x, y - 0.2], [x + 0.18, y - 0.15], [x, y - 0.1]], TEAM);
// Tide parts
function planks(x0, cy, len, beam, color) {
  let s = '';
  for (let i = 1; i < 4; i++) { const y = cy - beam / 2 + (beam * i) / 4; s += line(x0 + 0.15, y, x0 + len - 0.35, y, color, 1.2, 'opacity=".6"'); }
  return s;
}
const patch = (x, y, w, h, c = T.plate) => rect(x, y, w, h, c, 1, `stroke="${T.plateD}" stroke-width="1"`) + circ(x + 0.03, y + 0.03, 0.012, '#222') + circ(x + w - 0.03, y + h - 0.03, 0.012, '#222');
const drum = (x, y, r = 0.09, c = '#8b2f25') => circ(x, y, r, c, `stroke="#2a1410" stroke-width="1.5"`) + circ(x, y, r * 0.35, '#3a1a14');
// a junk sail seen from above: a battened fan along a yard
function junkSail(x, y, len, color = T.sail, rot = -12) {
  let s = `<g transform="rotate(${rot} ${f(x * C)} ${f(y * C)})">`;
  s += `<path d="M${f(x * C)},${f(y * C)} L${f((x + len * 0.15) * C)},${f((y - len * 0.5) * C)} Q${f((x + len * 0.6) * C)},${f((y - len * 0.42) * C)} ${f((x + len * 0.55) * C)},${f(y * C)} Q${f((x + len * 0.6) * C)},${f((y + len * 0.42) * C)} ${f((x + len * 0.15) * C)},${f((y + len * 0.5) * C)} Z" fill="${color}" stroke="${T.sailD}" stroke-width="1.5" opacity=".95"/>`;
  for (let i = -2; i <= 2; i++) s += line(x + 0.02, y, x + len * 0.5, y + i * len * 0.18, T.sailD, 1.2);
  return s + line(x, y, x + len * 0.58, y, '#3b2a1a', 2) + '</g>';
}
const mast = (x, y, yard = 0.5) => line(x, y - yard / 2, x, y + yard / 2, T.woodD, 3) + circ(x, y, 0.05, T.woodD);
const flame = (x, y, s = 1) => `<path d="M${f(x * C)},${f((y - 0.16 * s) * C)} C${f((x + 0.14 * s) * C)},${f((y - 0.05 * s) * C)} ${f((x + 0.1 * s) * C)},${f((y + 0.12 * s) * C)} ${f(x * C)},${f((y + 0.14 * s) * C)} C${f((x - 0.12 * s) * C)},${f((y + 0.1 * s) * C)} ${f((x - 0.14 * s) * C)},${f((y - 0.04 * s) * C)} ${f(x * C)},${f((y - 0.16 * s) * C)} Z" fill="${T.fire}"/>` + circ(x, y + 0.03 * s, 0.05 * s, T.fireL);
function rib(x0, cy, len, beam, fill = '#3b3f42') { // an inflatable boat: fat tube round a small deck
  return `<path d="${hullPath(x0, cy, len, beam, { bow: 0.45, stern: 0.2, blunt: 0.4 })}" fill="${fill}" stroke="#16191b" stroke-width="2"/>` + deck(x0 + 0.06, cy, len - 0.12, beam - 0.18, '#6f6a5e', { bow: 0.38, stern: 0.15, blunt: 0.3 });
}
const motor = (x, cy) => rect(x - 0.1, cy - 0.07, 0.12, 0.14, '#222', 2);

// ---------- the ships ----------
// each: (cols, rows) of its footprint box, and its drawing
export const SPRITES = {
  // ======== NAVY ========
  patrol: [2, 1, () => hull(0, 0.5, 2, 0.56, N.hull, N.dark, { bow: 0.7 }) + deck(0, 0.5, 2, 0.56, N.deck, { bow: 0.7 }) + stripe(0.14, 0.5, 0.5)
    + turret(1.3, 0.5, 0.11, { len: 0.25 }) + bridge(0.7, 0.5, 0.36, 0.34) + radar(0.62, 0.5, 0.07) + wake(0, 0.5, 0.4)],
  survey: [1, 1, () => hull(0, 0.5, 1, 0.5, '#e7ecef', N.dark, { bow: 0.4, stern: 0.1 }) + deck(0, 0.5, 1, 0.5, '#c9d1d7', { bow: 0.4, stern: 0.1 }) + stripe(0.07, 0.5, 0.44)
    + bridge(0.36, 0.5, 0.26, 0.3, '#f4f7f9') + circ(0.5, 0.5, 0.06, '#f2a23a', `stroke="${N.dark}" stroke-width="1"`) + line(0.12, 0.33, 0.12, 0.67, '#f2a23a', 3)],
  corvette: [2, 1, () => hull(0, 0.5, 2, 0.6, N.hull, N.dark) + deck(0, 0.5, 2, 0.6, N.deck) + stripe(0.12, 0.5, 0.54)
    + turret(1.35, 0.5, 0.12, { len: 0.28 }) + bridge(0.72, 0.5, 0.38, 0.38) + radar(0.66, 0.5, 0.08) + ciws(0.3, 0.5)],
  hydrofoil: [2, 1, () => wake(0, 0.5, 0.36) + line(0.45, 0.2, 0.45, 0.8, N.dark, 4) + line(1.45, 0.24, 1.45, 0.76, N.dark, 4)
    + hull(0, 0.5, 2, 0.44, N.hull, N.dark, { bow: 0.9 }) + deck(0, 0.5, 2, 0.44, N.deck, { bow: 0.9 }) + stripe(0.1, 0.5, 0.38)
    + bridge(0.8, 0.5, 0.36, 0.28) + rect(0.25, 0.36, 0.34, 0.08, N.dark, 2) + rect(0.25, 0.56, 0.34, 0.08, N.dark, 2)],
  decoy: [3, 1, () => hull(0, 0.5, 3, 0.66, '#7c6d55', '#3c3428', { bow: 0.5, blunt: 0.5 }) + deck(0, 0.5, 3, 0.66, '#9a8a6c', { bow: 0.5, blunt: 0.5 })
    + rect(1.15, 0.33, 0.6, 0.34, 'none', 3, `stroke="#e8e0cc" stroke-width="2" stroke-dasharray="5 4"`) + circ(2.25, 0.5, 0.13, 'none', `stroke="#e8e0cc" stroke-width="2" stroke-dasharray="4 3"`)
    + line(2.38, 0.5, 2.7, 0.5, '#e8e0cc', 2, 'stroke-dasharray="4 3"') + circ(0.6, 0.5, 0.1, 'none', `stroke="#e8e0cc" stroke-width="2" stroke-dasharray="4 3"`) + stripe(0.1, 0.5, 0.6)],
  minelayer: [2, 2, () => line(0.45, 0.5, 0.45, 1.3, N.dark, 4) + circ(0.45, 0.42, 0.14, '#2f3a40', `stroke="#111" stroke-width="1.5"`) + spikes(0.45, 0.42)
    + hull(0, 1.5, 2, 0.62, N.hull, N.dark) + deck(0, 1.5, 2, 0.62, N.deck) + stripe(0.1, 1.5, 0.56)
    + line(0.2, 1.38, 0.9, 1.38, N.dark, 2) + line(0.2, 1.62, 0.9, 1.62, N.dark, 2) + circ(0.35, 1.38, 0.06, '#2f3a40') + circ(0.6, 1.38, 0.06, '#2f3a40') + circ(0.35, 1.62, 0.06, '#2f3a40') + circ(0.6, 1.62, 0.06, '#2f3a40')
    + bridge(1.0, 1.5, 0.4, 0.38) + turret(1.62, 1.5, 0.09, { len: 0.2 })],
  submarine: [3, 1, () => sub(0, 0.5, 3, 0.42, 0.95)],
  tanker: [4, 1, () => hull(0, 0.5, 4, 0.72, '#7a2f2a', N.dark, { bow: 0.8, blunt: 0.3 }) + deck(0, 0.5, 4, 0.72, '#6c7a5a', { bow: 0.8, blunt: 0.3 }) + stripe(0.1, 0.5, 0.66)
    + line(1.0, 0.5, 3.4, 0.5, '#d9d2b8', 3) + [1.3, 1.85, 2.4, 2.95].map(x => circ(x, 0.5, 0.11, '#5d6b4c', `stroke="#d9d2b8" stroke-width="1.5"`)).join('')
    + bridge(0.22, 0.5, 0.5, 0.56, '#e9ecef') + funnel(0.35, 0.5, 0.14, 0.18) + rect(0.27, 0.46, 0.04, 0.08, TEAM, 1)],
  destroyer: [4, 1, () => hull(0, 0.5, 4, 0.64, N.hull, N.dark) + deck(0, 0.5, 4, 0.64, N.deck) + stripe(0.1, 0.5, 0.58)
    + turret(3.05, 0.5, 0.14, { len: 0.35 }) + vls(2.35, 0.38, 3, 2) + bridge(1.65, 0.5, 0.55, 0.46) + radar(1.75, 0.5) + funnel(1.25, 0.5) + vls(0.85, 0.4, 2, 2) + helipad(0.42, 0.5, 0.22)],
  missileboat: [3, 1, () => hull(0, 0.5, 3, 0.58, N.hull, N.dark) + deck(0, 0.5, 3, 0.58, N.deck) + stripe(0.1, 0.5, 0.52)
    + turret(2.35, 0.5, 0.1, { len: 0.22 }) + bridge(1.55, 0.5, 0.42, 0.4) + radar(1.62, 0.5, 0.09)
    + [0.55, 0.95].map(x => `<g transform="rotate(-25 ${f((x + 0.2) * C)} ${f(0.5 * C)})">${rect(x, 0.36, 0.4, 0.1, N.supD, 2, `stroke="${N.dark}" stroke-width="1"`)}${rect(x, 0.54, 0.4, 0.1, N.supD, 2, `stroke="${N.dark}" stroke-width="1"`)}</g>`).join('')],
  frigate: [4, 1, () => hull(0, 0.5, 4, 0.64, N.hull, N.dark) + deck(0, 0.5, 4, 0.64, N.deck) + stripe(0.1, 0.5, 0.58)
    + turret(3.05, 0.5, 0.13, { len: 0.32 }) + ciws(2.55, 0.5) + bridge(1.75, 0.5, 0.6, 0.5) + radar(1.95, 0.5, 0.16) + radar(1.65, 0.5, 0.09)
    + rect(0.85, 0.3, 0.55, 0.4, N.sup, 4, `stroke="${N.dark}" stroke-width="1.5"`) + helipad(0.45, 0.5, 0.22) + ciws(1.5, 0.3)],
  jammer: [2, 2, () => line(1.25, 0.7, 1.25, 1.3, N.dark, 5) + circ(1.25, 1.45, 0.3, '#e9eef2', `stroke="${N.dark}" stroke-width="2"`) + circ(1.25, 1.45, 0.12, '#cdd6dd')
    + hull(0, 0.5, 2, 0.6, N.hull, N.dark) + deck(0, 0.5, 2, 0.6, N.deck) + stripe(0.1, 0.5, 0.54)
    + bridge(0.95, 0.5, 0.5, 0.44) + line(0.4, 0.28, 0.4, 0.72, N.dark, 2) + line(0.25, 0.5, 0.75, 0.5, N.dark, 2) + circ(0.6, 0.5, 0.07, '#e9eef2')],
  cruiser: [4, 2, () => sponson(1.12, 0.62, 0.95, 0.5) + rect(1.25, 0.35, 0.66, 0.56, N.sup, 6, `stroke="${N.dark}" stroke-width="1.5"`) + poly([[1.4, 0.45], [1.72, 0.45], [1.8, 0.6], [1.32, 0.6]], '#3b5e7a')
    + hull(0, 1.5, 4, 0.78, N.hull, N.dark) + deck(0, 1.5, 4, 0.78, N.deck) + stripe(0.1, 1.5, 0.72)
    + turret(3.15, 1.5, 0.15, { len: 0.32 }) + vls(2.45, 1.32, 3, 3) + bridge(1.6, 1.5, 0.7, 0.58) + radar(1.95, 1.5, 0.15) + funnel(1.35, 1.5) + vls(0.75, 1.35, 3, 3) + turret(0.42, 1.5, 0.12, { len: 0.2, rot: 180 })],
  salvage: [2, 2, () => line(1.25, 1.35, 1.25, 0.45, '#e0b23a', 5) + line(1.25, 0.45, 1.6, 0.45, '#e0b23a', 3) + rect(1.48, 0.3, 0.28, 0.28, '#5b4a3a', 2, `stroke="#2b2219" stroke-width="1.5"`)
    + hull(0, 1.5, 2, 0.66, N.hull, N.dark, { bow: 0.6 }) + deck(0, 1.5, 2, 0.66, N.deck, { bow: 0.6 }) + stripe(0.1, 1.5, 0.6)
    + bridge(0.35, 1.5, 0.45, 0.5) + circ(1.25, 1.5, 0.12, '#e0b23a', `stroke="${N.dark}" stroke-width="1.5"`) + line(0.9, 1.3, 1.6, 1.3, N.dark, 1.5)],
  repair: [2, 2, () => hull(0, 0.42, 2, 0.6, N.hull, N.dark) + hull(0, 1.58, 2, 0.6, N.hull, N.dark) + rect(0.15, 0.4, 1.4, 1.2, N.deck, 5, `stroke="${N.dark}" stroke-width="2"`)
    + stripe(0.17, 1.0, 1.1) + rect(0.35, 0.6, 0.6, 0.8, N.sup, 4, `stroke="${N.dark}" stroke-width="1.5"`) + line(0.4, 0.75, 0.9, 0.75, N.dark, 1.5) + line(0.4, 1.25, 0.9, 1.25, N.dark, 1.5)
    + circ(1.3, 1.0, 0.14, '#e0b23a', `stroke="${N.dark}" stroke-width="1.5"`) + line(1.3, 1.0, 1.75, 0.65, '#e0b23a', 4) + plusMark(0.65, 1.0)],
  drillship: [3, 2, () => rect(1.18, 0.3, 0.64, 0.9, 'none', 2, `stroke="#c8a032" stroke-width="3"`) + line(1.18, 0.3, 1.82, 1.2, '#c8a032', 2) + line(1.82, 0.3, 1.18, 1.2, '#c8a032', 2)
    + hull(0, 1.5, 3, 0.74, '#e6e9ec', N.dark, { bow: 0.7, blunt: 0.3 }) + deck(0, 1.5, 3, 0.74, '#b7c0c8', { bow: 0.7, blunt: 0.3 }) + stripe(0.1, 1.5, 0.68)
    + circ(1.5, 1.5, 0.15, '#13202b', `stroke="#c8a032" stroke-width="2"`) + bridge(2.15, 1.5, 0.4, 0.5, '#f4f7f9') + helipad(0.45, 1.5, 0.24)],
  icebreaker: [3, 1, () => hull(0, 0.5, 3, 0.76, '#b8322b', '#4a1512', { bow: 0.8, blunt: 0.6 }) + deck(0, 0.5, 3, 0.76, '#d9dde0', { bow: 0.8, blunt: 0.6 })
    + bridge(1.65, 0.5, 0.55, 0.56, '#f1f3f5') + radar(1.85, 0.5, 0.1) + funnel(1.3, 0.5, 0.2, 0.2) + helipad(0.5, 0.5, 0.24) + rect(0.14, 0.2, 0.08, 0.6, TEAM, 1)],
  carrier: [5, 2, () => carrierDeck(0, 1.5, 5, 0.86, 3.2)],
  battleship: [5, 2, () => hull(0, 1.0, 5, 1.62, N.hull, N.dark, { bow: 1.3 }) + deck(0, 1.0, 5, 1.62, '#a08f72', { bow: 1.3 }) + planksN(0.3, 1.0, 4.2, 1.4) + stripe(0.14, 1.0, 1.4)
    + turret(4.05, 1.0, 0.3, { barrels: 3, len: 0.55 }) + turret(3.35, 1.0, 0.3, { barrels: 3, len: 0.5 })
    + rect(1.75, 0.62, 1.0, 0.76, N.sup, 8, `stroke="${N.dark}" stroke-width="2"`) + rect(1.95, 0.75, 0.6, 0.5, N.supD, 6) + radar(2.25, 1.0, 0.16) + funnel(1.55, 1.0, 0.3, 0.26)
    + turret(0.85, 1.0, 0.3, { barrels: 3, len: 0.5, rot: 180 }) + ciws(2.0, 0.55) + ciws(2.0, 1.45)],
  command: [5, 2, () => sponson(2.05, 0.55, 0.9, 0.55) + line(2.5, 0.4, 2.5, 0.95, N.dark, 3) + circ(2.5, 0.4, 0.2, '#e9eef2', `stroke="${N.dark}" stroke-width="2"`) + circ(2.5, 0.4, 0.07, TEAM)
    + hull(0, 1.5, 5, 0.8, N.hull, N.dark) + deck(0, 1.5, 5, 0.8, N.deck) + stripe(0.12, 1.5, 0.74)
    + turret(4.2, 1.5, 0.14, { len: 0.3 }) + vls(3.45, 1.35, 3, 3) + rect(1.8, 1.17, 1.3, 0.66, N.sup, 8, `stroke="${N.dark}" stroke-width="1.5"`) + radar(2.2, 1.5, 0.17) + radar(2.75, 1.5, 0.12)
    + funnel(1.5, 1.5) + helipad(0.6, 1.5, 0.28) + flag(3.0, 1.32)],
  nuclearsub: [4, 1, () => sub(0, 0.5, 4, 0.5, 1.5, true)],
  dreadnought: [5, 2, () => hull(0, 1.0, 5, 1.82, '#6d7884', N.dark, { bow: 1.2, blunt: 0.2 }) + deck(0, 1.0, 5, 1.82, '#94856a', { bow: 1.2, blunt: 0.2 }) + planksN(0.3, 1.0, 4.2, 1.6) + stripe(0.14, 1.0, 1.6)
    + turret(4.1, 1.0, 0.34, { barrels: 3, len: 0.55 }) + turret(3.35, 1.0, 0.34, { barrels: 3, len: 0.5 })
    + rect(1.7, 0.55, 1.05, 0.9, N.sup, 8, `stroke="${N.dark}" stroke-width="2"`) + rect(1.9, 0.7, 0.65, 0.6, N.supD, 6) + radar(2.2, 1.0, 0.2) + funnel(1.5, 0.78, 0.26, 0.22) + funnel(1.5, 1.22, 0.26, 0.22)
    + turret(1.05, 1.0, 0.32, { barrels: 3, len: 0.5, rot: 180 }) + turret(0.45, 1.0, 0.22, { barrels: 2, len: 0.3, rot: 180 }) + ciws(2.0, 0.42) + ciws(2.0, 1.58) + ciws(3.0, 0.4) + ciws(3.0, 1.6)],
  supply: [3, 2, () => line(1.5, 0.7, 1.5, 1.4, N.dark, 4) + line(1.5, 1.4, 1.5, 1.78, '#1d1d1d', 3, 'stroke-dasharray="3 3"') + circ(1.5, 1.7, 0.09, '#f2a23a', `stroke="${N.dark}" stroke-width="1.5"`)
    + hull(0, 0.5, 3, 0.72, N.hull, N.dark, { bow: 0.8, blunt: 0.3 }) + deck(0, 0.5, 3, 0.72, N.deck, { bow: 0.8, blunt: 0.3 }) + stripe(0.1, 0.5, 0.66)
    + [[0.95, 0.38], [0.95, 0.56], [1.95, 0.38], [1.95, 0.56]].map(([x, y]) => rect(x, y, 0.32, 0.15, ['#b5513a', '#3d6f9a', '#c9a53a', '#5d8a4a'][Math.round(x * 3 + y * 7) % 4], 1, `stroke="#222" stroke-width="1"`)).join('')
    + rect(1.4, 0.24, 0.2, 0.52, N.dark, 2) + bridge(0.25, 0.5, 0.45, 0.52)],
  assault: [4, 2, () => sponson(0.95, 1.05, 2.1, 0.75) + rect(1.1, 1.18, 0.75, 0.48, '#4d5a46', 6, `stroke="${N.dark}" stroke-width="1.5"`) + rect(2.0, 1.18, 0.75, 0.48, '#4d5a46', 6, `stroke="${N.dark}" stroke-width="1.5"`)
    + circ(1.3, 1.42, 0.06, '#2c3328') + circ(1.6, 1.42, 0.06, '#2c3328') + circ(2.2, 1.42, 0.06, '#2c3328') + circ(2.5, 1.42, 0.06, '#2c3328')
    + hull(0, 0.5, 4, 0.78, N.hull, N.dark, { bow: 0.6, blunt: 0.5 }) + rect(0.15, 0.2, 3.4, 0.6, N.deckD, 4) + line(0.3, 0.5, 3.4, 0.5, '#e8edf1', 1.5, 'stroke-dasharray="8 6"')
    + stripe(0.1, 0.5, 0.72) + rect(1.8, 0.66, 0.7, 0.18, N.sup, 3, `stroke="${N.dark}" stroke-width="1.5"`) + radar(2.15, 0.75, 0.07) + helipad(3.1, 0.45, 0.2) + helipad(0.6, 0.45, 0.2)],
  battlecruiser: [5, 2, () => hull(0, 1.0, 5, 1.4, '#748190', N.dark, { bow: 1.6 }) + deck(0, 1.0, 5, 1.4, N.deck, { bow: 1.6 }) + stripe(0.14, 1.0, 1.2)
    + turret(3.9, 1.0, 0.26, { barrels: 2, len: 0.5 }) + turret(3.25, 1.0, 0.26, { barrels: 2, len: 0.45 })
    + rect(1.85, 0.72, 0.9, 0.56, N.sup, 8, `stroke="${N.dark}" stroke-width="2"`) + radar(2.3, 1.0, 0.14) + funnel(1.6, 1.0, 0.24, 0.24) + turret(0.95, 1.0, 0.26, { barrels: 2, len: 0.45, rot: 180 })
    + poly([[2.8, 0.72], [3.0, 0.62], [3.0, 1.38], [2.8, 1.28]], N.supD) + ciws(2.3, 0.6) + ciws(2.3, 1.4)],
  escortcarrier: [4, 2, () => sponson(1.12, 0.95, 0.75, 0.6) + rect(1.2, 1.1, 0.55, 0.36, N.sup, 4, `stroke="${N.dark}" stroke-width="1.5"`) + radar(1.48, 1.28, 0.08)
    + carrierDeck(0, 0.5, 4, 0.8, null)],
  landingcraft: [2, 1, () => hull(0, 0.5, 2, 0.62, '#5e6a55', N.dark, { bow: 0.12, blunt: 1 }) + rect(0.45, 0.28, 1.3, 0.44, '#7c8770', 2) + rect(1.82, 0.24, 0.1, 0.52, '#3e4637', 1)
    + [0.6, 0.85, 1.1, 1.35, 1.6].flatMap(x => [circ(x, 0.4, 0.045, '#3c4a2e'), circ(x, 0.6, 0.045, '#3c4a2e')]).join('') + rect(0.1, 0.32, 0.3, 0.36, N.sup, 3, `stroke="${N.dark}" stroke-width="1.5"`) + stripe(0.04, 0.5, 0.5)],

  // ======== FREE TIDE ========
  skiff: [1, 1, () => wake(0, 0.5, 0.3) + hull(0, 0.5, 1, 0.4, T.wood, T.woodD, { bow: 0.45, stern: 0.08 }) + deck(0, 0.5, 1, 0.4, T.woodL, { bow: 0.45, stern: 0.08 })
    + motor(0.12, 0.5) + circ(0.42, 0.5, 0.07, '#d7b48a') + line(0.42, 0.5, 0.78, 0.5, T.black, 2.5) + flag(0.22, 0.38)],
  prospector: [1, 1, () => wake(0, 0.5, 0.3) + hull(0, 0.5, 1, 0.42, '#c9b48a', T.woodD, { bow: 0.45, stern: 0.08 }) + deck(0, 0.5, 1, 0.42, '#e0cfa6', { bow: 0.45, stern: 0.08 })
    + motor(0.12, 0.5) + line(0.5, 0.5, 0.62, 0.1, T.black, 1.5) + circ(0.62, 0.12, 0.05, '#f2a23a') + circ(0.5, 0.5, 0.08, T.tarp) + flag(0.25, 0.38)],
  barge: [4, 1, () => tideBarge(false)],
  rigraft: [2, 2, () => raft(0.08, 0.1, 1.84, 1.8) + rect(0.65, 0.65, 0.7, 0.7, 'none', 1, `stroke="#c8a032" stroke-width="3"`) + line(0.65, 0.65, 1.35, 1.35, '#c8a032', 2) + line(1.35, 0.65, 0.65, 1.35, '#c8a032', 2)
    + circ(1.0, 1.0, 0.1, '#111') + drum(0.32, 0.32) + drum(1.68, 0.32) + drum(0.32, 1.68, 0.09, '#2f5d8a') + drum(1.68, 1.68) + flag(0.3, 0.98)],
  gunboat: [2, 1, () => wake(0, 0.5, 0.4) + hull(0, 0.5, 2, 0.56, T.rust, T.rustD, { bow: 0.7 }) + deck(0, 0.5, 2, 0.56, '#8b6a52', { bow: 0.7 }) + patch(0.5, 0.3, 0.25, 0.18) + patch(1.2, 0.55, 0.2, 0.14)
    + rect(0.3, 0.33, 0.4, 0.34, T.plate, 3, `stroke="${T.plateD}" stroke-width="1.5"`) + turret(1.45, 0.5, 0.1, { barrels: 2, len: 0.28, base: T.plateD, cap: TEAM }) + flag(0.18, 0.4)],
  lancer: [2, 1, () => wake(0, 0.5, 0.36) + line(1.6, 0.5, 2.0, 0.5, '#2b2b2b', 3) + circ(1.97, 0.5, 0.05, '#c0392b')
    + hull(0, 0.5, 1.75, 0.4, '#e2dccb', '#3a352b', { bow: 0.8 }) + deck(0, 0.5, 1.75, 0.4, '#bfb7a2', { bow: 0.8 }) + stripe(0.08, 0.5, 0.34)
    + rect(0.6, 0.36, 0.35, 0.28, '#2c3e50', 6) + motor(0.1, 0.42) + motor(0.1, 0.58)],
  minejunk: [2, 2, () => line(0.45, 0.6, 0.45, 1.45, T.woodD, 4) + line(1.2, 0.6, 1.2, 1.45, T.woodD, 4) + hull(0.15, 1.5, 1.4, 0.3, T.woodL, T.woodD, { bow: 0.4 })
    + circ(0.5, 1.5, 0.08, '#2f3a40') + spikes(0.5, 1.5, 0.08) + circ(0.9, 1.5, 0.08, '#2f3a40') + spikes(0.9, 1.5, 0.08)
    + hull(0, 0.5, 2, 0.6, T.wood, T.woodD, { bow: 0.7, blunt: 0.3 }) + deck(0, 0.5, 2, 0.6, T.woodL, { bow: 0.7, blunt: 0.3 }) + planks(0, 0.5, 2, 0.6, T.woodD)
    + mast(1.1, 0.5, 0.5) + junkSail(1.1, 0.5, 0.75) + circ(0.35, 0.5, 0.08, '#2f3a40') + spikes(0.35, 0.5, 0.08) + flag(0.2, 0.36)],
  smuggler: [2, 1, () => `<path d="${hullPath(0, 0.5, 2, 0.4, { bow: 0.9, stern: 0.2, blunt: 0.2 })}" fill="#25383a" stroke="#0e1617" stroke-width="2" opacity=".9"/>`
    + rect(0.75, 0.39, 0.42, 0.22, '#3d5456', 6, `stroke="#0e1617" stroke-width="1.5"`) + line(0.85, 0.5, 1.07, 0.5, '#7fd0d8', 2) + circ(0.3, 0.5, 0.05, '#0e1617') + rect(0.08, 0.47, 0.1, 0.06, TEAM, 1)],
  brig: [4, 1, () => hull(0, 0.5, 4, 0.72, T.wood, T.woodD, { bow: 1.0, stern: 0.2 }) + deck(0, 0.5, 4, 0.72, T.woodL, { bow: 1.0 }) + planks(0, 0.5, 4, 0.72, T.woodD)
    + [0.9, 1.5, 2.1, 2.7].flatMap(x => [rect(x, 0.15, 0.2, 0.08, '#222', 1), rect(x, 0.77, 0.2, 0.08, '#222', 1)]).join('')
    + mast(2.75, 0.5, 0.9) + line(2.75, 0.05, 2.75, 0.95, '#3b2a1a', 3) + mast(1.55, 0.5, 0.95) + line(1.55, 0.03, 1.55, 0.97, '#3b2a1a', 3)
    + sail(2.75, 0.5) + sail(1.55, 0.5) + rect(0.15, 0.3, 0.4, 0.4, T.woodD, 3) + line(3.6, 0.5, 4.05, 0.5, T.woodD, 3) + flag(0.3, 0.32)],
  fireship: [2, 1, () => hull(0, 0.5, 2, 0.56, '#4a3a2e', '#211812', { bow: 0.7 }) + deck(0, 0.5, 2, 0.56, '#3a2c22', { bow: 0.7 })
    + drum(0.5, 0.38, 0.09) + drum(0.5, 0.62, 0.09) + drum(0.8, 0.38, 0.09) + drum(0.8, 0.62, 0.09) + drum(1.1, 0.5, 0.09)
    + line(1.35, 0.5, 1.95, 0.5, '#2b2b2b', 3) + flame(1.15, 0.36, 0.9) + flame(0.62, 0.5, 0.7) + rect(0.08, 0.36, 0.18, 0.28, T.plate, 2) + rect(0.06, 0.46, 0.06, 0.08, TEAM, 1)],
  rocketjunk: [3, 1, () => hull(0, 0.5, 3, 0.64, T.wood, T.woodD, { bow: 0.8, blunt: 0.3 }) + deck(0, 0.5, 3, 0.64, T.woodL, { bow: 0.8, blunt: 0.3 }) + planks(0, 0.5, 3, 0.64, T.woodD)
    + rect(1.6, 0.3, 0.7, 0.4, T.plate, 3, `stroke="${T.plateD}" stroke-width="1.5"`) + [0, 1, 2].flatMap(i => [0, 1].map(j => circ(1.72 + i * 0.22, 0.4 + j * 0.2, 0.07, '#222', `stroke="#c0392b" stroke-width="1.5"`))).join('')
    + mast(0.95, 0.5, 0.6) + junkSail(0.95, 0.5, 0.7, T.sail, -8) + rect(0.12, 0.34, 0.3, 0.32, T.woodD, 3) + flag(0.2, 0.36)],
  boarder: [1, 1, () => wake(0, 0.5, 0.3) + rib(0, 0.5, 1, 0.48) + motor(0.1, 0.5) + circ(0.4, 0.42, 0.06, '#d7b48a') + circ(0.55, 0.58, 0.06, '#d7b48a')
    + line(0.65, 0.5, 0.95, 0.5, '#555', 2) + line(0.88, 0.42, 0.95, 0.5, '#555', 2) + line(0.88, 0.58, 0.95, 0.5, '#555', 2) + flag(0.2, 0.4)],
  qship: [4, 1, () => tideBarge(true)],
  mothership: [5, 2, () => sponson(2.05, 0.55, 0.9, 0.55) + line(2.5, 0.45, 2.5, 0.95, T.plateD, 3) + circ(2.5, 0.42, 0.18, '#d3d7d8', `stroke="#333" stroke-width="2"`) + circ(2.5, 0.42, 0.06, TEAM)
    + hull(0, 1.5, 5, 0.84, '#4f6260', '#22302f', { bow: 0.9, blunt: 0.3 }) + deck(0, 1.5, 5, 0.84, '#6b7c76', { bow: 0.9, blunt: 0.3 }) + patch(3.4, 1.22, 0.4, 0.2) + patch(1.0, 1.6, 0.35, 0.18)
    + [0, 1, 2].flatMap(i => [0, 1].map(j => drone(2.75 + i * 0.42, 1.33 + j * 0.34))).join('') + rect(1.0, 1.2, 0.9, 0.6, '#3a4a48', 3, `stroke="#22302f" stroke-width="1.5"`)
    + [0, 1].flatMap(j => [0, 1].map(i => drone(1.22 + i * 0.44, 1.35 + j * 0.3, 0.8))).join('') + rect(0.2, 1.25, 0.6, 0.5, '#cfd5d3', 4, `stroke="#22302f" stroke-width="1.5"`) + flag(0.5, 1.3)],
  leviathan: [5, 2, () => leviathan()],
  queen: [5, 2, () => sponson(2.05, 0.55, 0.9, 0.55, '#3a2a40') + line(2.5, 0.45, 2.5, 0.95, '#c9a23a', 3) + poly([[2.32, 0.5], [2.4, 0.3], [2.5, 0.45], [2.6, 0.3], [2.68, 0.5]], '#e0b84a') + circ(2.5, 0.52, 0.06, TEAM)
    + hull(0, 1.5, 5, 0.84, '#2f2440', '#140f1c', { bow: 1.1 }) + deck(0, 1.5, 5, 0.84, '#e9dfc8', { bow: 1.1 }) + planks(0.2, 1.5, 4.4, 0.8, '#b9ab8c')
    + rect(1.4, 1.2, 1.9, 0.6, '#f4efe2', 10, `stroke="#140f1c" stroke-width="1.5"`) + rect(1.65, 1.3, 1.4, 0.4, '#e2d6b8', 8) + circ(2.35, 1.5, 0.12, '#c9a23a')
    + turret(3.75, 1.5, 0.13, { len: 0.3, base: '#4a3a55', cap: '#e0b84a' }) + turret(0.85, 1.5, 0.12, { len: 0.25, base: '#4a3a55', cap: '#e0b84a', rot: 180 })
    + line(0.4, 1.12, 4.3, 1.12, TEAM, 3) + line(0.4, 1.88, 4.3, 1.88, TEAM, 3) + flag(4.0, 1.4) + flag(1.2, 1.4)],
  broodraft: [3, 2, () => raft(0.06, 0.08, 2.88, 1.84) + rect(0.9, 0.6, 1.2, 0.8, T.tarp, 6, `stroke="${T.tarpD}" stroke-width="2"`) + line(0.9, 1.0, 2.1, 1.0, T.tarpD, 1.5)
    + miniSkiff(0.15, 0.32) + miniSkiff(0.15, 1.5) + miniSkiff(2.2, 0.32) + miniSkiff(2.2, 1.5) + drum(0.6, 1.0) + drum(2.4, 1.0, 0.09, '#2f5d8a') + flag(1.5, 0.62)],
  incendiary: [3, 1, () => hull(0, 0.5, 3, 0.64, '#5a3a28', '#2a1a10', { bow: 0.8, blunt: 0.3 }) + deck(0, 0.5, 3, 0.64, '#6e4b33', { bow: 0.8, blunt: 0.3 }) + planks(0, 0.5, 3, 0.64, '#2a1a10')
    + circ(1.75, 0.4, 0.12, '#8b2f25', `stroke="#2a1410" stroke-width="1.5"`) + circ(1.75, 0.62, 0.1, '#8b2f25', `stroke="#2a1410" stroke-width="1.5"`) + line(1.9, 0.5, 2.55, 0.5, '#333', 4) + flame(2.62, 0.5, 0.8)
    + mast(1.0, 0.5, 0.6) + junkSail(1.0, 0.5, 0.68, '#a0442a', -10) + rect(0.12, 0.34, 0.3, 0.32, '#3a2618', 3) + flag(0.22, 0.36)],
  ghost: [2, 1, () => `<path d="M${f(0.06 * C)},${f(0.3 * C)} L${f(1.2 * C)},${f(0.27 * C)} L${f(1.96 * C)},${f(0.5 * C)} L${f(1.2 * C)},${f(0.73 * C)} L${f(0.06 * C)},${f(0.7 * C)} Z" fill="#1c2226" stroke="#05080a" stroke-width="2" opacity=".92"/>`
    + `<path d="M${f(0.5 * C)},${f(0.38 * C)} L${f(1.1 * C)},${f(0.36 * C)} L${f(1.35 * C)},${f(0.5 * C)} L${f(1.1 * C)},${f(0.64 * C)} L${f(0.5 * C)},${f(0.62 * C)} Z" fill="#2b343a"/>`
    + line(0.6, 0.5, 1.25, 0.5, '#3c474e', 1.5) + rect(0.08, 0.46, 0.1, 0.08, TEAM, 1) + line(1.3, 0.5, 1.7, 0.5, '#0b0f12', 2)],
};

// ---------- composite parts ----------
function spikes(x, y, r = 0.14) { let s = ''; for (let a = 0; a < 8; a++) { const t = a * Math.PI / 4; s += line(x + Math.cos(t) * r, y + Math.sin(t) * r, x + Math.cos(t) * (r + 0.05), y + Math.sin(t) * (r + 0.05), '#111', 2); } return s; }
const plusMark = (x, y) => rect(x - 0.03, y - 0.12, 0.06, 0.24, '#d33', 1) + rect(x - 0.12, y - 0.03, 0.24, 0.06, '#d33', 1);
const sponson = (x, y, w, h, fill = N.hullD) => rect(x, y, w, h, fill, 8, `stroke="${N.dark}" stroke-width="2"`);
function planksN(x0, cy, len, beam) { let s = ''; for (let i = 1; i < 7; i++) { const y = cy - beam / 2 + (beam * i) / 7; s += line(x0, y, x0 + len, y, '#7a6b52', 1, 'opacity=".55"'); } return s; }
function sub(x0, cy, len, beam, sailX, missiles = false) {
  const x = x0 * C + 3, X = (x0 + len) * C - 3, y = cy * C, h = beam * C / 2;
  let s = `<path d="M${f(x + h)},${f(y - h)} L${f(X - h * 2.2)},${f(y - h)} Q${f(X)},${f(y - h)} ${f(X)},${f(y)} Q${f(X)},${f(y + h)} ${f(X - h * 2.2)},${f(y + h)} L${f(x + h)},${f(y + h)} Q${f(x)},${f(y + h * 0.4)} ${f(x)},${f(y)} Q${f(x)},${f(y - h * 0.4)} ${f(x + h)},${f(y - h)} Z" fill="#2c3439" stroke="#0f1315" stroke-width="2"/>`;
  s += line(x0 + 0.08, cy - beam * 0.75, x0 + 0.08, cy + beam * 0.75, '#0f1315', 4) + line(x0 + 0.2, cy, x0 + len - 0.3, cy, '#3b454b', 1.5);
  s += rect(sailX - 0.22, cy - 0.11, 0.48, 0.22, '#3e484e', 10, `stroke="#0f1315" stroke-width="1.5"`) + line(sailX - 0.3, cy, sailX + 0.3, cy, '#0f1315', 3);
  if (missiles) for (let i = 0; i < 6; i++) s += circ(sailX - 0.45 - i * 0.14, cy, 0.045, '#1b2125', `stroke="#4b565c" stroke-width="1"`);
  return s + rect(x0 + 0.16, cy - 0.04, 0.12, 0.08, TEAM, 1);
}
function carrierDeck(x0, cy, len, beam, angledTo) {
  let s = hull(x0, cy, len, beam, N.hullD, N.dark, { bow: 0.7, blunt: 0.6 });
  const top = cy - beam / 2 + 0.05, h = beam - 0.1;
  s += `<path d="${hullPath(x0 + 0.05, cy, len - 0.1, beam - 0.1, { bow: 0.6, blunt: 0.6 })}" fill="#4a535b"/>`;
  if (angledTo != null) {
    // the angled landing deck sweeping up into the square above
    // (it stays inside the footprint's one square up top, angledTo..angledTo+1)
    s += poly([[x0 + 0.5, cy + beam / 2 - 0.06], [x0 + 1.25, cy + beam / 2 - 0.06], [angledTo + 0.72, cy - beam / 2 - 0.62], [angledTo - 0.12, cy - beam / 2 - 0.6]], '#4a535b', `stroke="${N.dark}" stroke-width="2"`);
    s += line(x0 + 0.9, cy + beam / 2 - 0.12, angledTo + 0.3, cy - beam / 2 - 0.55, '#e8edf1', 1.5, 'stroke-dasharray="7 6"');
    s += rect(2.6, cy + beam / 2 - 0.36, 0.7, 0.28, N.sup, 4, `stroke="${N.dark}" stroke-width="1.5"`) + radar(2.95, cy + beam / 2 - 0.22, 0.09);
  } else {
    s += line(x0 + 0.25, cy, x0 + len - 0.5, cy, '#e8edf1', 1.5, 'stroke-dasharray="7 6"');
  }
  s += line(x0 + 0.2, top + 0.06, x0 + len - 0.7, top + 0.06, '#e8edf1', 1) + line(x0 + 0.2, top + h - 0.06, x0 + len - 0.7, top + h - 0.06, '#e8edf1', 1);
  const jets = angledTo != null ? [[3.6, cy - 0.12], [3.9, cy + 0.12], [4.2, cy - 0.12], [1.5, cy + 0.15]] : [[2.6, cy - 0.12], [2.9, cy + 0.12], [0.9, cy - 0.1]];
  for (const [x, y] of jets) s += jet(x, y);
  return s + stripe(x0 + 0.1, cy, beam - 0.1);
}
const jet = (x, y, k = 1) => poly([[x + 0.17 * k, y], [x - 0.08 * k, y - 0.12 * k], [x - 0.03 * k, y], [x - 0.08 * k, y + 0.12 * k]], '#9aa6b1', `stroke="${N.dark}" stroke-width="1"`);
const drone = (x, y, k = 1) => circ(x, y, 0.07 * k, '#2b2f33') + [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([dx, dy]) => circ(x + dx * 0.09 * k, y + dy * 0.09 * k, 0.045 * k, 'none', `stroke="#9aa" stroke-width="1"`)).join('');
function raft(x, y, w, h) {
  let s = rect(x, y, w, h, T.woodD, 5, `stroke="#3a2818" stroke-width="2"`);
  const n = Math.round(w / 0.17);
  for (let i = 0; i < n; i++) s += rect(x + 0.03 + i * (w - 0.06) / n, y + 0.03, (w - 0.06) / n - 0.02, h - 0.06, i % 3 ? T.wood : T.woodL, 1);
  s += line(x + 0.05, y + h * 0.3, x + w - 0.05, y + h * 0.3, '#3a2818', 2) + line(x + 0.05, y + h * 0.7, x + w - 0.05, y + h * 0.7, '#3a2818', 2);
  return s;
}
const miniSkiff = (x, y) => hull(x, y, 0.62, 0.2, T.woodL, T.woodD, { bow: 0.25, stern: 0.04 }) + rect(x + 0.04, y - 0.03, 0.06, 0.06, '#222', 1);
const sail = (x, y) => `<path d="M${f((x - 0.02) * C)},${f((y - 0.42) * C)} Q${f((x + 0.28) * C)},${f(y * C)} ${f((x - 0.02) * C)},${f((y + 0.42) * C)} Z" fill="#e8dcc0" stroke="#9b8c6a" stroke-width="1.5"/>`;
function tideBarge(q) {
  let s = hull(0, 0.5, 4, 0.72, T.rust, T.rustD, { bow: 0.55, blunt: 0.55 }) + deck(0, 0.5, 4, 0.72, '#6e5a48', { bow: 0.55, blunt: 0.55 });
  s += patch(0.9, 0.22, 0.4, 0.2) + patch(2.6, 0.58, 0.35, 0.18) + patch(3.1, 0.25, 0.3, 0.18, '#7a6b5b');
  s += circ(1.55, 0.5, 0.19, '#5b5f4a', `stroke="#2f3027" stroke-width="2"`) + circ(2.25, 0.5, 0.19, '#5b5f4a', `stroke="#2f3027" stroke-width="2"`);
  s += line(1.2, 0.5, 3.3, 0.5, '#2f3027', 2);
  s += drum(2.85, 0.4) + drum(2.85, 0.62) + drum(3.1, 0.5, 0.09, '#2f5d8a');
  s += rect(0.15, 0.27, 0.5, 0.46, '#c9c2b0', 4, `stroke="#4a4030" stroke-width="1.5"`) + rect(0.2, 0.32, 0.12, 0.36, '#334', 2) + flag(0.35, 0.3);
  if (q) {
    // hidden launchers: hatch outlines on the tank tops, and a tarp over the bow
    s += rect(1.38, 0.33, 0.34, 0.34, 'none', 2, `stroke="#c0392b" stroke-width="1.5" stroke-dasharray="3 2" opacity=".9"`);
    s += rect(2.08, 0.33, 0.34, 0.34, 'none', 2, `stroke="#c0392b" stroke-width="1.5" stroke-dasharray="3 2" opacity=".9"`);
    s += rect(3.3, 0.3, 0.38, 0.4, T.tarp, 4, `stroke="${T.tarpD}" stroke-width="1.5"`) + line(3.3, 0.5, 3.68, 0.5, T.tarpD, 1);
  }
  return s;
}
function leviathan() {
  let s = hull(0, 1.0, 5, 1.7, '#5a4232', '#24170f', { bow: 1.2, blunt: 0.3 });
  // a skirt of lashed rafts along the sides
  for (let i = 0; i < 9; i++) { s += rect(0.4 + i * 0.45, 0.06, 0.38, 0.2, i % 2 ? T.wood : T.woodL, 2, `stroke="${T.woodD}" stroke-width="1"`); s += rect(0.4 + i * 0.45, 1.74, 0.38, 0.2, i % 2 ? T.woodL : T.wood, 2, `stroke="${T.woodD}" stroke-width="1"`); }
  s += deck(0.1, 1.0, 4.8, 1.46, '#6b5a4a', { bow: 1.0, blunt: 0.3 });
  s += patch(0.6, 0.5, 0.6, 0.35) + patch(3.1, 1.2, 0.55, 0.32, '#7a6b5b') + patch(1.6, 1.3, 0.45, 0.3) + patch(3.4, 0.45, 0.4, 0.3);
  s += rect(1.7, 0.55, 1.2, 0.9, '#5f6b6b', 8, `stroke="#2c3333" stroke-width="2"`) + rect(1.95, 0.72, 0.7, 0.56, '#4a5555', 6) + circ(2.3, 1.0, 0.14, TEAM);
  s += turret(4.0, 1.0, 0.28, { barrels: 2, len: 0.45, base: '#4a4a40', cap: TEAM }) + turret(3.3, 0.62, 0.17, { len: 0.3, base: '#4a4a40' }) + turret(3.3, 1.38, 0.17, { len: 0.3, base: '#4a4a40' });
  s += turret(1.1, 1.0, 0.24, { barrels: 2, len: 0.4, base: '#4a4a40', cap: TEAM, rot: 180 });
  s += funnel(1.5, 0.72, 0.2, 0.2) + funnel(1.5, 1.28, 0.2, 0.2) + flag(2.9, 0.85) + drum(0.5, 1.4) + drum(0.75, 1.5, 0.09, '#2f5d8a');
  return s;
}

// the whole sprite as an SVG document (transparent background) in a player's colour
export function shipSVG(type, team = '#2bb3a3') {
  const [w, h, draw] = SPRITES[type];
  TEAM = team;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w * C}" height="${h * C}" viewBox="0 0 ${w * C} ${h * C}">${draw()}</svg>`;
}
void uid;
