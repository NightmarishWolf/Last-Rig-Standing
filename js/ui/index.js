// UI entry point: start-up, refreshing everything, and sending actions to the engine.
import * as E from '../engine/index.js';
import { cellFromEvent, resize } from './board/canvas.js';
import { draw, requestDraw } from './board/render.js';
import { minimapToWorld } from './board/minimap.js';
import { centerOn, panBy, zoomAt } from './camera.js';
import { MARGIN } from './constants.js';
import { showRules } from './dialogs.js';
import { cancelMode, onBoardClick, onKey, onPanelClick, onResearchClick } from './input.js';
import { closeResearch, openResearch, renderResearch } from './research.js';
import { renderPanel, renderTop } from './panel.js';
import { S, asMe } from './state.js';
import { toast, updateStatus } from './status.js';
import { reopenSummary } from './summary.js';
import { effectsForAction } from './board/weapons.js';
import { muted, setMuted } from './sound.js';

export function initUI(state, h) {
  S.st = state; S.hooks = h;
  S.canvas = document.getElementById('board');
  S.ctx = S.canvas.getContext('2d');
  window.addEventListener('resize', () => { resize(); draw(); });
  // left-click = act, drag (left or middle button) = scroll the map, wheel = zoom, right-click = cancel
  S.canvas.addEventListener('mousedown', e => {
    if (e.button === 0 || e.button === 1) S.drag = { x: e.clientX, y: e.clientY, moved: false, button: e.button };
    if (e.button === 1) e.preventDefault();
  });
  window.addEventListener('mousemove', e => {
    if (S.drag) {
      const dx = e.clientX - S.drag.x, dy = e.clientY - S.drag.y;
      if (!S.drag.moved && Math.abs(dx) + Math.abs(dy) > 5 && !S.fit) S.drag.moved = true;
      if (S.drag.moved) { panBy(dx, dy); S.drag.x = e.clientX; S.drag.y = e.clientY; S.canvas.style.cursor = 'grabbing'; }
    }
    if (e.target === S.canvas) { S.hover = cellFromEvent(e); requestDraw(); asMe(updateStatus); }
    else if (S.drag?.moved) requestDraw();
  });
  window.addEventListener('mouseup', e => {
    const d = S.drag; S.drag = null; S.canvas.style.cursor = '';
    if (d && !d.moved && d.button === 0 && e.target === S.canvas) asMe(() => onBoardClick(cellFromEvent(e), e.shiftKey));
  });
  S.canvas.addEventListener('mouseleave', () => { S.hover = null; requestDraw(); });
  S.canvas.addEventListener('contextmenu', e => { e.preventDefault(); cancelMode(); });
  S.canvas.addEventListener('wheel', e => {
    if (S.fit) return;
    e.preventDefault();
    const r = S.canvas.getBoundingClientRect();
    zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left - MARGIN, e.clientY - r.top - MARGIN);
    S.hover = cellFromEvent(e); requestDraw(); updateStatus();
  }, { passive: false });
  // minimap: click or drag to jump
  const mm = document.getElementById('minimap');
  if (mm) {
    let mmDrag = false;
    const jump = e => { const w = minimapToWorld(e); centerOn(Math.floor(w.x), Math.floor(w.y)); requestDraw(); };
    mm.addEventListener('mousedown', e => { mmDrag = true; jump(e); e.stopPropagation(); });
    window.addEventListener('mousemove', e => { if (mmDrag) jump(e); });
    window.addEventListener('mouseup', () => { mmDrag = false; });
  }
  document.getElementById('panel').addEventListener('click', e => asMe(() => onPanelClick(e)));
  document.getElementById('research').addEventListener('click', e => asMe(() => onResearchClick(e)));
  document.getElementById('turn-info').addEventListener('click', e => { if (e.target.closest('#btn-research')) openResearch(); });
  document.getElementById('btn-help').onclick = showRules;
  document.getElementById('btn-summary').onclick = () => reopenSummary();
  const snd = document.getElementById('btn-sound');
  const showSnd = () => { snd.textContent = muted() ? '🔇' : '🔊'; snd.title = muted() ? 'Sound off (click to turn on)' : 'Sound on (click to mute)'; };
  snd.onclick = () => { setMuted(!muted()); showSnd(); };
  showSnd();
  document.getElementById('btn-menu').onclick = () => S.hooks.showMenu();
  window.addEventListener('keydown', e => asMe(() => onKey(e)));
  resize();
}

export function setState(state) {
  S.st = state; S.selectedId = null; S.mode = { kind: 'idle' };
  S.botTurn = false; S.viewer = null; S.tween = null; S.fx = [];
  S.spectate = !state.tutorial && state.players.every(p => p.seat === 'ai'); // all bots: watch the whole map
  refresh();
}

export const refresh = () => asMe(refreshScreen);
function refreshScreen() {
  if (S.planFor !== S.selectedId) { S.planRot = null; S.plan = []; S.planFor = S.selectedId; }
  S.reachCache = null; renderPanel(); renderTop();
  if (S.hooks.afterRender?.(S.st, { selectedId: S.selectedId, mode: S.mode })) { renderPanel(); S.hooks.afterRender?.(S.st, { selectedId: S.selectedId, mode: S.mode }); }
  resize(); draw(); updateStatus(); renderResearch();
}

export const redraw = () => draw();

// End the current player's turn (End turn button, or the turn timer running out).
export function endTurnNow(reason) {
  if (S.st.simul) { S.hooks.simulReady?.(reason); return; } // simultaneous rounds: Ready, not End turn
  closeResearch(); // never leave one player's research on screen for the next
  dispatch({ type: 'endTurn' });
  S.selectedId = null; S.selectedBase = null; S.mode = { kind: 'idle' };
  if (S.st.phase === 'playing') S.hooks.handoff(S.st, reason);
  refresh();
}

// ---------- dispatch ----------
export function dispatch(action) {
  // simultaneous rounds: every action says who's acting (this screen's player)
  if (S.st.simul && S.viewer != null && action.by == null) action = { ...action, by: S.viewer };
  // online, simultaneous, not the host: the move goes to the host, and plays out when it comes back
  if (S.hooks.sendInstead?.(action)) return { ok: true, pending: true };
  const p = S.st.simul && action.by != null ? action.by : S.st.current, shotsBefore = S.st.players[p]?.shots.length || 0;
  const r = E.applyAction(S.st, action);
  if (!r.ok) toast(r.error);
  else if (['act', 'baseStrike', 'satellite'].includes(action.type)) effectsForAction(S.st, action, p, shotsBefore); // shells, missiles, sounds...
  S.hooks.onAction?.(action, r); // online games: send the move to the others
  S.hooks.save(S.st);
  if (S.selectedId && !S.st.ships.find(s => s.id === S.selectedId)) { S.selectedId = null; S.mode = { kind: 'idle' }; }
  if (S.st.phase === 'over') { refresh(); S.hooks.gameOver(S.st); return r; }
  return r;
}
