// Tutorial markers: glowing boxes with a label.
import { roundRect } from './canvas.js';
import { MARGIN } from '../constants.js';
import { px, py } from '../helpers.js';
import { S } from '../state.js';

// tutorial markers: glowing boxes with a label
export function drawMarkers() {
  const list = S.hooks.markers?.() || [];
  if (!list.length) return;
  const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 260);
  for (const m of list) {
    const x = px(m.x0), y = py(m.y0), w = S.cell * (m.x1 - m.x0 + 1), h = S.cell * (m.y1 - m.y0 + 1);
    S.ctx.strokeStyle = `rgba(255,214,102,${pulse})`; S.ctx.lineWidth = 3;
    roundRect(x - 2, y - 2, w + 4, h + 4, 6); S.ctx.stroke(); S.ctx.lineWidth = 1;
    if (m.label) {
      S.ctx.font = `bold ${Math.max(11, S.cell * 0.4)}px system-ui`;
      const tw = S.ctx.measureText(m.label).width + 12, th = Math.max(16, S.cell * 0.6);
      const lx = Math.min(Math.max(MARGIN, x + w / 2 - tw / 2), MARGIN + S.cell * S.st.W - tw);
      const ly = y - th - 6 < MARGIN ? y + h + 6 : y - th - 6;
      S.ctx.fillStyle = '#ffd666'; roundRect(lx, ly, tw, th, 4); S.ctx.fill();
      S.ctx.fillStyle = '#2a1e00'; S.ctx.textAlign = 'center'; S.ctx.textBaseline = 'middle';
      S.ctx.fillText(m.label, lx + tw / 2, ly + th / 2 + 1);
    }
  }
}

