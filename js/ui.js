// ============================================================
// UI: draws the board on a canvas and the side panel in HTML,
// and turns clicks into engine actions.
// ============================================================
import * as E from './engine.js';
import { SHIPS, RIG, PORT, DEPOSITS, PASSIVE_TEXT, TIER_RIGS, PLAYER_COLORS, ECONOMY, DOMINATION } from './data/ships.js';

const CODES = {
  patrol: 'PB', survey: 'SV', corvette: 'CO', hydrofoil: 'HF', decoy: 'DB', minelayer: 'ML',
  submarine: 'SS', tanker: 'TK', destroyer: 'DD', missileboat: 'MB', frigate: 'FF', jammer: 'JM',
  cruiser: 'CR', salvage: 'SL', repair: 'RP', drillship: 'DS', carrier: 'CV', battleship: 'BB',
  command: 'CM', nuclearsub: 'SN', dreadnought: 'DN',
};
const COL = {
  homeMine: '#0f2d4b', middle: '#0b2034', homeEnemy: '#0c2338', grid: 'rgba(255,255,255,0.05)',
  land: '#b9a46c', landEdge: '#8d7a4a', mine: '#2bb3a3', mineDark: '#17675e', enemy: '#e25555',
  oil: '#f0a531', wreck: '#5a6571', text: '#e4edf5', muted: '#8aa3b8',
};
const pcol = p => PLAYER_COLORS[p];
const pname = p => st.players[p].name;

let st, hooks;
let mode = { kind: 'idle' };
let selectedId = null;
let hover = null;
let cell = 28;
const MARGIN = 20;
let canvas, ctx;
let reachCache = null;

export function initUI(state, h) {
  st = state; hooks = h;
  canvas = document.getElementById('board');
  ctx = canvas.getContext('2d');
  window.addEventListener('resize', () => { resize(); draw(); });
  canvas.addEventListener('mousemove', e => { hover = cellFromEvent(e); draw(); updateStatus(); });
  canvas.addEventListener('mouseleave', () => { hover = null; draw(); });
  canvas.addEventListener('click', e => onBoardClick(cellFromEvent(e)));
  canvas.addEventListener('contextmenu', e => { e.preventDefault(); cancelMode(); });
  document.getElementById('panel').addEventListener('click', onPanelClick);
  document.getElementById('btn-help').onclick = showRules;
  document.getElementById('btn-menu').onclick = () => hooks.showMenu();
  window.addEventListener('keydown', onKey);
  resize();
}
export function setState(state) { st = state; selectedId = null; mode = { kind: 'idle' }; refresh(); }
export function refresh() {
  reachCache = null; renderPanel(); renderTop();
  if (hooks.afterRender?.(st, { selectedId, mode })) { renderPanel(); hooks.afterRender?.(st, { selectedId, mode }); }
  resize(); draw(); updateStatus();
}
export const redraw = () => draw();
// End the current player's turn (End turn button, or the turn timer running out).
export function endTurnNow(reason) {
  dispatch({ type: 'endTurn' });
  selectedId = null; mode = { kind: 'idle' };
  if (st.phase === 'playing') hooks.handoff(st, reason);
  refresh();
}

// ---------- dispatch ----------
function dispatch(action) {
  const r = E.applyAction(st, action);
  if (!r.ok) toast(r.error);
  hooks.save(st);
  if (selectedId && !st.ships.find(s => s.id === selectedId)) { selectedId = null; mode = { kind: 'idle' }; }
  if (st.phase === 'over') { refresh(); hooks.gameOver(st); return r; }
  return r;
}

// ---------- geometry ----------
function resize() {
  // Size from the window (not the page layout) so the board never changes size
  // when the panel, coach box or scrollbar changes.
  const vw = document.documentElement.clientWidth, vh = window.innerHeight;
  const avail = Math.max(300, vw <= 1000 ? vw - 32 : vw - 340 - 48);
  const COACH_SPACE = st && st.tutorial ? 172 + 10 : 0; // fixed coach height + gap (see .coach in style.css)
  const maxH = vh - 150 - COACH_SPACE;
  cell = Math.max(12, Math.min(40, Math.floor(Math.min((avail - MARGIN) / st.W, (maxH - MARGIN) / st.H))));
  const w = cell * st.W + MARGIN, h = cell * st.H + MARGIN;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr; canvas.height = h * dpr;
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function cellFromEvent(e) {
  const r = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - r.left - MARGIN) / cell);
  const y = Math.floor((e.clientY - r.top - MARGIN) / cell);
  return x >= 0 && y >= 0 && x < st.W && y < st.H ? { x, y } : null;
}
const px = x => MARGIN + x * cell;
const py = y => MARGIN + y * cell;
const me = () => st.current;
const selected = () => st.ships.find(s => s.id === selectedId);
const centerOffset = (type, rot) => {
  const c = E.cellsOf(type, 0, 0, rot);
  return c[Math.floor(c.length / 2)];
};
function reach() {
  const s = selected();
  if (!s) return null;
  if (!reachCache || reachCache.id !== s.id) reachCache = { id: s.id, map: E.reachable(st, s) };
  return reachCache.map;
}

