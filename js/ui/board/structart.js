// Top-down sprites for things that stand in the sea: oil rigs and every base platform. One square each,
// drawn as SVG like the ships (shipart.js), with the owner's colour on the deck edge, flags and caps.
// Navy pieces are grey steel; Free Tide ones are rust, planks and patched plate.
// structSVG(kind, team, tide) → an SVG document; kinds: 'rig' and the PLATFORMS ids.
const C = 56;
let TEAM = '#2bb3a3', P = null;
const f = n => +n.toFixed(2);
const STEEL = { deck: '#8d99a4', deckD: '#6a7681', edge: '#3a434b', leg: '#4b555e', sup: '#c3ccd4', supD: '#a2acb6', dark: '#2f373e', pipe: '#d08a2a', win: '#24313c', hatch: '#59646e' };
const TIDE = { deck: '#8a6440', deckD: '#5e4128', edge: '#2e1e12', leg: '#3a2a1c', sup: '#9a8a70', supD: '#7a6a52', dark: '#2a1f16', pipe: '#b5652a', win: '#2a2622', hatch: '#5f6b6b' };

const rect = (x, y, w, h, fill, r = 2, extra = '') => `<rect x="${f(x * C)}" y="${f(y * C)}" width="${f(w * C)}" height="${f(h * C)}" rx="${r}" fill="${fill}" ${extra}/>`;
const circ = (x, y, r, fill, extra = '') => `<circle cx="${f(x * C)}" cy="${f(y * C)}" r="${f(r * C)}" fill="${fill}" ${extra}/>`;
const line = (x1, y1, x2, y2, stroke, w = 2, extra = '') => `<line x1="${f(x1 * C)}" y1="${f(y1 * C)}" x2="${f(x2 * C)}" y2="${f(y2 * C)}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" ${extra}/>`;
const poly = (pts, fill, extra = '') => `<polygon points="${pts.map(([x, y]) => `${f(x * C)},${f(y * C)}`).join(' ')}" fill="${fill}" ${extra}/>`;
const ring = (x, y, r, stroke, w = 2, extra = '') => circ(x, y, r, 'none', `stroke="${stroke}" stroke-width="${w}" ${extra}`);

// ---------- parts ----------
// the deck: a plate on four legs, its edge in the owner's colour; Tide decks are planked and patched
function deck(x = 0.1, y = 0.1, w = 0.8, h = 0.8, { legs = true } = {}) {
  let s = '';
  if (legs) for (const [lx, ly] of [[x + 0.05, y + 0.05], [x + w - 0.05, y + 0.05], [x + 0.05, y + h - 0.05], [x + w - 0.05, y + h - 0.05]])
    s += circ(lx, ly, 0.075, P.leg, `stroke="${P.edge}" stroke-width="1.5"`) + circ(lx, ly, 0.03, P.edge);
  s += rect(x, y, w, h, P.deck, 5, `stroke="${P.edge}" stroke-width="2"`);
  s += rect(x + 0.025, y + 0.025, w - 0.05, h - 0.05, 'none', 4, `stroke="${TEAM}" stroke-width="2.4"`);
  if (P === TIDE) {
    for (let i = 1; i < 5; i++) s += line(x + 0.06, y + (h * i) / 5, x + w - 0.06, y + (h * i) / 5, P.deckD, 1, 'opacity=".7"');
    s += rect(x + w * 0.58, y + h * 0.62, 0.16, 0.12, P.hatch, 1, `stroke="#465050" stroke-width="1"`);
  } else {
    for (let i = 1; i < 4; i++) s += line(x + 0.05, y + (h * i) / 4, x + w - 0.05, y + (h * i) / 4, P.deckD, 0.8, 'opacity=".55"');
  }
  return s;
}
const flag = (x, y) => line(x, y, x, y - 0.17, '#2b2b2b', 1.5) + poly([[x, y - 0.17], [x + 0.15, y - 0.13], [x, y - 0.09]], TEAM);
const vent = (x, y) => circ(x, y, 0.045, P.dark) + circ(x, y, 0.02, '#111');
const windows = (x, y, w, n) => { let s = ''; for (let i = 0; i < n; i++) s += rect(x + (i + 0.2) * (w / n), y, (w / n) * 0.6, 0.035, P.win, 0.5); return s; };
const block = (x, y, w, h, fill = P.sup) => rect(x, y, w, h, fill, 3, `stroke="${P.edge}" stroke-width="1.5"`) + rect(x + 0.02, y + 0.02, w - 0.04, 0.035, 'rgba(255,255,255,.18)', 1);
function lattice(x, y, s) { // a derrick or mast seen from above: a square frame with cross-braces
  return rect(x - s / 2, y - s / 2, s, s, 'none', 1, `stroke="${P.dark}" stroke-width="2.2"`) + line(x - s / 2, y - s / 2, x + s / 2, y + s / 2, P.dark, 1.6) + line(x + s / 2, y - s / 2, x - s / 2, y + s / 2, P.dark, 1.6)
    + rect(x - s * 0.22, y - s * 0.22, s * 0.44, s * 0.44, 'none', 1, `stroke="${P.dark}" stroke-width="1.4"`) + circ(x, y, s * 0.1, TEAM);
}
const tank = (x, y, r, fill = '#c9d0d6') => circ(x, y, r, fill, `stroke="${P.edge}" stroke-width="1.5"`) + circ(x - r * 0.25, y - r * 0.25, r * 0.55, 'rgba(255,255,255,.22)') + ring(x, y, r * 0.72, 'rgba(0,0,0,.18)', 1.2);
function flare(x, y, ang, len) { // a flare boom out over the water, with its flame
  const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
  return line(x, y, ex, ey, P.dark, 2.6) + line(x, y, ex, ey, P.supD, 1.2) + circ(ex, ey, 0.065, '#ff8a2a') + circ(ex, ey, 0.032, '#ffd36a');
}
function crane(x, y, ang, len) {
  const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
  return circ(x, y, 0.06, '#e0b43a', `stroke="${P.edge}" stroke-width="1.2"`) + line(x, y, ex, ey, '#e0b43a', 3) + line(x, y, ex, ey, P.edge, 0.8, 'stroke-dasharray="2 2"') + circ(ex, ey, 0.025, P.edge);
}
const helideck = (x, y, r) => circ(x, y, r, '#4e5a52', `stroke="#e8edf1" stroke-width="1.4"`) + ring(x, y, r * 0.72, '#e6c34a', 1.2)
  + `<text x="${f(x * C)}" y="${f((y + r * 0.36) * C)}" font-family="Arial" font-weight="700" font-size="${f(r * 1.05 * C)}" fill="#e8edf1" text-anchor="middle">H</text>`;
