// Mouse and keyboard: clicks on the board and on the side panel.
import * as E from '../engine/index.js';
import { SHIPS } from '../data/ships.js';
import { draw } from './board/render.js';
import { centerOffset, me, planRot, reach, select, selected } from './helpers.js';
import { dispatch, endTurnNow, refresh } from './index.js';
import { S } from './state.js';
import { currentYard, nearbyLoners } from './panel.js';
import { toast } from './status.js';
import { closeResearch, openResearch, researchOpen, renderResearch } from './research.js';
import { requestDraw } from './board/render.js';
import { centerOn, panBy, zoomAt } from './camera.js';

// ---------- input ----------
export function onBoardClick(c, shift = false) {
  if (!c || S.st.phase !== 'playing' || S.botTurn) return; // a computer is playing
  const p = me();
  const myShipAt = S.st.ships.find(s => s.owner === p && E.shipCells(s).some(([x, y]) => x === c.x && y === c.y));
  // forming a fleet: clicks add or remove ships
  if (S.mode.kind === 'fleetPick') {
    if (myShipAt) {
      const ids = S.mode.ids;
      S.mode.ids = ids.includes(myShipAt.id) ? ids.filter(id => id !== myShipAt.id) : [...ids, myShipAt.id];
    }
    return refresh();
  }
  // escort: click the ship to look after
  if (S.mode.kind === 'escortPick') {
    if (myShipAt && selected()) {
      const r = dispatch({ type: 'setStanding', shipId: S.selectedId, standing: { kind: 'escort', target: myShipAt.id } });
      if (r.ok) S.mode = { kind: 'move' };
    }
    return refresh();
  }
  // patrol: clicks add points to the loop
  if (S.mode.kind === 'patrolPick') {
    const s = selected();
    if (s) { const [ox, oy] = centerOffset(s.type, s.rot); S.mode.points.push(toFleetPoint(s, c.x - ox, c.y - oy)); }
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
  const mine = myShipAt;
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
    const fleet = E.fleetOf(S.st, s.id);
    // finishing a route that has waypoints: it becomes a voyage through all of them
    if (S.plan.length) {
      const pts = [...S.plan, { x: ax, y: ay, rot: pr }];
      const r = fleet ? dispatch({ type: 'setFleetOrder', fleetId: fleet.id, points: pts.map(q => toFleetPoint(s, q.x, q.y)) })
        : dispatch({ type: 'setOrder', shipId: s.id, points: pts });
      if (r.ok) { S.plan = []; S.planRot = null; }
      return refresh();
    }
    if (reach().has(ax + ',' + ay + ',' + pr)) { dispatch({ type: 'move', shipId: s.id, x: ax, y: ay, rot: pr }); S.planRot = null; return refresh(); }
    // further away: set sail on a voyage (it keeps going each turn until it arrives); a fleet sails together
    if (!S.fit && fleet) { dispatch({ type: 'setFleetOrder', fleetId: fleet.id, points: [toFleetPoint(s, ax, ay)] }); S.planRot = null; return refresh(); }
    if (!S.fit && E.findPath(S.st, s, ax, ay, pr)?.length) { dispatch({ type: 'setOrder', shipId: s.id, x: ax, y: ay, rot: pr }); S.planRot = null; return refresh(); }
    return; // unreachable spot: keep the ship selected
  }
}

// A point for a fleet's flagship, so that ship `s` (a member) ends up at (ax, ay).
// For a ship that isn't in a fleet the point is unchanged.
export function toFleetPoint(s, ax, ay) {
  const f = E.fleetOf(S.st, s.id);
  const m = f && f.members.find(x => x.id === s.id);
  return m ? { x: ax - m.dx, y: ay - m.dy } : { x: ax, y: ay };
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
  if (['target', 'placeRig', 'placePort', 'fleetPick', 'patrolPick', 'escortPick'].includes(S.mode.kind)) S.mode = selected() ? { kind: 'move' } : { kind: 'idle' };
  else { S.selectedId = null; S.mode = { kind: 'idle' }; }
  refresh();
}

export function onKey(e) {
  if (!document.getElementById('overlay').classList.contains('hidden')) return;
  if (e.key === 'Escape') return cancelMode();
  if (S.botTurn && !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a', 'A', 'd', 'D', 'w', 'W', 's', 'S', '+', '=', '-', '_'].includes(e.key)) return; // only the camera during computer turns
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
    const busy = s => s.order || E.standingOf(S.st, s) || E.fleetOf(S.st, s.id)?.order;
    const ready = mine.filter(s => !busy(s) && (s.movesLeft > 0 || !s.acted));
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
    if (selected()) planTurn();
  }
}