// ---------- drawing ----------
function draw() {
  if (!st) return;
  const p = me();
  const v = E.getView(st, p);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // water: No Man's Sea, then each home tinted in its owner's colour
  ctx.fillStyle = COL.middle; ctx.fillRect(px(0), py(0), cell * st.W, cell * st.H);
  st.players.forEach((pl, i) => {
    const h = pl.home;
    ctx.fillStyle = i === p ? COL.homeMine : COL.homeEnemy;
    ctx.fillRect(px(h.x0), py(h.y0), cell * (h.x1 - h.x0 + 1), cell * (h.y1 - h.y0 + 1));
    ctx.globalAlpha = i === p ? 0.07 : 0.05; ctx.fillStyle = pcol(i);
    ctx.fillRect(px(h.x0), py(h.y0), cell * (h.x1 - h.x0 + 1), cell * (h.y1 - h.y0 + 1));
    ctx.globalAlpha = 1;
  });
  // my spawn zone
  { const sp = st.players[p].spawn; ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(px(sp.x0), py(sp.y0), cell * (sp.x1 - sp.x0 + 1), cell * (sp.y1 - sp.y0 + 1)); }
  // grid
  ctx.strokeStyle = COL.grid; ctx.lineWidth = 1;
  for (let x = 0; x <= st.W; x++) { ctx.beginPath(); ctx.moveTo(px(x) + .5, py(0)); ctx.lineTo(px(x) + .5, py(st.H)); ctx.stroke(); }
  for (let y = 0; y <= st.H; y++) { ctx.beginPath(); ctx.moveTo(px(0), py(y) + .5); ctx.lineTo(px(st.W), py(y) + .5); ctx.stroke(); }
  // home borders in each owner's colour
  ctx.setLineDash([6, 6]);
  st.players.forEach((pl, i) => {
    const h = pl.home; ctx.strokeStyle = pcol(i); ctx.globalAlpha = pl.out ? 0.15 : 0.55;
    ctx.strokeRect(px(h.x0) + 1, py(h.y0) + 1, cell * (h.x1 - h.x0 + 1) - 2, cell * (h.y1 - h.y0 + 1) - 2);
  });
  ctx.globalAlpha = 1; ctx.setLineDash([]);
  // axis labels
  ctx.fillStyle = COL.muted; ctx.font = `${Math.max(9, cell * 0.36)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let x = 0; x < st.W; x++) if (cell >= 18 || x % 2 === 0) ctx.fillText(String(x + 1), px(x) + cell / 2, MARGIN / 2);
  for (let y = 0; y < st.H; y++) ctx.fillText(E.coord(0, y).replace(/\d+$/, ''), MARGIN / 2, py(y) + cell / 2);
  // land
  for (let y = 0; y < st.H; y++) for (let x = 0; x < st.W; x++) if (E.isLand(st, x, y)) {
    ctx.fillStyle = COL.land; roundRect(px(x) + 1, py(y) + 1, cell - 2, cell - 2, 4); ctx.fill();
  }
  // surveyed water: a clear sandy-green tint with a fine dot, so you know where you've already looked
  {
    const sv = st.players[p].surveyed || {};
    for (const k in sv) {
      const [x, y] = k.split(',').map(Number);
      if (E.isLand(st, x, y)) continue;
      ctx.fillStyle = 'rgba(126, 170, 92, 0.26)'; ctx.fillRect(px(x), py(y), cell, cell);
      ctx.fillStyle = 'rgba(190, 225, 150, 0.35)';
      ctx.beginPath(); ctx.arc(px(x) + cell * 0.18, py(y) + cell * 0.18, Math.max(1, cell * 0.05), 0, Math.PI * 2); ctx.fill();
    }
    // outline the edge of the surveyed area
    ctx.strokeStyle = 'rgba(170, 215, 120, 0.7)'; ctx.lineWidth = 1.5;
    for (const k in sv) {
      const [x, y] = k.split(',').map(Number);
      const edge = (nx, ny) => !sv[nx + ',' + ny];
      ctx.beginPath();
      if (edge(x, y - 1)) { ctx.moveTo(px(x), py(y) + .5); ctx.lineTo(px(x + 1), py(y) + .5); }
      if (edge(x, y + 1)) { ctx.moveTo(px(x), py(y + 1) - .5); ctx.lineTo(px(x + 1), py(y + 1) - .5); }
      if (edge(x - 1, y)) { ctx.moveTo(px(x) + .5, py(y)); ctx.lineTo(px(x) + .5, py(y + 1)); }
      if (edge(x + 1, y)) { ctx.moveTo(px(x + 1) - .5, py(y)); ctx.lineTo(px(x + 1) - .5, py(y + 1)); }
      ctx.stroke();
    }
    ctx.lineWidth = 1;
  }
  // scans this turn
  for (const sc of v.me.scans) {
    for (const [x, y] of sc.cells) { ctx.fillStyle = 'rgba(120,200,255,0.10)'; ctx.fillRect(px(x), py(y), cell, cell); }
    for (const [x, y] of sc.jammed) hatch(x, y, 'rgba(200,120,255,0.5)');
  }
  // enemy fire flashes (from their last turn)
  for (const f of v.me.flashes) {
    ctx.strokeStyle = 'rgba(255,140,60,0.8)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 2;
    ctx.strokeRect(px(Math.max(0, f.x)) + 1, py(Math.max(0, f.y)) + 1,
      cell * (Math.min(st.W, f.x + f.w) - Math.max(0, f.x)) - 2, cell * (Math.min(st.H, f.y + f.h) - Math.max(0, f.y)) - 2);
    ctx.setLineDash([]); ctx.lineWidth = 1;
  }
  // deposits
  for (const d of v.deposits) {
    const cx = px(d.x) + cell / 2, cy = py(d.y) + cell / 2;
    ctx.beginPath(); ctx.arc(cx, cy, cell * 0.38, 0, Math.PI * 2);
    ctx.fillStyle = d.reserves > 0 ? 'rgba(240,165,49,0.25)' : 'rgba(120,120,120,0.25)'; ctx.fill();
    ctx.strokeStyle = d.reserves > 0 ? COL.oil : '#777'; ctx.stroke();
    ctx.fillStyle = d.reserves > 0 ? COL.oil : '#999'; ctx.font = `bold ${cell * 0.38}px system-ui`;
    ctx.fillText(DEPOSITS[d.type].label, cx, cy + 1);
  }
  // wrecks
  for (const w of v.wrecks) for (const [x, y] of w.cells) {
    ctx.fillStyle = 'rgba(90,101,113,0.55)'; ctx.fillRect(px(x) + 3, py(y) + 3, cell - 6, cell - 6);
    ctx.strokeStyle = '#2b3036'; ctx.beginPath(); ctx.moveTo(px(x) + 5, py(y) + 5); ctx.lineTo(px(x) + cell - 5, py(y) + cell - 5); ctx.stroke();
  }
  // incoming shots (enemy fired here last turn)
  for (const s of v.me.incoming) {
    ctx.strokeStyle = 'rgba(255,140,60,0.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(px(s.x) + cell / 2, py(s.y) + cell / 2, cell * 0.3, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1;
  }
  drawFog(v);
  // my mines
  for (const m of v.myMines) {
    const cx = px(m.x) + cell / 2, cy = py(m.y) + cell / 2;
    ctx.fillStyle = '#c8d3dd'; ctx.beginPath(); ctx.arc(cx, cy, cell * 0.16, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#c8d3dd';
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(cx - Math.cos(a) * cell * .28, cy - Math.sin(a) * cell * .28); ctx.lineTo(cx + Math.cos(a) * cell * .28, cy + Math.sin(a) * cell * .28); ctx.stroke(); }
  }
  // rigs
  v.myRigs.forEach(r => drawRig(r, pcol(p)));
  v.enemyRigs.forEach(r => drawRig(r, pcol(r.owner)));
  v.myPorts.forEach(o => drawPort(o, pcol(p)));
  v.enemyPorts.forEach(o => drawPort(o, pcol(o.owner)));
  // ships
  for (const s of v.myShips) drawHull(E.shipCells(s), pcol(p), s.id === selectedId, s.acted && (s.movesLeft === 0 || s.shotsLeft === 0) ? 0.6 : 1, CODES[s.type], s.hp / SHIPS[s.type].hp);
  for (const s of v.enemyShips) drawHull(s.cells, pcol(s.owner), false, 1, '?', undefined, true);
  for (const sp of v.me.spoofs) drawHull([[sp.x, sp.y]], pcol(sp.owner), false, 1, '?', undefined, true);
  // my shot markers
  for (const s of v.me.shots) {
    const age = st.turnCount - s.turn;
    ctx.globalAlpha = age <= 0 ? 1 : age <= 2 ? 0.6 : 0.3;
    const x0 = px(s.x), y0 = py(s.y);
    if (s.r === 'hit' || s.r === 'sunk') {
      ctx.strokeStyle = '#ff4d4d'; ctx.lineWidth = s.r === 'sunk' ? 4 : 3;
      ctx.beginPath(); ctx.moveTo(x0 + 6, y0 + 6); ctx.lineTo(x0 + cell - 6, y0 + cell - 6);
      ctx.moveTo(x0 + cell - 6, y0 + 6); ctx.lineTo(x0 + 6, y0 + cell - 6); ctx.stroke();
    } else if (s.r === 'intercepted') {
      ctx.strokeStyle = '#6fb6ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x0 + 6, y0 + cell - 6); ctx.lineTo(x0 + cell - 6, y0 + 6); ctx.stroke();
    } else {
      ctx.fillStyle = '#e6eef5'; ctx.beginPath(); ctx.arc(x0 + cell / 2, y0 + cell / 2, cell * 0.1, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.lineWidth = 1;
  }
  drawModeOverlay();
  drawMarkers();
  drawOilTooltip(v);
}

// Hovering an oil spot or rig shows how much oil is left, e.g. "18/35 oil left".
function oilInfo(v, x, y) {
  const dep = v.deposits.find(d => d.x === x && d.y === y);
  const myRig = v.myRigs.find(r => r.x === x && r.y === y);
  const enemyRig = v.enemyRigs.find(r => r.x === x && r.y === y);
  const port = [...v.myPorts, ...v.enemyPorts].find(o => o.x === x && o.y === y);
  if (port) return [
    { t: port.owner === me() ? 'Your forward port' : `${pname(port.owner)}'s forward port`, c: pcol(port.owner) },
    { t: `HP ${port.hp}/${PORT.hp}`, c: '#ffffff', big: true },
    { t: `Launches ships within ${PORT.range} squares`, c: '#9fb3c6' },
  ];
  if (!dep && !myRig && !enemyRig) return null;
  const lines = [];
  if (myRig) lines.push({ t: `Your oil rig · HP ${myRig.hp}/${RIG.hp}`, c: pcol(me()) });
  else if (enemyRig) lines.push({ t: `${pname(enemyRig.owner)}'s oil rig`, c: pcol(enemyRig.owner) });
  if (dep) {
    const info = DEPOSITS[dep.type], max = dep.max ?? dep.reserves;
    lines.push({ t: `${info.name} deposit`, c: '#f0a531' });
    lines.push({ t: dep.reserves > 0 ? `${dep.reserves}/${max} oil left` : `Dry (0/${max})`, c: dep.reserves > 0 ? '#ffffff' : '#9aa5b1', big: true });
    if (dep.reserves > 0) lines.push({ t: `Pumps ${info.rate}/turn · about ${Math.ceil(dep.reserves / info.rate)} turns left`, c: '#9fb3c6' });
    if (!myRig && !enemyRig && dep.reserves > 0) lines.push({ t: 'No rig yet', c: '#9fb3c6' });
  } else lines.push({ t: 'Deposit not surveyed', c: '#9fb3c6' });
  return lines;
}
function drawOilTooltip(v) {
  if (!hover || mode.kind === 'target') return;
  const lines = oilInfo(v, hover.x, hover.y);
  if (!lines) return;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  const fs = 12, lh = 17;
  const w = 12 + Math.max(...lines.map(l => { ctx.font = `${l.big ? 'bold 14px' : fs + 'px'} system-ui`; return ctx.measureText(l.t).width; })) + 12;
  const h = 10 + lines.reduce((t, l) => t + (l.big ? lh + 3 : lh), 0) + 6;
  let x = px(hover.x) + cell + 6, y = py(hover.y) - 4;
  if (x + w > MARGIN + st.W * cell) x = px(hover.x) - w - 6;
  if (y + h > MARGIN + st.H * cell) y = MARGIN + st.H * cell - h;
  ctx.fillStyle = 'rgba(8, 18, 28, 0.95)'; roundRect(x, y, w, h, 6); ctx.fill();
  ctx.strokeStyle = 'rgba(240,165,49,0.7)'; ctx.lineWidth = 1; roundRect(x, y, w, h, 6); ctx.stroke();
  let ty = y + 8;
  for (const l of lines) {
    ctx.font = `${l.big ? 'bold 14px' : fs + 'px'} system-ui`; ctx.fillStyle = l.c;
    ctx.fillText(l.t, x + 12, ty); ty += l.big ? lh + 3 : lh;
  }
}

