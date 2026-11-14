// Rig bases on the board: claim borders in the owner's colour, platforms, and wrecked-base markers.
import * as E from '../../engine/index.js';
import { outlineArea } from './canvas.js';
import { drawPlatform } from './units.js';
import { visibleRange } from '../camera.js';
import { me, pcol, px, py } from '../helpers.js';
import { S } from '../state.js';

// Squares a base actually controls (on screen only), respecting overlaps with older bases.
function claimSquares(b, R) {
  const r = E.baseRadius(S.st, b), set = new Set();
  for (let y = Math.max(R.y0 - 1, b.y - r); y <= Math.min(R.y1 + 1, b.y + r); y++)
    for (let x = Math.max(R.x0 - 1, b.x - r); x <= Math.min(R.x1 + 1, b.x + r); x++)
      if (x >= 0 && y >= 0 && x < S.st.W && y < S.st.H && E.claimAt(S.st, x, y) === b) set.add(x + ',' + y);
  return set;
}

export function drawClaims(v) {
  const R = visibleRange(), ctx = S.ctx;
  for (const b of [...v.myBases, ...v.enemyBases]) {
    if (b.wrecked) continue;
    const r = E.baseRadius(S.st, b);
    if (b.x + r < R.x0 - 1 || b.x - r > R.x1 + 1 || b.y + r < R.y0 - 1 || b.y - r > R.y1 + 1) continue;
    const set = claimSquares(b, R), col = pcol(b.owner);
    ctx.globalAlpha = b.owner === me() ? 0.08 : 0.06; ctx.fillStyle = col;
    for (const k of set) { const [x, y] = k.split(',').map(Number); ctx.fillRect(px(x), py(y), S.cell, S.cell); }
    ctx.globalAlpha = 1;
    const sel = b.id === S.selectedBase;
    outlineArea(set, sel ? '#ffffff' : col, sel ? 2.5 : 1.8, sel ? [6, 4] : null);
  }
}

export function drawBasePieces(v) {
  const R = visibleRange();
  const inView = o => o.x >= R.x0 - 1 && o.x <= R.x1 + 1 && o.y >= R.y0 - 1 && o.y <= R.y1 + 1;
  for (const o of v.myPlatforms) if (inView(o)) drawPlatform(o, pcol(me()));
  for (const o of v.enemyPlatforms) if (inView(o)) drawPlatform(o, pcol(o.owner));
  // base markers: a star on your Admiralty, the level on other bases, a red cross on wrecked ones
  const ctx = S.ctx;
  for (const b of [...v.myBases, ...v.enemyBases]) {
    if (!inView(b)) continue;
    const x0 = px(b.x), y0 = py(b.y), c = S.cell;
    if (b.wrecked) {
      ctx.strokeStyle = '#ff4d4d'; ctx.lineWidth = Math.max(1.5, c * 0.1);
      ctx.beginPath(); ctx.moveTo(x0 + c * .2, y0 + c * .2); ctx.lineTo(x0 + c * .8, y0 + c * .8); ctx.moveTo(x0 + c * .8, y0 + c * .2); ctx.lineTo(x0 + c * .2, y0 + c * .8); ctx.stroke();
      ctx.lineWidth = 1; continue;
    }
    if (c < 12) continue;
    const label = b.capital ? '★' : String(b.level);
    const r = Math.max(6, c * 0.24);
    ctx.fillStyle = b.capital ? '#ffd666' : pcol(b.owner);
    ctx.beginPath(); ctx.arc(x0 + c - r * 0.6, y0 + r * 0.6, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#10161c'; ctx.font = `bold ${Math.round(r * 1.3)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x0 + c - r * 0.6, y0 + r * 0.6 + 1);
  }
}