// mission props: things on a hand-made map that aren't pieces (a dark, stripped rig...)
export function drawProps() {
  for (const p of S.hooks.props?.() || []) {
    if (p.kind === 'village') { // a few roofs and a jetty on the coast
      const x0 = px(p.x), y0 = py(p.y), u = S.cell / 10, c = S.ctx;
      c.save();
      for (let [dx, dy, col] of [[-0.9, -0.1, '#a8413a'], [0.1, -0.45, '#6d5847'], [0.7, 0.25, '#8e2f2a'], [-0.3, 0.55, '#6d5847']]) {
        const hx = x0 + S.cell * (0.5 + dx * 0.6), hy = y0 + S.cell * (0.5 + dy * 0.6);
        c.fillStyle = p.burnt ? '#3a332e' : '#d8cfc0'; c.fillRect(hx - u * 1.6, hy - u * 0.6, u * 3.2, u * 2.2);
        if (p.burnt) col = '#1d1916'; // (burnt out: black roofs and smoke)
        c.fillStyle = col; c.beginPath(); c.moveTo(hx - u * 2, hy - u * 0.4); c.lineTo(hx, hy - u * 2.2); c.lineTo(hx + u * 2, hy - u * 0.4); c.closePath(); c.fill();
        c.fillStyle = '#3a2f28'; c.fillRect(hx - u * 0.35, hy + u * 0.5, u * 0.7, u * 1.1);
        if (p.burnt) { c.fillStyle = 'rgba(70,70,74,.55)'; c.beginPath(); c.arc(hx + u * 0.6, hy - u * 3, u * 1.3, 0, 7); c.arc(hx + u * 1.4, hy - u * 4.6, u * 1.7, 0, 7); c.fill(); }
      }
      if (S.cell >= 18 && p.label) {
        c.font = `600 ${Math.max(10, S.cell * 0.3)}px system-ui`; c.textAlign = 'center'; c.textBaseline = 'top';
        c.fillStyle = 'rgba(0,0,0,.55)'; c.fillText(p.label, x0 + S.cell / 2 + 1, y0 + S.cell + 3);
        c.fillStyle = '#f4e9d4'; c.fillText(p.label, x0 + S.cell / 2, y0 + S.cell + 2);
      }
      c.restore();
    }
    if (p.kind === 'boats') { // small fishing boats pulled up by the shore
      const x0 = px(p.x), y0 = py(p.y), u = S.cell / 10, c = S.ctx;
      c.save();
      for (const [dx, dy, col] of [[2, 3, '#c9a227'], [5.5, 5, '#2f6fb0'], [3, 7, '#a8413a']]) {
        c.fillStyle = col; c.beginPath(); c.ellipse(x0 + u * dx + u * 1.3, y0 + u * dy, u * 1.6, u * 0.6, -0.3, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#2a1a14'; c.lineWidth = 1; c.stroke();
      }
      c.restore();
    }
    if (p.kind === 'terminal') { // the Allocation Terminal: storage tanks on the shore and a jetty
      const x0 = px(p.x), y0 = py(p.y), u = S.cell / 10, c = S.ctx;
      c.save();
      for (const [dx, col] of [[0.5, '#d9dde2'], [1.5, '#c9ced4'], [2.5, '#d9dde2']]) {
        c.fillStyle = col; c.beginPath(); c.arc(x0 + S.cell * dx, y0 + S.cell * 0.45, S.cell * 0.34, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#5a6470'; c.lineWidth = 1.2; c.stroke();
        c.strokeStyle = '#8a949e'; c.beginPath(); c.arc(x0 + S.cell * dx, y0 + S.cell * 0.45, S.cell * 0.2, 0, Math.PI * 2); c.stroke();
      }
      c.fillStyle = '#6b5a48'; c.fillRect(x0 + S.cell * 1.42, y0 + S.cell * 0.8, u * 1.6, S.cell * 0.9); // jetty
      if (S.cell >= 18 && p.label) {
        c.font = `600 ${Math.max(10, S.cell * 0.3)}px system-ui`; c.textAlign = 'center'; c.textBaseline = 'top';
        c.fillStyle = 'rgba(0,0,0,.6)'; c.fillText(p.label, x0 + S.cell * 1.5 + 1, y0 + 3);
        c.fillStyle = '#f4e9d4'; c.fillText(p.label, x0 + S.cell * 1.5, y0 + 2);
      }
      c.restore();
    }
    if (p.kind === 'rafttown') { // a raft town: hulls and decks lashed together around its base
      const c = S.ctx, u = S.cell / 10;
      c.save();
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const x = p.x + dx, y = p.y + dy;
        if ((!dx && !dy) || Math.abs(dx) + Math.abs(dy) > 3 || x < 0 || y < 0 || x >= S.st.W || y >= S.st.H || S.st.land[y * S.st.W + x]) continue;
        if ((S.st.platforms || []).some(o => o.x === x && o.y === y)) continue;
        const x0 = px(x), y0 = py(y), h = (x * 7 + y * 13) % 3;
        c.globalAlpha = 0.9;
        c.fillStyle = p.burnt ? '#2a2420' : ['#8a6a4a', '#7a5e44', '#9a7650'][h];
        c.fillRect(x0 + u * 1.2, y0 + u * (2 + h), u * 7.6, u * 2.4);
        c.fillStyle = p.burnt ? '#1a1512' : p.hospital ? '#ece8e0' : ['#5d7d8a', '#8a4e3a', '#6b7a4a'][h]; // tarps (a hospital raft's are white)
        c.fillRect(x0 + u * (2 + h), y0 + u * 5.4, u * 4.2, u * 2.6);
        if (p.hospital && !p.burnt) { // a red cross painted on each white tarp
          c.fillStyle = '#c8262c';
          c.fillRect(x0 + u * (3.7 + h), y0 + u * 5.8, u * 0.8, u * 1.8);
          c.fillRect(x0 + u * (3.2 + h), y0 + u * 6.3, u * 1.8, u * 0.8);
        }
        c.strokeStyle = p.burnt ? '#120e0c' : '#4a3a2a'; c.lineWidth = Math.max(1, u * 0.4);
        c.beginPath(); c.moveTo(x0 + u * 1, y0 + u * 9); c.lineTo(x0 + u * 9, y0 + u * 9); c.stroke(); // lashing
        if (p.burnt && h === 1) { c.fillStyle = '#f0a531'; c.fillRect(x0 + u * 4, y0 + u * 3, u * 1.2, u * 1.2); }
      }
      c.restore();
    }
    if (p.kind === 'derelictRig') {
      // a dead rig: grey steel, no lights, a sagging derrick and the Tide's flag on top
      const x0 = px(p.x), y0 = py(p.y), u = S.cell / 10, c = S.ctx;
      c.save();
      c.fillStyle = '#0d151d'; c.fillRect(x0 + 2, y0 + 2, S.cell - 4, S.cell - 4);
      c.strokeStyle = '#5d6873'; c.lineWidth = 2; c.setLineDash([3, 3]); c.strokeRect(x0 + 2, y0 + 2, S.cell - 4, S.cell - 4); c.setLineDash([]);
      c.strokeStyle = '#8a949e'; c.lineWidth = Math.max(1.2, u * 0.7); c.beginPath();
      c.moveTo(x0 + u * 2, y0 + u * 7); c.lineTo(x0 + u * 8, y0 + u * 7);
      c.moveTo(x0 + u * 3, y0 + u * 7); c.lineTo(x0 + u * 3, y0 + u * 8.5); c.moveTo(x0 + u * 7, y0 + u * 7); c.lineTo(x0 + u * 7, y0 + u * 8.5);
      c.moveTo(x0 + u * 3.6, y0 + u * 7); c.lineTo(x0 + u * 5.4, y0 + u * 2.2); c.lineTo(x0 + u * 6.4, y0 + u * 7); // (bent)
      c.moveTo(x0 + u * 4.1, y0 + u * 5.4); c.lineTo(x0 + u * 6.0, y0 + u * 5.4);
      c.stroke();
      // the flag: blue with a white wave (once you're close enough to see it)
      if (p.flag) {
      c.strokeStyle = '#2b2b2b'; c.lineWidth = 1; c.beginPath(); c.moveTo(x0 + u * 5.4, y0 + u * 2.2); c.lineTo(x0 + u * 5.4, y0 + u * 0.6); c.stroke();
      c.fillStyle = '#2f6fb0'; c.fillRect(x0 + u * 5.4, y0 + u * 0.6, u * 2.6, u * 1.6);
      c.strokeStyle = '#f4f1ea'; c.lineWidth = Math.max(1, u * 0.35); c.beginPath(); c.moveTo(x0 + u * 5.6, y0 + u * 1.6); c.quadraticCurveTo(x0 + u * 6.4, y0 + u * 0.8, x0 + u * 7.8, y0 + u * 1.5); c.stroke();
      }
      c.restore();
    }
  }
}