// ---------- fog of war ----------
// Squares one of my ships or rigs can see right now.
function visionSet(v) {
  const seen = new Set();
  const mark = (cells, r) => {
    for (const [cx, cy] of cells)
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x >= 0 && y >= 0 && x < st.W && y < st.H) seen.add(x + ',' + y);
      }
  };
  for (const s of v.myShips) mark(E.shipCells(s), SHIPS[s.type].sight);
  for (const r of v.myRigs) mark([[r.x, r.y]], RIG.sight);
  for (const o of v.myPorts) mark([[o.x, o.y]], PORT.sight);
  return seen;
}
function drawFog(v) {
  const seen = visionSet(v);
  ctx.fillStyle = 'rgba(2, 8, 14, 0.42)';
  for (let y = 0; y < st.H; y++) for (let x = 0; x < st.W; x++)
    if (!seen.has(x + ',' + y)) ctx.fillRect(px(x), py(y), cell, cell);
  outlineArea(seen, 'rgba(160, 220, 255, 0.35)', 1);
}
// draw the outer edge of a set of "x,y" squares
function outlineArea(set, color, width, dash) {
  ctx.strokeStyle = color; ctx.lineWidth = width; if (dash) ctx.setLineDash(dash);
  ctx.beginPath();
  for (const k of set) {
    const [x, y] = k.split(',').map(Number);
    if (!set.has(x + ',' + (y - 1))) { ctx.moveTo(px(x), py(y)); ctx.lineTo(px(x + 1), py(y)); }
    if (!set.has(x + ',' + (y + 1))) { ctx.moveTo(px(x), py(y + 1)); ctx.lineTo(px(x + 1), py(y + 1)); }
    if (!set.has((x - 1) + ',' + y)) { ctx.moveTo(px(x), py(y)); ctx.lineTo(px(x), py(y + 1)); }
    if (!set.has((x + 1) + ',' + y)) { ctx.moveTo(px(x + 1), py(y)); ctx.lineTo(px(x + 1), py(y + 1)); }
  }
  ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1;
}
function sightSquares(cells, r) {
  const set = new Set();
  for (const [cx, cy] of cells)
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x >= 0 && y >= 0 && x < st.W && y < st.H) set.add(x + ',' + y);
    }
  return set;
}

