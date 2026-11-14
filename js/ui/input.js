// Mouse and keyboard: clicks on the board and on the side panel.
import * as E from '../engine/index.js';
import { SHIPS } from '../data/ships.js';
import { draw } from './board/render.js';
import { centerOffset, me, reach, selected } from './helpers.js';
import { dispatch, endTurnNow, refresh } from './index.js';
import { S } from './state.js';

// ---------- input ----------
export function onBoardClick(c) {
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
  if (mine) { S.selectedId = mine.id; S.mode = { kind: 'move' }; return refresh(); }
  if (S.mode.kind === 'move') {
    const s = selected();
    const [ox, oy] = centerOffset(s.type, s.rot);
    const ax = c.x - ox, ay = c.y - oy;
    if (reach().has(ax + ',' + ay)) { dispatch({ type: 'move', shipId: s.id, x: ax, y: ay }); return refresh(); }
    return; // unreachable spot: keep the ship selected
  }
}

export function cancelMode() {
  if (S.mode.kind === 'target' || S.mode.kind === 'placeShip' || S.mode.kind === 'placeRig' || S.mode.kind === 'placePort') S.mode = selected() ? { kind: 'move' } : { kind: 'idle' };
  else { S.selectedId = null; S.mode = { kind: 'idle' }; }
  refresh();
}

export function onKey(e) {
  if (!document.getElementById('overlay').classList.contains('hidden')) return;
  if (e.key === 'Escape') cancelMode();
  if (e.key === 'r' || e.key === 'R') {
    if (S.mode.kind === 'placeShip') { S.mode.rot = (S.mode.rot + 1) % 4; draw(); }
    else if (selected()) { dispatch({ type: 'rotate', shipId: S.selectedId }); refresh(); }
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
  if (d.rotate) dispatch({ type: 'rotate', shipId: S.selectedId });
  if (d.buy) { S.mode = { kind: 'placeShip', ship: d.buy, rot: 1 }; S.selectedId = null; }
  if (d.rig) S.mode = S.mode.kind === 'placeRig' ? { kind: 'idle' } : { kind: 'placeRig' };
  if (d.port) S.mode = S.mode.kind === 'placePort' ? { kind: 'idle' } : { kind: 'placePort' };
  if (d.sell) dispatch({ type: 'sell', amount: d.sell === 'all' ? S.st.players[me()].oil : Number(d.sell) });
  if (d.end) return endTurnNow();
  if (d.deselect) { S.selectedId = null; S.mode = { kind: 'idle' }; }
  refresh();
}
