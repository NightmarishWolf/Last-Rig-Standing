// Canvas basics: sizing the board, mouse-to-square, and drawing shapes and outlines.
import { MARGIN } from '../constants.js';
import { me, px, py } from '../helpers.js';
import { S } from '../state.js';
import { clampCam, switchCameraTo } from '../camera.js';

// ---------- geometry ----------
export function resize() {
  // Size from the window (not the page layout) so the board never changes size
  // when the panel, coach box or scrollbar changes.
  const vw = document.documentElement.clientWidth, vh = window.innerHeight;
  const avail = Math.max(300, vw <= 1000 ? vw - 32 : vw - 340 - 48);
  const COACH_SPACE = S.st && S.st.tutorial ? 172 + 10 : 0; // fixed coach height + gap (see .coach in style.css)
  const maxH = vh - 150 - COACH_SPACE;
  const fitCell = Math.floor(Math.min((avail - MARGIN) / S.st.W, (maxH - MARGIN) / S.st.H));
  let w, h;
  if (fitCell >= 16) {
    // small map: show it whole, like a board game
    S.fit = true; S.cell = Math.min(40, fitCell); S.cam.x = 0; S.cam.y = 0;
    w = S.cell * S.st.W + MARGIN; h = S.cell * S.st.H + MARGIN;
  } else {
    // big world: the board fills the space and the camera scrolls
    S.fit = false; w = avail; h = Math.max(300, maxH);
  }
  S.view.w = w - MARGIN; S.view.h = h - MARGIN;
  if (!S.fit) { switchCameraTo(S.spectate ? 'all' : me()); clampCam(); }
  const dpr = window.devicePixelRatio || 1;
  S.canvas.width = w * dpr; S.canvas.height = h * dpr;
  S.canvas.style.width = w + 'px'; S.canvas.style.height = h + 'px';
  S.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

export function cellFromEvent(e) {
  const r = S.canvas.getBoundingClientRect();
  const sx = e.clientX - r.left - MARGIN, sy = e.clientY - r.top - MARGIN;
  if (sx < 0 || sy < 0 || sx > S.view.w || sy > S.view.h) return null;
  const x = Math.floor(sx / S.cell + S.cam.x);
  const y = Math.floor(sy / S.cell + S.cam.y);
  return x >= 0 && y >= 0 && x < S.st.W && y < S.st.H ? { x, y } : null;
}

// draw the outer edge of a set of "x,y" squares
export function outlineArea(set, color, width, dash) {
  S.ctx.strokeStyle = color; S.ctx.lineWidth = width; if (dash) S.ctx.setLineDash(dash);
  S.ctx.beginPath();
  for (const k of set) {
    const [x, y] = k.split(',').map(Number);
    if (!set.has(x + ',' + (y - 1))) { S.ctx.moveTo(px(x), py(y)); S.ctx.lineTo(px(x + 1), py(y)); }
    if (!set.has(x + ',' + (y + 1))) { S.ctx.moveTo(px(x), py(y + 1)); S.ctx.lineTo(px(x + 1), py(y + 1)); }
    if (!set.has((x - 1) + ',' + y)) { S.ctx.moveTo(px(x), py(y)); S.ctx.lineTo(px(x), py(y + 1)); }
    if (!set.has((x + 1) + ',' + y)) { S.ctx.moveTo(px(x + 1), py(y)); S.ctx.lineTo(px(x + 1), py(y + 1)); }
  }
  S.ctx.stroke(); S.ctx.setLineDash([]); S.ctx.lineWidth = 1;
}

export function sightSquares(cells, r) {
  const set = new Set();
  for (const [cx, cy] of cells)
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x >= 0 && y >= 0 && x < S.st.W && y < S.st.H) set.add(x + ',' + y);
    }
  return set;
}

export function ghost(cells, color) {
  S.ctx.fillStyle = color;
  for (const [x, y] of cells) if (x >= 0 && y >= 0 && x < S.st.W && y < S.st.H) { const g = S.cell < 8 ? 0 : 2; roundRect(px(x) + g, py(y) + g, S.cell - g * 2, S.cell - g * 2, Math.min(4, S.cell / 3)); S.ctx.fill(); }
}

export function hatch(x, y, color) {
  S.ctx.save(); S.ctx.beginPath(); S.ctx.rect(px(x), py(y), S.cell, S.cell); S.ctx.clip();
  S.ctx.strokeStyle = color;
  for (let i = -S.cell; i < S.cell; i += 6) { S.ctx.beginPath(); S.ctx.moveTo(px(x) + i, py(y)); S.ctx.lineTo(px(x) + i + S.cell, py(y) + S.cell); S.ctx.stroke(); }
  S.ctx.restore();
}

export function roundRect(x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  S.ctx.beginPath(); S.ctx.moveTo(x + r, y); S.ctx.arcTo(x + w, y, x + w, y + h, r); S.ctx.arcTo(x + w, y + h, x, y + h, r);
  S.ctx.arcTo(x, y + h, x, y, r); S.ctx.arcTo(x, y, x + w, y, r); S.ctx.closePath();
}