// tutorial markers: glowing boxes with a label
function drawMarkers() {
  const list = hooks.markers?.() || [];
  if (!list.length) return;
  const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 260);
  for (const m of list) {
    const x = px(m.x0), y = py(m.y0), w = cell * (m.x1 - m.x0 + 1), h = cell * (m.y1 - m.y0 + 1);
    ctx.strokeStyle = `rgba(255,214,102,${pulse})`; ctx.lineWidth = 3;
    roundRect(x - 2, y - 2, w + 4, h + 4, 6); ctx.stroke(); ctx.lineWidth = 1;
    if (m.label) {
      ctx.font = `bold ${Math.max(11, cell * 0.4)}px system-ui`;
      const tw = ctx.measureText(m.label).width + 12, th = Math.max(16, cell * 0.6);
      const lx = Math.min(Math.max(MARGIN, x + w / 2 - tw / 2), MARGIN + cell * st.W - tw);
      const ly = y - th - 6 < MARGIN ? y + h + 6 : y - th - 6;
      ctx.fillStyle = '#ffd666'; roundRect(lx, ly, tw, th, 4); ctx.fill();
      ctx.fillStyle = '#2a1e00'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(m.label, lx + tw / 2, ly + th / 2 + 1);
    }
  }
}

function drawModeOverlay() {
  const s = selected();
  if (s) {
    outlineArea(sightSquares(E.shipCells(s), SHIPS[s.type].sight), 'rgba(255,255,255,0.75)', 1.5, [5, 4]);
    const sonar = SHIPS[s.type].passives?.sonar;
    if (sonar) outlineArea(sightSquares(E.shipCells(s), sonar), 'rgba(111,182,255,0.8)', 1.5, [2, 3]);
  }
  if (mode.kind === 'move' && s) {
    const map = reach();
    ctx.fillStyle = 'rgba(43,179,163,0.16)';
    const painted = new Set();
    for (const n of map.values()) for (const [x, y] of E.cellsOf(s.type, n.x, n.y, s.rot)) {
      const k = x + ',' + y; if (painted.has(k)) continue; painted.add(k); ctx.fillRect(px(x), py(y), cell, cell);
    }
    if (hover) {
      const [ox, oy] = centerOffset(s.type, s.rot);
      const ax = hover.x - ox, ay = hover.y - oy;
      const n = map.get(ax + ',' + ay);
      if (n) {
        const gc = E.cellsOf(s.type, ax, ay, s.rot);
        ghost(gc, 'rgba(43,179,163,0.55)');
        outlineArea(sightSquares(gc, SHIPS[s.type].sight), 'rgba(127,209,122,0.9)', 1.5, [5, 4]);
      }
    }
  }
  if (mode.kind === 'target' && s) {
    const act = SHIPS[s.type].actions.find(a => a.id === mode.actionId);
    const range = E.actionRange(st, s, act);
    const cells = E.shipCells(s);
    ctx.fillStyle = 'rgba(240,165,49,0.09)';
    for (let y = 0; y < st.H; y++) for (let x = 0; x < st.W; x++) if (E.dist(cells, [[x, y]]) <= range) ctx.fillRect(px(x), py(y), cell, cell);
    if (hover && E.dist(cells, [[hover.x, hover.y]]) <= range) {
      let lo = 0, hi = 0;
      if (act.kind === 'scan') { lo = -Math.floor((act.size - 1) / 2); hi = lo + act.size - 1; }
      if (act.area === 3) { lo = -1; hi = 1; }
      ctx.strokeStyle = COL.oil; ctx.lineWidth = 2;
      ctx.strokeRect(px(hover.x + lo) + 1, py(hover.y + lo) + 1, cell * (hi - lo + 1) - 2, cell * (hi - lo + 1) - 2);
      ctx.lineWidth = 1;
    }
  }
  if (mode.kind === 'placeShip') {
    // where ships can launch: your spawn strip plus the area around forward rigs
    const zone = new Set();
    const sp = st.players[me()].spawn;
    for (let y = sp.y0; y <= sp.y1; y++) for (let x = sp.x0; x <= sp.x1; x++) zone.add(x + ',' + y);
    for (const r of E.forwardPorts(st, me()))
      for (let dy = -PORT.range; dy <= PORT.range; dy++) for (let dx = -PORT.range; dx <= PORT.range; dx++)
        if (r.x + dx >= 0 && r.y + dy >= 0 && r.x + dx < st.W && r.y + dy < st.H && !E.isLand(st, r.x + dx, r.y + dy)) zone.add((r.x + dx) + ',' + (r.y + dy));
    ctx.fillStyle = 'rgba(43,179,163,0.14)';
    for (const k of zone) { const [x, y] = k.split(',').map(Number); ctx.fillRect(px(x), py(y), cell, cell); }
    outlineArea(zone, 'rgba(95,211,198,0.8)', 1.5, [4, 3]);
  }
  if (mode.kind === 'placeShip' && hover) {
    const [ox, oy] = centerOffset(mode.ship, mode.rot);
    const cells = E.cellsOf(mode.ship, hover.x - ox, hover.y - oy, mode.rot);
    const okSpot = E.inLaunchZone(st, me(), cells) &&
      E.placementOk(st, me(), cells, null, E.visibility(st, me()));
    ghost(cells, okSpot ? 'rgba(43,179,163,0.6)' : 'rgba(226,85,85,0.6)');
  }
  if (mode.kind === 'placePort') {
    // every coast square you can build on right now
    for (let y = 0; y < st.H; y++) for (let x = 0; x < st.W; x++) {
      if (!E.isCoast(st, x, y)) continue;
      const okHere = !E.portBuildProblem(st, me(), x, y);
      ctx.strokeStyle = okHere ? '#7fd17a' : 'rgba(255,255,255,0.25)'; ctx.lineWidth = okHere ? 2.5 : 1;
      if (okHere) { ctx.fillStyle = 'rgba(127,209,122,0.35)'; roundRect(px(x) + 2, py(y) + 2, cell - 4, cell - 4, 4); ctx.fill(); }
      roundRect(px(x) + 2, py(y) + 2, cell - 4, cell - 4, 4); ctx.stroke(); ctx.lineWidth = 1;
    }
    if (hover) {
      const okSpot = !E.portBuildProblem(st, me(), hover.x, hover.y);
      ctx.globalAlpha = 0.8; drawPort({ x: hover.x, y: hover.y, hp: PORT.hp }, okSpot ? pcol(me()) : '#e25555'); ctx.globalAlpha = 1;
      if (okSpot) {
        const z = new Set();
        for (let dy = -PORT.range; dy <= PORT.range; dy++) for (let dx = -PORT.range; dx <= PORT.range; dx++) {
          const x = hover.x + dx, y = hover.y + dy;
          if (x >= 0 && y >= 0 && x < st.W && y < st.H && !E.isLand(st, x, y)) z.add(x + ',' + y);
        }
        outlineArea(z, 'rgba(95,211,198,0.9)', 1.5, [4, 3]);
      }
    }
  }
  if (mode.kind === 'placeRig') {
    // every deposit you can build on right now: solid green square
    for (const d of E.getView(st, me()).deposits) {
      if (E.rigBuildProblem(st, me(), d.x, d.y)) continue;
      ctx.fillStyle = 'rgba(43,179,163,0.45)'; roundRect(px(d.x) + 2, py(d.y) + 2, cell - 4, cell - 4, 4); ctx.fill();
      ctx.strokeStyle = '#7fd17a'; ctx.lineWidth = 2.5; roundRect(px(d.x) + 2, py(d.y) + 2, cell - 4, cell - 4, 4); ctx.stroke();
      ctx.lineWidth = 1;
    }
    // ghost rig under the mouse: teal where it can go, red where it can't
    if (hover) {
      const okSpot = !E.rigBuildProblem(st, me(), hover.x, hover.y);
      ctx.globalAlpha = 0.75;
      drawRig({ x: hover.x, y: hover.y, hp: RIG.hp }, okSpot ? pcol(me()) : '#e25555');
      ctx.globalAlpha = 1;
      if (!okSpot) { ctx.fillStyle = 'rgba(226,85,85,0.35)'; ctx.fillRect(px(hover.x), py(hover.y), cell, cell); }
    }
  }
}

