// ============================================================
// Character portraits: 64×64 pixel-art busts, four moods each (neutral, stern, worried, pleased).
// The pictures are PNG files in assets/portraits/{who}-{mood}.png, drawn big with crisp pixels.
// portraitSVG(who, mood, size) → an <svg> string wrapping the picture. CHARACTERS[who] = { name, short, side, radio }.
// ============================================================

export const CHARACTERS = {
  ortiz: { name: 'Captain Mateo Ortiz', short: 'Ortiz', side: 'navy' },
  hale: { name: 'Admiral Ruth Hale', short: 'Hale', side: 'navy', radio: true },
  sato: { name: 'Lt. Kenji Sato', short: 'Sato', side: 'navy' },
  vance: { name: 'Commodore Elias Vance', short: 'Vance', side: 'navy', radio: true },
  kade: { name: 'Kade the Burner', short: 'Kade', side: 'tide', radio: true },
  maren: { name: 'Maren Holt, Bracken Point', short: 'Maren', side: 'tide' },
  lio: { name: 'Lio, of Driftwood', short: 'Lio', side: 'tide' },
  ruiz: { name: '"Mother" Ruiz', short: 'Ruiz', side: 'tide', radio: true },
  nyx: { name: 'Old Salt Nyx', short: 'Nyx', side: 'tide', radio: true },
  // (voiceOnly: a character with no picture yet is shown as a voice on the radio)
  // the Allocation Council: never a face, only a voice from behind a screen
  council: { name: 'The Allocation Council', short: 'Council', side: 'navy', radio: true, voiceOnly: true, faceless: true },
};

export const MOODS = ['neutral', 'stern', 'worried', 'pleased'];
const N = 64;

// where a portrait's picture lives (relative to this file, so it works from any page path)
export function portraitURL(who, mood = 'neutral') {
  if (!MOODS.includes(mood)) mood = 'neutral';
  return new URL(`../../assets/portraits/${who}-${mood}.png`, import.meta.url).href;
}

const cache = new Map();
export function portraitSVG(who, mood = 'neutral', size = 96) {
  const key = `${who}|${mood}|${size}`;
  if (cache.has(key)) return cache.get(key);
  if (!CHARACTERS[who]) return '';
  if (CHARACTERS[who].faceless) return cacheSet(key, councilSVG(size));
  if (CHARACTERS[who].voiceOnly) return cacheSet(key, voiceSVG(size));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N} ${N}" width="${size}" height="${size}" class="portrait">`
    + `<image href="${portraitURL(who, mood)}" width="${N}" height="${N}" style="image-rendering:pixelated"/></svg>`;
  cache.set(key, svg);
  return svg;
}

const cacheSet = (k, v) => (cache.set(k, v), v);
// a voice with no face: a dark silhouette behind radio static
function voiceSVG(size) {
  let lines = '';
  for (let y = 3; y < N; y += 6) lines += `<rect x="0" y="${y}" width="${N}" height="1" fill="#7fd0d8" opacity=".12"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N} ${N}" width="${size}" height="${size}" shape-rendering="crispEdges" class="portrait">`
    + `<rect width="${N}" height="${N}" fill="#1c2a1f"/><rect width="${N}" height="40" fill="#28392b"/>`
    + `<rect x="24" y="14" width="16" height="20" fill="#0d130f"/><rect x="22" y="18" width="20" height="12" fill="#0d130f"/><rect x="28" y="34" width="8" height="5" fill="#0d130f"/>`
    + `<rect x="10" y="39" width="44" height="25" fill="#0d130f"/><rect x="14" y="37" width="36" height="4" fill="#0d130f"/>`
    + `${lines}<text x="32" y="58" font-size="7" font-family="monospace" text-anchor="middle" fill="#7fd0d8" opacity=".7">RADIO</text></svg>`;
}

// the Council: a blank figure, backlit, in a pool of cold light; no features, no name
function councilSVG(size) {
  let px = '';
  const R = (x, y, w, h, c) => { px += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`; };
  R(0, 0, N, N, '#0a0e14');
  // the light behind them: a pale circle, stepped like the other portraits' backdrops
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const r = Math.hypot(x + 0.5 - 32, y + 0.5 - 24), d = ((x < 32 ? x : 63 - x) + y) % 2 === 0; // (the dither mirrored too)
    const c = r < 18 ? '#c9cfd6' : r < 20 && d ? '#c9cfd6' : r < 25 ? '#5f6873' : r < 28 && d ? '#5f6873' : r < 34 ? '#1d242d' : null;
    if (c) R(x, y, 1, 1, c);
  }
  // the figure: head, neck, high-collared shoulders, all one flat black
  const K = '#05070a';
  for (let y = 10; y < 40; y++) for (let x = 0; x < N; x++) {
    const dx = (x + 0.5 - 32) / 11.5, dy = (y + 0.5 - 24) / 14;
    if (dx * dx + dy * dy <= 1) R(x, y, 1, 1, K);
  }
  R(26, 36, 12, 8, K);
  for (let y = 42; y < N; y++) { const h = Math.round(Math.min(32, 10 + (y - 42) * 2.2)); R(32 - h, y, h * 2, 1, K); } // (centred on the middle line)
  R(22, 41, 20, 4, K); // the collar
  // a thin rim of light round the head and shoulders
  for (const [x, y] of [[20, 20], [20, 22], [20, 24], [21, 17], [21, 27], [22, 15], [23, 13], [43, 20], [43, 22], [43, 24], [42, 17], [42, 27], [41, 15], [40, 13]]) R(x, y, 1, 1, '#8d97a2');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N} ${N}" width="${size}" height="${size}" shape-rendering="crispEdges" class="portrait">${px}</svg>`;
}

// load every picture once up front, so the first line of dialogue doesn't flash empty
let warmed = false;
export function preloadPortraits() {
  if (warmed || typeof Image === 'undefined') return;
  warmed = true;
  for (const who of Object.keys(CHARACTERS).filter(w => !CHARACTERS[w].voiceOnly)) for (const mood of MOODS) { const img = new Image(); img.src = portraitURL(who, mood); }
}
