// Weapons you can see: turrets and launchers drawn on the ships, and every shot as a projectile with
// its own look and sound (shells, heavy shells, rockets, missiles, cruise missiles, ballistic missiles,
// torpedoes, depth charges, aircraft, flak for interceptions), ending in an explosion or a splash.
//
// Turrets turn to track the nearest enemy ship in sight, swing onto their target when they fire,
// recoil and flash. Everything is drawn in square coordinates, so it zooms and scrolls with the map.
import * as E from '../../engine/index.js';
import { SHIPS } from '../../data/ships.js';
import { PLATFORMS } from '../../data/bases.js';
import { px, py } from '../helpers.js';
import { S } from '../state.js';
import { play } from '../sound.js';

// ---------- which weapon looks like what ----------
// Mounts per ship: c = index into the ship's shape (it follows the ship when it turns), t = turret style,
// w = the actions fired from it. Styles: gun, heavy (triple barrels), rocket (pod), missile (twin box launcher),
// aa (twin thin barrels), vls (deck hatches), depth (stern racks), tube (torpedo tubes), deck (aircraft), mine, dish.
const MOUNTS = {
  patrol: [{ c: 0, t: 'gun', w: ['gun'] }],
  corvette: [{ c: 0, t: 'gun', w: ['gun'] }],
  hydrofoil: [{ c: 0, t: 'rocket', w: ['rockets'] }],
  minelayer: [{ c: 2, t: 'mine', w: ['mine'] }],
  submarine: [{ c: 0, t: 'tube', w: ['torpedo'] }],
  destroyer: [{ c: 0, t: 'gun', w: ['gun'] }, { c: 3, t: 'depth', w: ['depth'] }],
  missileboat: [{ c: 0, t: 'missile', w: ['missile'] }, { c: 2, t: 'vls', w: ['cruise'] }],
  frigate: [{ c: 0, t: 'gun', w: ['gun'] }, { c: 3, t: 'aa', w: [] }],
  jammer: [{ c: 2, t: 'dish', w: [] }],
  cruiser: [{ c: 1, t: 'missile', w: ['missile'] }, { c: 4, t: 'vls', w: ['cruise'] }, { c: 0, t: 'aa', w: [] }],
  carrier: [{ c: 1, t: 'deck', w: ['strike'] }, { c: 5, t: 'aa', w: [] }],
  battleship: [{ c: 0, t: 'heavy', w: ['salvo'] }, { c: 2, t: 'heavy', w: ['salvo'] }, { c: 7, t: 'heavy', w: ['salvo'] }, { c: 5, t: 'aa', w: [] }],
  nuclearsub: [{ c: 0, t: 'tube', w: ['torpedo'] }, { c: 3, t: 'vls', w: ['slbm'] }],
  dreadnought: [{ c: 0, t: 'heavy', w: ['battery'] }, { c: 2, t: 'heavy', w: ['battery'] }, { c: 4, t: 'heavy', w: ['battery'] }, { c: 9, t: 'heavy', w: ['battery'] }, { c: 7, t: 'aa', w: [] }],
};
const TURNS = new Set(['gun', 'heavy', 'rocket', 'missile', 'aa']); // styles that rotate

// The projectile (and sounds) for a ship's action.
export function shotKind(act) {
  if (!act) return 'shell';
  if (act.id === 'salvo' || act.id === 'battery') return 'heavy';
  if (act.id === 'rockets') return 'rocket';
  if (act.tag === 'torpedo') return 'torpedo';
  if (act.tag === 'depth') return 'depth';
  if (act.tag === 'air') return 'plane';
  if (act.id === 'slbm') return 'ballistic';
  if (act.tag === 'missile') return act.longRange ? 'cruise' : 'missile';
  if (act.kind === 'mine') return 'mine';
  return 'shell';
}
const platformKind = kind => (PLATFORMS[kind]?.strike?.area > 1 ? 'bomber' : 'cruise');