function drawHull(cells, color, sel, alpha, label, hpFrac, enemy = false) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  const set = new Set(cells.map(c => c[0] + ',' + c[1]));
  const ins = Math.max(2, cell * 0.12);
  for (const [x, y] of cells) {
    roundRect(px(x) + ins, py(y) + ins, cell - ins * 2, cell - ins * 2, 4); ctx.fill();
    if (set.has((x + 1) + ',' + y)) ctx.fillRect(px(x) + cell - ins - 1, py(y) + ins, ins * 2 + 2, cell - ins * 2);
    if (set.has(x + ',' + (y + 1))) ctx.fillRect(px(x) + ins, py(y) + cell - ins - 1, cell - ins * 2, ins * 2 + 2);
  }
  if (enemy) {
    ctx.strokeStyle = '#ff4d4d'; ctx.lineWidth = 2;
    for (const [x, y] of cells) { roundRect(px(x) + ins - 1, py(y) + ins - 1, cell - ins * 2 + 2, cell - ins * 2 + 2, 4); ctx.stroke(); }
    ctx.lineWidth = 1;
  }
  if (sel) {
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
    for (const [x, y] of cells) { roundRect(px(x) + ins - 1, py(y) + ins - 1, cell - ins * 2 + 2, cell - ins * 2 + 2, 4); ctx.stroke(); }
    ctx.lineWidth = 1;
  }
  const mid = cells[Math.floor(cells.length / 2)];
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.font = `bold ${Math.max(9, cell * 0.34)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, px(mid[0]) + cell / 2, py(mid[1]) + cell / 2 + 1);
  if (hpFrac !== undefined && hpFrac < 1) {
    const minX = Math.min(...cells.map(c => c[0])), maxX = Math.max(...cells.map(c => c[0]));
    const maxY = Math.max(...cells.map(c => c[1]));
    const w = (maxX - minX + 1) * cell - 8;
    ctx.fillStyle = '#300'; ctx.fillRect(px(minX) + 4, py(maxY) + cell - 5, w, 3);
    ctx.fillStyle = hpFrac > 0.5 ? '#7fd17a' : hpFrac > 0.25 ? '#f0a531' : '#ff4d4d';
    ctx.fillRect(px(minX) + 4, py(maxY) + cell - 5, w * Math.max(0, hpFrac), 3);
  }
  ctx.globalAlpha = 1;
}
function drawRig(r, color) {
  const x0 = px(r.x), y0 = py(r.y), u = cell / 10;
  ctx.fillStyle = '#0a1a26';
  roundRect(x0 + 2, y0 + 2, cell - 4, cell - 4, 3); ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
  // platform deck + legs
  ctx.strokeStyle = COL.oil; ctx.lineWidth = Math.max(1.2, u * 0.7);
  ctx.beginPath();
  ctx.moveTo(x0 + u * 2, y0 + u * 7); ctx.lineTo(x0 + u * 8, y0 + u * 7);
  ctx.moveTo(x0 + u * 3, y0 + u * 7); ctx.lineTo(x0 + u * 3, y0 + u * 8.5);
  ctx.moveTo(x0 + u * 7, y0 + u * 7); ctx.lineTo(x0 + u * 7, y0 + u * 8.5);
  // derrick tower with cross-braces
  ctx.moveTo(x0 + u * 3.6, y0 + u * 7); ctx.lineTo(x0 + u * 5, y0 + u * 1.8); ctx.lineTo(x0 + u * 6.4, y0 + u * 7);
  ctx.moveTo(x0 + u * 4.0, y0 + u * 5.4); ctx.lineTo(x0 + u * 6.0, y0 + u * 5.4);
  ctx.moveTo(x0 + u * 4.4, y0 + u * 3.8); ctx.lineTo(x0 + u * 5.6, y0 + u * 3.8);
  ctx.stroke(); ctx.lineWidth = 1;
  if (r.hp < RIG.hp) { ctx.fillStyle = '#ff4d4d'; ctx.fillRect(x0 + 4, y0 + cell - 5, (cell - 8) * r.hp / RIG.hp, 3); }
}
// forward port: an anchor on a coast square
function drawPort(o, color) {
  const x0 = px(o.x), y0 = py(o.y), u = cell / 10;
  ctx.fillStyle = '#0a1a26'; roundRect(x0 + 2, y0 + 2, cell - 4, cell - 4, 4); ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
  ctx.strokeStyle = '#e8eef4'; ctx.lineWidth = Math.max(1.2, u * 0.75); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(x0 + u * 5, y0 + u * 2.6, u * 0.9, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x0 + u * 5, y0 + u * 3.5); ctx.lineTo(x0 + u * 5, y0 + u * 8);
  ctx.moveTo(x0 + u * 3.4, y0 + u * 4.6); ctx.lineTo(x0 + u * 6.6, y0 + u * 4.6);
  ctx.stroke();
  ctx.beginPath(); ctx.arc(x0 + u * 5, y0 + u * 5.6, u * 2.5, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
  ctx.lineCap = 'butt'; ctx.lineWidth = 1;
  if (o.hp < PORT.hp) { ctx.fillStyle = '#ff4d4d'; ctx.fillRect(x0 + 4, y0 + cell - 6, (cell - 8) * o.hp / PORT.hp, 3); }
}

function ghost(cells, color) {
  ctx.fillStyle = color;
  for (const [x, y] of cells) if (x >= 0 && y >= 0 && x < st.W && y < st.H) { roundRect(px(x) + 2, py(y) + 2, cell - 4, cell - 4, 4); ctx.fill(); }
}
function hatch(x, y, color) {
  ctx.save(); ctx.beginPath(); ctx.rect(px(x), py(y), cell, cell); ctx.clip();
  ctx.strokeStyle = color;
  for (let i = -cell; i < cell; i += 6) { ctx.beginPath(); ctx.moveTo(px(x) + i, py(y)); ctx.lineTo(px(x) + i + cell, py(y) + cell); ctx.stroke(); }
  ctx.restore();
}
function roundRect(x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// ---------- input ----------
function onBoardClick(c) {
  if (!c || st.phase !== 'playing') return;
  const p = me();
  if (mode.kind === 'placeShip') {
    const [ox, oy] = centerOffset(mode.ship, mode.rot);
    const r = dispatch({ type: 'buyShip', ship: mode.ship, x: c.x - ox, y: c.y - oy, rot: mode.rot });
    if (r.ok) mode = { kind: 'idle' };
    return refresh();
  }
  if (mode.kind === 'placePort') {
    const r = dispatch({ type: 'buyPort', x: c.x, y: c.y });
    if (r.ok) mode = { kind: 'idle' };
    return refresh();
  }
  if (mode.kind === 'placeRig') {
    const r = dispatch({ type: 'buyRig', x: c.x, y: c.y });
    if (r.ok) mode = { kind: 'idle' };
    return refresh();
  }
  if (mode.kind === 'target') {
    const s = selected();
    const r = dispatch({ type: 'act', shipId: s.id, actionId: mode.actionId, x: c.x, y: c.y });
    if (!r.ok) return refresh();
    const still = selected();
    if (!still || !(still.activeAction === mode.actionId && still.shotsLeft > 0)) mode = still ? { kind: 'move' } : { kind: 'idle' };
    return refresh();
  }
  // clicking one of my ships selects it
  const mine = st.ships.find(s => s.owner === p && E.shipCells(s).some(([x, y]) => x === c.x && y === c.y));
  if (mine) { selectedId = mine.id; mode = { kind: 'move' }; return refresh(); }
  if (mode.kind === 'move') {
    const s = selected();
    const [ox, oy] = centerOffset(s.type, s.rot);
    const ax = c.x - ox, ay = c.y - oy;
    if (reach().has(ax + ',' + ay)) { dispatch({ type: 'move', shipId: s.id, x: ax, y: ay }); return refresh(); }
    return; // unreachable spot: keep the ship selected
  }
}
function cancelMode() {
  if (mode.kind === 'target' || mode.kind === 'placeShip' || mode.kind === 'placeRig' || mode.kind === 'placePort') mode = selected() ? { kind: 'move' } : { kind: 'idle' };
  else { selectedId = null; mode = { kind: 'idle' }; }
  refresh();
}
function onKey(e) {
  if (!document.getElementById('overlay').classList.contains('hidden')) return;
  if (e.key === 'Escape') cancelMode();
  if (e.key === 'r' || e.key === 'R') {
    if (mode.kind === 'placeShip') { mode.rot = (mode.rot + 1) % 4; draw(); }
    else if (selected()) { dispatch({ type: 'rotate', shipId: selectedId }); refresh(); }
  }
}
function onPanelClick(e) {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  const d = b.dataset;
  if (d.act) {
    const s = selected();
    const act = SHIPS[s.type].actions.find(a => a.id === d.act);
    if (act.kind === 'survey') { dispatch({ type: 'act', shipId: s.id, actionId: act.id }); mode = { kind: 'move' }; }
    else mode = { kind: 'target', actionId: act.id };
  }
  if (d.rotate) dispatch({ type: 'rotate', shipId: selectedId });
  if (d.buy) { mode = { kind: 'placeShip', ship: d.buy, rot: 1 }; selectedId = null; }
  if (d.rig) mode = mode.kind === 'placeRig' ? { kind: 'idle' } : { kind: 'placeRig' };
  if (d.port) mode = mode.kind === 'placePort' ? { kind: 'idle' } : { kind: 'placePort' };
  if (d.sell) dispatch({ type: 'sell', amount: d.sell === 'all' ? st.players[me()].oil : Number(d.sell) });
  if (d.end) return endTurnNow();
  if (d.deselect) { selectedId = null; mode = { kind: 'idle' }; }
  refresh();
}

// ---------- panel ----------
function renderTop() {
  const p = me();
  document.getElementById('turn-info').innerHTML =
    `<b style="color:${pcol(p)}">${pname(p)}</b> · Round ${st.round} · Your home waters have the <b style="color:${pcol(p)}">${['teal', 'orange', 'purple', 'gold'][p]}</b> dashed border`;
}
function renderPanel() {
  const p = me(), pl = st.players[p];
  const rigs = E.rigsOwned(st, p);
  const tier = rigs >= TIER_RIGS[3] ? 3 : rigs >= TIER_RIGS[2] ? 2 : 1;
  const s = selected();
  let html = `
  <div class="card">
    <h3>Admirals</h3>
    <div class="row" style="margin-top:0">${st.players.map((o, i) => `<span class="chip ${o.out ? 'out' : ''} ${i === p ? 'me' : ''}" style="--c:${pcol(i)}">${o.name}${o.seat === 'ai' ? ' (CPU)' : ''}${o.out ? ' · out' : ''}${st.domination && o.domStreak > 0 && !o.out ? ` · <b style="color:#ffd666">domination ${o.domStreak}/${DOMINATION.rounds}</b>` : ''}</span>`).join('')}</div>
    ${st.domination ? `<div class="small muted" style="margin-top:6px">Domination: hold rigs on ${E.dominationNeed(st)} of ${E.middleDeposits(st).length} No Man's Sea deposits for ${DOMINATION.rounds} rounds to win. You hold ${E.middleRigs(st, p)}.</div>` : ''}
  </div>
  <div class="card">
    <h3>Resources</h3>
    <div class="stats">
      <div class="stat"><span>Money</span><span class="v money">$${pl.money}</span></div>
      <div class="stat"><span>Oil</span><span class="v oil" title="Storage cap: oil pumped past ${ECONOMY.oilCap} spills">${pl.oil}/${ECONOMY.oilCap}</span></div>
      <div class="stat"><span>Oil price</span><span class="v">$${st.market.price.toFixed(2)}</span></div>
      <div class="stat"><span>Rigs</span><span class="v">${rigs}</span></div>
      <div class="stat"><span>Fleet</span><span class="v">${st.ships.filter(x => x.owner === p).length} ships</span></div>
      <div class="stat"><span>Upkeep</span><span class="v" style="color:#f09595">−$${E.upkeepTotal(st, p)}/turn</span></div>
      <div class="stat"><span>Oil/turn</span><span class="v oil">+${st.rigs.filter(r => r.owner === p).reduce((t, r) => { const d = st.deposits.find(d => d.id === r.depId); return t + Math.min(DEPOSITS[d.type].rate, d.reserves); }, 0)}</span></div>
      <div class="stat"><span>Tier</span><span class="v">${tier}</span></div>
    </div>
    <div class="small muted" style="margin-top:6px">Sell oil (price drops as you sell, recovers each turn):</div>
    <div class="row">
      ${[1, 5, 10].map(n => `<button data-sell="${n}" ${pl.oil < n ? 'disabled' : ''}>Sell ${n} ($${E.sellValue(st, n).total})</button>`).join('')}
      <button data-sell="all" ${pl.oil < 1 ? 'disabled' : ''}>All</button>
    </div>
    <div class="row">
      <button data-rig="1" class="${mode.kind === 'placeRig' ? 'active' : ''}" ${pl.money < E.rigCost(st, p) ? 'disabled' : ''}>Build rig ($${E.rigCost(st, p)})</button>
      <button data-port="1" class="${mode.kind === 'placePort' ? 'active' : ''}" ${pl.money < E.portCost(st, p) ? 'disabled' : ''} title="Build on an island coast next to one of your ships. Launch new ships near it.">Build port ($${E.portCost(st, p)})</button>
      <button data-end="1" class="primary" style="margin-left:auto">End turn</button>
    </div>
  </div>`;

  if (s) {
    const def = SHIPS[s.type];
    const pas = Object.entries(def.passives || {}).map(([k, val]) => PASSIVE_TEXT[k] ? `<li>${PASSIVE_TEXT[k](val)}</li>` : '').join('');
    const canMove = !(s.acted && !def.passives?.hitAndRun);
    html += `
    <div class="card">
      <h3>Selected · ${def.name}</h3>
      <div class="stats">
        <div class="stat"><span>HP</span><span class="v">${s.hp}/${def.hp}</span></div>
        <div class="stat"><span>Moves left</span><span class="v">${canMove ? s.movesLeft : 0}</span></div>
        <div class="stat"><span>Oil/square</span><span class="v oil">${def.oil}${E.moveCost(st, s, 2) < def.oil * 2 ? ' (½)' : ''}</span></div>
        <div class="stat"><span>Sight</span><span class="v">${def.sight}</span></div>
        <div class="stat"><span>Upkeep</span><span class="v">$${E.upkeepOf(s.type)}/turn</span></div>
      </div>
      ${pas ? `<ul class="small muted" style="padding-left:18px;margin:8px 0 0">${pas}</ul>` : ''}
      ${def.actions.map(a => {
        const why = E.canUseAction(st, s, a);
        const shots = s.activeAction === a.id && s.shotsLeft > 0 ? ` — ${s.shotsLeft} shot${s.shotsLeft > 1 ? 's' : ''} left` : '';
        return `<button class="action-btn ${mode.kind === 'target' && mode.actionId === a.id ? 'active' : ''}" data-act="${a.id}" ${why ? 'disabled' : ''}>
          <b>${a.name}</b>${a.free ? ' <span class="small muted">(free)</span>' : ''}${shots}
          <span class="why">${why || describeAction(a)}</span></button>`;
      }).join('')}
      <div class="row">
        <button data-rotate="1" ${!canMove || s.movesLeft < 1 ? 'disabled' : ''}>Turn 90° (R) · ${E.moveCost(st, s, 1)} oil</button>
        <button data-deselect="1" class="ghost">Deselect</button>
      </div>
    </div>`;
  }

  html += `<div class="card"><h3>Shipyard</h3><div class="small muted">New ships launch in your spawn zone (the lighter strip at your map edge) or within ${PORT.range} squares of one of your forward ports. Ready next turn. Press R to turn while placing.</div>`;
  for (const t of [1, 2, 3]) {
    const unlocked = E.tierUnlocked(st, p, t);
    html += `<div class="shop-tier"><div class="tier-head"><span>Tier ${t}</span><span>${unlocked ? 'Unlocked' : `Needs ${TIER_RIGS[t]} rigs`}</span></div>`;
    for (const [k, def] of Object.entries(SHIPS).filter(([, d]) => d.tier === t)) {
      const afford = pl.money >= def.cost;
      const tip = [describeShip(def), ...Object.entries(def.passives || {}).map(([pk, pv]) => PASSIVE_TEXT[pk]?.(pv))].filter(Boolean).join('\n');
      html += `<div class="shop-item ${unlocked ? '' : 'locked'}" title="${tip.replace(/"/g, '&quot;')}">
        ${shapeSvg(def.shape)}
        <div><div class="name">${def.name}</div><div class="meta">HP ${def.hp} · Move ${def.move} · ${def.oil} oil/sq · Sight ${def.sight} · Upkeep $${E.upkeepOf(k)}</div></div>
        <button data-buy="${k}" class="${mode.kind === 'placeShip' && mode.ship === k ? 'active' : ''}" ${!unlocked || !afford ? 'disabled' : ''}>$${def.cost}</button>
      </div>`;
    }
    html += '</div>';
  }
  html += '</div>';

  html += `<div class="card"><h3>Log</h3><div class="log">${pl.log.map(l => `<div class="${l.turn >= st.turnCount - 1 ? 'new' : ''}">${l.text}</div>`).join('')}</div></div>`;
  document.getElementById('panel').innerHTML = html;
}
function describeAction(a) {
  switch (a.kind) {
    case 'attack': return `Range ${a.range}, ${a.dmg} dmg${a.shots ? ` × ${a.shots} shots` : ''}${a.area === 3 ? ', 3×3 area' : ''}${a.subsOnly ? ', subs only' : ''}${a.rigMult ? `, ×${a.rigMult} vs rigs` : ''}${a.cooldown ? `, reload ${a.cooldown}` : ''}`;
    case 'scan': return `Reveal a ${a.size}×${a.size} area within ${a.range}${a.cooldown ? `, reload ${a.cooldown}` : ''}`;
    case 'survey': return `Find oil within ${a.radius} square${a.radius > 1 ? 's' : ''} of this ship`;
    case 'mine': return `Place a hidden mine next to this ship (max ${a.max})`;
    case 'repair': return `Heal ${a.amount} HP on an adjacent ship or rig`;
    case 'spoof': return `Plant a fake contact on the enemy's screen within ${a.range}`;
    case 'salvage': return `Recover ${a.share * 100}% of a wreck's value (adjacent)`;
  }
  return '';
}
const describeShip = def => def.actions.map(a => `${a.name}: ${describeAction(a)}`).join('\n');
function shapeSvg(shape) {
  const s = 9, w = Math.max(...shape.map(c => c[0])) + 1, h = Math.max(...shape.map(c => c[1])) + 1;
  return `<svg width="52" height="24" viewBox="0 0 52 24"><g transform="translate(${(52 - w * s) / 2},${(24 - h * s) / 2})">${shape.map(([x, y]) => `<rect x="${x * s}" y="${y * s}" width="${s - 1}" height="${s - 1}" rx="1.5" fill="#2bb3a3"/>`).join('')}</g></svg>`;
}