const pipe = (pts, w = 3) => `<polyline points="${pts.map(([x, y]) => `${f(x * C)},${f(y * C)}`).join(' ')}" fill="none" stroke="${P.pipe}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"/>`;
function barrels(x, y, ang, n, len, w = 3) {
  let s = ''; const nx = -Math.sin(ang), ny = Math.cos(ang);
  for (let i = 0; i < n; i++) { const o = (i - (n - 1) / 2) * 0.05; s += line(x + nx * o, y + ny * o, x + nx * o + Math.cos(ang) * len, y + ny * o + Math.sin(ang) * len, P.dark, w); }
  return s;
}
const turretBase = (x, y, r) => circ(x, y, r, '#5d6873', `stroke="${P.edge}" stroke-width="1.6"`) + circ(x, y, r * 0.42, TEAM);

// ---------- the pieces ----------
const ART = {
  // an oil rig: derrick, flare boom, crane, helideck and the wellhead pipework
  rig: () => {
    // a jacket on four big legs, the derrick in the middle, a helideck at one corner, a flare boom off another
    let s = '';
    for (const [lx, ly] of [[0.13, 0.13], [0.87, 0.13], [0.13, 0.87], [0.87, 0.87]]) s += circ(lx, ly, 0.1, P.leg, `stroke="${P.edge}" stroke-width="1.6"`) + circ(lx, ly, 0.045, P.edge);
    s += rect(0.08, 0.08, 0.84, 0.84, P.deck, 4, `stroke="${P.edge}" stroke-width="2"`) + rect(0.105, 0.105, 0.79, 0.79, 'none', 3, `stroke="${TEAM}" stroke-width="2.6"`);
    for (let i = 1; i < 4; i++) s += line(0.12, 0.08 + 0.21 * i, 0.88, 0.08 + 0.21 * i, P.deckD, 0.9, 'opacity=".55"');
    s += flare(0.86, 0.14, -0.75, 0.14) + crane(0.2, 0.2, 3.9, 0.12);
    s += pipe([[0.44, 0.44], [0.26, 0.72]], 3.2) + block(0.15, 0.64, 0.18, 0.18, P.supD);
    s += lattice(0.44, 0.42, 0.42);
    s += helideck(0.72, 0.72, 0.18);
    return s + flag(0.7, 0.3);
  },
  // wellhead: a small deck round the valve tree, oil pipe leading off
  wellhead: () => deck(0.22, 0.22, 0.56, 0.56) + pipe([[0.5, 0.5], [0.5, 0.86]], 4) + circ(0.5, 0.5, 0.14, '#6d7781', `stroke="${P.edge}" stroke-width="1.6"`)
    + line(0.36, 0.5, 0.64, 0.5, '#d33', 4) + line(0.5, 0.36, 0.5, 0.64, '#d33', 4) + circ(0.5, 0.5, 0.06, '#f0a531') + flag(0.3, 0.38),
  // storage: four tanks
  storage: () => deck() + tank(0.32, 0.32, 0.16) + tank(0.68, 0.32, 0.16) + tank(0.32, 0.68, 0.16) + tank(0.68, 0.68, 0.16, TEAM) + pipe([[0.32, 0.5], [0.68, 0.5]], 2),
  // research lab: a domed module and dishes
  lab: () => deck() + block(0.16, 0.18, 0.4, 0.3) + windows(0.18, 0.28, 0.36, 4) + windows(0.18, 0.38, 0.36, 4)
    + circ(0.64, 0.64, 0.19, '#dfe6ec', `stroke="${P.edge}" stroke-width="1.6"`) + circ(0.6, 0.6, 0.09, 'rgba(255,255,255,.5)') + ring(0.64, 0.64, 0.12, 'rgba(0,0,0,.12)', 1)
    + circ(0.3, 0.7, 0.1, '#e8edf1', `stroke="${P.edge}" stroke-width="1.3"`) + line(0.3, 0.7, 0.38, 0.62, P.dark, 1.6) + circ(0.72, 0.28, 0.05, TEAM),
  // pump station: pump housings and the pipeline
  pump: () => deck() + pipe([[0.1, 0.5], [0.9, 0.5]], 5) + pipe([[0.1, 0.5], [0.9, 0.5]], 1.5).replace(P.pipe, '#f6c36a')
    + block(0.2, 0.22, 0.24, 0.2, '#7a858f') + block(0.56, 0.58, 0.24, 0.2, '#7a858f') + circ(0.32, 0.32, 0.05, TEAM) + circ(0.68, 0.68, 0.05, TEAM) + vent(0.7, 0.28) + vent(0.3, 0.72),
  // crew quarters: an accommodation block with a helideck
  quarters: () => deck() + block(0.16, 0.16, 0.68, 0.38) + windows(0.18, 0.24, 0.64, 6) + windows(0.18, 0.34, 0.64, 6) + windows(0.18, 0.44, 0.64, 6)
    + helideck(0.36, 0.7, 0.14) + circ(0.72, 0.7, 0.06, '#e85d3a', `stroke="${P.edge}" stroke-width="1.2"`) + flag(0.8, 0.2),
  // gun platform: a twin-gun turret
  gun: () => deck() + barrels(0.5, 0.5, -0.6, 2, 0.42, 4) + circ(0.5, 0.5, 0.22, '#5d6873', `stroke="${P.edge}" stroke-width="1.8"`) + circ(0.46, 0.53, 0.09, TEAM)
    + rect(0.18, 0.7, 0.16, 0.12, P.hatch, 1) + rect(0.66, 0.7, 0.16, 0.12, P.hatch, 1),
  // radar mast: a lattice mast with the turning antenna
  radar: () => deck() + lattice(0.5, 0.5, 0.36) + `<g transform="rotate(-25 ${0.5 * C} ${0.5 * C})">` + rect(0.18, 0.46, 0.64, 0.08, '#dfe6ec', 2, `stroke="${P.edge}" stroke-width="1.4"`) + '</g>'
    + circ(0.5, 0.5, 0.06, TEAM) + ring(0.5, 0.5, 0.36, 'rgba(140,230,255,.35)', 1.2, 'stroke-dasharray="3 3"'),
  // dry dock: two walls with water between, and a gantry crane
  drydock: () => rect(0.08, 0.12, 0.84, 0.76, '#1f4d6b', 4, `stroke="${P.edge}" stroke-width="2"`) + rect(0.08, 0.12, 0.84, 0.16, P.deck, 3, `stroke="${P.edge}" stroke-width="1.5"`)
    + rect(0.08, 0.72, 0.84, 0.16, P.deck, 3, `stroke="${P.edge}" stroke-width="1.5"`) + rect(0.08, 0.12, 0.12, 0.76, P.deck, 3, `stroke="${P.edge}" stroke-width="1.5"`)
    + line(0.2, 0.5, 0.86, 0.5, 'rgba(255,255,255,.18)', 1) + line(0.62, 0.16, 0.62, 0.84, '#e0b43a', 4) + line(0.62, 0.16, 0.62, 0.84, P.edge, 0.8, 'stroke-dasharray="2 2"')
    + rect(0.1, 0.14, 0.8, 0.03, TEAM, 1) + rect(0.1, 0.83, 0.8, 0.03, TEAM, 1),
  // refinery: distillation columns, pipework and a flare
  refinery: () => deck() + tank(0.3, 0.3, 0.1, '#b9c1c8') + tank(0.3, 0.56, 0.1, '#b9c1c8') + tank(0.52, 0.3, 0.08, '#b9c1c8')
    + pipe([[0.3, 0.4], [0.3, 0.46]], 3) + pipe([[0.4, 0.3], [0.44, 0.3]], 3) + pipe([[0.3, 0.66], [0.3, 0.76], [0.66, 0.76], [0.66, 0.6]], 2.5)
    + block(0.56, 0.46, 0.24, 0.16, '#7a858f') + circ(0.74, 0.26, 0.06, P.dark) + circ(0.74, 0.26, 0.045, '#ff8a2a') + circ(0.74, 0.26, 0.022, '#ffd36a') + circ(0.62, 0.54, 0.04, TEAM),
  // AA platform: a quad-barrelled mount and its fire director
  aa: () => deck() + barrels(0.46, 0.54, -1.0, 4, 0.34, 2.4) + circ(0.46, 0.54, 0.16, '#5d6873', `stroke="${P.edge}" stroke-width="1.6"`) + circ(0.46, 0.54, 0.06, TEAM)
    + circ(0.74, 0.74, 0.08, '#dfe6ec', `stroke="${P.edge}" stroke-width="1.2"`) + line(0.74, 0.74, 0.8, 0.68, P.dark, 1.6) + vent(0.24, 0.26),
  // helipad: a big pad and a parked helicopter's rotor
  helipad: () => deck(0.08, 0.08, 0.84, 0.84) + circ(0.5, 0.5, 0.33, '#4e5a52', `stroke="#e8edf1" stroke-width="1.6"`) + ring(0.5, 0.5, 0.25, '#e6c34a', 1.5)
    + `<text x="${f(0.5 * C)}" y="${f(0.61 * C)}" font-family="Arial" font-weight="700" font-size="${f(0.3 * C)}" fill="#e8edf1" text-anchor="middle">H</text>` + rect(0.12, 0.12, 0.1, 0.1, TEAM, 1) + rect(0.78, 0.78, 0.1, 0.1, TEAM, 1),
  // cruise missile battery: two angled box launchers
  cruise: () => deck() + `<g transform="rotate(-30 ${0.5 * C} ${0.5 * C})">` + rect(0.22, 0.3, 0.56, 0.16, '#6a7568', 2, `stroke="${P.edge}" stroke-width="1.5"`) + rect(0.22, 0.54, 0.56, 0.16, '#6a7568', 2, `stroke="${P.edge}" stroke-width="1.5"`)
    + [0.31, 0.45, 0.59].map(x => circ(x + 0.08, 0.38, 0.045, P.dark) + circ(x + 0.08, 0.62, 0.045, P.dark)).join('') + rect(0.2, 0.47, 0.6, 0.06, TEAM, 1) + '</g>',
  // airbase: a short runway across the deck, with markings and a hangar
  airbase: () => deck(0.06, 0.06, 0.88, 0.88) + `<g transform="rotate(-35 ${0.5 * C} ${0.5 * C})">` + rect(0.02, 0.36, 0.96, 0.28, '#3e4448', 2)
    + [0.12, 0.3, 0.48, 0.66].map(x => rect(x, 0.49, 0.1, 0.02, '#e8edf1', 0)).join('') + rect(0.04, 0.38, 0.04, 0.24, TEAM, 0) + rect(0.92, 0.38, 0.04, 0.24, TEAM, 0) + '</g>'
    + block(0.62, 0.66, 0.24, 0.18, '#7a858f'),
  // fusion plant: a glowing torus in a containment ring
  fusion: () => deck() + circ(0.5, 0.5, 0.3, '#3a4650', `stroke="${P.edge}" stroke-width="2"`) + ring(0.5, 0.5, 0.21, '#46e0ff', 6, 'opacity=".85"') + ring(0.5, 0.5, 0.21, '#d8fbff', 2)
    + circ(0.5, 0.5, 0.09, '#203038') + circ(0.5, 0.5, 0.05, TEAM) + [0, 1, 2, 3].map(i => { const a = i * Math.PI / 2 + Math.PI / 4; return rect(0.5 + Math.cos(a) * 0.36 - 0.04, 0.5 + Math.sin(a) * 0.36 - 0.04, 0.08, 0.08, P.dark, 1); }).join(''),
  // missile battery: a grid of vertical launch hatches
  missile: () => { let s = deck() + rect(0.2, 0.2, 0.6, 0.6, P.deckD, 3, `stroke="${P.edge}" stroke-width="1.5"`); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) s += rect(0.235 + i * 0.135, 0.235 + j * 0.135, 0.1, 0.1, i === 1 && j === 2 ? TEAM : P.dark, 1); return s; },
};
export const hasStructArt = kind => !!ART[kind];
export function structSVG(kind, team = '#2bb3a3', tide = false) {
  TEAM = team; P = tide ? TIDE : STEEL;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${C}" height="${C}" viewBox="0 0 ${C} ${C}">${(ART[kind] || ART.rig)()}</svg>`;
}
