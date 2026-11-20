// Drawing fleets, standing orders and shipyards on the board.
import * as E from '../../engine/index.js';
import { FLEET, STANDING } from '../../data/production.js';
import { SHIPS } from '../../data/ships.js';
import { ghost, outlineArea, roundRect } from './canvas.js';
import { centerOffset, me, px, py, selected } from '../helpers.js';
import { S } from '../state.js';

const GOLD = '#ffd666';
const mid = (s, x = s.x, y = s.y, r = s.rot) => { const [ox, oy] = centerOffset(s.type, r); return [px(x + ox) + S.cell / 2, py(y + oy) + S.cell / 2]; };
const outline = (s, color, dash = [4, 3], w = 2) => outlineArea(new Set(E.shipCells(s).map(c => c.join(','))), color, w, dash);

// Small badges on your own ships: ⚑ for fleet members (★ for the flagship), and a standing-order icon.
export function drawUnitBadges(v) {
  if (S.cell < 14) return;
  const ctx = S.ctx, sz = Math.max(9, Math.round(S.cell * 0.36));
  ctx.font = `${sz}px system-ui`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  for (const s of v.myShips) {
    const f = E.fleetOf(S.st, s.id);
    const o = (f || s).standing;
    const low = E.lowOnSupplies(s) && v.me.faction !== 'tide'; // (Navy: −1 damage until it's back in supply)
    if (!f && !o && !low) continue;
    const cells = E.shipCells(s);
    const x0 = Math.min(...cells.map(c => c[0])), y0 = Math.min(...cells.map(c => c[1]));
    const bx = px(x0) + 1, by = py(y0) - 1;
    const label = (f ? (f.leader === s.id ? '★' : '⚑') : '') + (o ? STANDING[o.kind].icon : '') + (low ? '📦' : '');
    const w = ctx.measureText(label).width + 4;
    ctx.fillStyle = 'rgba(8,18,28,0.85)'; roundRect(bx - 1, by, w, sz + 2, 3); ctx.fill();
    ctx.fillStyle = GOLD; ctx.fillText(label, bx + 1, by + 1);
  }
}

// Shipyards that are building: a ⚒ badge with the number of ships in line.
export function drawYardBadges() {
  const p = me(), builds = E.buildsOf(S.st, p);
  if (!builds.length || S.cell < 6) return;
  const ctx = S.ctx;
  for (const y of E.yardsOf(S.st, p)) {
    const n = builds.filter(b => b.yard === y.id).length;
    if (!n) continue;
    const text = `⚒ ${n}`, fs = Math.max(10, Math.min(13, S.cell * 0.45));
    ctx.font = `bold ${fs}px system-ui`;
    const w = ctx.measureText(text).width + 10, x = px(y.x) + S.cell / 2 - w / 2, yy = py(y.y) - fs - 8;
    ctx.fillStyle = 'rgba(8,18,28,0.9)'; roundRect(x, yy, w, fs + 6, 4); ctx.fill();
    ctx.strokeStyle = '#2bb3a3'; ctx.lineWidth = 1.5; roundRect(x, yy, w, fs + 6, 4); ctx.stroke(); ctx.lineWidth = 1;
    ctx.fillStyle = '#e8eef4'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x + w / 2, yy + (fs + 6) / 2 + 1);
  }
}