const FLIGHT = { shell: 0.55, heavy: 0.6, rocket: 0.5, missile: 0.62, cruise: 0.7, ballistic: 0.72, torpedo: 0.72, depth: 0.45, plane: 0.62, bomber: 0.65, mine: 0.4 };
const DUR = { shell: 800, heavy: 1050, rocket: 700, missile: 1250, cruise: 1700, ballistic: 1800, torpedo: 1600, depth: 1300, plane: 1700, bomber: 1800, mine: 700, ping: 900 };
const LAUNCH = { shell: 'gun', heavy: 'heavy', rocket: 'rocket', missile: 'missile', cruise: 'cruise', ballistic: 'cruise', torpedo: 'torpedo', depth: 'depth', plane: 'plane', bomber: 'plane', mine: 'splash' };

// ---------- geometry ----------
const centreOf = cells => [cells.reduce((t, c) => t + c[0], 0) / cells.length + 0.5, cells.reduce((t, c) => t + c[1], 0) / cells.length + 0.5];
const X = v => px(v - 0.5) + S.cell / 2; // square coords (centres at +0.5) -> pixels
const Y = v => py(v - 0.5) + S.cell / 2;
function mountsOf(type, cells) {
  return (MOUNTS[type] || []).filter(m => cells[m.c]).map(m => ({ ...m, x: cells[m.c][0] + 0.5, y: cells[m.c][1] + 0.5 }));
}
// where a shot comes out of: the mount that fires that action, else the middle of the ship
export function muzzle(ship, actId) {
  const cells = E.shipCells(ship);
  const m = mountsOf(ship.type, cells).find(q => q.w.includes(actId));
  return m ? [m.x, m.y] : centreOf(cells);
}

// ---------- turret state: angles, aim, recoil ----------
const ang = S.turretAng ||= {};   // `${shipId}:${mount}` -> current angle
const aim = S.turretAim ||= {};   // shipId -> { x, y, until }: forced aim while firing
const kick = S.turretKick ||= {}; // `${shipId}:${mount}` -> time of the last shot
let lastFrame = performance.now();

// Draw the mounts on one ship. `foes` = enemy ship cells the ship can see (to track).
export function drawTurrets(ship, cells, foes) {
  if (S.cell < 12) return;
  const ms = mountsOf(ship.type, cells);
  if (!ms.length) return;
  const ctx = S.ctx, u = S.cell, now = performance.now();
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  const ctr = centreOf(cells);
  // the target: forced aim, or the nearest enemy within 8 squares
  let tgt = aim[ship.id] && aim[ship.id].until > now ? aim[ship.id] : null;
  if (!tgt && foes?.length) {
    let best = 9;
    for (const f of foes) { const c = centreOf(f), d = Math.max(Math.abs(c[0] - ctr[0]), Math.abs(c[1] - ctr[1])); if (d < best) { best = d; tgt = { x: c[0], y: c[1] }; } }
  }
  ms.forEach((m, i) => {
    const key = ship.id + ':' + i, cx = X(m.x), cy = Y(m.y);
    // resting: pointing away from the middle of the ship (bow mounts forward, stern mounts aft)
    let want = Math.atan2(m.y - ctr[1], m.x - ctr[0]);
    if (Math.abs(m.y - ctr[1]) + Math.abs(m.x - ctr[0]) < 0.1) want = Math.atan2(cells[0][1] - ctr[1] + 0.5, cells[0][0] - ctr[0] + 0.5);
    if (tgt && TURNS.has(m.t)) want = Math.atan2(tgt.y - m.y, tgt.x - m.x);
    let a = ang[key] ?? want;
    let diff = Math.atan2(Math.sin(want - a), Math.cos(want - a));
    const turn = (m.t === 'heavy' ? 2.2 : 4.5) * dt;
    if (Math.abs(diff) > turn) { a += Math.sign(diff) * turn; S.animating = true; } else a = want;
    ang[key] = a;
    const kAge = (now - (kick[key] || 0)) / 1000, recoil = kAge < 0.18 ? (1 - kAge / 0.18) : 0;
    if (recoil > 0) S.animating = true;
    drawMount(ctx, m.t, cx, cy, u * 1.25, a, recoil);
  });
}

