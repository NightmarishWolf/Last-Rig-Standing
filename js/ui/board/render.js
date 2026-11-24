// Draws the whole board, layer by layer (water, intel, units, overlays).
// Only the squares inside the camera view are drawn, so huge maps stay fast.
// Zoomed far out, detail is simplified (no labels, plain shapes) and the
// terrain comes from a pre-drawn one-pixel-per-square image.
import { drawWaves } from './waves.js';
import { drawSprite, hasSprite, spriteZoom } from './sprites.js';
import { drawLand, drawRipples, waterArt } from './landart.js';
import * as E from '../../engine/index.js';
import { DEPOSITS } from '../../data/economy.js';
import { SHIPS } from '../../data/ships.js';
import { hatch, roundRect } from './canvas.js';
import { drawFog } from './fog.js';
import { drawBasePieces, drawClaims } from './bases.js';
import { drawMarkers, drawProps } from './markers.js';
import { drawUnitBadges, drawYardBadges } from './fleets.js';
import { drawFx, tweenCells } from './fx.js';
import { drawTurrets, endFrame } from './weapons.js';
import { drawMinimap } from './minimap.js';
import { drawModeOverlay } from './modes.js';
import { drawOilTooltip } from './tooltip.js';
import { drawHull, drawPort, drawRig, drawShipMarks, drawContact } from './units.js';
import { drawWorldAbove, drawWorldBelow } from './world.js';
import { visibleRange } from '../camera.js';
import { CODES, COL, MARGIN } from '../constants.js';
import { me, pcol, px, py } from '../helpers.js';
import { S, asMe } from '../state.js';

// Spectator mode: the whole map, every fleet, no fog.
export function spectatorView(st) {
  const base = E.getView(st, st.current);
  return {
    ...base,
    me: { ...base.me, shots: [], incoming: [], flashes: [], spoofs: [], scans: [] },
    myShips: [], myRigs: [], myMines: [], myPorts: [], myPlatforms: [], myBases: [], myFleets: [], builds: [],
    enemyShips: st.ships.map(s => ({ id: s.id, owner: s.owner, cells: E.shipCells(s), type: s.type, hp: s.hp })),
    enemyRigs: st.rigs, enemyPorts: st.ports || [], enemyPlatforms: st.platforms || [], enemyBases: st.bases || [],
    deposits: st.deposits,
    tides: st.players.flatMap((pl, o) => (pl.out ? [] : E.tideSources(st, o).map(t => ({ owner: o, x: t.x, y: t.y, r: t.r })))),
  };
}

// Ask for a redraw on the next animation frame (mouse moves, scrolling, zooming).
export function requestDraw() {
  if (S.drawQueued) return;
  S.drawQueued = true;
  requestAnimationFrame(() => { S.drawQueued = false; draw(); });
}

// One pixel per square: water, home tints and land, as seen by player p. Cached per game.
export function terrainImage(p) {
  const c = S.terrainCache;
  if (c && c.st === S.st && c.p === p && c.ice === (S.st.iceVer || 0)) return c.canvas; // (redrawn when the pack ice changes)
  const { W, H } = S.st;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  const img = g.createImageData(W, H);
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const water = hex(COL.middle), mine = hex(COL.homeMine), theirs = hex(COL.homeEnemy), ice = [214, 236, 248];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const z = E.zoneOf(S.st, x, y);
      // (land is left as sea here: the painted land goes on top, and its curved coasts need sea under them)
      const col = S.st.ice?.[y * W + x] && !E.isLand(S.st, x, y) ? ice : z === 'middle' ? water : z === p ? mine : theirs;
      const i = (y * W + x) * 4;
      img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  S.terrainCache = { st: S.st, p, canvas, ice: S.st.iceVer || 0 };
  return canvas;
}

