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
  const mark = (cells, r) => {
    for (const [cx, cy] of cells)
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x >= 0 && y >= 0 && x < S.st.W && y < S.st.H) seen.add(x + ',' + y);
      }
  };
  for (const s of v.myShips) mark(E.shipCells(s), SHIPS[s.type].sight);
  for (const r of v.myRigs) mark([[r.x, r.y]], RIG.sight);
  for (const o of v.myPorts) mark([[o.x, o.y]], PORT.sight);
  return seen;
}

export function drawFog(v) {
  const seen = visionSet(v);
  S.ctx.fillStyle = 'rgba(2, 8, 14, 0.42)';
  for (let y = 0; y < S.st.H; y++) for (let x = 0; x < S.st.W; x++)
    if (!seen.has(x + ',' + y)) S.ctx.fillRect(px(x), py(y), S.cell, S.cell);
  outlineArea(seen, 'rgba(160, 220, 255, 0.35)', 1);
}
