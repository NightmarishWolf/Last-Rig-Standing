// Overlays for the current mode: move range, targeting, placing ships, rigs and ports.
import * as E from '../../engine/index.js';
import { PORT, RIG, STRIKES } from '../../data/economy.js';
import { PLATFORMS } from '../../data/bases.js';
import { SHIPS } from '../../data/ships.js';
import { ghost, outlineArea, roundRect, sightSquares } from './canvas.js';
import { drawPlatform, drawPort, drawRig } from './units.js';
import { COL } from '../constants.js';
import { centerOffset, me, pcol, planRot, px, py, reach, selected } from '../helpers.js';
import { S } from '../state.js';
import { visibleRange } from '../camera.js';
import { drawFleetOverlay } from './fleets.js';

export const voyageLabel = (s, len) => {
  const f = E.fleetOf(S.st, s.id); // a fleet ship goes at the fleet's speed
  const speed = f ? E.fleetSpeed(S.st, f) : SHIPS[s.type].move;
  const first = Math.max(0, Math.min(s.movesLeft, speed));
  const turns = len <= first ? 1 : 1 + Math.ceil((len - first) / speed);
  return `${turns} turn${turns > 1 ? 's' : ''}`;
};

// Route a ship would take to put its anchor at (ax, ay), cached while the mouse stays put.
export function voyagePreview(s, ax, ay, r = s.rot) {
  const legs = routePreview(s, [...S.plan, { x: ax, y: ay, rot: r }]);
  return legs ? legs.flat() : null;
}

// Route through several points (Shift+click waypoints, then a destination). Cached.
export function routePreview(s, points) {
  const key = `${s.id}|${s.x},${s.y},${s.rot}|${JSON.stringify(points)}|${S.st.turnCount}|${s.movesLeft}`;
  if (S.pathCache?.key === key) return S.pathCache.legs;
  const legs = E.routeThrough(S.st, s, points);
  S.pathCache = { key, legs };
  return legs;
}