export function onPanelClick(e) {
  if (S.botTurn) return;
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
  // shipyards
  if (d.buy) dispatch({ type: 'buyShip', ship: d.buy, yard: currentYard(S.st, me()).id });
  if (d.yard) { S.yard = d.yard; const y = currentYard(S.st, me()); if (!S.fit && y.kind !== 'home') centerOn(y.x, y.y); }
  if (d.yardShow) { const y = currentYard(S.st, me()); centerOn(y.x, y.y); }
  if (d.cancelBuild) dispatch({ type: 'cancelBuild', buildId: d.cancelBuild });
  // fleets
  if (d.fleetPick) S.mode = { kind: 'fleetPick', ids: [S.selectedId] };
  if (d.fleetNearby) { const first = S.st.ships.find(x => x.id === S.mode.ids[0]); S.mode.ids = [...S.mode.ids, ...nearbyLoners(first).map(x => x.id)]; }
  if (d.fleetCreate) { const r = dispatch({ type: 'formFleet', shipIds: S.mode.ids }); if (r.ok) S.mode = { kind: 'move' }; }
  if (d.fleetCancel || d.modeCancel) S.mode = selected() ? { kind: 'move' } : { kind: 'idle' };
  if (d.fleetJoinOne) dispatch({ type: 'joinFleet', fleetId: d.fleetJoinOne, shipId: S.selectedId });
  if (d.fleetJoin) { const f = E.fleetById(S.st, d.fleetJoin); for (const x of nearbyLoners(E.flagship(S.st, f))) dispatch({ type: 'joinFleet', fleetId: f.id, shipId: x.id }); }
  if (d.fleetLeave) dispatch({ type: 'leaveFleet', shipId: d.fleetLeave });
  if (d.fleetDisband) dispatch({ type: 'disbandFleet', fleetId: d.fleetDisband });
  if (d.fleetReform) dispatch({ type: 'reformFleet', fleetId: d.fleetReform });
  if (d.fleetRegroup) dispatch({ type: 'regroupFleet', fleetId: d.fleetRegroup });
  if (d.fleetStop) dispatch({ type: 'cancelFleetOrder', fleetId: d.fleetStop });
  // standing orders
  if (d.standing) {
    const k = d.standing;
    if (k === 'patrol') S.mode = S.mode.kind === 'patrolPick' ? { kind: 'move' } : { kind: 'patrolPick', points: [] };
    else if (k === 'escort') S.mode = S.mode.kind === 'escortPick' ? { kind: 'move' } : { kind: 'escortPick' };
    else { dispatch({ type: 'setStanding', shipId: S.selectedId, standing: { kind: k } }); S.mode = { kind: 'move' }; }
  }
  if (d.standingPatrolGo) { const r = dispatch({ type: 'setStanding', shipId: S.selectedId, standing: { kind: 'patrol', points: S.mode.points } }); if (r.ok) S.mode = { kind: 'move' }; }
  if (d.standingClear) dispatch({ type: 'setStanding', shipId: S.selectedId, standing: null });
  if (d.rig) S.mode = S.mode.kind === 'placeRig' ? { kind: 'idle' } : { kind: 'placeRig' };
  if (d.port) S.mode = S.mode.kind === 'placePort' ? { kind: 'idle' } : { kind: 'placePort' };
  if (d.sell) dispatch({ type: 'sell', amount: d.sell === 'all' ? S.st.players[me()].oil : Number(d.sell) });
  if (d.end) return endTurnNow();
  if (d.deselect) { S.selectedId = null; S.selectedBase = null; S.mode = { kind: 'idle' }; }
  if (d.cancelOrder) dispatch({ type: 'cancelOrder', shipId: S.selectedId });
  if (d.platform) S.mode = S.mode.kind === 'placePlatform' && S.mode.platform === d.platform ? { kind: 'idle' } : { kind: 'placePlatform', platform: d.platform, baseId: S.selectedBase };
  if (d.upgrade) dispatch({ type: 'upgradeBase', baseId: d.upgrade });
  if (d.moveCapital) dispatch({ type: 'moveCapital', baseId: d.moveCapital });
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
