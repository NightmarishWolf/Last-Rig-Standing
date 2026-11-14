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