function updateStatus() {
  const el = document.getElementById('status');
  const s = selected();
  let t = '';
  if (mode.kind === 'move' && s) {
    if (hover) {
      const [ox, oy] = centerOffset(s.type, s.rot);
      const n = reach().get((hover.x - ox) + ',' + (hover.y - oy));
      t = n ? `Move ${n.d} square${n.d > 1 ? 's' : ''} for <b class="oil">${E.moveCost(st, s, n.d)} oil</b>. Green dashed box = what it would see from there. Click to move.` : 'Click a highlighted spot to move, or pick an action in the panel.';
    } else t = `<b>${SHIPS[s.type].name}</b> selected. White dashed box = what it can see (sight ${SHIPS[s.type].sight}). Click a highlighted spot to move. R to turn. Esc to deselect.`;
  } else if (mode.kind === 'target' && s) {
    const a = SHIPS[s.type].actions.find(x => x.id === mode.actionId);
    t = `<b>${a.name}</b>: click a target in the highlighted range. Right-click or Esc to cancel.`;
  } else if (mode.kind === 'placeShip') t = `Place your <b>${SHIPS[mode.ship].name}</b> in the outlined launch zone: your spawn strip, or near one of your forward ports. R to turn, Esc to cancel.`;
  else if (mode.kind === 'placePort') {
    const why = hover && E.portBuildProblem(st, me(), hover.x, hover.y);
    t = hover && !why ? `Click to build a forward port here for <b class="money">$${E.portCost(st, me())}</b>. Ships can launch inside the dashed area.`
      : `Click a <b style="color:#7fd17a">highlighted island coast</b> next to one of your ships to build a port.${why ? ` <span style="color:#f09595">${why}</span>` : ''} Esc to cancel.`;
  }
  else if (mode.kind === 'placeRig') {
    const any = E.getView(st, me()).deposits.some(d => !E.rigBuildProblem(st, me(), d.x, d.y));
    const why = hover && E.rigBuildProblem(st, me(), hover.x, hover.y);
    t = !any ? '<b>No deposit available right now.</b> A rig needs a discovered deposit with one of your ships right next to it. Esc to cancel.'
      : hover && !why ? `Click to build a rig here for <b class="money">$${E.rigCost(st, me())}</b>.`
      : `Click a <b style="color:#7fd17a">highlighted deposit</b> to build a rig.${why && hover ? ` <span style="color:#f09595">${why}</span>` : ''} Esc to cancel.`;
  }
  else t = 'Click one of your ships to select it. Red-outlined "?" = enemy contacts (coloured by owner). S/M/R = small/medium/rich oil.';
  const oil = hover && oilInfo(E.getView(st, me()), hover.x, hover.y);
  if (oil && mode.kind !== 'target') t = oil.map(l => l.t).join(' · ');
  if (hover) t += ` <span class="muted">· ${E.coord(hover.x, hover.y)}${(st.players[me()].surveyed || {})[hover.x + ',' + hover.y] ? ' · <span style="color:#a9d77a">surveyed</span>' : ''} · ${(z => z === 'middle' ? "No Man's Sea" : z === me() ? 'Your waters' : pname(z) + "'s waters")(E.zoneOf(st, hover.x, hover.y))}</span>`;
  el.innerHTML = t;
}

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.add('hidden'), 2600);
}

