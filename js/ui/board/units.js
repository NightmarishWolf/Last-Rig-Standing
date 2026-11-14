// Drawing ships, rigs and ports.
import { PORT, RIG } from '../../data/economy.js';
import { PLATFORMS } from '../../data/bases.js';
import * as E from '../../engine/index.js';
import { roundRect } from './canvas.js';
import { COL } from '../constants.js';
import { px, py } from '../helpers.js';
import { S } from '../state.js';

export function drawHull(cells, color, sel, alpha, label, hpFrac, enemy = false) {
  S.ctx.globalAlpha = alpha;
  S.ctx.fillStyle = color;
  const set = new Set(cells.map(c => c[0] + ',' + c[1]));
  const ins = S.cell < 8 ? 0.3 : Math.max(2, S.cell * 0.12);
  for (const [x, y] of cells) {
    roundRect(px(x) + ins, py(y) + ins, S.cell - ins * 2, S.cell - ins * 2, S.cell < 8 ? 0 : 4); S.ctx.fill();
    if (set.has((x + 1) + ',' + y)) S.ctx.fillRect(px(x) + S.cell - ins - 1, py(y) + ins, ins * 2 + 2, S.cell - ins * 2);
    if (set.has(x + ',' + (y + 1))) S.ctx.fillRect(px(x) + ins, py(y) + S.cell - ins - 1, S.cell - ins * 2, ins * 2 + 2);
  }
  if (enemy) {
    S.ctx.strokeStyle = '#ff4d4d'; S.ctx.lineWidth = 2;
    for (const [x, y] of cells) { roundRect(px(x) + ins - 1, py(y) + ins - 1, S.cell - ins * 2 + 2, S.cell - ins * 2 + 2, 4); S.ctx.stroke(); }
    S.ctx.lineWidth = 1;
  }
  if (sel) {
    S.ctx.strokeStyle = '#ffffff'; S.ctx.lineWidth = 2;
    for (const [x, y] of cells) { roundRect(px(x) + ins - 1, py(y) + ins - 1, S.cell - ins * 2 + 2, S.cell - ins * 2 + 2, 4); S.ctx.stroke(); }
    S.ctx.lineWidth = 1;
  }
  const mid = cells[Math.floor(cells.length / 2)];
  S.ctx.fillStyle = 'rgba(0,0,0,0.75)';
  S.ctx.font = `bold ${Math.max(9, S.cell * 0.34)}px system-ui`; S.ctx.textAlign = 'center'; S.ctx.textBaseline = 'middle';
  if (S.cell >= 14) S.ctx.fillText(label, px(mid[0]) + S.cell / 2, py(mid[1]) + S.cell / 2 + 1);
  if (hpFrac !== undefined && hpFrac < 1 && S.cell >= 10) {
    const minX = Math.min(...cells.map(c => c[0])), maxX = Math.max(...cells.map(c => c[0]));
    const maxY = Math.max(...cells.map(c => c[1]));
    const w = (maxX - minX + 1) * S.cell - 8;
    S.ctx.fillStyle = '#300'; S.ctx.fillRect(px(minX) + 4, py(maxY) + S.cell - 5, w, 3);
    S.ctx.fillStyle = hpFrac > 0.5 ? '#7fd17a' : hpFrac > 0.25 ? '#f0a531' : '#ff4d4d';
    S.ctx.fillRect(px(minX) + 4, py(maxY) + S.cell - 5, w * Math.max(0, hpFrac), 3);
  }
  S.ctx.globalAlpha = 1;
}

export function drawRig(r, color) {
  const x0 = px(r.x), y0 = py(r.y), u = S.cell / 10;
  if (S.cell < 10) { S.ctx.fillStyle = color; S.ctx.fillRect(x0, y0, S.cell, S.cell); S.ctx.fillStyle = '#f0a531'; S.ctx.fillRect(x0 + S.cell * .3, y0 + S.cell * .3, S.cell * .4, S.cell * .4); return; }
  S.ctx.fillStyle = '#0a1a26';
  roundRect(x0 + 2, y0 + 2, S.cell - 4, S.cell - 4, 3); S.ctx.fill();
  S.ctx.strokeStyle = color; S.ctx.lineWidth = 2; S.ctx.stroke();
  // platform deck + legs
  S.ctx.strokeStyle = COL.oil; S.ctx.lineWidth = Math.max(1.2, u * 0.7);
  S.ctx.beginPath();
  S.ctx.moveTo(x0 + u * 2, y0 + u * 7); S.ctx.lineTo(x0 + u * 8, y0 + u * 7);
  S.ctx.moveTo(x0 + u * 3, y0 + u * 7); S.ctx.lineTo(x0 + u * 3, y0 + u * 8.5);
  S.ctx.moveTo(x0 + u * 7, y0 + u * 7); S.ctx.lineTo(x0 + u * 7, y0 + u * 8.5);
  // derrick tower with cross-braces
  S.ctx.moveTo(x0 + u * 3.6, y0 + u * 7); S.ctx.lineTo(x0 + u * 5, y0 + u * 1.8); S.ctx.lineTo(x0 + u * 6.4, y0 + u * 7);
  S.ctx.moveTo(x0 + u * 4.0, y0 + u * 5.4); S.ctx.lineTo(x0 + u * 6.0, y0 + u * 5.4);
  S.ctx.moveTo(x0 + u * 4.4, y0 + u * 3.8); S.ctx.lineTo(x0 + u * 5.6, y0 + u * 3.8);
  S.ctx.stroke(); S.ctx.lineWidth = 1;
  const b = r.center && (S.st.bases || []).find(b => b.id === r.baseId);
  const max = b ? E.baseMaxHp(S.st, b) : RIG.hp;
  if (r.hp < max) { S.ctx.fillStyle = '#ff4d4d'; S.ctx.fillRect(x0 + 4, y0 + S.cell - 5, (S.cell - 8) * r.hp / max, 3); }
}