export const draw = () => asMe(drawBoard);
function drawBoard() {
  if (!S.st) return;
  const p = me();
  const v = S.spectate ? spectatorView(S.st) : E.getView(S.st, p);
  S.lastView = v; // (the surf layer cuts ships and rigs out of its waves)
  const ctx = S.ctx, cell = S.cell;
  const R = visibleRange();
  const inView = (x, y) => x >= R.x0 - 1 && x <= R.x1 + 1 && y >= R.y0 - 1 && y <= R.y1 + 1;
  const detail = cell >= 12; // labels, rounded tiles, grid
  ctx.clearRect(0, 0, S.canvas.width, S.canvas.height);
  ctx.save();
  ctx.beginPath(); ctx.rect(MARGIN, MARGIN, S.view.w, S.view.h); ctx.clip();
  ctx.fillStyle = '#050d15'; ctx.fillRect(MARGIN, MARGIN, S.view.w, S.view.h); // beyond the map edge

  // ---- water and land ----
  // the sea (deeper further from land), ripples close up, then each home area as a soft tint of its colour
  const vx = Math.max(0, R.x0 - 1), vy = Math.max(0, R.y0 - 1), vw = Math.min(S.st.W, R.x1 + 2) - vx, vh = Math.min(S.st.H, R.y1 + 2) - vy;
  if (vw > 0 && vh > 0) {
    const wa = waterArt(S.st);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(wa.canvas, vx * wa.s, vy * wa.s, vw * wa.s, vh * wa.s, px(vx), py(vy), vw * cell, vh * cell);
    drawRipples(ctx, vx, vy, vw, vh, px(vx), py(vy), cell);
  }
  S.st.players.forEach((pl, i) => {
    const h = pl.home;
    if (pl.hideHome) return; // (a mission's enemy has no home waters on the map)
    ctx.globalAlpha = i === p ? 0.14 : 0.07; ctx.fillStyle = pcol(i);
    ctx.fillRect(px(h.x0), py(h.y0), cell * (h.x1 - h.x0 + 1), cell * (h.y1 - h.y0 + 1));
    ctx.globalAlpha = 1;
  });
  // my spawn zone
  { const sp = S.st.players[p].spawn; ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(px(sp.x0), py(sp.y0), cell * (sp.x1 - sp.x0 + 1), cell * (sp.y1 - sp.y0 + 1)); }
  // grid (only when zoomed in enough to be useful)
  if (cell >= 10) {
    ctx.strokeStyle = COL.grid; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = R.x0; x <= R.x1 + 1; x++) { ctx.moveTo(Math.round(px(x)) + .5, py(R.y0)); ctx.lineTo(Math.round(px(x)) + .5, py(R.y1 + 1)); }
    for (let y = R.y0; y <= R.y1 + 1; y++) { ctx.moveTo(px(R.x0), Math.round(py(y)) + .5); ctx.lineTo(px(R.x1 + 1), Math.round(py(y)) + .5); }
    ctx.stroke();
  }
  // land: the painted islands (coasts, beaches, hills, shallows), drawn once per game and scaled to the view
  {
    const sx = Math.max(0, R.x0 - 1), sy = Math.max(0, R.y0 - 1), sw = Math.min(S.st.W, R.x1 + 2) - sx, sh = Math.min(S.st.H, R.y1 + 2) - sy;
    if (sw > 0 && sh > 0) drawLand(ctx, S.st, sx, sy, sw, sh, px(sx), py(sy), cell);
  }
  // home borders in each owner's colour
  ctx.setLineDash([6, 6]);
  S.st.players.forEach((pl, i) => {
    const h = pl.home; if (pl.hideHome) return;
    ctx.strokeStyle = pcol(i); ctx.globalAlpha = pl.out ? 0.15 : 0.55;
    ctx.strokeRect(px(h.x0) + 1, py(h.y0) + 1, cell * (h.x1 - h.x0 + 1) - 2, cell * (h.y1 - h.y0 + 1) - 2);
  });
  ctx.globalAlpha = 1; ctx.setLineDash([]);

  // ---- intel ----
  // surveyed water: a sandy-green tint with an outline around the edge
  {
    const sv = S.st.players[p].surveyed || {};
    const has = (x, y) => sv[x + ',' + y];
    ctx.fillStyle = 'rgba(126, 170, 92, 0.26)';
    const keys = Object.keys(sv);
    const cells = [];
    if (keys.length < (R.x1 - R.x0 + 1) * (R.y1 - R.y0 + 1)) {
      for (const k of keys) { const [x, y] = k.split(',').map(Number); if (inView(x, y)) cells.push([x, y]); }
    } else {
      for (let y = R.y0; y <= R.y1; y++) for (let x = R.x0; x <= R.x1; x++) if (has(x, y)) cells.push([x, y]);
    }
    for (const [x, y] of cells) if (!E.isLand(S.st, x, y)) ctx.fillRect(px(x), py(y), cell, cell);
    if (detail) {
      ctx.fillStyle = 'rgba(190, 225, 150, 0.35)';
      for (const [x, y] of cells) if (!E.isLand(S.st, x, y)) { ctx.beginPath(); ctx.arc(px(x) + cell * 0.18, py(y) + cell * 0.18, Math.max(1, cell * 0.05), 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.strokeStyle = 'rgba(170, 215, 120, 0.7)'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const [x, y] of cells) {
      if (!has(x, y - 1)) { ctx.moveTo(px(x), py(y) + .5); ctx.lineTo(px(x + 1), py(y) + .5); }
      if (!has(x, y + 1)) { ctx.moveTo(px(x), py(y + 1) - .5); ctx.lineTo(px(x + 1), py(y + 1) - .5); }
      if (!has(x - 1, y)) { ctx.moveTo(px(x) + .5, py(y)); ctx.lineTo(px(x) + .5, py(y + 1)); }
      if (!has(x + 1, y)) { ctx.moveTo(px(x + 1) - .5, py(y)); ctx.lineTo(px(x + 1) - .5, py(y + 1)); }
    }
    ctx.stroke(); ctx.lineWidth = 1;
  }
  // scans this turn
  for (const sc of v.me.scans) {
    ctx.fillStyle = 'rgba(120,200,255,0.10)';
    for (const [x, y] of sc.cells) ctx.fillRect(px(x), py(y), cell, cell);
    if (detail) for (const [x, y] of sc.jammed) hatch(x, y, 'rgba(200,120,255,0.5)');
  }
  // enemy fire flashes (from their last turn)
  for (const f of v.me.flashes) {
    ctx.strokeStyle = 'rgba(255,140,60,0.8)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 2;
    ctx.strokeRect(px(Math.max(0, f.x)) + 1, py(Math.max(0, f.y)) + 1,
      cell * (Math.min(S.st.W, f.x + f.w) - Math.max(0, f.x)) - 2, cell * (Math.min(S.st.H, f.y + f.h) - Math.max(0, f.y)) - 2);
    ctx.setLineDash([]); ctx.lineWidth = 1;
  }
  drawWorldBelow(R, detail); // pack ice, oil slicks, the super-rich field's area
  drawTides(v, R, detail); // the Free Tide's raft network
  // deposits
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const d of v.deposits) {
    if (!inView(d.x, d.y)) continue;
    const cx = px(d.x) + cell / 2, cy = py(d.y) + cell / 2, live = d.reserves > 0;
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(1.5, cell * 0.38), 0, Math.PI * 2);
    ctx.fillStyle = live ? (detail ? 'rgba(240,165,49,0.25)' : COL.oil) : 'rgba(120,120,120,0.5)'; ctx.fill();
    if (detail) {
      ctx.strokeStyle = live ? COL.oil : '#777'; ctx.stroke();
      ctx.fillStyle = live ? COL.oil : '#999'; ctx.font = `bold ${cell * 0.38}px system-ui`;
      ctx.fillText(DEPOSITS[d.type].label, cx, cy + 1);
    }
  }
  // wrecks
  for (const w of v.wrecks) for (const [x, y] of w.cells) {
    if (!inView(x, y)) continue;
    const g = detail ? 3 : 0;
    ctx.fillStyle = 'rgba(90,101,113,0.55)'; ctx.fillRect(px(x) + g, py(y) + g, cell - g * 2, cell - g * 2);
    if (detail) { ctx.strokeStyle = '#2b3036'; ctx.beginPath(); ctx.moveTo(px(x) + 5, py(y) + 5); ctx.lineTo(px(x) + cell - 5, py(y) + cell - 5); ctx.stroke(); }
  }
  // incoming shots (enemy fired here since your last turn)
  for (const s of v.me.incoming) {
    ctx.strokeStyle = 'rgba(255,140,60,0.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(px(s.x) + cell / 2, py(s.y) + cell / 2, Math.max(2, cell * 0.3), 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1;
  }
  if (!S.spectate && !S.st.noFog) drawFog(v);
  drawClaims(v);

  // ---- units ----
  for (const m of v.myMines) {
    if (!inView(m.x, m.y)) continue;
    const cx = px(m.x) + cell / 2, cy = py(m.y) + cell / 2;
    ctx.fillStyle = '#c8d3dd'; ctx.beginPath(); ctx.arc(cx, cy, Math.max(1.5, cell * 0.16), 0, Math.PI * 2); ctx.fill();
    if (detail) {
      ctx.strokeStyle = '#c8d3dd';
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(cx - Math.cos(a) * cell * .28, cy - Math.sin(a) * cell * .28); ctx.lineTo(cx + Math.cos(a) * cell * .28, cy + Math.sin(a) * cell * .28); ctx.stroke(); }
    }
  }
  v.myRigs.forEach(r => inView(r.x, r.y) && drawRig(r, pcol(p)));
  v.enemyRigs.forEach(r => inView(r.x, r.y) && drawRig(r, pcol(r.owner)));
  v.myPorts.forEach(o => inView(o.x, o.y) && drawPort(o, pcol(p)));
  v.enemyPorts.forEach(o => inView(o.x, o.y) && drawPort(o, pcol(o.owner)));
  drawBasePieces(v);
  S.animating = false;
  const foes = v.enemyShips.map(e => e.cells);
  drawProps();
  // a ship as its sprite when zoomed in (turned to its heading, in its owner's colour), else the plain hull
  const sprite = (s, cells, color, alpha) => {
    if (!spriteZoom() || !hasSprite(s.type)) return false;
    const [ax, ay] = tweenCells(s.id, [[s.x, s.y]])[0];
    return drawSprite(ctx, s.type, px(ax), py(ay), s.rot || 0, color, alpha);
  };
  for (const s of v.myShips) {
    if (!inView(s.x, s.y) && !inView(s.x + 4, s.y + 4)) continue;
    const cells = tweenCells(s.id, E.shipCells(s));
    const alpha = s.acted && (s.movesLeft === 0 || s.shotsLeft === 0) ? 0.6 : 1, hp = s.hp / SHIPS[s.type].hp;
    if (sprite(s, cells, pcol(p), alpha)) drawShipMarks(cells, { sel: s.id === S.selectedId, hpFrac: hp });
    else { drawHull(cells, pcol(p), s.id === S.selectedId, alpha, CODES[s.type], hp); drawTurrets(s, cells, foes); }
  }
  drawUnitBadges(v);
  drawYardBadges();
  for (const s of v.enemyShips) {
    const cells = tweenCells(s.id, s.cells);
    if (s.owner < 0) { // pirates and the rogue sub: shown for what they are
      const hp = Math.min(1, s.hp / SHIPS[s.type].hp);
      if (sprite(s, cells, pcol(s.owner), 1)) drawShipMarks(cells, { enemy: true, hpFrac: hp, badge: s.neutral === 'rogue' ? '🦈' : '☠' });
      else drawHull(cells, pcol(s.owner), false, 1, s.neutral === 'rogue' ? '🦈' : '☠', hp);
      continue;
    }
    if (S.spectate) {
      const hp = s.hp / SHIPS[s.type].hp;
      if (sprite(s, cells, pcol(s.owner), 1)) drawShipMarks(cells, { hpFrac: hp });
      else { drawHull(cells, pcol(s.owner), false, 1, CODES[s.type], hp); drawTurrets(s, cells, v.enemyShips.filter(e => e.owner !== s.owner).map(e => e.cells).concat(v.myShips.map(m => E.shipCells(m)))); }
      continue;
    }
    // in plain sight: you can see what it is; picked up only by scans, sonar or flashes: an unidentified contact
    if (s.type && sprite(s, cells, pcol(s.owner), 1)) drawShipMarks(cells, { enemy: true, badge: s.burning ? '🔥' : null });
    else if (spriteZoom()) drawContact(cells, pcol(s.owner), s.burning ? '🔥' : '?'); // (burning: badly damaged, can be boarded)
    else drawHull(cells, pcol(s.owner), false, 1, s.burning ? '🔥' : '?', undefined, true);
  }
  drawFx();
  endFrame();
  drawWorldAbove(); // storms, fog banks, next round's event, blowouts
  for (const sp of v.me.spoofs) spriteZoom() ? drawContact([[sp.x, sp.y]], pcol(sp.owner)) : drawHull([[sp.x, sp.y]], pcol(sp.owner), false, 1, '?', undefined, true);
  // my shot markers
  const m = Math.max(1, Math.min(6, cell * 0.2));
  for (const s of v.me.shots) {
    if (!inView(s.x, s.y)) continue;
    const age = S.st.turnCount - s.turn;
    ctx.globalAlpha = age <= 0 ? 1 : age <= 2 ? 0.6 : 0.3;
    const x0 = px(s.x), y0 = py(s.y);
    if (s.r === 'hit' || s.r === 'sunk') {
      ctx.strokeStyle = '#ff4d4d'; ctx.lineWidth = s.r === 'sunk' ? 4 : 3;
      ctx.beginPath(); ctx.moveTo(x0 + m, y0 + m); ctx.lineTo(x0 + cell - m, y0 + cell - m);
      ctx.moveTo(x0 + cell - m, y0 + m); ctx.lineTo(x0 + m, y0 + cell - m); ctx.stroke();
    } else if (s.r === 'intercepted') {
      ctx.strokeStyle = '#6fb6ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x0 + m, y0 + cell - m); ctx.lineTo(x0 + cell - m, y0 + m); ctx.stroke();
    } else {
      ctx.fillStyle = '#e6eef5'; ctx.beginPath(); ctx.arc(x0 + cell / 2, y0 + cell / 2, Math.max(1, cell * 0.1), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.lineWidth = 1;
  }

  // ---- overlays ----
  drawModeOverlay();
  drawMarkers();
  drawOilTooltip(v);
  ctx.restore();

  // ---- axis labels (outside the map area) ----
  ctx.fillStyle = '#07131f'; ctx.fillRect(0, 0, S.view.w + MARGIN, MARGIN); ctx.fillRect(0, 0, MARGIN, S.view.h + MARGIN);
  ctx.fillStyle = COL.muted; ctx.font = `${Math.max(9, Math.min(14, cell * 0.36))}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const step = Math.max(1, Math.ceil(26 / cell));
  for (let x = R.x0; x <= R.x1; x++) if (x % step === 0 || (S.fit && (cell >= 18 || x % 2 === 0))) {
    const lx = px(x) + cell / 2; if (lx > MARGIN) ctx.fillText(String(x + 1), lx, MARGIN / 2);
  }
  const ystep = Math.max(1, Math.ceil(16 / cell));
  ctx.font = `${Math.max(8, Math.min(12, cell * 0.36))}px system-ui`;
  for (let y = R.y0; y <= R.y1; y++) if (y % ystep === 0) {
    const ly = py(y) + cell / 2; if (ly > MARGIN) ctx.fillText(E.rowName(y), MARGIN / 2, ly);
  }
  drawMinimap(v);
  drawWaves(); // (keep the surf in step with the camera)
}

// The Free Tide's raft network: a woven tint in the owner's colour over the water it covers
// (with little raft marks when zoomed in), and a dashed edge.
function drawTides(v, R, detail) {
  if (!v.tides?.length) return;
  const ctx = S.ctx, cell = S.cell, W = S.st.W, H = S.st.H;
  const owners = [...new Set(v.tides.map(t => t.owner))];
  for (const o of owners) {
    const src = v.tides.filter(t => t.owner === o);
    const on = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !E.isLand(S.st, x, y) && E.inTideOf(src, x, y);
    const x0 = Math.max(R.x0, Math.min(...src.map(t => t.x - t.r))), x1 = Math.min(R.x1, Math.max(...src.map(t => t.x + t.r)));
    const y0 = Math.max(R.y0, Math.min(...src.map(t => t.y - t.r))), y1 = Math.min(R.y1, Math.max(...src.map(t => t.y + t.r)));
    const col = pcol(o);
    ctx.globalAlpha = detail ? 0.13 : 0.22; ctx.fillStyle = col;
    const cells = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (on(x, y)) { cells.push([x, y]); ctx.fillRect(px(x), py(y), cell, cell); }
    if (detail) {
      ctx.globalAlpha = 0.35; ctx.strokeStyle = col; ctx.lineWidth = 1;
      ctx.beginPath();
      for (const [x, y] of cells) if ((x + y) % 2 === 0) { // little lashed planks
        const cx = px(x) + cell / 2, cy = py(y) + cell / 2, h = cell * 0.18;
        ctx.moveTo(cx - h, cy - h * 0.6); ctx.lineTo(cx + h, cy - h * 0.6);
        ctx.moveTo(cx - h, cy + h * 0.6); ctx.lineTo(cx + h, cy + h * 0.6);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 0.6; ctx.setLineDash([3, 4]); ctx.lineWidth = 1.5; ctx.beginPath();
    for (const [x, y] of cells) {
      if (!on(x, y - 1)) { ctx.moveTo(px(x), py(y) + .5); ctx.lineTo(px(x + 1), py(y) + .5); }
      if (!on(x, y + 1)) { ctx.moveTo(px(x), py(y + 1) - .5); ctx.lineTo(px(x + 1), py(y + 1) - .5); }
      if (!on(x - 1, y)) { ctx.moveTo(px(x) + .5, py(y)); ctx.lineTo(px(x) + .5, py(y + 1)); }
      if (!on(x + 1, y)) { ctx.moveTo(px(x + 1) - .5, py(y)); ctx.lineTo(px(x + 1) - .5, py(y + 1)); }
    }
    ctx.stroke();
    ctx.setLineDash([]); ctx.lineWidth = 1; ctx.globalAlpha = 1;
  }
}
