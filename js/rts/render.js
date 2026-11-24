// ============================================================
// RTS · drawing. The sea and islands are the game's own art (landart.js), ships and platforms its sprites
// turned to any heading. Then oil deposits, base claims, shells and explosions, health and build bars, the
// fog of war, selection rings, where the selected ships are going, rally flags, the ghost of a platform
// you're placing, an ability's range while you aim it, and the box you're dragging.
// V.me is the player whose eyes we see through (V.all: a spectator, sees everything).
// ============================================================
import { drawLand, waterArt } from '../ui/board/landart.js';
import { SPRITES, shipSVG } from '../ui/board/shipart.js';
import { structSVG, hasStructArt } from '../ui/board/structart.js';
import { UNITS, PLATS, SPRITE_K, BASE_LEVELS } from './data.js';
import { radiusOf, seen, TEAM_COLORS, claimOf } from './sim.js';

const pics = new Map();
function pic(key, svg, w, h) {
  let e = pics.get(key);
  if (e) return e.ready ? e.c : null;
  e = { ready: false }; pics.set(key, e);
  const img = new Image();
  img.onload = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h); e.c = c; e.ready = true; };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  return null;
}
const shipPic = (type, col) => { const [w, h] = SPRITES[type]; return pic('s' + type + col, shipSVG(type, col), w * 64, h * 64); };
const structPic = (kind, col, tide) => pic('p' + kind + col + tide, structSVG(hasStructArt(kind) ? kind : 'rig', col, tide), 128, 128);
export const structSize = s => (s.type === 'base' ? (s.capital ? 2.1 : 1.15 + s.level * 0.12) : 1);

