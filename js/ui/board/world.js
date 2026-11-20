// Drawing the world around the players: pack ice, oil slicks, the super-rich field's marked area,
// storms and fog banks (with a dashed preview of whatever's announced for next round), and blowouts.
// Weather and announcements are public, so everyone sees them whatever the fog.
import * as E from '../../engine/index.js';
import { EVENTS } from '../../data/events.js';
import { px, py } from '../helpers.js';
import { S } from '../state.js';
import { iceArt } from './landart.js';

// under the units: ice, slicks, field areas
export function drawWorldBelow(R, detail) {
  const st = S.st, ctx = S.ctx, cell = S.cell;
  if (st.ice) {
    // the painted floes (redrawn when an Icebreaker cracks some)
    const art = iceArt(st);
    const sx = Math.max(0, R.x0 - 1), sy = Math.max(0, R.y0 - 1), sw = Math.min(st.W, R.x1 + 2) - sx, sh = Math.min(st.H, R.y1 + 2) - sy;
    if (art && sw > 0 && sh > 0) {
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(art.canvas, sx * art.s, sy * art.s, sw * art.s, sh * art.s, px(sx), py(sy), sw * cell, sh * cell);
    }
    void detail;
  }
  for (const s of st.spills || []) {
    const x0 = Math.max(0, s.x - s.r), y0 = Math.max(0, s.y - s.r), x1 = Math.min(st.W - 1, s.x + s.r), y1 = Math.min(st.H - 1, s.y + s.r);
    if (x1 < R.x0 || x0 > R.x1 || y1 < R.y0 || y0 > R.y1) continue;
    // a dark, oily sheen (fading as it clears)
    const fade = Math.min(1, s.left / 6);
    const g = ctx.createRadialGradient(px(s.x) + cell / 2, py(s.y) + cell / 2, cell * 0.3, px(s.x) + cell / 2, py(s.y) + cell / 2, cell * (s.r + 1));
    g.addColorStop(0, `rgba(10, 8, 6, ${0.75 * fade})`); g.addColorStop(0.6, `rgba(40, 30, 60, ${0.55 * fade})`); g.addColorStop(1, `rgba(60, 90, 80, ${0.25 * fade})`);
    ctx.fillStyle = g;
    ctx.fillRect(px(x0), py(y0), cell * (x1 - x0 + 1), cell * (y1 - y0 + 1));
    if (detail) label(`🛢️ ${s.left}`, px(s.x) + cell / 2, py(y0) - 2, 'rgba(10,8,6,.8)');
  }
  for (const e of [...(st.events?.active || []).filter(e => e.kind === 'field'), ...(st.events?.pending?.kind === 'field' ? [st.events.pending] : [])])
    zone(e, 'rgba(120, 220, 255, 0.9)', 'rgba(120, 220, 255, 0.07)', `💎 Super-rich field somewhere here${e === st.events.pending ? ' (next round)' : ''}`, true);
}

// over the units: weather, announced events, blowouts
export function drawWorldAbove() {
  const st = S.st, ctx = S.ctx, cell = S.cell, ev = st.events;
  if (!ev) return;
  for (const e of ev.active) {
    if (e.kind === 'storm') zone(e, 'rgba(160, 175, 210, 0.7)', 'rgba(70, 80, 110, 0.35)', `🌩️ Storm · ${e.until - st.round + 1} round${e.until - st.round ? 's' : ''} left`);
    if (e.kind === 'fogbank') zone(e, 'rgba(230, 235, 240, 0.5)', 'rgba(220, 228, 235, 0.42)', `🌫️ Fog bank · ${e.until - st.round + 1} round${e.until - st.round ? 's' : ''} left`);
    if (e.kind === 'blowout') {
      const r = st.rigs.find(x => x.id === e.rigId);
      if (r?.blowout) { ctx.font = `${Math.max(10, cell * 0.8)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🔥', px(r.x) + cell / 2, py(r.y) - cell * 0.3); }
    }
    if (e.kind === 'rogue') zone(e, 'rgba(214, 69, 93, 0.6)', null, '🦈 Rogue submarine hunting ground', true);
  }
  // next round's event: a dashed preview where we know the place
  const p = ev.pending;
  if (p && p.kind === 'storm') zone(p, 'rgba(160, 175, 210, 0.8)', null, '🌩️ Storm arriving next round', true);
  if (p && p.kind === 'fogbank') zone(p, 'rgba(230, 235, 240, 0.8)', null, '🌫️ Fog bank next round', true);
  if (p && (p.kind === 'pirates' || p.kind === 'rogue')) zone({ ...p, r: p.r || 5 }, 'rgba(214, 69, 93, 0.9)', null, `${EVENTS[p.kind].icon} ${EVENTS[p.kind].name} next round`, true);
}

function zone(e, stroke, fill, text, dashed = false) {
  const ctx = S.ctx, cell = S.cell;
  const x0 = px(e.x - e.r), y0 = py(e.y - e.r), w = cell * (2 * e.r + 1);
  if (fill) { ctx.fillStyle = fill; ctx.fillRect(x0, y0, w, w); }
  ctx.strokeStyle = stroke; ctx.lineWidth = 2;
  if (dashed) ctx.setLineDash([8, 6]);
  ctx.strokeRect(x0 + 1, y0 + 1, w - 2, w - 2);
  ctx.setLineDash([]); ctx.lineWidth = 1;
  if (cell >= 5) label(text, x0 + w / 2, y0 - 2, 'rgba(7,19,31,.85)');
}
function label(text, x, y, bg) {
  const ctx = S.ctx;
  ctx.font = '600 12px system-ui';
  const w = ctx.measureText(text).width + 10;
  ctx.fillStyle = bg; ctx.fillRect(x - w / 2, y - 18, w, 17);
  ctx.fillStyle = '#e6eef5'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y - 9);
}
export const worldTip = (x, y) => {
  const st = S.st, out = [];
  if (st.ice?.[y * st.W + x]) out.push({ t: '🧊 Pack ice: only an Icebreaker can sail here' });
  const s = E.spillAt(st, x, y);
  if (s) out.push({ t: `🛢️ Oil slick (${s.left} round${s.left > 1 ? 's' : ''} left): double oil to sail through, no rigs can be built` });
  for (const e of st.events?.active || []) if (e.r && E.inZone(e, x, y)) {
    if (e.kind === 'storm') out.push({ t: '🌩️ Storm: half speed, no aircraft' });
    if (e.kind === 'fogbank') out.push({ t: '🌫️ Fog bank: sight 1' });
    if (e.kind === 'field') out.push({ t: '💎 The super-rich field is somewhere in this area: survey it' });
  }
  return out;
};
