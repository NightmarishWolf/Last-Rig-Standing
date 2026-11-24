// Drawing ships, rigs and ports.
import { PORT, RIG } from '../../data/economy.js';
import { PLATFORMS } from '../../data/bases.js';
import * as E from '../../engine/index.js';
import { roundRect } from './canvas.js';
import { COL } from '../constants.js';
import { px, py } from '../helpers.js';
import { S } from '../state.js';
import { requestDraw } from './render.js';
import { structSVG, hasStructArt } from './structart.js';
import { factionOf } from '../../data/factions.js';

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

// An unidentified contact (picked up by scan, sonar or a gun flash, not seen): a dark, featureless hull
// in the owner's colour outline with a "?" - you know something is there and whose it is, not what it is.
export function drawContact(cells, color, badge = '?') {
  const ctx = S.ctx, c = S.cell;
  const xs = cells.map(q => q[0]), ys = cells.map(q => q[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const ins = Math.max(2, c * 0.14);
  const X = px(minX) + ins, Y = py(minY) + ins, W = (maxX - minX + 1) * c - ins * 2, H = (maxY - minY + 1) * c - ins * 2;
  const r = Math.min(W, H) / 2;
  ctx.save();
  roundRect(X, Y, W, H, r);
  ctx.fillStyle = 'rgba(12,18,26,0.82)'; ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.5, c * 0.06); ctx.setLineDash([Math.max(3, c * 0.18), Math.max(2, c * 0.12)]);
  ctx.stroke(); ctx.setLineDash([]);
  roundRect(X - 2, Y - 2, W + 4, H + 4, r + 2);
  ctx.strokeStyle = 'rgba(255,77,77,0.55)'; ctx.lineWidth = 1; ctx.stroke();
  if (c >= 12) {
    ctx.fillStyle = color; ctx.font = `bold ${Math.max(10, c * 0.42)}px system-ui`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(badge, X + W / 2, Y + H / 2 + 1);
  }
  ctx.restore();
}

// For ships drawn as sprites: just the outline (selection, or red for an enemy), the HP bar and a badge.
export function drawShipMarks(cells, { sel = false, enemy = false, hpFrac, badge } = {}) {
  const ins = Math.max(2, S.cell * 0.08), ctx = S.ctx;
  const set = new Set(cells.map(c => Math.round(c[0]) + ',' + Math.round(c[1])));
  const edge = (color, w, dash) => {
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.setLineDash(dash || []);
    ctx.beginPath();
    for (const [x, y] of cells) {
      const k = Math.round(x) + ',' + Math.round(y), X = px(x), Y = py(y), c = S.cell;
      const has = (dx, dy) => set.has((Math.round(x) + dx) + ',' + (Math.round(y) + dy));
      if (!has(0, -1)) { ctx.moveTo(X + ins, Y + ins); ctx.lineTo(X + c - ins, Y + ins); }
      if (!has(0, 1)) { ctx.moveTo(X + ins, Y + c - ins); ctx.lineTo(X + c - ins, Y + c - ins); }
      if (!has(-1, 0)) { ctx.moveTo(X + ins, Y + ins); ctx.lineTo(X + ins, Y + c - ins); }
      if (!has(1, 0)) { ctx.moveTo(X + c - ins, Y + ins); ctx.lineTo(X + c - ins, Y + c - ins); }
      void k;
    }
    ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1;
  };
  if (enemy) edge('rgba(255,77,77,0.75)', 1.5, [5, 4]);
  if (sel) edge('#ffffff', 2);
  if (hpFrac !== undefined && hpFrac < 1 && S.cell >= 10) {
    const minX = Math.min(...cells.map(c => c[0])), maxX = Math.max(...cells.map(c => c[0])), maxY = Math.max(...cells.map(c => c[1]));
    const w = (maxX - minX + 1) * S.cell - 8;
    ctx.fillStyle = '#300'; ctx.fillRect(px(minX) + 4, py(maxY) + S.cell - 5, w, 3);
    ctx.fillStyle = hpFrac > 0.5 ? '#7fd17a' : hpFrac > 0.25 ? '#f0a531' : '#ff4d4d';
    ctx.fillRect(px(minX) + 4, py(maxY) + S.cell - 5, w * Math.max(0, hpFrac), 3);
  }
  if (badge && S.cell >= 14) {
    const mid = cells[Math.floor(cells.length / 2)];
    ctx.font = `${Math.max(10, S.cell * 0.36)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(badge, px(mid[0]) + S.cell / 2, py(mid[1]) + S.cell / 2);
  }
}

// a structure's sprite (rigs and platforms), rasterised once per kind, colour and size
const structPics = new Map();
function structPic(kind, color, tide) {
  const size = [24, 40, 64, 96].find(z => z >= S.cell * (window.devicePixelRatio || 1)) || 96, key = kind + color + tide + size;
  let e = structPics.get(key);
  if (e) return e.ready ? e.c : null;
  e = { ready: false }; structPics.set(key, e);
  const img = new Image();
  img.onload = () => { const c = document.createElement('canvas'); c.width = c.height = size; c.getContext('2d').drawImage(img, 0, 0, size, size); e.c = c; e.ready = true; requestDraw(); };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(structSVG(kind, color, tide));
  return null;
}
const tideOwner = o => o.owner != null && S.st.players[o.owner] && factionOf(S.st, o.owner) === 'tide';
function drawStruct(kind, o, color) {
  if (S.cell < 10 || !hasStructArt(kind)) return false;
  const pic = structPic(kind, color, tideOwner(o));
  if (!pic) return false;
  S.ctx.imageSmoothingEnabled = true; S.ctx.imageSmoothingQuality = 'high';
  S.ctx.drawImage(pic, px(o.x), py(o.y), S.cell, S.cell);
  return true;
}
export function drawRig(r, color) {
  const x0 = px(r.x), y0 = py(r.y), u = S.cell / 10;
  if (drawStruct('rig', r, color)) {
    const b = r.center && (S.st.bases || []).find(b => b.id === r.baseId), max = b ? E.baseMaxHp(S.st, b) : RIG.hp;
    if (r.hp < max) { S.ctx.fillStyle = '#ff4d4d'; S.ctx.fillRect(x0 + 4, y0 + S.cell - 5, (S.cell - 8) * r.hp / max, 3); }
    return;
  }
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
  ctx.globalAlpha = o.buildLeft ? 0.5 : 1;
  if (!drawStruct(o.kind, o, color)) {
    ctx.fillStyle = '#0a1a26'; roundRect(x0 + g, y0 + g, c - g * 2, c - g * 2, 4); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 2;
    roundRect(x0 + g, y0 + g, c - g * 2, c - g * 2, 4); ctx.stroke(); ctx.lineWidth = 1;
    ctx.fillStyle = o.kind === 'wellhead' ? '#f0a531' : '#e8eef4';
    ctx.font = `bold ${Math.round(c * 0.42)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(def.code, x0 + c / 2, y0 + c / 2 + 1);
  }
  ctx.globalAlpha = 1;
  // (still being built: scaffolding round it)
  if (o.buildLeft) { ctx.strokeStyle = '#ffd666'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]); roundRect(x0 + 1.5, y0 + 1.5, c - 3, c - 3, 4); ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1; }
  if (o.buildLeft && c >= 16) {
    ctx.fillStyle = '#ffd666'; ctx.font = `bold ${Math.round(c * 0.28)}px system-ui`;
    ctx.fillText(String(o.buildLeft), x0 + c - g - c * 0.12, y0 + c - g - c * 0.14);
  }
  const max = E.platformMaxHp(S.st, o);
  if (!o.buildLeft && o.hp < max) { ctx.fillStyle = '#ff4d4d'; ctx.fillRect(x0 + 4, y0 + c - 5, (c - 8) * o.hp / max, 3); }
}