// Draw a planned or active route: dashed course, a dot at each end-of-turn stop,
// numbered circles at waypoints, a ghost at the destination and an optional label.
function drawRoute(s, legs, color, label) {
  const path = legs ? legs.flat() : null;
  if (!path || !path.length) return;
  // draw through the middle of the ship at every step (the middle shifts as it turns)
  const mid = (x, y, r) => { const [ox, oy] = centerOffset(s.type, r); return [px(x + ox) + S.cell / 2, py(y + oy) + S.cell / 2]; };
  const ctx = S.ctx;
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.5, Math.min(3, S.cell * 0.12)); ctx.setLineDash([6, 5]);
  ctx.beginPath(); ctx.moveTo(...mid(s.x, s.y, s.rot));
  for (const n of path) ctx.lineTo(...mid(n.x, n.y, n.r));
  ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1;
  // end-of-turn stops
  const mv = SHIPS[s.type].move;
  ctx.fillStyle = color;
  // (turns are free, so only squares count toward each turn's moves)
  let r = s.rot, sq = 0, next = s.movesLeft;
  for (const n of path) {
    if (n.r === r) sq++;
    r = n.r;
    if (sq >= next && sq > 0) {
      const [mx, my] = mid(n.x, n.y, n.r);
      ctx.beginPath(); ctx.arc(mx, my, Math.max(2, S.cell * 0.14), 0, Math.PI * 2); ctx.fill();
      next += mv;
    }
  }
  // numbered waypoints
  let n = 0;
  for (const leg of legs.slice(0, -1)) {
    n++;
    const e = leg.length ? leg[leg.length - 1] : null;
    if (!e) continue;
    const [wx, wy] = mid(e.x, e.y, e.r), rad = Math.max(7, Math.min(11, S.cell * 0.4));
    ctx.fillStyle = '#ffd666'; ctx.beginPath(); ctx.arc(wx, wy, rad, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#2a1e00'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.lineWidth = 1;
    ctx.fillStyle = '#2a1e00'; ctx.font = `bold ${Math.round(rad * 1.2)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(n), wx, wy + 1);
  }
  const end = path[path.length - 1];
  ghost(E.cellsOf(s.type, end.x, end.y, end.r), 'rgba(255,214,102,0.35)');
  if (label) {
    ctx.font = 'bold 12px system-ui';
    const [ex, ey] = mid(end.x, end.y, end.r);
    const tw = ctx.measureText(label).width + 12, lx = ex + S.cell / 2, ly = ey - S.cell / 2 - 18;
    ctx.fillStyle = 'rgba(8,18,28,0.92)'; roundRect(lx, ly, tw, 18, 4); ctx.fill();
    ctx.fillStyle = '#ffd666'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(label, lx + 6, ly + 9.5);
  }
}

// The selected ship's current voyage (if it has one).
function drawVoyage(s) {
  if (!s || !s.order || S.plan.length) return;
  const legs = routePreview(s, E.orderPoints(s.order));
  if (legs) drawRoute(s, legs, 'rgba(255,214,102,0.85)', `Voyage: ${voyageLabel(s, E.pathMoves(legs.flat(), s.rot))} left`);
}

// While planning: the waypoints so far, plus the leg to wherever the mouse is.
function drawPlan(s, hoverPoint) {
  if (!S.plan.length) return false;
  const pts = hoverPoint ? [...S.plan, hoverPoint] : S.plan;
  const legs = routePreview(s, pts);
  if (!legs) {
    // the hovered spot can't be reached: still show the waypoints that can
    const ok = routePreview(s, S.plan);
    if (ok) drawRoute(s, [...ok, []], 'rgba(255,214,102,0.7)', 'No route to here');
    return true;
  }
  const len = E.pathMoves(legs.flat(), s.rot);
  drawRoute(s, hoverPoint ? legs : [...legs, []], 'rgba(255,214,102,0.8)', hoverPoint ? `${len} squares · ${voyageLabel(s, len)}` : null);
  return true;
}

export function drawModeOverlay() {
  const s = selected();
  const R = visibleRange();
  drawVoyage(s);
  drawFleetOverlay();
  if (s) {
    outlineArea(sightSquares(E.shipCells(s), SHIPS[s.type].sight), 'rgba(255,255,255,0.75)', 1.5, [5, 4]);
    const sonar = SHIPS[s.type].passives?.sonar;
    if (sonar) outlineArea(sightSquares(E.shipCells(s), sonar), 'rgba(111,182,255,0.8)', 1.5, [2, 3]);
  }
  if (S.mode.kind === 'move' && s && planRot(s) !== s.rot) {
    // planned turn: outline where the ship would sit after turning in place
    const [tx, ty] = E.turnAnchor(s.type, s.x, s.y, s.rot, planRot(s));
    outlineArea(new Set(E.cellsOf(s.type, tx, ty, planRot(s)).map(c => c.join(','))), 'rgba(255,214,102,0.9)', 2, [3, 3]);
  }
  if (S.mode.kind === 'move' && s && !S.hover) drawPlan(s, null);
  if (S.mode.kind === 'move' && s) {
    const map = reach();
    S.ctx.fillStyle = 'rgba(43,179,163,0.16)';
    const painted = new Set();
    const pr = planRot(s);
    for (const n of map.values()) if (n.r === pr) for (const [x, y] of E.cellsOf(s.type, n.x, n.y, n.r)) {
      const k = x + ',' + y; if (painted.has(k)) continue; painted.add(k); S.ctx.fillRect(px(x), py(y), S.cell, S.cell);
    }
    if (S.hover) {
      const [ox, oy] = centerOffset(s.type, pr);
      const ax = S.hover.x - ox, ay = S.hover.y - oy;
      const n = map.get(ax + ',' + ay + ',' + pr);
      const planning = drawPlan(s, { x: ax, y: ay, rot: pr });
      if (!planning && !n && !S.fit && !(ax === s.x && ay === s.y && pr === s.rot)) {
        const legs = routePreview(s, [{ x: ax, y: ay, rot: pr }]);
        const len = legs ? E.pathMoves(legs.flat(), s.rot) : 0;
        if (len) drawRoute(s, legs, 'rgba(255,214,102,0.7)', `${len} squares · ${voyageLabel(s, len)}`);
      }
      if (n && !planning) {
        const gc = E.cellsOf(s.type, ax, ay, pr);
        ghost(gc, 'rgba(43,179,163,0.55)');
        outlineArea(sightSquares(gc, SHIPS[s.type].sight), 'rgba(127,209,122,0.9)', 1.5, [5, 4]);
      }
    }
  }
  if (S.mode.kind === 'target' && s) {
    const act = SHIPS[s.type].actions.find(a => a.id === S.mode.actionId);
    const range = E.actionRange(S.st, s, act);
    const cells = E.shipCells(s);
    S.ctx.fillStyle = 'rgba(240,165,49,0.09)';
    for (let y = R.y0; y <= R.y1; y++) for (let x = R.x0; x <= R.x1; x++) if (E.dist(cells, [[x, y]]) <= range) S.ctx.fillRect(px(x), py(y), S.cell, S.cell);
    if (S.hover && E.dist(cells, [[S.hover.x, S.hover.y]]) <= range) {
      let lo = 0, hi = 0;
      if (act.kind === 'scan') { lo = -Math.floor((act.size - 1) / 2); hi = lo + act.size - 1; }
      if (act.area === 3) { lo = -1; hi = 1; }
      S.ctx.strokeStyle = COL.oil; S.ctx.lineWidth = 2;
      S.ctx.strokeRect(px(S.hover.x + lo) + 1, py(S.hover.y + lo) + 1, S.cell * (hi - lo + 1) - 2, S.cell * (hi - lo + 1) - 2);
      S.ctx.lineWidth = 1;
    }
  }
  if (S.mode.kind === 'baseStrike' || S.mode.kind === 'satellite') {
    const o = (S.st.platforms || []).find(x => x.id === S.mode.platformId);
    const def = o && PLATFORMS[o.kind], spec = S.mode.kind === 'satellite' ? { range: 999, size: STRIKES.satellite.size } : def && (def.strike || def.recon);
    if (spec) {
      if (o) {
        S.ctx.fillStyle = def.strike ? 'rgba(255,107,107,0.12)' : 'rgba(120,200,255,0.12)';
        for (let y = R.y0; y <= R.y1; y++) for (let x = R.x0; x <= R.x1; x++) if (Math.max(Math.abs(x - o.x), Math.abs(y - o.y)) <= spec.range) S.ctx.fillRect(px(x), py(y), S.cell, S.cell);
        // the edge of the range
        S.ctx.strokeStyle = def.strike ? 'rgba(255,107,107,0.85)' : 'rgba(120,200,255,0.85)'; S.ctx.setLineDash([6, 4]); S.ctx.lineWidth = 2;
        S.ctx.strokeRect(px(o.x - spec.range), py(o.y - spec.range), S.cell * (2 * spec.range + 1), S.cell * (2 * spec.range + 1));
        S.ctx.setLineDash([]); S.ctx.lineWidth = 1;
      }
      if (S.hover) {
        const n = spec.size || spec.area || 1, lo = -Math.floor((n - 1) / 2);
        const okSpot = o ? !E.strikeProblem(S.st, me(), o, S.hover.x, S.hover.y) : E.satelliteReady(S.st, me());
        S.ctx.strokeStyle = okSpot ? (def?.strike ? '#ff6b6b' : '#78c8ff') : 'rgba(255,255,255,0.35)'; S.ctx.lineWidth = 2;
        S.ctx.strokeRect(px(S.hover.x + lo) + 1, py(S.hover.y + lo) + 1, S.cell * n - 2, S.cell * n - 2); S.ctx.lineWidth = 1;
      }
    }
  }
  if (S.mode.kind === 'placePort') {
    // every coast square you can build on right now
    for (let y = R.y0; y <= R.y1; y++) for (let x = R.x0; x <= R.x1; x++) {
      if (!E.isCoast(S.st, x, y)) continue;
      const okHere = !E.portBuildProblem(S.st, me(), x, y);
      S.ctx.strokeStyle = okHere ? '#7fd17a' : 'rgba(255,255,255,0.25)'; S.ctx.lineWidth = okHere ? 2.5 : 1;
      if (okHere) { S.ctx.fillStyle = 'rgba(127,209,122,0.35)'; roundRect(px(x) + 2, py(y) + 2, S.cell - 4, S.cell - 4, 4); S.ctx.fill(); }
      roundRect(px(x) + 2, py(y) + 2, S.cell - 4, S.cell - 4, 4); S.ctx.stroke(); S.ctx.lineWidth = 1;
    }
    if (S.hover) {
      const okSpot = !E.portBuildProblem(S.st, me(), S.hover.x, S.hover.y);
      S.ctx.globalAlpha = 0.8; drawPort({ x: S.hover.x, y: S.hover.y, hp: PORT.hp }, okSpot ? pcol(me()) : '#e25555'); S.ctx.globalAlpha = 1;
      if (okSpot) {
        const z = new Set();
        for (let dy = -PORT.range; dy <= PORT.range; dy++) for (let dx = -PORT.range; dx <= PORT.range; dx++) {
          const x = S.hover.x + dx, y = S.hover.y + dy;
          if (x >= 0 && y >= 0 && x < S.st.W && y < S.st.H && !E.isLand(S.st, x, y)) z.add(x + ',' + y);
        }
        outlineArea(z, 'rgba(95,211,198,0.9)', 1.5, [4, 3]);
      }
    }
  }
  if (S.mode.kind === 'placePlatform') {
    const b = (S.st.bases || []).find(x => x.id === S.mode.baseId);
    if (b) {
      const r = E.baseRadius(S.st, b);
      for (let y = b.y - r; y <= b.y + r; y++) for (let x = b.x - r; x <= b.x + r; x++) {
        if (x < 0 || y < 0 || x >= S.st.W || y >= S.st.H || E.platformProblem(S.st, me(), S.mode.platform, x, y)) continue;
        S.ctx.fillStyle = 'rgba(127,209,122,0.28)'; roundRect(px(x) + 2, py(y) + 2, S.cell - 4, S.cell - 4, 4); S.ctx.fill();
        S.ctx.strokeStyle = '#7fd17a'; S.ctx.lineWidth = 1.5; roundRect(px(x) + 2, py(y) + 2, S.cell - 4, S.cell - 4, 4); S.ctx.stroke(); S.ctx.lineWidth = 1;
      }
    }
    if (S.hover) {
      const okSpot = !E.platformProblem(S.st, me(), S.mode.platform, S.hover.x, S.hover.y);
      S.ctx.globalAlpha = 0.85; drawPlatform({ kind: S.mode.platform, x: S.hover.x, y: S.hover.y, hp: 1, owner: me() }, okSpot ? pcol(me()) : '#e25555'); S.ctx.globalAlpha = 1;
      if (!okSpot) { S.ctx.fillStyle = 'rgba(226,85,85,0.3)'; S.ctx.fillRect(px(S.hover.x), py(S.hover.y), S.cell, S.cell); }
    }
  }
  if (S.mode.kind === 'placeRig') {
    // every deposit you can build on right now: solid green square
    for (const d of E.getView(S.st, me()).deposits) {
      if (E.rigBuildProblem(S.st, me(), d.x, d.y)) continue;
      S.ctx.fillStyle = 'rgba(43,179,163,0.45)'; roundRect(px(d.x) + 2, py(d.y) + 2, S.cell - 4, S.cell - 4, 4); S.ctx.fill();
      S.ctx.strokeStyle = '#7fd17a'; S.ctx.lineWidth = 2.5; roundRect(px(d.x) + 2, py(d.y) + 2, S.cell - 4, S.cell - 4, 4); S.ctx.stroke();
      S.ctx.lineWidth = 1;
    }
    // ghost rig under the mouse: teal where it can go, red where it can't
    if (S.hover) {
      const okSpot = !E.rigBuildProblem(S.st, me(), S.hover.x, S.hover.y);
      S.ctx.globalAlpha = 0.75;
      drawRig({ x: S.hover.x, y: S.hover.y, hp: RIG.hp }, okSpot ? pcol(me()) : '#e25555');
      S.ctx.globalAlpha = 1;
      if (!okSpot) { S.ctx.fillStyle = 'rgba(226,85,85,0.35)'; S.ctx.fillRect(px(S.hover.x), py(S.hover.y), S.cell, S.cell); }
    }
  }
}