export function showOverlay(html, bind) {
  const ov = document.getElementById('overlay');
  document.getElementById('overlay-card').innerHTML = html;
  ov.classList.remove('hidden');
  bind?.(document.getElementById('overlay-card'), () => ov.classList.add('hidden'));
}
export function showConfirm(title, text, yesLabel, onYes, onNo) {
  showOverlay(`<h2>${title}</h2><p class="muted">${text}</p>
    <div class="row" style="margin-top:16px"><button class="primary big" data-yes>${yesLabel}</button><button class="big ghost" data-no>Cancel</button></div>`,
  (card, close) => {
    card.querySelector('[data-yes]').onclick = () => { close(); onYes(); };
    card.querySelector('[data-no]').onclick = () => { close(); onNo?.(); };
  });
}
export function showRules() {
  showOverlay(`<div class="rules">
    <h2>How to play Last Rig Standing</h2>
    <p>Two to four admirals, one sea. Oil moves your ships and pays for your war. A player who runs out of ships, rigs and money is out. Last rig standing wins.</p>
    <h4>Your turn</h4>
    <ul>
      <li>Each ship can <b>move</b> (up to its Move, paying oil per square) and take <b>one action</b> (attack, scan, survey…). Once a ship attacks it can't move, unless it has Hit and Run.</li>
      <li>Turning a ship 90° costs one square of movement. Press <b>R</b>.</li>
      <li>Buy ships in the Shipyard. They launch in your spawn zone (the lighter strip at your edge of the map) and are ready next turn.</li>
      <li>Sell oil for money. Selling a lot at once drops the price; it recovers each turn.</li>
      <li><b>Upkeep:</b> every ship costs 5% of its price in money each turn. Ships you can't pay for lose 1 HP. Big idle fleets drain you.</li>
      <li><b>Storage:</b> you can hold ${ECONOMY.oilCap} oil. Anything pumped past that spills, so use it or sell it.</li>
      <li><b>Forward ports:</b> build one on an <b>island coast</b> (island land touching water) with one of your ships right next to it. New ships can then launch within ${PORT.range} squares of the port. Ports have ${PORT.hp} HP, see ${PORT.sight} squares, and can be shot.</li>
    </ul>
    <h4>Oil</h4>
    <ul>
      <li>Deposits are hidden and move every game. Use <b>Survey</b> to find them. S/M/R = small/medium/rich. Water you've surveyed turns <b style="color:#a9d77a">green</b>, so you know where you've already looked.</li>
      <li>Every deposit starts with a random amount of oil. Hover over a deposit or rig to see what's left (e.g. 18/35). Rigs pump the same rate until the deposit runs dry.</li>
      <li>Home deposits are small and run dry within a few rounds (every player's home gets the exact same amounts). No Man's Sea deposits hold several times more, so sooner or later you have to go fight for them.</li>
      <li>Build a rig on a discovered deposit next to one of your ships. Rigs produce oil each turn until the deposit runs dry.</li>
      <li>Owning 3 rigs unlocks Tier 2 ships. 5 rigs unlocks Tier 3.</li>
    </ul>
    <h4>Fog of war</h4>
    <ul>
      <li>Each ship sees a set number of squares around it (its <b>Sight</b>: 1 for support ships up to 4 for carriers and command ships). Rigs see 1 square. Water you can see is bright; everything else is darkened fog.</li>
    <li>You only see enemies inside that bright area, or revealed by scans. Enemy ships show as red-outlined "?" contacts in their owner's colour.</li>
      <li>You can fire at any square in range, even blind. White dot = miss, red X = hit, blue slash = intercepted.</li>
      <li>Firing reveals your rough position: everyone else sees an orange dashed box near you on their next turn. Orange circles show enemy shots that landed in your waters or hit your stuff.</li>
      <li>Submarines are only seen when adjacent or by destroyer sonar. Jammers blank out scans (purple hatching). Decoys and spoofs fake contacts.</li>
      <li>Moving into an unseen enemy stops your ship and reveals it. Mines are invisible to the enemy.</li>
    </ul>
    <h4>Winning</h4>
    <p>Knock everyone else out (no ships, no rigs, under $60), or, if Domination is on, hold rigs on at least half of No Man's Sea's deposits for ${DOMINATION.rounds} rounds in a row.</p>
    <h4>Wrecks</h4>
    <p>Sunk ships leave wrecks. A Salvage Ship can recover half their value, from any side. When a player is knocked out, their whole fleet becomes wrecks.</p>
    <div class="row" style="margin-top:16px"><button class="primary" data-close>Got it</button></div>
  </div>`, (card, close) => card.querySelector('[data-close]').onclick = close);
}
