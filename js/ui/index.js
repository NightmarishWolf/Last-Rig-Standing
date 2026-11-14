// UI entry point: start-up, refreshing everything, and sending actions to the engine.
import * as E from '../engine/index.js';
import { cellFromEvent, resize } from './board/canvas.js';
import { draw } from './board/render.js';
import { showRules } from './dialogs.js';
import { cancelMode, onBoardClick, onKey, onPanelClick } from './input.js';
import { renderPanel, renderTop } from './panel.js';
import { S } from './state.js';
import { toast, updateStatus } from './status.js';

export function initUI(state, h) {
  S.st = state; S.hooks = h;
  S.canvas = document.getElementById('board');
  S.ctx = S.canvas.getContext('2d');
  window.addEventListener('resize', () => { resize(); draw(); });
  S.canvas.addEventListener('mousemove', e => { S.hover = cellFromEvent(e); draw(); updateStatus(); });
  S.canvas.addEventListener('mouseleave', () => { S.hover = null; draw(); });
  S.canvas.addEventListener('click', e => onBoardClick(cellFromEvent(e)));
  S.canvas.addEventListener('contextmenu', e => { e.preventDefault(); cancelMode(); });
  document.getElementById('panel').addEventListener('click', onPanelClick);
  document.getElementById('btn-help').onclick = showRules;
  document.getElementById('btn-menu').onclick = () => S.hooks.showMenu();
  window.addEventListener('keydown', onKey);
  resize();
}

export function setState(state) { S.st = state; S.selectedId = null; S.mode = { kind: 'idle' }; refresh(); }

export function refresh() {
  S.reachCache = null; renderPanel(); renderTop();
  if (S.hooks.afterRender?.(S.st, { selectedId: S.selectedId, mode: S.mode })) { renderPanel(); S.hooks.afterRender?.(S.st, { selectedId: S.selectedId, mode: S.mode }); }
  resize(); draw(); updateStatus();
}

export const redraw = () => draw();

// End the current player's turn (End turn button, or the turn timer running out).
export function endTurnNow(reason) {
  dispatch({ type: 'endTurn' });
  S.selectedId = null; S.mode = { kind: 'idle' };
  if (S.st.phase === 'playing') S.hooks.handoff(S.st, reason);
  refresh();
}

// ---------- dispatch ----------
export function dispatch(action) {
  const r = E.applyAction(S.st, action);
  if (!r.ok) toast(r.error);
  S.hooks.save(S.st);
  if (S.selectedId && !S.st.ships.find(s => s.id === S.selectedId)) { S.selectedId = null; S.mode = { kind: 'idle' }; }
  if (S.st.phase === 'over') { refresh(); S.hooks.gameOver(S.st); return r; }
  return r;
}
