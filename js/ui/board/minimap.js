// Minimap: the whole world in the corner of the board. Click or drag on it to move the camera.
import { fogImage } from './fog.js';
import { terrainImage } from './render.js';
import { viewSquares } from '../camera.js';
import { me, pcol } from '../helpers.js';
import { S } from '../state.js';
import * as E from '../../engine/index.js';

const MAX_W = 230, MAX_H = 160;

export function minimapSize() {
  const k = Math.min(MAX_W / S.st.W, MAX_H / S.st.H);
  return { w: Math.round(S.st.W * k), h: Math.round(S.st.H * k), k };
}

export function drawMinimap(v) {
  const el = document.getElementById('minimap');
  if (!el) return;
  if (S.fit) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  const { w, h, k } = minimapSize();
  const dpr = window.devicePixelRatio || 1;
  if (el.width !== w * dpr) { el.width = w * dpr; el.height = h * dpr; el.style.width = w + 'px'; el.style.height = h + 'px'; }
  const g = el.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.imageSmoothingEnabled = true;
  g.drawImage(terrainImage(me()), 0, 0, w, h);
  if (S.fogCanvas) g.drawImage(S.fogCanvas, 0, 0, w, h);
  const dot = (x, y, col, r = 1.6) => { g.fillStyle = col; g.fillRect(x * k - r / 2, y * k - r / 2, Math.max(r, k), Math.max(r, k)); };
  for (const d of v.deposits) if (d.reserves > 0) dot(d.x, d.y, '#f0a531', 1.4);
  for (const r of v.myRigs) dot(r.x, r.y, pcol(me()), 3);
  for (const r of v.enemyRigs) dot(r.x, r.y, pcol(r.owner), 3);
  for (const o of [...v.myPorts, ...v.enemyPorts]) dot(o.x, o.y, '#ffffff', 3);
  for (const b of [...v.myBases, ...v.enemyBases]) if (!b.wrecked) { g.strokeStyle = pcol(b.owner); g.lineWidth = 1.5; const r = E.baseRadius(S.st, b) + 0.5; g.strokeRect((b.x - r + 0.5) * k, (b.y - r + 0.5) * k, 2 * r * k, 2 * r * k); }
  for (const s of v.enemyShips) for (const [x, y] of s.cells) dot(x, y, '#ff4d4d', 2.5);
  for (const s of v.myShips) { const c = E.shipCells(s); dot(c[0][0], c[0][1], s.id === S.selectedId ? '#ffffff' : pcol(me()), 3); }
  // the camera's view
  const vs = viewSquares();
  g.strokeStyle = '#ffffff'; g.lineWidth = 1.5;
  g.strokeRect(S.cam.x * k, S.cam.y * k, vs.w * k, vs.h * k);
}

// minimap pixel -> world square
export function minimapToWorld(e) {
  const el = document.getElementById('minimap');
  const r = el.getBoundingClientRect();
  const { k } = minimapSize();
  return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k };
}