// forward port: an anchor on a coast square
export function drawPort(o, color) {
  const x0 = px(o.x), y0 = py(o.y), u = S.cell / 10;
  if (S.cell < 10) { S.ctx.fillStyle = '#ffffff'; S.ctx.fillRect(x0, y0, S.cell, S.cell); S.ctx.fillStyle = color; S.ctx.fillRect(x0 + S.cell * .25, y0 + S.cell * .25, S.cell * .5, S.cell * .5); return; }
  S.ctx.fillStyle = '#0a1a26'; roundRect(x0 + 2, y0 + 2, S.cell - 4, S.cell - 4, 4); S.ctx.fill();
  S.ctx.strokeStyle = color; S.ctx.lineWidth = 2; S.ctx.stroke();
  S.ctx.strokeStyle = '#e8eef4'; S.ctx.lineWidth = Math.max(1.2, u * 0.75); S.ctx.lineCap = 'round';
  S.ctx.beginPath(); S.ctx.arc(x0 + u * 5, y0 + u * 2.6, u * 0.9, 0, Math.PI * 2); S.ctx.stroke();
  S.ctx.beginPath();
  S.ctx.moveTo(x0 + u * 5, y0 + u * 3.5); S.ctx.lineTo(x0 + u * 5, y0 + u * 8);
  S.ctx.moveTo(x0 + u * 3.4, y0 + u * 4.6); S.ctx.lineTo(x0 + u * 6.6, y0 + u * 4.6);
  S.ctx.stroke();
  S.ctx.beginPath(); S.ctx.arc(x0 + u * 5, y0 + u * 5.6, u * 2.5, Math.PI * 0.15, Math.PI * 0.85); S.ctx.stroke();
  S.ctx.lineCap = 'butt'; S.ctx.lineWidth = 1;
  if (o.hp < PORT.hp) { S.ctx.fillStyle = '#ff4d4d'; S.ctx.fillRect(x0 + 4, y0 + S.cell - 6, (S.cell - 8) * o.hp / PORT.hp, 3); }
}

// A platform: a small square with its letter (W, S, L, G...). Dashed while under construction.
export function drawPlatform(o, color) {
  const def = PLATFORMS[o.kind], x0 = px(o.x), y0 = py(o.y), c = S.cell, ctx = S.ctx;
  if (c < 10) { ctx.fillStyle = color; ctx.globalAlpha = o.buildLeft ? 0.5 : 1; ctx.fillRect(x0, y0, c, c); ctx.globalAlpha = 1; return; }
  const g = Math.max(2, c * 0.1);
  ctx.globalAlpha = o.buildLeft ? 0.65 : 1;
  ctx.fillStyle = '#0a1a26'; roundRect(x0 + g, y0 + g, c - g * 2, c - g * 2, 4); ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = 2; if (o.buildLeft) ctx.setLineDash([3, 3]);
  roundRect(x0 + g, y0 + g, c - g * 2, c - g * 2, 4); ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1;
  ctx.fillStyle = o.kind === 'wellhead' ? '#f0a531' : '#e8eef4';
  ctx.font = `bold ${Math.round(c * 0.42)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(def.code, x0 + c / 2, y0 + c / 2 + 1);
  ctx.globalAlpha = 1;
  if (o.buildLeft && c >= 16) {
    ctx.fillStyle = '#ffd666'; ctx.font = `bold ${Math.round(c * 0.28)}px system-ui`;
    ctx.fillText(String(o.buildLeft), x0 + c - g - c * 0.12, y0 + c - g - c * 0.14);
  }
  const max = E.platformMaxHp(S.st, o);
  if (!o.buildLeft && o.hp < max) { ctx.fillStyle = '#ff4d4d'; ctx.fillRect(x0 + 4, y0 + c - 5, (c - 8) * o.hp / max, 3); }
}