function drawMount(ctx, t, cx, cy, u, a, recoil) {
  ctx.save();
  ctx.translate(cx, cy);
  const dark = 'rgba(8,16,24,0.85)', steel = '#c9d3dc', mid = '#7f8c98';
  if (t === 'vls') { // missile hatches: a 2×2 grid of doors
    const s = u * 0.12;
    ctx.fillStyle = dark; ctx.fillRect(-s * 2.1, -s * 2.1, s * 4.2, s * 4.2);
    ctx.fillStyle = mid; for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) ctx.fillRect(dx * s - s * 0.8, dy * s - s * 0.8, s * 1.6, s * 1.6);
  } else if (t === 'depth') { // stern racks: two barrels
    ctx.fillStyle = dark; ctx.fillRect(-u * 0.22, -u * 0.16, u * 0.44, u * 0.32);
    ctx.fillStyle = mid; for (const d of [-1, 1]) { ctx.beginPath(); ctx.arc(d * u * 0.1, 0, u * 0.08, 0, Math.PI * 2); ctx.fill(); }
  } else if (t === 'tube') { // torpedo tubes: two dark slits at the bow
    ctx.rotate(a); ctx.fillStyle = dark;
    for (const d of [-1, 1]) ctx.fillRect(u * 0.05, d * u * 0.09 - u * 0.03, u * 0.3, u * 0.06);
  } else if (t === 'mine') {
    ctx.fillStyle = dark; ctx.fillRect(-u * 0.24, -u * 0.12, u * 0.48, u * 0.24);
    ctx.fillStyle = '#d24d4d'; for (const d of [-1, 0, 1]) { ctx.beginPath(); ctx.arc(d * u * 0.14, 0, u * 0.055, 0, Math.PI * 2); ctx.fill(); }
  } else if (t === 'deck') { // flight deck: a runway stripe and a little plane
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.setLineDash([u * 0.08, u * 0.06]); ctx.lineWidth = Math.max(1, u * 0.04);
    ctx.beginPath(); ctx.moveTo(-u * 0.4, 0); ctx.lineTo(u * 0.4, 0); ctx.stroke(); ctx.setLineDash([]);
    planeShape(ctx, u * 0.32, steel);
  } else if (t === 'dish') {
    ctx.strokeStyle = steel; ctx.lineWidth = Math.max(1, u * 0.05);
    ctx.beginPath(); ctx.arc(0, 0, u * 0.16, Math.PI * 0.15, Math.PI * 0.85, true); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -u * 0.12); ctx.stroke();
  } else {
    // rotating turrets
    ctx.rotate(a);
    const back = recoil * u * 0.1;
    if (t === 'gun') {
      ctx.fillStyle = steel; ctx.fillRect(u * 0.08 - back, -u * 0.035, u * 0.32, u * 0.07);
      ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(0, 0, u * 0.15, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = mid; ctx.beginPath(); ctx.arc(0, 0, u * 0.1, 0, Math.PI * 2); ctx.fill();
    } else if (t === 'heavy') {
      ctx.fillStyle = steel; for (const d of [-1, 0, 1]) ctx.fillRect(u * 0.12 - back, d * u * 0.09 - u * 0.03, u * 0.42, u * 0.06);
      ctx.fillStyle = dark; roundRectPath(ctx, -u * 0.22, -u * 0.2, u * 0.4, u * 0.4, u * 0.08); ctx.fill();
      ctx.fillStyle = mid; roundRectPath(ctx, -u * 0.16, -u * 0.14, u * 0.28, u * 0.28, u * 0.06); ctx.fill();
    } else if (t === 'rocket') { // a pod of 4 tubes
      ctx.fillStyle = dark; ctx.fillRect(-u * 0.14 - back, -u * 0.14, u * 0.32, u * 0.28);
      ctx.fillStyle = '#e8b24a'; for (const [dx, dy] of [[0.12, -0.06], [0.12, 0.06], [0.02, -0.06], [0.02, 0.06]]) { ctx.beginPath(); ctx.arc(dx * u - back, dy * u, u * 0.035, 0, Math.PI * 2); ctx.fill(); }
    } else if (t === 'missile') { // twin box launcher
      ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(0, 0, u * 0.12, 0, Math.PI * 2); ctx.fill();
      for (const d of [-1, 1]) { ctx.fillStyle = '#9fb0bf'; ctx.fillRect(-u * 0.12 - back, d * u * 0.085 - u * 0.055, u * 0.38, u * 0.11); ctx.fillStyle = '#d24d4d'; ctx.fillRect(u * 0.22 - back, d * u * 0.085 - u * 0.04, u * 0.04, u * 0.08); }
    } else if (t === 'aa') { // twin thin barrels on a small base
      ctx.fillStyle = steel; for (const d of [-1, 1]) ctx.fillRect(u * 0.04 - back, d * u * 0.05 - u * 0.015, u * 0.28, u * 0.03);
      ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(0, 0, u * 0.1, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = steel; ctx.lineWidth = 1; ctx.stroke();
    }
    if (recoil > 0.5) { // muzzle flash
      const len = t === 'heavy' ? 0.62 : t === 'aa' ? 0.36 : 0.44;
      const g = ctx.createRadialGradient(u * len, 0, 0, u * len, 0, u * (t === 'heavy' ? 0.35 : 0.2));
      g.addColorStop(0, 'rgba(255,240,180,0.95)'); g.addColorStop(1, 'rgba(255,140,40,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(u * len, 0, u * (t === 'heavy' ? 0.35 : 0.2), 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}
function roundRectPath(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function planeShape(ctx, s, color) { // nose pointing +x
  ctx.fillStyle = color; ctx.beginPath();
  ctx.moveTo(s * 0.6, 0); ctx.lineTo(-s * 0.1, -s * 0.12); ctx.lineTo(-s * 0.15, -s * 0.6); ctx.lineTo(-s * 0.35, -s * 0.6); ctx.lineTo(-s * 0.3, -s * 0.1);
  ctx.lineTo(-s * 0.55, -s * 0.08); ctx.lineTo(-s * 0.65, -s * 0.3); ctx.lineTo(-s * 0.72, -s * 0.3); ctx.lineTo(-s * 0.68, 0);
  ctx.lineTo(-s * 0.72, s * 0.3); ctx.lineTo(-s * 0.65, s * 0.3); ctx.lineTo(-s * 0.55, s * 0.08); ctx.lineTo(-s * 0.3, s * 0.1);
  ctx.lineTo(-s * 0.35, s * 0.6); ctx.lineTo(-s * 0.15, s * 0.6); ctx.lineTo(-s * 0.1, s * 0.12); ctx.closePath(); ctx.fill();
}

// ---------- shots ----------
// Start the effect for one shot. from/to in square coordinates (centres at +0.5), r = 'hit' | 'sunk' | 'miss' | 'intercepted'.
export function spawnShot({ kind, from, to, r, t0 = performance.now(), shipId, mountKey }) {
  const dur = DUR[kind] || 800;
  (S.fx ||= []).push({ kind, from, to, r, t0, dur, seed: Math.random() });
  if (shipId) {
    aim[shipId] = { x: to[0], y: to[1], until: t0 + dur + 600 };
    // the mounts that fire this kind recoil as the shot leaves (a short delay lets the turret swing round first)
    setTimeout(() => { for (const k of mountKey || []) kick[k] = performance.now(); S.animating = true; }, Math.max(0, t0 - performance.now()) + 120);
  }
  const delay = Math.max(0, t0 - performance.now()) / 1000 + 0.12;
  play(LAUNCH[kind], delay);
  const impact = delay + dur * (FLIGHT[kind] || 0.6) / 1000;
  if (r === 'intercepted') play('flak', impact - 0.05);
  else if (r === 'sunk') play('bigboom', impact);
  else if (r === 'hit') play(kind === 'torpedo' || kind === 'depth' ? 'thud' : kind === 'heavy' || kind === 'cruise' || kind === 'ballistic' ? 'bigboom' : 'boom', impact);
  else if (kind !== 'mine') play('splash', impact);
  S.animating = true;
  return t0 + dur;
}
export function spawnPing(x, y, r = 4) {
  (S.fx ||= []).push({ kind: 'ping', from: [x, y], to: [x, y], r, t0: performance.now(), dur: DUR.ping });
  play('ping'); S.animating = true;
}

// Work out and start the effects for an action that just happened: `before` = what the action's player
// had in st.players[p].shots before it ran, the shooter (if a ship) and its cells before it acted.
export function effectsForAction(st, a, p, shotsBefore, t0 = performance.now(), visible = () => true) {
  const shots = st.players[p].shots.slice(shotsBefore);
  let end = 0;
  if (a.type === 'act') {
    const ship = st.ships.find(s => s.id === a.shipId);
    const act = ship && SHIPS[ship.type].actions.find(x => x.id === a.actionId);
    if (act && (act.kind === 'scan' || act.kind === 'survey')) {
      const at = a.x != null ? [a.x + 0.5, a.y + 0.5] : centreOf(E.shipCells(ship));
      if (visible(at)) spawnPing(at[0], at[1], act.kind === 'survey' ? 3 : 4);
      return t0 + DUR.ping;
    }
    if (!ship) return 0;
    const kind = shotKind(act), from = muzzle(ship, act?.id);
    const keys = mountsOf(ship.type, E.shipCells(ship)).map((m, i) => (m.w.includes(act?.id) ? ship.id + ':' + i : null)).filter(Boolean);
    if (act?.kind === 'mine' && a.x != null) return spawnShot({ kind: 'mine', from, to: [a.x + 0.5, a.y + 0.5], r: 'miss', t0, shipId: ship.id, mountKey: keys });
    shots.forEach((s, i) => {
      const to = [s.x + 0.5, s.y + 0.5];
      if (!visible(to) && !visible(from)) return;
      // an unseen shooter doesn't give itself away: the shot appears just short of where it lands
      const start = visible(from) ? from : [to[0] - Math.sign(to[0] - from[0]) * 1.5, to[1] - Math.sign(to[1] - from[1]) * 1.5];
      end = Math.max(end, spawnShot({ kind, from: start, to, r: s.r, t0: t0 + i * 180, shipId: visible(from) ? ship.id : null, mountKey: keys }));
    });
  } else if (a.type === 'baseStrike') {
    const o = (st.platforms || []).find(q => q.id === a.platformId);
    if (!o) return 0;
    shots.forEach((s, i) => { end = Math.max(end, spawnShot({ kind: platformKind(o.kind), from: [o.x + 0.5, o.y + 0.5], to: [s.x + 0.5, s.y + 0.5], r: s.r, t0: t0 + i * 160 })); });
    if (!shots.length && PLATFORMS[o.kind]?.recon && a.x != null) { spawnPing(a.x + 0.5, a.y + 0.5, 3); end = t0 + DUR.ping; }
  } else if (a.type === 'satellite' && a.x != null) {
    spawnPing(a.x + 0.5, a.y + 0.5, 4); end = t0 + DUR.ping;
  }
  return end;
}

// ---------- drawing the shots ----------
const lerp = (a, b, k) => a + (b - a) * k;
const ease = k => 1 - Math.pow(1 - k, 2);
export function drawShots() {
  const list = S.fx;
  if (!list?.length) return;
  const ctx = S.ctx, now = performance.now(), u = S.cell;
  S.fx = list.filter(f => now - f.t0 < f.dur + 50);
  for (const f of S.fx) {
    const k = (now - f.t0) / f.dur;
    if (k < 0) continue;
    S.animating = true;
    if (f.kind === 'ping') { drawPingFx(ctx, f, k, u); continue; }
    const fl = FLIGHT[f.kind] || 0.6;
    const [fx, fy] = f.from, [tx, ty] = f.to;
    const dist = Math.hypot(tx - fx, ty - fy);
    if (k <= fl) drawFlight(ctx, f, k / fl, fx, fy, tx, ty, dist, u);
    else drawImpact(ctx, f, (k - fl) / (1 - fl), tx, ty, u);
  }
}

function drawFlight(ctx, f, q, fx, fy, tx, ty, dist, u) {
  const kind = f.kind;
  const nx = (tx - fx) / (dist || 1), ny = (ty - fy) / (dist || 1);
  // path: arcs for shells and long-range missiles, a gentle curve for missiles, straight for torpedoes
  const lift = { shell: 0.18, heavy: 0.26, rocket: 0.08, missile: 0.12, cruise: 0.35, ballistic: 0.6, plane: 0, bomber: 0, depth: 0.05, mine: 0.03, torpedo: 0 }[kind] ?? 0.15;
  const side = (f.seed - 0.5) * 0.6;
  const pos = t => {
    const e = kind === 'torpedo' || kind === 'plane' || kind === 'bomber' ? t : ease(t);
    const x = lerp(fx, tx, e) - ny * Math.sin(e * Math.PI) * side * (kind === 'missile' ? dist * 0.15 : 0);
    const y = lerp(fy, ty, e) + nx * Math.sin(e * Math.PI) * side * (kind === 'missile' ? dist * 0.15 : 0) - Math.sin(e * Math.PI) * lift * dist;
    return [x, y];
  };
  const [x, y] = pos(q), [x0, y0] = pos(Math.max(0, q - 0.04));
  const dir = Math.atan2(y - y0, x - x0);
  if (kind === 'torpedo') {
    // a wake on the surface: a fading line of foam behind a dark torpedo
    ctx.strokeStyle = 'rgba(200,240,255,0.55)'; ctx.lineWidth = Math.max(1.5, u * 0.08); ctx.setLineDash([u * 0.12, u * 0.1]);
    ctx.beginPath(); ctx.moveTo(X(fx), Y(fy)); ctx.lineTo(X(x), Y(y)); ctx.stroke(); ctx.setLineDash([]);
    for (let i = 0; i < 4; i++) { const t = Math.max(0, q - i * 0.05), [bx, by] = pos(t); ctx.fillStyle = `rgba(255,255,255,${0.5 - i * 0.1})`; ctx.beginPath(); ctx.arc(X(bx) + (Math.random() - 0.5) * u * 0.15, Y(by) + (Math.random() - 0.5) * u * 0.15, u * 0.05, 0, Math.PI * 2); ctx.fill(); }
    ctx.save(); ctx.translate(X(x), Y(y)); ctx.rotate(dir); ctx.fillStyle = '#1b2a36'; ctx.fillRect(-u * 0.18, -u * 0.05, u * 0.36, u * 0.1); ctx.restore();
    return;
  }
  if (kind === 'plane' || kind === 'bomber') {
    // there and back: the plane reaches the target at q = 1 (bombs fall as it passes)
    ctx.save(); ctx.translate(X(x), Y(y)); ctx.rotate(dir);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.translate(u * 0.12, u * 0.25); planeShape(ctx, u * (kind === 'bomber' ? 0.7 : 0.5), 'rgba(0,0,0,0.3)'); ctx.translate(-u * 0.12, -u * 0.25);
    planeShape(ctx, u * (kind === 'bomber' ? 0.7 : 0.5), '#dfe7ee');
    ctx.restore();
    return;
  }
  if (kind === 'depth' || kind === 'mine') {
    ctx.fillStyle = '#2b3640'; ctx.beginPath(); ctx.arc(X(x), Y(y), u * 0.1, 0, Math.PI * 2); ctx.fill();
    return;
  }
  // smoke trails for rockets and missiles
  if (kind === 'missile' || kind === 'cruise' || kind === 'ballistic' || kind === 'rocket') {
    const n = kind === 'rocket' ? 5 : 12;
    for (let i = n; i >= 1; i--) {
      const t = Math.max(0, q - i * (kind === 'rocket' ? 0.04 : 0.025)), [sx, sy] = pos(t);
      ctx.fillStyle = `rgba(210,215,220,${0.35 * (1 - i / (n + 1))})`;
      ctx.beginPath(); ctx.arc(X(sx), Y(sy), u * (0.05 + i * 0.012), 0, Math.PI * 2); ctx.fill();
    }
  }
  const drawBody = (bx, by, d, scale = 1) => {
    ctx.save(); ctx.translate(X(bx), Y(by)); ctx.rotate(d);
    if (kind === 'shell' || kind === 'heavy') {
      const r = u * (kind === 'heavy' ? 0.1 : 0.065);
      ctx.strokeStyle = 'rgba(255,200,90,0.75)'; ctx.lineWidth = r * 1.2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-u * 0.35, 0); ctx.lineTo(0, 0); ctx.stroke(); ctx.lineCap = 'butt';
      ctx.fillStyle = '#fff3c4'; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    } else {
      const L = u * (kind === 'rocket' ? 0.22 : kind === 'missile' ? 0.34 : 0.44) * scale, w = L * 0.22;
      ctx.fillStyle = 'rgba(255,170,60,0.9)'; ctx.beginPath(); ctx.moveTo(-L / 2, 0); ctx.lineTo(-L / 2 - L * 0.4, -w * 0.6); ctx.lineTo(-L / 2 - L * 0.4, w * 0.6); ctx.fill(); // flame
      ctx.fillStyle = '#e6ebef'; ctx.fillRect(-L / 2, -w / 2, L, w);
      ctx.fillStyle = '#d24d4d'; ctx.beginPath(); ctx.moveTo(L / 2, -w / 2); ctx.lineTo(L / 2 + w, 0); ctx.lineTo(L / 2, w / 2); ctx.fill();
    }
    ctx.restore();
  };
  if (kind === 'rocket') for (const o of [-0.18, 0, 0.18]) drawBody(x + ny * o, y - nx * o, dir, 0.9);
  else drawBody(x, y, dir);
  // an intercepted missile is torn apart by flak near the end of its flight
  if (f.r === 'intercepted' && q > 0.8) flak(ctx, x, y, (q - 0.8) / 0.2, u);
}

function drawImpact(ctx, f, q, tx, ty, u) {
  const x = X(tx), y = Y(ty);
  if (f.r === 'intercepted') return flak(ctx, tx, ty, Math.min(1, 0.6 + q), u);
  const under = f.kind === 'torpedo' || f.kind === 'depth';
  if (f.kind === 'mine') return ring(ctx, x, y, q, u * 0.6, 'rgba(220,240,255,');
  if (f.kind === 'depth') { // three charges going off under water
    for (let i = 0; i < 3; i++) { const qq = q * 1.3 - i * 0.15; if (qq > 0 && qq < 1) ring(ctx, x + (i - 1) * u * 0.35, y + ((i * 7) % 3 - 1) * u * 0.3, qq, u * 0.9, 'rgba(160,220,255,'); }
  }
  if (f.r === 'miss' && !under) { // a splash: a white ring and droplets
    ring(ctx, x, y, q, u * 0.8, 'rgba(230,245,255,');
    ctx.fillStyle = `rgba(230,245,255,${0.8 * (1 - q)})`;
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + f.seed * 6, d = u * (0.15 + q * 0.5); ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d - q * u * 0.3, u * 0.05, 0, Math.PI * 2); ctx.fill(); }
    return;
  }
  if (f.r === 'miss') { ring(ctx, x, y, q, u * 0.6, 'rgba(160,220,255,'); return; }
  // a hit: torpedoes and depth charges throw up a white water column first
  if (under) {
    const h = u * 1.2 * Math.sin(Math.min(1, q * 1.6) * Math.PI);
    const g = ctx.createLinearGradient(x, y, x, y - h);
    g.addColorStop(0, 'rgba(240,250,255,0.9)'); g.addColorStop(1, 'rgba(240,250,255,0)');
    ctx.fillStyle = g; ctx.fillRect(x - u * 0.22, y - h, u * 0.44, h);
  }
  const big = f.r === 'sunk' || f.kind === 'heavy' || f.kind === 'cruise' || f.kind === 'ballistic' || f.kind === 'bomber';
  const R = u * (big ? 1.3 : 0.85);
  // fireball
  const fq = Math.min(1, q * 1.8);
  if (fq < 1) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, R * (0.4 + fq * 0.6));
    g.addColorStop(0, `rgba(255,245,200,${1 - fq})`); g.addColorStop(0.4, `rgba(255,150,40,${0.9 * (1 - fq)})`); g.addColorStop(1, 'rgba(200,40,20,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R * (0.4 + fq * 0.6), 0, Math.PI * 2); ctx.fill();
  }
  // sparks
  ctx.fillStyle = `rgba(255,210,120,${1 - q})`;
  for (let i = 0; i < (big ? 12 : 7); i++) {
    const a = i * 2.4 + f.seed * 9, d = R * (0.3 + q * 0.9) * (0.7 + ((i * 37) % 10) / 20);
    ctx.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d + q * q * u * 0.4, Math.max(1.5, u * 0.05), Math.max(1.5, u * 0.05));
  }
  // smoke drifting up
  for (let i = 0; i < 4; i++) {
    const sq = q - 0.15 - i * 0.08;
    if (sq <= 0) continue;
    ctx.fillStyle = `rgba(60,64,70,${0.45 * (1 - sq)})`;
    ctx.beginPath(); ctx.arc(x + (i - 1.5) * u * 0.18, y - sq * u * 0.9, u * (0.18 + sq * 0.3), 0, Math.PI * 2); ctx.fill();
  }
  if (f.r === 'sunk') ring(ctx, x, y, q, u * 2, 'rgba(255,120,60,');
}
function ring(ctx, x, y, q, R, rgba) {
  ctx.strokeStyle = rgba + (0.9 * (1 - q)) + ')'; ctx.lineWidth = Math.max(1.5, R * 0.08);
  ctx.beginPath(); ctx.arc(x, y, R * (0.2 + q * 0.8), 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1;
}
function flak(ctx, sx, sy, q, u) { // grey puffs with flashes
  const x = X(sx), y = Y(sy);
  for (let i = 0; i < 5; i++) {
    const a = i * 1.3, d = u * 0.45 * ((i % 3) + 1) / 2;
    ctx.fillStyle = `rgba(90,95,100,${0.6 * (1 - q)})`;
    ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, u * (0.15 + q * 0.25), 0, Math.PI * 2); ctx.fill();
    if (q < 0.4) { ctx.fillStyle = `rgba(255,220,120,${1 - q * 2.5})`; ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, u * 0.08, 0, Math.PI * 2); ctx.fill(); }
  }
}
function drawPingFx(ctx, f, k, u) { // sonar / survey: rings spreading out
  const x = X(f.from[0]), y = Y(f.from[1]);
  for (let i = 0; i < 3; i++) {
    const q = k * 1.4 - i * 0.2;
    if (q <= 0 || q >= 1) continue;
    ctx.strokeStyle = `rgba(110,230,210,${0.8 * (1 - q)})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, u * f.r * q, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.lineWidth = 1;
}

// call once per frame after drawing: keeps track of time for turret turning
export function endFrame() { lastFrame = performance.now(); }
