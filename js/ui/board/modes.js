// Overlays for the current mode: move range, targeting, placing ships, rigs and ports.
import * as E from '../../engine/index.js';
import { PORT, RIG } from '../../data/economy.js';
import { SHIPS } from '../../data/ships.js';
import { ghost, outlineArea, roundRect, sightSquares } from './canvas.js';
import { drawPort, drawRig } from './units.js';
import { COL } from '../constants.js';
import { centerOffset, me, pcol, px, py, reach, selected } from '../helpers.js';
import { S } from '../state.js';

export function drawModeOverlay() {
  const s = selected();
  if (s) {
    outlineArea(sightSquares(E.shipCells(s), SHIPS[s.type].sight), 'rgba(255,255,255,0.75)', 1.5, [5, 4]);
    const sonar = SHIPS[s.type].passives?.sonar;
    if (sonar) outlineArea(sightSquares(E.shipCells(s), sonar), 'rgba(111,182,255,0.8)', 1.5, [2, 3]);
  }
  if (S.mode.kind === 'move' && s) {
    const map = reach();
    S.ctx.fillStyle = 'rgba(43,179,163,0.16)';
    const painted = new Set();
    for (const n of map.values()) for (const [x, y] of E.cellsOf(s.type, n.x, n.y, s.rot)) {
      const k = x + ',' + y; if (painted.has(k)) continue; painted.add(k); S.ctx.fillRect(px(x), py(y), S.cell, S.cell);
    }
    if (S.hover) {
      const [ox, oy] = centerOffset(s.type, s.rot);
      const ax = S.hover.x - ox, ay = S.hover.y - oy;
      const n = map.get(ax + ',' + ay);
      if (n) {
        const gc = E.cellsOf(s.type, ax, ay, s.rot);
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
    for (let y = 0; y < S.st.H; y++) for (let x = 0; x < S.st.W; x++) if (E.dist(cells, [[x, y]]) <= range) S.ctx.fillRect(px(x), py(y), S.cell, S.cell);
    if (S.hover && E.dist(cells, [[S.hover.x, S.hover.y]]) <= range) {
      let lo = 0, hi = 0;
      if (act.kind === 'scan') { lo = -Math.floor((act.size - 1) / 2); hi = lo + act.size - 1; }
      if (act.area === 3) { lo = -1; hi = 1; }
      S.ctx.strokeStyle = COL.oil; S.ctx.lineWidth = 2;
      S.ctx.strokeRect(px(S.hover.x + lo) + 1, py(S.hover.y + lo) + 1, S.cell * (hi - lo + 1) - 2, S.cell * (hi - lo + 1) - 2);
      S.ctx.lineWidth = 1;
    }
  }
  if (S.mode.kind === 'placeShip') {
    // where ships can launch: your spawn strip plus the area around forward rigs
    const zone = new Set();
    const sp = S.st.players[me()].spawn;
    for (let y = sp.y0; y <= sp.y1; y++) for (let x = sp.x0; x <= sp.x1; x++) zone.add(x + ',' + y);
    for (const r of E.forwardPorts(S.st, me()))
      for (let dy = -PORT.range; dy <= PORT.range; dy++) for (let dx = -PORT.range; dx <= PORT.range; dx++)
        if (r.x + dx >= 0 && r.y + dy >= 0 && r.x + dx < S.st.W && r.y + dy < S.st.H && !E.isLand(S.st, r.x + dx, r.y + dy)) zone.add((r.x + dx) + ',' + (r.y + dy));
    S.ctx.fillStyle = 'rgba(43,179,163,0.14)';
    for (const k of zone) { const [x, y] = k.split(',').map(Number); S.ctx.fillRect(px(x), py(y), S.cell, S.cell); }
    outlineArea(zone, 'rgba(95,211,198,0.8)', 1.5, [4, 3]);
  }
  if (S.mode.kind === 'placeShip' && S.hover) {
    const [ox, oy] = centerOffset(S.mode.ship, S.mode.rot);
    const cells = E.cellsOf(S.mode.ship, S.hover.x - ox, S.hover.y - oy, S.mode.rot);
    const okSpot = E.inLaunchZone(S.st, me(), cells) &&
      E.placementOk(S.st, me(), cells, null, E.visibility(S.st, me()));
    ghost(cells, okSpot ? 'rgba(43,179,163,0.6)' : 'rgba(226,85,85,0.6)');
  }
  if (S.mode.kind === 'placePort') {
    // every coast square you can build on right now
    for (let y = 0; y < S.st.H; y++) for (let x = 0; x < S.st.W; x++) {
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