// A dashed line through points (in anchor coordinates of ship s), optionally closed into a loop.
function pathLine(s, pts, color, loop) {
  const ctx = S.ctx;
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash([7, 5]);
  ctx.beginPath();
  pts.forEach((q, i) => { const [x, y] = mid(s, q.x, q.y); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
  if (loop && pts.length > 1) ctx.closePath();
  ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1;
  pts.forEach((q, i) => {
    const [x, y] = mid(s, q.x, q.y), r = Math.max(6, Math.min(10, S.cell * 0.35));
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0a1a26'; ctx.font = `bold ${Math.round(r * 1.1)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), x, y + 1);
  });
}

// The flagship's route, cached until something moves.
let routeCache = null;
function fleetRoute(f, L) {
  const key = `${f.id}|${L.x},${L.y},${L.rot}|${JSON.stringify(f.order.points)}|${S.st.turnCount}|${S.st.ships.length}`;
  if (routeCache?.key !== key) routeCache = { key, legs: E.routeThrough(S.st, L, f.order.points.map(q => ({ x: q.x, y: q.y, rot: null }))) };
  return routeCache.legs;
}

// The selected ship's fleet and standing orders, and the fleet/patrol/escort picking modes.
export function drawFleetOverlay() {
  const st = S.st, s = selected(), ctx = S.ctx;
  // forming a fleet: picked ships, and the join range around the first one
  if (S.mode.kind === 'fleetPick') {
    const ships = S.mode.ids.map(id => st.ships.find(x => x.id === id)).filter(Boolean);
    const lead = [...ships].sort((a, b) => SHIPS[b.type].cost - SHIPS[a.type].cost)[0];
    if (lead) {
      const R = FLEET.joinRange;
      ctx.strokeStyle = 'rgba(255,214,102,0.6)'; ctx.setLineDash([6, 6]); ctx.lineWidth = 1.5;
      ctx.strokeRect(px(lead.x - R), py(lead.y - R), S.cell * (2 * R + 1), S.cell * (2 * R + 1));
      ctx.setLineDash([]); ctx.lineWidth = 1;
    }
    for (const x of ships) { ghost(E.shipCells(x), 'rgba(255,214,102,0.35)'); outline(x, GOLD, [], 2.5); }
    return;
  }
  if (!s) return;
  const f = E.fleetOf(st, s.id);
  if (f) {
    const L = E.flagship(st, f);
    // every member, plus a ghost where stragglers should be
    for (const m of f.members) {
      const x = st.ships.find(o => o.id === m.id);
      if (!x) continue;
      outline(x, 'rgba(255,214,102,0.85)');
      const want = { x: L.x + m.dx, y: L.y + m.dy };
      if (x.x !== want.x || x.y !== want.y) {
        outlineArea(new Set(E.cellsOf(x.type, want.x, want.y, x.rot).map(c => c.join(','))), 'rgba(255,214,102,0.45)', 1.5, [2, 3]);
        ctx.strokeStyle = 'rgba(255,214,102,0.35)'; ctx.setLineDash([2, 4]);
        ctx.beginPath(); ctx.moveTo(...mid(x)); ctx.lineTo(...mid(x, want.x, want.y)); ctx.stroke(); ctx.setLineDash([]);
      }
    }
    // the fleet's route (the flagship's course)
    if (f.order?.points?.length && !S.plan.length) {
      const legs = fleetRoute(f, L);
      const path = legs ? legs.flat() : null;
      if (path?.length) {
        ctx.strokeStyle = 'rgba(255,214,102,0.85)'; ctx.lineWidth = Math.max(1.5, Math.min(3, S.cell * 0.12)); ctx.setLineDash([6, 5]);
        ctx.beginPath(); ctx.moveTo(...mid(L));
        for (const n of path) ctx.lineTo(...mid(L, n.x, n.y, n.r));
        ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1;
        const e = path[path.length - 1];
        for (const m of f.members) {
          const x = st.ships.find(o => o.id === m.id);
          if (x) ghost(E.cellsOf(x.type, e.x + m.dx, e.y + m.dy, x === L ? e.r : x.rot), 'rgba(255,214,102,0.25)');
        }
        const turns = Math.ceil(path.length / Math.max(1, E.fleetSpeed(st, f)));
        const label = `Fleet ${f.name}: ${turns} turn${turns > 1 ? 's' : ''}`;
        ctx.font = 'bold 12px system-ui';
        const [ex, ey] = mid(L, e.x, e.y, e.r);
        const tw = ctx.measureText(label).width + 12;
        ctx.fillStyle = 'rgba(8,18,28,0.92)'; roundRect(ex + S.cell / 2, ey - S.cell / 2 - 18, tw, 18, 4); ctx.fill();
        ctx.fillStyle = GOLD; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(label, ex + S.cell / 2 + 6, ey - S.cell / 2 - 8.5);
      }
    }
  }
  // standing orders of the selected ship (or its fleet)
  const unit = f || s, o = unit.standing, lead = f ? E.flagship(st, f) : s;
  if (o?.kind === 'patrol' && S.mode.kind !== 'patrolPick') pathLine(lead, o.points, 'rgba(111,214,255,0.9)', true);
  if (o?.kind === 'guard') {
    const [x, y] = mid(lead, o.x, o.y), r = S.cell * 2.2;
    ctx.strokeStyle = 'rgba(127,209,122,0.9)'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1;
    ctx.fillStyle = 'rgba(127,209,122,0.95)'; ctx.font = `${Math.max(12, S.cell * 0.6)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('⚓', x, y - r - 2);
  }
  if (o?.kind === 'escort') {
    const t = st.ships.find(x => x.id === o.target);
    if (t) {
      ctx.strokeStyle = 'rgba(191,160,255,0.9)'; ctx.lineWidth = 2; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(...mid(lead)); ctx.lineTo(...mid(t)); ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1;
      outline(t, 'rgba(191,160,255,0.95)', [3, 3]);
    }
  }
  if (o?.kind === 'explore' && o.target) {
    const [x, y] = mid(lead, o.target.x, o.target.y);
    ctx.fillStyle = 'rgba(255,214,102,0.9)'; ctx.font = `${Math.max(12, S.cell * 0.6)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🧭', x, y);
  }
  // picking patrol points: the loop so far, plus where the mouse is
  if (S.mode.kind === 'patrolPick') {
    const pts = [{ x: lead.x, y: lead.y }, ...S.mode.points];
    if (S.hover) {
      const [ox, oy] = centerOffset(s.type, s.rot);
      const m = f && f.members.find(x => x.id === s.id);
      pts.push({ x: S.hover.x - ox - (m ? m.dx : 0), y: S.hover.y - oy - (m ? m.dy : 0) });
    }
    pathLine(lead, pts, 'rgba(111,214,255,0.9)', true);
  }
  // picking a ship to escort: outline the candidates
  if (S.mode.kind === 'escortPick') for (const x of st.ships.filter(x => x.owner === s.owner && x.id !== s.id && !(f && E.fleetOf(st, x.id) === f))) outline(x, 'rgba(191,160,255,0.8)', [3, 3]);
}
