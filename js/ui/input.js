// Mouse and keyboard: clicks on the board and on the side panel.
import * as E from '../engine/index.js';
import { SHIPS } from '../data/ships.js';
import { draw } from './board/render.js';
import { centerOffset, me, planRot, reach, select, selected } from './helpers.js';
import { dispatch, endTurnNow, refresh } from './index.js';
import { S } from './state.js';
import { toast } from './status.js';
import { closeResearch, openResearch, researchOpen, renderResearch } from './research.js';
import { requestDraw } from './board/render.js';
import { centerOn, panBy, zoomAt } from './camera.js';

// ---------- input ----------
export function onBoardClick(c, shift = false) {
  if (!c || S.st.phase !== 'playing') return;
  const p = me();
  if (S.mode.kind === 'placeShip') {
    const [ox, oy] = centerOffset(S.mode.ship, S.mode.rot);
    const r = dispatch({ type: 'buyShip', ship: S.mode.ship, x: c.x - ox, y: c.y - oy, rot: S.mode.rot });
    if (r.ok) S.mode = { kind: 'idle' };
    return refresh();
  }
  if (S.mode.kind === 'placePort') {
    const r = dispatch({ type: 'buyPort', x: c.x, y: c.y });
    if (r.ok) S.mode = { kind: 'idle' };
    return refresh();
  }
  if (S.mode.kind === 'placePlatform') {
    const r = dispatch({ type: 'buildPlatform', kind: S.mode.platform, x: c.x, y: c.y });
    if (r.ok) S.mode = { kind: 'idle' };
    return refresh();
  }
  if (S.mode.kind === 'placeRig') {
    const r = dispatch({ type: 'buyRig', x: c.x, y: c.y });
    if (r.ok) S.mode = { kind: 'idle' };
    return refresh();
  }
  if (S.mode.kind === 'target') {
    const s = selected();
    const r = dispatch({ type: 'act', shipId: s.id, actionId: S.mode.actionId, x: c.x, y: c.y });
    if (!r.ok) return refresh();
    const still = selected();
    if (!still || !(still.activeAction === S.mode.actionId && still.shotsLeft > 0)) S.mode = still ? { kind: 'move' } : { kind: 'idle' };
    return refresh();
  }
  // clicking one of my ships selects it
  const mine = S.st.ships.find(s => s.owner === p && E.shipCells(s).some(([x, y]) => x === c.x && y === c.y));
  if (mine) { if (mine.id !== S.selectedId) select(mine.id); S.selectedBase = null; S.mode = { kind: 'move' }; return refresh(); }
  // clicking one of my rigs or platforms opens that base
  const piece = S.st.rigs.find(r => r.owner === p && r.x === c.x && r.y === c.y && r.baseId) ||
    (S.st.platforms || []).find(o => o.owner === p && o.x === c.x && o.y === c.y);
  if (piece && !shift) { select(null); S.selectedBase = piece.baseId; S.mode = { kind: 'idle' }; return refresh(); }
  if (S.mode.kind === 'move') {
    const s = selected();
    const pr = planRot(s); // the ship only actually turns now, as part of the move
    const [ox, oy] = centerOffset(s.type, pr);
    const ax = c.x - ox, ay = c.y - oy;
    // Shift+click: add a waypoint (nothing is spent yet)
    if (shift) {
      const pt = { x: ax, y: ay, rot: null };
      if (E.routeThrough(S.st, s, [...S.plan, pt])?.flat().length) S.plan.push(pt);
      else toast('No sea route to that waypoint.');
      return refresh();
    }
    // finishing a route that has waypoints: it becomes a voyage through all of them
    if (S.plan.length) {
      const r = dispatch({ type: 'setOrder', shipId: s.id, points: [...S.plan, { x: ax, y: ay, rot: pr }] });
      if (r.ok) { S.plan = []; S.planRot = null; }
      return refresh();
    }
    if (reach().has(ax + ',' + ay + ',' + pr)) { dispatch({ type: 'move', shipId: s.id, x: ax, y: ay, rot: pr }); S.planRot = null; return refresh(); }
    // further away: set sail on a voyage (it keeps going each turn until it arrives)
    if (!S.fit && E.findPath(S.st, s, ax, ay, pr)?.length) { dispatch({ type: 'setOrder', shipId: s.id, x: ax, y: ay, rot: pr }); S.planRot = null; return refresh(); }
    return; // unreachable spot: keep the ship selected
  }
}

// R: plan the next facing. Nothing is spent until you click to move or set a voyage.
function planTurn() {
  const s = selected();
  if (!s) return;
  S.planRot = (planRot(s) + 1) % 4;
  S.mode = { kind: 'move' };
  refresh();
}

export function cancelMode() {
  if (researchOpen()) { closeResearch(); return refresh(); }
  if (S.plan.length) { S.plan = []; return refresh(); } // Esc first clears planned waypoints
  if (S.mode.kind === 'placePlatform') { S.mode = { kind: 'idle' }; return refresh(); }
  if (S.selectedBase && S.mode.kind === 'idle') { S.selectedBase = null; return refresh(); }
  if (S.mode.kind === 'target' || S.mode.kind === 'placeShip' || S.mode.kind === 'placeRig' || S.mode.kind === 'placePort') S.mode = selected() ? { kind: 'move' } : { kind: 'idle' };
  else { S.selectedId = null; S.mode = { kind: 'idle' }; }
  refresh();
}