export function render(V, G) {
  const { ctx: g, cam, cell, w, h } = V, m = G.m, me = V.me;
  if (!V.terrain || V.terrain.m !== m) V.terrain = { m, st: { W: m.W, H: m.H, land: Array.from(m.land), seed: m.seed * 97 + 11, mapType: m.mapType || 'classic' } };
  const T = V.terrain.st;
  const sx = x => (x - cam.x) * cell, sy = y => (y - cam.y) * cell;
  g.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
  g.fillStyle = '#04101b'; g.fillRect(0, 0, w, h);
  const x0 = Math.max(0, Math.floor(cam.x)), y0 = Math.max(0, Math.floor(cam.y)), x1 = Math.min(m.W, Math.ceil(cam.x + w / cell)), y1 = Math.min(m.H, Math.ceil(cam.y + h / cell));
  if (x1 > x0 && y1 > y0) {
    const wa = waterArt(T); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(wa.canvas, x0 * wa.s, y0 * wa.s, (x1 - x0) * wa.s, (y1 - y0) * wa.s, sx(x0), sy(y0), (x1 - x0) * cell, (y1 - y0) * cell);
    drawLand(g, T, x0, y0, x1 - x0, y1 - y0, sx(x0), sy(y0), cell);
  }
  const all = V.all || G.cfg.fog === 'off';
  const vis = G.vis[me], exp = G.explored[me];
  const visible = (x, y) => all || !!vis[(y | 0) * m.W + (x | 0)], explored = (x, y) => all || !!exp[(y | 0) * m.W + (x | 0)];
  const onScr = (x, y, r = 2) => x > cam.x - r && y > cam.y - r && x < cam.x + w / cell + r && y < cam.y + h / cell + r;
  const mates = t => t === me || G.players[me]?.allies?.includes(t);

  // oil deposits nobody's drilling (seen once explored); a ring shows what's left in them
  for (const d of m.deposits) {
    if (!onScr(d.x, d.y) || !explored(d.x, d.y)) continue;
    if (G.structs.some(s => s.dep === d.id && (s.type === 'base' || s.type === 'wellhead') && (mates(s.team) || explored(s.x, s.y)))) continue;
    const r = cell * 0.3, X = sx(d.x), Y = sy(d.y), dry = d.reserves <= 0;
    g.fillStyle = dry ? 'rgba(120,120,120,.6)' : 'rgba(18,10,2,.85)'; g.beginPath(); g.ellipse(X, Y, r * 1.5, r * 1.1, 0.3, 0, Math.PI * 2); g.fill();
    g.fillStyle = dry ? '#777' : '#f0a531'; g.beginPath(); g.arc(X, Y, r * 0.75, 0, Math.PI * 2); g.fill();
    if (!dry && d.max) { g.strokeStyle = 'rgba(240,165,49,.8)'; g.lineWidth = 2; g.beginPath(); g.arc(X, Y, r * 1.05, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * d.reserves / d.max); g.stroke(); }
    if (cell >= 16) { g.fillStyle = '#1a1005'; g.font = `bold ${Math.round(cell * 0.28)}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(d.type[0].toUpperCase(), X, Y + 1); }
  }

  // the Tide: a faint wash of the owner's colour round Free Tide bases (and Leviathans)
  for (const P of G.players) {
    if (P.side !== 'tide' || !G.tide?.[P.id]?.length || (!mates(P.id) && !all && !G.tide[P.id].some(t => visible(t.x, t.y)))) continue;
    g.save(); g.globalAlpha = mates(P.id) ? 0.13 : 0.09; g.fillStyle = P.color; g.beginPath();
    for (const t of G.tide[P.id]) { if (!onScr(t.x, t.y, t.r + 1)) continue; g.moveTo(sx(t.x) + t.r * cell, sy(t.y)); g.arc(sx(t.x), sy(t.y), t.r * cell, 0, Math.PI * 2); }
    g.fill(); g.restore();
  }
  // oil slicks (burning ones flicker orange)
  for (const k of G.slicks) {
    if (!onScr(k.x, k.y, k.r + 1) || !explored(k.x, k.y)) continue;
    const burn = k.burnUntil > G.t, X = sx(k.x), Y = sy(k.y), R = k.r * cell, fade = Math.min(1, (k.until - G.t) / 10);
    const gr = g.createRadialGradient(X, Y, R * 0.2, X, Y, R);
    gr.addColorStop(0, burn ? `rgba(255,120,30,${0.55 * fade})` : `rgba(10,8,14,${0.7 * fade})`); gr.addColorStop(1, burn ? 'rgba(255,60,0,0)' : 'rgba(40,30,60,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(X, Y, R, 0, Math.PI * 2); g.fill();
    if (burn && cell >= 10) for (let i = 0; i < 5; i++) { const a = G.t * 2 + i * 1.3, rr = R * (0.2 + 0.6 * ((i * 0.37 + G.t * 0.5) % 1)); g.fillStyle = `rgba(255,${150 + i * 15},60,${0.5 * fade})`; g.beginPath(); g.arc(X + Math.cos(a) * rr, Y + Math.sin(a) * rr, cell * 0.12, 0, Math.PI * 2); g.fill(); }
  }
  // super-rich field markers (everyone sees the circle)
  for (const f of G.fields) { g.strokeStyle = 'rgba(255,214,102,.75)'; g.lineWidth = 2; g.setLineDash([8, 6]); g.beginPath(); g.arc(sx(f.x), sy(f.y), f.r * cell, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); if (cell >= 8) { g.fillStyle = '#ffd666'; g.font = `bold ${Math.max(11, cell * 0.5)}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('💎', sx(f.x), sy(f.y)); } }
  // base claims: a selected base's, or all of yours while you place a platform
  const claims = G.structs.filter(s => s.type === 'base' && s.built >= 1 && s.team === me && (V.place && V.place !== 'base' ? true : V.sel.has(s.id)));
  for (const b of claims) {
    const c = claimOf(G, b), bx = Math.floor(b.x), by = Math.floor(b.y);
    g.strokeStyle = 'rgba(255,214,102,.6)'; g.fillStyle = 'rgba(255,214,102,.05)'; g.lineWidth = 1.5; g.setLineDash([6, 5]);
    g.fillRect(sx(bx - c), sy(by - c), (c * 2 + 1) * cell, (c * 2 + 1) * cell); g.strokeRect(sx(bx - c), sy(by - c), (c * 2 + 1) * cell, (c * 2 + 1) * cell); g.setLineDash([]);
  }

  // structures (yours always; theirs where you've explored)
  for (const s of G.structs) {
    if (!onScr(s.x, s.y, 3)) continue;
    if (!mates(s.team) && !explored(s.x, s.y)) continue;
    const size = cell * structSize(s), X = sx(s.x), Y = sy(s.y), tide = G.players[s.team]?.side === 'tide';
    const p = structPic(s.type === 'base' ? 'rig' : s.type, colOf(G, s.team), tide);
    g.globalAlpha = s.built < 1 ? 0.5 : !mates(s.team) && !visible(s.x, s.y) ? 0.65 : 1;
    if (p) { g.imageSmoothingEnabled = true; g.drawImage(p, X - size / 2, Y - size / 2, size, size); }
    else { g.fillStyle = colOf(G, s.team); g.fillRect(X - size / 3, Y - size / 3, size / 1.5, size / 1.5); }
    g.globalAlpha = 1;
    if (s.built < 1) { g.strokeStyle = '#ffd666'; g.lineWidth = 1.5; g.setLineDash([3, 3]); g.strokeRect(X - size / 2 + 1, Y - size / 2 + 1, size - 2, size - 2); g.setLineDash([]); bar(g, X, Y + size * 0.5 + 2, size * 0.9, s.built, '#ffd666'); }
    if (s.type === 'base') {
      // (the Admiralty gets a star; every base shows its level as pips)
      if (s.capital) badge(g, X + size * 0.4, Y - size * 0.4, Math.max(7, cell * 0.28), '★', '#ffd666');
      if (cell >= 12) for (let i = 0; i < s.level; i++) { g.fillStyle = colOf(G, s.team); g.strokeStyle = '#000'; g.lineWidth = 1; g.beginPath(); g.arc(X - size * 0.3 + i * Math.max(5, cell * 0.2), Y + size * 0.42, Math.max(2, cell * 0.07), 0, Math.PI * 2); g.fill(); g.stroke(); }
      if (s.upgrading && mates(s.team)) bar(g, X, Y + size * 0.5 + 6, size * 0.9, s.upgrading.t / s.upgrading.need, '#8ecbff');
    }
    if (s.queue?.length && mates(s.team)) bar(g, X, Y + size * 0.5 + (s.upgrading ? 11 : 6), size * 0.9, s.queue[0].t / UNITS[s.queue[0].type].build, '#2bb3a3');
    if (V.sel.has(s.id) || (s.hp < s.max && s.built >= 1)) bar(g, X, Y - size * 0.5 - 6, size * 0.9, s.hp / s.max, hpCol(s.hp / s.max));
    if (V.sel.has(s.id)) ring(g, X, Y, size * 0.6, mates(s.team));
    if (s.hitAt && G.t - s.hitAt < 0.15) { g.strokeStyle = 'rgba(255,90,70,.8)'; g.lineWidth = 2; g.strokeRect(X - size / 2, Y - size / 2, size, size); }
  }

  // ships
  for (const u of G.units) {
    if (!onScr(u.x, u.y)) continue;
    if (!mates(u.team) && !(V.all ? true : seen(G, me, u))) continue;
    const d = UNITS[u.type], [sw, sh] = SPRITES[u.type], k = SPRITE_K * cell, X = sx(u.x), Y = sy(u.y);
    if (V.sel.has(u.id)) ring(g, X, Y, radiusOf(u) * cell * 1.2, mates(u.team));
    const p = shipPic(u.type, colOf(G, u.team));
    g.save(); g.translate(X, Y); g.rotate(u.a);
    if (d.submerged) g.globalAlpha = 0.45;
    if (p) g.drawImage(p, -sw * k / 2, -sh * k / 2, sw * k, sh * k);
    else { g.fillStyle = colOf(G, u.team); g.fillRect(-sw * k / 2, -sh * k / 3, sw * k, sh * k / 1.5); }
    g.restore();
    if (V.sel.has(u.id) || u.hp < u.max) bar(g, X, Y - radiusOf(u) * cell - 7, Math.max(18, radiusOf(u) * cell * 1.8), u.hp / u.max, hpCol(u.hp / u.max));
    if (u.order.type === 'build' && V.sel.has(u.id)) { g.strokeStyle = 'rgba(255,214,102,.7)'; g.lineWidth = 1.5; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(X, Y); g.lineTo(sx(u.order.x), sy(u.order.y)); g.stroke(); g.setLineDash([]); }
  }
  // repair rings round a selected repair ship / dry dock
  for (const id of V.sel) {
    const e = G.index?.get(id); if (!e || !mates(e.team)) continue;
    const aura = e.kind === 'unit' ? UNITS[e.type].abilities.find(a => a.kind === 'aura')?.range : e.type === 'drydock' ? 2.5 : 0;
    if (aura) { g.strokeStyle = 'rgba(127,209,122,.45)'; g.lineWidth = 1.5; g.setLineDash([3, 4]); g.beginPath(); g.arc(sx(e.x), sy(e.y), aura * cell, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); }
  }

  // where the selected ships are headed
  g.lineWidth = 1.5;
  for (const id of V.sel) {
    const u = G.index?.get(id); if (!u || u.kind !== 'unit' || !mates(u.team) || !u.path.length) continue;
    g.strokeStyle = u.order.type === 'amove' || u.order.type === 'attack' ? 'rgba(255,120,100,.55)' : 'rgba(140,255,200,.45)'; g.setLineDash([5, 5]);
    g.beginPath(); g.moveTo(sx(u.x), sy(u.y)); for (const [x, y] of u.path) g.lineTo(sx(x), sy(y)); g.stroke(); g.setLineDash([]);
    const [lx, ly] = u.path[u.path.length - 1]; g.fillStyle = g.strokeStyle; g.beginPath(); g.arc(sx(lx), sy(ly), 3, 0, Math.PI * 2); g.fill();
  }
  // a selected yard's rally point
  for (const id of V.sel) {
    const s = G.index?.get(id); if (!s?.rally || s.team !== me) continue;
    const X = sx(s.rally.x), Y = sy(s.rally.y);
    g.strokeStyle = 'rgba(255,214,102,.35)'; g.setLineDash([3, 5]); g.beginPath(); g.moveTo(sx(s.x), sy(s.y)); g.lineTo(X, Y); g.stroke(); g.setLineDash([]);
    g.strokeStyle = '#ffd666'; g.lineWidth = 2; g.beginPath(); g.moveTo(X, Y); g.lineTo(X, Y - 16); g.stroke();
    g.fillStyle = '#ffd666'; g.beginPath(); g.moveTo(X, Y - 16); g.lineTo(X + 11, Y - 12); g.lineTo(X, Y - 8); g.fill();
  }
  // shells and missiles
  for (const s of G.shots) {
    if (s.delay > 0 || !visible(s.x, s.y) || !onScr(s.x, s.y)) continue;
    if (s.big || s.air) { const a = Math.atan2(s.ty - s.y, s.tx - s.x); g.strokeStyle = 'rgba(255,200,140,.5)'; g.lineWidth = 2; g.beginPath(); g.moveTo(sx(s.x), sy(s.y)); g.lineTo(sx(s.x - Math.cos(a) * 0.6), sy(s.y - Math.sin(a) * 0.6)); g.stroke(); }
    g.fillStyle = s.torpedo ? '#9fe3ff' : '#fff3c4'; g.beginPath(); g.arc(sx(s.x), sy(s.y), Math.max(1.8, cell * (s.big ? 0.11 : 0.07)), 0, Math.PI * 2); g.fill();
  }
  // effects
  for (const f of G.fx) {
    const k = f.t / f.life, X = sx(f.x), Y = sy(f.y);
    if (!onScr(f.x, f.y)) continue;
    if (f.kind === 'ping') { g.strokeStyle = f.col; g.globalAlpha = 1 - k; g.lineWidth = 2; g.beginPath(); g.ellipse(X, Y, cell * (0.2 + k * 0.5), cell * (0.15 + k * 0.4), 0, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1; continue; }
    if (f.kind === 'scan') { if (f.team !== undefined && !mates(f.team) && !V.all) continue; g.strokeStyle = `rgba(142,203,255,${1 - k})`; g.lineWidth = 2; g.beginPath(); g.arc(X, Y, cell * f.r * (0.3 + k * 0.7), 0, Math.PI * 2); g.stroke(); continue; }
    if (!visible(f.x, f.y)) continue;
    if (f.kind === 'flash') { g.fillStyle = `rgba(255,230,150,${1 - k})`; g.beginPath(); g.arc(X + Math.cos(f.a) * f.r * cell * 0.6, Y + Math.sin(f.a) * f.r * cell * 0.6, cell * 0.16, 0, Math.PI * 2); g.fill(); }
    else if (f.kind === 'hit') { g.strokeStyle = f.aa ? `rgba(142,203,255,${1 - k})` : `rgba(255,200,120,${1 - k})`; g.lineWidth = 2; g.beginPath(); g.arc(X, Y, cell * (0.1 + k * 0.35), 0, Math.PI * 2); g.stroke(); }
    else if (f.kind === 'boom' || f.kind === 'fire') {
      g.fillStyle = f.kind === 'fire' ? `rgba(255,110,30,${0.7 * (1 - k)})` : `rgba(255,170,60,${0.8 * (1 - k)})`;
      g.beginPath(); g.arc(X, Y, cell * f.r * (0.4 + k * 0.6), 0, Math.PI * 2); g.fill();
      g.strokeStyle = `rgba(255,240,200,${1 - k})`; g.lineWidth = 2; g.beginPath(); g.arc(X, Y, cell * f.r * (0.5 + k * 0.8), 0, Math.PI * 2); g.stroke();
    } else if (f.kind === 'dmg' && cell >= 14) { g.fillStyle = mates(f.team) ? `rgba(255,120,110,${1 - k})` : `rgba(255,240,200,${1 - k})`; g.font = `bold ${Math.max(10, Math.round(cell * 0.34))}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillText('-' + f.n, X, Y - k * cell * 0.8); }
  }
  // fog of war
  if (!all) {
    if (!V.fogC || V.fogC.width !== m.W || V.fogC.height !== m.H) { V.fogC = document.createElement('canvas'); V.fogC.width = m.W; V.fogC.height = m.H; V.fogG = V.fogC.getContext('2d'); V.fogImg = V.fogG.createImageData(m.W, m.H); }
    const px = V.fogImg.data;
    for (let i = 0; i < m.W * m.H; i++) { px[i * 4] = 3; px[i * 4 + 1] = 9; px[i * 4 + 2] = 16; px[i * 4 + 3] = vis[i] ? 0 : exp[i] ? 125 : 220; }
    V.fogG.putImageData(V.fogImg, 0, 0);
    g.imageSmoothingEnabled = true; g.drawImage(V.fogC, sx(0), sy(0), m.W * cell, m.H * cell);
  } else V.fogC = null;
  // storms and fog banks
  for (const st of G.storms) {
    const X = sx(st.x), Y = sy(st.y), R = st.r * cell, gr = g.createRadialGradient(X, Y, R * 0.1, X, Y, R);
    gr.addColorStop(0, 'rgba(40,50,70,.55)'); gr.addColorStop(0.8, 'rgba(40,50,70,.35)'); gr.addColorStop(1, 'rgba(40,50,70,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(X, Y, R, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(200,220,255,.35)'; g.lineWidth = 1;
    for (let i = 0; i < 14; i++) { const a = i * 2.39 + G.t * 0.3, rr = R * ((i * 0.31) % 0.9), x = X + Math.cos(a) * rr, y = Y + Math.sin(a) * rr; const off = (G.t * 60 + i * 23) % 30; g.beginPath(); g.moveTo(x - 3, y - 8 + off * 0.3); g.lineTo(x - 6, y + off * 0.3); g.stroke(); }
    if ((G.t * 7 | 0) % 37 === 0) { g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.arc(X, Y, R, 0, Math.PI * 2); g.fill(); }
  }
  for (const f of G.fog) { const X = sx(f.x), Y = sy(f.y), R = f.r * cell, gr = g.createRadialGradient(X, Y, R * 0.3, X, Y, R); gr.addColorStop(0, 'rgba(200,210,220,.55)'); gr.addColorStop(1, 'rgba(200,210,220,0)'); g.fillStyle = gr; g.beginPath(); g.arc(X, Y, R, 0, Math.PI * 2); g.fill(); }
  // a blown-out rig burns
  for (const s of G.structs) if (s.blowUntil > G.t && explored(s.x, s.y) && onScr(s.x, s.y)) { const X = sx(s.x), Y = sy(s.y) - cell * 0.3; for (let i = 0; i < 3; i++) { const k = (G.t * 1.5 + i / 3) % 1; g.fillStyle = `rgba(${255 - k * 120},${120 - k * 80},30,${0.8 * (1 - k)})`; g.beginPath(); g.arc(X + Math.sin(G.t * 3 + i) * cell * 0.1, Y - k * cell * 0.9, cell * (0.18 + k * 0.25), 0, Math.PI * 2); g.fill(); } }
  // aiming an ability: its range from each ship that has it, and the area it hits
  if (V.aim && V.mouse) {
    for (const e of (V.aim.srcs || []).map(id => G.index?.get(id)).filter(Boolean)) { g.strokeStyle = 'rgba(142,203,255,.4)'; g.lineWidth = 1.5; g.setLineDash([6, 6]); g.beginPath(); g.arc(sx(e.x), sy(e.y), V.aim.range * cell, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); }
    g.strokeStyle = V.aim.kind === 'scan' ? '#8ecbff' : V.aim.kind === 'power' ? '#ffd666' : '#ff8a7a'; g.lineWidth = 2; g.beginPath(); g.arc(sx(V.mouse.x), sy(V.mouse.y), (V.aim.area || 1) * cell, 0, Math.PI * 2); g.stroke();
  }
  // placing a rig or platform
  if (V.place && V.mouse) {
    const p = V.placeCheck, cx = Math.floor(V.mouse.x) + 0.5, cy = Math.floor(V.mouse.y) + 0.5, size = cell * (V.place === 'base' ? 1.25 : 1), X = sx(cx), Y = sy(cy);
    g.globalAlpha = 0.6; const sp = structPic(V.place === 'base' ? 'rig' : V.place, colOf(G, me), G.players[me]?.side === 'tide'); if (sp) g.drawImage(sp, X - size / 2, Y - size / 2, size, size); g.globalAlpha = 1;
    g.strokeStyle = p?.ok ? '#7fd17a' : '#ff6b6b'; g.lineWidth = 2; g.strokeRect(X - size / 2, Y - size / 2, size, size);
  }
  // the box you're dragging
  if (V.box) { const { x0, y0, x1, y1 } = V.box; g.strokeStyle = '#8ef0c8'; g.lineWidth = 1.5; g.fillStyle = 'rgba(142,240,200,.08)'; g.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0)); g.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0)); }
  void BASE_LEVELS; void PLATS;
}
const colOf = (G, t) => G.players[t]?.color || TEAM_COLORS[t] || '#999';
const hpCol = f => (f > 0.6 ? '#7fd17a' : f > 0.3 ? '#f0c040' : '#ff5a4d');
function bar(g, cx, y, w, f, col) { g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(cx - w / 2 - 1, y - 1, w + 2, 5); g.fillStyle = col; g.fillRect(cx - w / 2, y, w * Math.max(0, Math.min(1, f)), 3); }
function ring(g, x, y, r, mine) { g.strokeStyle = mine ? '#8ef0c8' : '#ff8a7a'; g.lineWidth = 2; g.beginPath(); g.ellipse(x, y, r, r * 0.85, 0, 0, Math.PI * 2); g.stroke(); }
function badge(g, x, y, r, text, col) { g.fillStyle = col; g.strokeStyle = '#10161c'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.stroke(); g.fillStyle = '#10161c'; g.font = `bold ${Math.round(r * 1.2)}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, x, y + 1); }

// the minimap: land, fog, everything you can see, alerts, and where the camera is
export function renderMini(V, G, c) {
  const m = G.m, g = c.getContext('2d'), kx = c.width / m.W, ky = c.height / m.H, me = V.me, all = V.all || G.cfg.fog === 'off';
  if (!V.miniBase || V.miniBase.m !== m) {
    const b = document.createElement('canvas'); b.width = m.W; b.height = m.H; const bg = b.getContext('2d'), im = bg.createImageData(m.W, m.H);
    for (let i = 0; i < m.W * m.H; i++) im.data.set(m.land[i] ? [118, 140, 82, 255] : [16, 44, 70, 255], i * 4);
    bg.putImageData(im, 0, 0); V.miniBase = { m, c: b };
  }
  g.imageSmoothingEnabled = false; g.drawImage(V.miniBase.c, 0, 0, c.width, c.height);
  if (V.fogC && !all) { g.globalAlpha = 0.75; g.imageSmoothingEnabled = true; g.drawImage(V.fogC, 0, 0, c.width, c.height); g.globalAlpha = 1; }
  const exp = G.explored[me], mates = t => t === me || G.players[me]?.allies?.includes(t);
  for (const d of m.deposits) if (d.reserves > 0 && (all || exp[(d.y | 0) * m.W + (d.x | 0)])) { g.fillStyle = '#f0a531'; g.fillRect(d.x * kx - 1, d.y * ky - 1, 2, 2); }
  for (const s of G.structs) if (mates(s.team) || all || exp[(s.y | 0) * m.W + (s.x | 0)]) { const r = s.type === 'base' ? (s.capital ? 4 : 3) : 2; g.fillStyle = colOf(G, s.team); g.fillRect(s.x * kx - r, s.y * ky - r, r * 2, r * 2); if (s.capital) { g.strokeStyle = '#fff'; g.lineWidth = 1; g.strokeRect(s.x * kx - r, s.y * ky - r, r * 2, r * 2); } }
  for (const u of G.units) if (mates(u.team) || (all ? !UNITS[u.type].submerged : seen(G, me, u))) { g.fillStyle = colOf(G, u.team); g.fillRect(u.x * kx - 1.5, u.y * ky - 1.5, 3, 3); }
  const now = performance.now();
  for (const a of V.alerts || []) { const k = (now - a.t) / 2500; if (k > 1) continue; g.strokeStyle = `rgba(255,80,60,${1 - k})`; g.lineWidth = 2; g.beginPath(); g.arc(a.x * kx, a.y * ky, 4 + k * 10, 0, Math.PI * 2); g.stroke(); }
  g.strokeStyle = '#fff'; g.lineWidth = 1; g.strokeRect(V.cam.x * kx, V.cam.y * ky, V.w / V.cell * kx, V.h / V.cell * ky);
}
