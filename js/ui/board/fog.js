// Fog of war: darken everything your fleet cannot currently see.
import * as E from '../../engine/index.js';
import { PORT, RIG } from '../../data/economy.js';
import { SHIPS } from '../../data/ships.js';
import { outlineArea } from './canvas.js';
import { px, py } from '../helpers.js';
import { S } from '../state.js';

// ---------- fog of war ----------
// Squares one of my ships or rigs can see right now.
function visionSet(v) {
  const seen = new Set();
  for (const [cells, r] of E.sightSources(S.st, S.st.current))
    for (const [cx, cy] of cells)
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x >= 0 && y >= 0 && x < S.st.W && y < S.st.H) seen.add(x + ',' + y);
      }
  return seen;
}

// One pixel per square: dark where you can't see. Rebuilt every draw (cheap), reused by the minimap.
export function fogImage(seen) {
  const { W, H } = S.st;
  let f = S.fogCanvas;
  if (!f || f.width !== W || f.height !== H) { f = document.createElement('canvas'); f.width = W; f.height = H; S.fogCanvas = f; }
  const g = f.getContext('2d');
  const img = g.createImageData(W, H);
  for (let i = 0; i < W * H; i++) { img.data[i * 4 + 2] = 14; img.data[i * 4 + 3] = 107; } // rgba(2, 8, 14, 0.42)
  for (const k of seen) { const [x, y] = k.split(','); img.data[(+y * W + +x) * 4 + 3] = 0; }
  g.putImageData(img, 0, 0);
  return f;
}

export function drawFog(v) {
  const seen = visionSet(v);
  S.ctx.imageSmoothingEnabled = false;
  S.ctx.drawImage(fogImage(seen), px(0), py(0), S.cell * S.st.W, S.cell * S.st.H);
  if (S.cell >= 6) outlineArea(seen, 'rgba(160, 220, 255, 0.35)', 1);
}