export function onKey(e) {
  if (!document.getElementById('overlay').classList.contains('hidden')) return;
  if (e.key === 'Escape') return cancelMode();
  if (e.key === 't' || e.key === 'T') { if (researchOpen()) closeResearch(); else openResearch(); return; }
  if (researchOpen()) return; // the board's keys are off while the research screen is open
  // camera: WASD / arrow keys scroll (hold Shift for faster), + and - zoom
  const pan = { ArrowLeft: [1, 0], a: [1, 0], A: [1, 0], ArrowRight: [-1, 0], d: [-1, 0], D: [-1, 0],
    ArrowUp: [0, 1], w: [0, 1], W: [0, 1], ArrowDown: [0, -1], s: [0, -1], S: [0, -1] }[e.key];
  if (pan && !S.fit) {
    const step = S.cell * (e.shiftKey ? 18 : 6);
    panBy(pan[0] * step, pan[1] * step); requestDraw(); e.preventDefault(); return;
  }
  if ((e.key === '+' || e.key === '=' || e.key === '-' || e.key === '_') && !S.fit) {
    zoomAt(e.key === '-' || e.key === '_' ? 1 / 1.25 : 1.25, S.view.w / 2, S.view.h / 2); requestDraw(); return;
  }
  // Tab: next ship that can still move or act. Space: centre on the selected ship.
  if (e.key === 'Tab') {
    e.preventDefault();
    const mine = S.st.ships.filter(s => s.owner === me());
    const ready = mine.filter(s => !s.order && (s.movesLeft > 0 || !s.acted));
    const list = ready.length ? ready : mine;
    if (!list.length) return;
    const i = list.findIndex(s => s.id === S.selectedId);
    const next = list[(i + 1) % list.length];
    select(next.id); S.selectedBase = null; S.mode = { kind: 'move' };
    if (!S.fit) centerOn(next.x, next.y);
    return refresh();
  }
  if (e.key === ' ' && selected()) { e.preventDefault(); if (!S.fit) { centerOn(selected().x, selected().y); requestDraw(); } return; }
  if (e.key === 'r' || e.key === 'R') {
    if (S.mode.kind === 'placeShip') { S.mode.rot = (S.mode.rot + 1) % 4; draw(); }
    else if (selected()) planTurn();
  }
}

export function onPanelClick(e) {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  const d = b.dataset;
  if (d.act) {
    const s = selected();
    const act = SHIPS[s.type].actions.find(a => a.id === d.act);
    if (act.kind === 'survey') { dispatch({ type: 'act', shipId: s.id, actionId: act.id }); S.mode = { kind: 'move' }; }
    else S.mode = { kind: 'target', actionId: act.id };
  }
  if (d.planRotate) { S.mode = { kind: 'move' }; return planTurn(); }
  if (d.turnHere) {
    // turn on the spot to the planned facing (uses 1–2 squares of movement)
    const s = selected(), pr = planRot(s);
    let at = null;
    for (const n of reach().values()) if (n.r === pr && (!at || n.d < at.d) && E.cellsOf(s.type, n.x, n.y, pr).some(([x, y]) => E.shipCells(s).some(([a, b]) => a === x && b === y))) at = n;
    if (at) { dispatch({ type: 'move', shipId: s.id, x: at.x, y: at.y, rot: pr }); S.planRot = null; }
  }
  if (d.buy) { S.mode = { kind: 'placeShip', ship: d.buy, rot: 1 }; S.selectedId = null; S.selectedBase = null; }
  if (d.rig) S.mode = S.mode.kind === 'placeRig' ? { kind: 'idle' } : { kind: 'placeRig' };
  if (d.port) S.mode = S.mode.kind === 'placePort' ? { kind: 'idle' } : { kind: 'placePort' };
  if (d.sell) dispatch({ type: 'sell', amount: d.sell === 'all' ? S.st.players[me()].oil : Number(d.sell) });
  if (d.end) return endTurnNow();
  if (d.deselect) { S.selectedId = null; S.selectedBase = null; S.mode = { kind: 'idle' }; }
  if (d.cancelOrder) dispatch({ type: 'cancelOrder', shipId: S.selectedId });
  if (d.platform) S.mode = S.mode.kind === 'placePlatform' && S.mode.platform === d.platform ? { kind: 'idle' } : { kind: 'placePlatform', platform: d.platform, baseId: S.selectedBase };
  if (d.upgrade) dispatch({ type: 'upgradeBase', baseId: d.upgrade });
  if (d.clearPlan) S.plan = [];
  if (d.center && selected()) centerOn(selected().x, selected().y);
  refresh();
}

// Clicks inside the research screen.
export function onResearchClick(e) {
  const el = e.target.closest('[data-tech],[data-dequeue],[data-fund],[data-close-research]');
  if (!el) return;
  const d = el.dataset;
  if (d.closeResearch !== undefined) { closeResearch(); return refresh(); }
  if (d.dequeue) dispatch({ type: 'dequeueResearch', tech: d.dequeue });
  if (d.fund) dispatch({ type: 'setFunding', rp: (S.st.players[me()].research.funding || 0) + Number(d.fund) });
  if (d.tech) {
    const status = E.techStatus(S.st, me(), d.tech);
    if (status === 'available') dispatch({ type: 'research', tech: d.tech });
    else if (status === 'blocked') dispatch({ type: 'queueResearch', tech: d.tech });
  }
  refresh();
  renderResearch();
}
