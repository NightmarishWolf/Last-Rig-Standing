// Draws the whole board, layer by layer (water, intel, units, overlays).
import * as E from '../../engine/index.js';
import { DEPOSITS } from '../../data/economy.js';
import { SHIPS } from '../../data/ships.js';
import { hatch, roundRect } from './canvas.js';
import { drawFog } from './fog.js';
import { drawMarkers } from './markers.js';
import { drawModeOverlay } from './modes.js';
import { drawOilTooltip } from './tooltip.js';
import { drawHull, drawPort, drawRig } from './units.js';
import { CODES, COL, MARGIN } from '../constants.js';
import { me, pcol, px, py } from '../helpers.js';
import { S } from '../state.js';

// ---------- drawing ----------
export function draw() {
  if (!S.st) return;
  const p = me();
  const v = E.getView(S.st, p);
  S.ctx.clearRect(0, 0, S.canvas.width, S.canvas.height);

  // water: No Man's Sea, then each home tinted in its owner's colour
  S.ctx.fillStyle = COL.middle; S.ctx.fillRect(px(0), py(0), S.cell * S.st.W, S.cell * S.st.H);
  S.st.players.forEach((pl, i) => {
    const h = pl.home;
    S.ctx.fillStyle = i === p ? COL.homeMine : COL.homeEnemy;
    S.ctx.fillRect(px(h.x0), py(h.y0), S.cell * (h.x1 - h.x0 + 1), S.cell * (h.y1 - h.y0 + 1));
    S.ctx.globalAlpha = i === p ? 0.07 : 0.05; S.ctx.fillStyle = pcol(i);
    S.ctx.fillRect(px(h.x0), py(h.y0), S.cell * (h.x1 - h.x0 + 1), S.cell * (h.y1 - h.y0 + 1));
    S.ctx.globalAlpha = 1;
  });
  // my spawn zone
  { const sp = S.st.players[p].spawn; S.ctx.fillStyle = 'rgba(255,255,255,0.05)';
    S.ctx.fillRect(px(sp.x0), py(sp.y0), S.cell * (sp.x1 - sp.x0 + 1), S.cell * (sp.y1 - sp.y0 + 1)); }
  // grid
  S.ctx.strokeStyle = COL.grid; S.ctx.lineWidth = 1;
  for (let x = 0; x <= S.st.W; x++) { S.ctx.beginPath(); S.ctx.moveTo(px(x) + .5, py(0)); S.ctx.lineTo(px(x) + .5, py(S.st.H)); S.ctx.stroke(); }
  for (let y = 0; y <= S.st.H; y++) { S.ctx.beginPath(); S.ctx.moveTo(px(0), py(y) + .5); S.ctx.lineTo(px(S.st.W), py(y) + .5); S.ctx.stroke(); }
  // home borders in each owner's colour
  S.ctx.setLineDash([6, 6]);
  S.st.players.forEach((pl, i) => {
    const h = pl.home; S.ctx.strokeStyle = pcol(i); S.ctx.globalAlpha = pl.out ? 0.15 : 0.55;
    S.ctx.strokeRect(px(h.x0) + 1, py(h.y0) + 1, S.cell * (h.x1 - h.x0 + 1) - 2, S.cell * (h.y1 - h.y0 + 1) - 2);
  });
  S.ctx.globalAlpha = 1; S.ctx.setLineDash([]);
  // axis labels
  S.ctx.fillStyle = COL.muted; S.ctx.font = `${Math.max(9, S.cell * 0.36)}px system-ui`; S.ctx.textAlign = 'center'; S.ctx.textBaseline = 'middle';
  for (let x = 0; x < S.st.W; x++) if (S.cell >= 18 || x % 2 === 0) S.ctx.fillText(String(x + 1), px(x) + S.cell / 2, MARGIN / 2);
  for (let y = 0; y < S.st.H; y++) S.ctx.fillText(E.coord(0, y).replace(/\d+$/, ''), MARGIN / 2, py(y) + S.cell / 2);
  // land
  for (let y = 0; y < S.st.H; y++) for (let x = 0; x < S.st.W; x++) if (E.isLand(S.st, x, y)) {
    S.ctx.fillStyle = COL.land; roundRect(px(x) + 1, py(y) + 1, S.cell - 2, S.cell - 2, 4); S.ctx.fill();
  }
  // surveyed water: a clear sandy-green tint with a fine dot, so you know where you've already looked
  {
    const sv = S.st.players[p].surveyed || {};
    for (const k in sv) {
      const [x, y] = k.split(',').map(Number);
      if (E.isLand(S.st, x, y)) continue;
      S.ctx.fillStyle = 'rgba(126, 170, 92, 0.26)'; S.ctx.fillRect(px(x), py(y), S.cell, S.cell);
      S.ctx.fillStyle = 'rgba(190, 225, 150, 0.35)';
      S.ctx.beginPath(); S.ctx.arc(px(x) + S.cell * 0.18, py(y) + S.cell * 0.18, Math.max(1, S.cell * 0.05), 0, Math.PI * 2); S.ctx.fill();
    }
    // outline the edge of the surveyed area
    S.ctx.strokeStyle = 'rgba(170, 215, 120, 0.7)'; S.ctx.lineWidth = 1.5;
    for (const k in sv) {
      const [x, y] = k.split(',').map(Number);
      const edge = (nx, ny) => !sv[nx + ',' + ny];
      S.ctx.beginPath();
      if (edge(x, y - 1)) { S.ctx.moveTo(px(x), py(y) + .5); S.ctx.lineTo(px(x + 1), py(y) + .5); }
      if (edge(x, y + 1)) { S.ctx.moveTo(px(x), py(y + 1) - .5); S.ctx.lineTo(px(x + 1), py(y + 1) - .5); }
      if (edge(x - 1, y)) { S.ctx.moveTo(px(x) + .5, py(y)); S.ctx.lineTo(px(x) + .5, py(y + 1)); }
      if (edge(x + 1, y)) { S.ctx.moveTo(px(x + 1) - .5, py(y)); S.ctx.lineTo(px(x + 1) - .5, py(y + 1)); }
      S.ctx.stroke();
    }
    S.ctx.lineWidth = 1;
  }
  // scans this turn
  for (const sc of v.me.scans) {
    for (const [x, y] of sc.cells) { S.ctx.fillStyle = 'rgba(120,200,255,0.10)'; S.ctx.fillRect(px(x), py(y), S.cell, S.cell); }
    for (const [x, y] of sc.jammed) hatch(x, y, 'rgba(200,120,255,0.5)');
  }
  // enemy fire flashes (from their last turn)
  for (const f of v.me.flashes) {
    S.ctx.strokeStyle = 'rgba(255,140,60,0.8)'; S.ctx.setLineDash([4, 4]); S.ctx.lineWidth = 2;
    S.ctx.strokeRect(px(Math.max(0, f.x)) + 1, py(Math.max(0, f.y)) + 1,
      S.cell * (Math.min(S.st.W, f.x + f.w) - Math.max(0, f.x)) - 2, S.cell * (Math.min(S.st.H, f.y + f.h) - Math.max(0, f.y)) - 2);
    S.ctx.setLineDash([]); S.ctx.lineWidth = 1;
  }
  // deposits
  for (const d of v.deposits) {
    const cx = px(d.x) + S.cell / 2, cy = py(d.y) + S.cell / 2;
    S.ctx.beginPath(); S.ctx.arc(cx, cy, S.cell * 0.38, 0, Math.PI * 2);
    S.ctx.fillStyle = d.reserves > 0 ? 'rgba(240,165,49,0.25)' : 'rgba(120,120,120,0.25)'; S.ctx.fill();
    S.ctx.strokeStyle = d.reserves > 0 ? COL.oil : '#777'; S.ctx.stroke();
    S.ctx.fillStyle = d.reserves > 0 ? COL.oil : '#999'; S.ctx.font = `bold ${S.cell * 0.38}px system-ui`;
    S.ctx.fillText(DEPOSITS[d.type].label, cx, cy + 1);
  }
  // wrecks
  for (const w of v.wrecks) for (const [x, y] of w.cells) {
    S.ctx.fillStyle = 'rgba(90,101,113,0.55)'; S.ctx.fillRect(px(x) + 3, py(y) + 3, S.cell - 6, S.cell - 6);
    S.ctx.strokeStyle = '#2b3036'; S.ctx.beginPath(); S.ctx.moveTo(px(x) + 5, py(y) + 5); S.ctx.lineTo(px(x) + S.cell - 5, py(y) + S.cell - 5); S.ctx.stroke();
  }
  // incoming shots (enemy fired here last turn)
  for (const s of v.me.incoming) {
    S.ctx.strokeStyle = 'rgba(255,140,60,0.9)'; S.ctx.lineWidth = 2;
    S.ctx.beginPath(); S.ctx.arc(px(s.x) + S.cell / 2, py(s.y) + S.cell / 2, S.cell * 0.3, 0, Math.PI * 2); S.ctx.stroke(); S.ctx.lineWidth = 1;
  }
  drawFog(v);
  // my mines
  for (const m of v.myMines) {
    const cx = px(m.x) + S.cell / 2, cy = py(m.y) + S.cell / 2;
    S.ctx.fillStyle = '#c8d3dd'; S.ctx.beginPath(); S.ctx.arc(cx, cy, S.cell * 0.16, 0, Math.PI * 2); S.ctx.fill();
    S.ctx.strokeStyle = '#c8d3dd';
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 4; S.ctx.beginPath(); S.ctx.moveTo(cx - Math.cos(a) * S.cell * .28, cy - Math.sin(a) * S.cell * .28); S.ctx.lineTo(cx + Math.cos(a) * S.cell * .28, cy + Math.sin(a) * S.cell * .28); S.ctx.stroke(); }
  }
  // rigs
  v.myRigs.forEach(r => drawRig(r, pcol(p)));
  v.enemyRigs.forEach(r => drawRig(r, pcol(r.owner)));
  v.myPorts.forEach(o => drawPort(o, pcol(p)));
  v.enemyPorts.forEach(o => drawPort(o, pcol(o.owner)));
  // ships
  for (const s of v.myShips) drawHull(E.shipCells(s), pcol(p), s.id === S.selectedId, s.acted && (s.movesLeft === 0 || s.shotsLeft === 0) ? 0.6 : 1, CODES[s.type], s.hp / SHIPS[s.type].hp);
  for (const s of v.enemyShips) drawHull(s.cells, pcol(s.owner), false, 1, '?', undefined, true);
  for (const sp of v.me.spoofs) drawHull([[sp.x, sp.y]], pcol(sp.owner), false, 1, '?', undefined, true);
  // my shot markers
  for (const s of v.me.shots) {
    const age = S.st.turnCount - s.turn;
    S.ctx.globalAlpha = age <= 0 ? 1 : age <= 2 ? 0.6 : 0.3;
    const x0 = px(s.x), y0 = py(s.y);
    if (s.r === 'hit' || s.r === 'sunk') {
      S.ctx.strokeStyle = '#ff4d4d'; S.ctx.lineWidth = s.r === 'sunk' ? 4 : 3;
      S.ctx.beginPath(); S.ctx.moveTo(x0 + 6, y0 + 6); S.ctx.lineTo(x0 + S.cell - 6, y0 + S.cell - 6);
      S.ctx.moveTo(x0 + S.cell - 6, y0 + 6); S.ctx.lineTo(x0 + 6, y0 + S.cell - 6); S.ctx.stroke();
    } else if (s.r === 'intercepted') {
      S.ctx.strokeStyle = '#6fb6ff'; S.ctx.lineWidth = 3; S.ctx.beginPath(); S.ctx.moveTo(x0 + 6, y0 + S.cell - 6); S.ctx.lineTo(x0 + S.cell - 6, y0 + 6); S.ctx.stroke();
    } else {
      S.ctx.fillStyle = '#e6eef5'; S.ctx.beginPath(); S.ctx.arc(x0 + S.cell / 2, y0 + S.cell / 2, S.cell * 0.1, 0, Math.PI * 2); S.ctx.fill();
    }
    S.ctx.globalAlpha = 1; S.ctx.lineWidth = 1;
  }
  drawModeOverlay();
  drawMarkers();
  drawOilTooltip(v);
}
