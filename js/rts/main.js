// ============================================================
// RTS · the page: the game loop, the camera, mouse and keys, and the HUD.
//   Left-click / drag: select (Shift adds; double-click: every one of that kind on screen)
//   Right-click: move · attack what's under the cursor · workers on an oil deposit: build a rig · a yard: rally point
//   A + click: attack-move · S stop · H hold · F use the ship's ability · Ctrl+1-9 make a group, 1-9 select it (twice: go there)
//   A worker: B opens the build menu (O rig, then each platform's letter) · a yard: its ships' letters · a base: U upgrade
//   Space: pause (orders still work) · Esc: cancel / menu · wheel: zoom · arrows, screen edges or middle-drag: scroll
//   Home: jump to your Admiralty · . (full stop): next idle worker · Tab: research · N, M: commander powers
// The match settings come from the main menu's New game page (sessionStorage 'lrs-rts'); without them, a quick
// 1-v-1 against a Normal computer.
// ============================================================
import { UNITS, PLATS, ROSTER, SUPPLY, PLAT_ORDER, BASE_LEVELS, QUARTERS_NEEDED_FROM, HQ_INCOME, MARKET, PUMP, UPKEEP_RATE } from './data.js';
import { newMatch } from './world.js';
import { step, order, orderBuild, queueUnit, cancelQueue, canPlace, supplyOf, rates, byId, radiusOf, seen, oilCapOf, sellOil, upgradeBase, useAbility,
  foundingCost, claimOf, slotsOf, usedSlots, platsOf, basesOf, nameOf, sellBonus, sellPrice, upgradeCost, players } from './sim.js';
import { ud, pd, shipOk, shipLock, platOk, platLock, maxLevel, TECH, etaOf, rpIncome } from './tech.js';
import { powersOf, powerCd, usePower, COMMANDERS } from './powers.js';
import { fixBlowout, EVENTS } from './events.js';
import { openResearch, closeResearch, researchOpen, renderResearch } from './research.js';
import { aiStep } from './ai.js';
import { render, renderMini, structSize } from './render.js';

const $ = s => document.querySelector(s);
const cv = $('#rts'), mini = $('#mini');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const BUILD_KEYS = Object.fromEntries(PLAT_ORDER.map(k => [k, PLATS[k].code.length === 1 && /[A-Z]/.test(PLATS[k].code) ? PLATS[k].code : 'X']));

function loadCfg() {
  try { const c = JSON.parse(sessionStorage.getItem('lrs-rts') || 'null'); if (c?.players?.length) return c; } catch { /* (no saved settings) */ }
  return { size: 'small', mapType: 'classic', mirror: true, fog: 'on', events: 'light', victory: { postoil: true }, players: [{ seat: 'human', faction: 'navy', name: 'You', commander: 'hale', level: 8 }, { seat: 'ai', faction: 'tide', difficulty: 'normal', name: 'Free Tide', commander: 'auto' }] };
}
let CFG = loadCfg(), G;
const V = { ctx: cv.getContext('2d'), cam: { x: 0, y: 0 }, cell: 26, w: 0, h: 0, dpr: 1, sel: new Set(), groups: {}, box: null, mouse: null, place: null, aim: null, amove: false,
  keys: new Set(), msgs: [], alerts: [], card: 'main', me: 0, all: false };

function start() {
  G = newMatch({ ...CFG, seed: Number.isInteger(CFG.seed) ? CFG.seed : undefined });
  const me = G.players.findIndex(P => P.human);
  V.me = me < 0 ? 0 : me; V.all = me < 0;
  V.sel.clear(); V.groups = {}; V.over = false; V.terrain = null; V.miniBase = null; V.fogC = null; V.place = V.aim = null; V.amove = false; V.card = 'main'; V.alerts = []; V.msgs = []; V.hitSeen = 0;
  $('#over').classList.add('hidden'); $('#menu').classList.add('hidden'); closeResearch();
  resize();
  V.cell = Math.max(V.minCell, 26);
  const hq = basesOf(G, V.me).find(b => b.capital); if (hq) lookAt(hq.x + 4, hq.y);
  if (V.all) { V.cell = V.minCell; lookAt(G.m.W / 2, G.m.H / 2); say('Spectating: every seat is a computer.'); }
  else {
    select(G.units.filter(u => u.team === V.me && !UNITS[u.type].worker).map(u => u.id));
    say('Drill the oil: select a worker, right-click a deposit. Sell oil for money, build ships at your Admiralty.');
  }
  setPause(false);
}

// ---------- the camera ----------
function resize() {
  const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
  V.w = r.width; V.h = r.height; V.dpr = dpr;
  V.minCell = Math.max(4, Math.min(V.w / G.m.W, V.h / G.m.H));
  V.cell = Math.max(V.minCell, Math.min(64, V.cell));
  // (the minimap keeps the map's shape)
  const box = mini.parentElement.getBoundingClientRect(), k = Math.min((box.width - 2) / G.m.W, (box.height - 2) / G.m.H);
  mini.width = Math.max(40, Math.floor(G.m.W * k)); mini.height = Math.max(30, Math.floor(G.m.H * k));
  clampCam();
}
function clampCam() {
  const vw = V.w / V.cell, vh = V.h / V.cell, pad = 2;
  V.cam.x = vw >= G.m.W ? (G.m.W - vw) / 2 : Math.max(-pad, Math.min(G.m.W - vw + pad, V.cam.x));
  V.cam.y = vh >= G.m.H ? (G.m.H - vh) / 2 : Math.max(-pad, Math.min(G.m.H - vh + pad, V.cam.y));
}
function lookAt(x, y) { V.cam.x = x - V.w / V.cell / 2; V.cam.y = y - V.h / V.cell / 2; clampCam(); }
const world = e => { const r = cv.getBoundingClientRect(); return { x: V.cam.x + (e.clientX - r.left) / V.cell, y: V.cam.y + (e.clientY - r.top) / V.cell, sx: e.clientX - r.left, sy: e.clientY - r.top }; };

// ---------- picking things ----------
const mine = e => e.team === V.me && !V.all;
const canSee = e => mine(e) || V.all || G.cfg.fog === 'off' || (e.kind === 'unit' ? seen(G, V.me, e) : !!G.explored[V.me][(e.y | 0) * G.m.W + (e.x | 0)]);
function entityAt(p) {
  let best = null, bd = 1e9;
  for (const e of [...G.units, ...G.structs]) {
    if (!canSee(e)) continue;
    if (V.all && e.kind === 'unit' && UNITS[e.type].submerged && !seen(G, e.team === 0 ? 1 : 0, e)) { /* (spectators see subs too) */ }
    const d = Math.hypot(e.x - p.x, e.y - p.y), r = (e.kind === 'unit' ? radiusOf(e) : structSize(e) / 2) + 0.2;
    if (d <= r && d < bd) { bd = d; best = e; }
  }
  return best;
}
const selected = () => [...V.sel].map(id => byId(G, id)).filter(Boolean);
const myUnits = () => selected().filter(e => e.kind === 'unit' && mine(e));
const myWorkers = () => myUnits().filter(u => UNITS[u.type].worker);
const isYard = s => s.kind === 'struct' && s.built >= 1 && ((s.type === 'base' && s.capital) || s.type === 'drydock');
const myYards = () => selected().filter(s => mine(s) && isYard(s));
function select(ids, add) { if (!add) V.sel.clear(); for (const id of ids) V.sel.add(id); V.place = null; V.aim = null; V.amove = false; V.card = 'main'; hud(true); }
function say(text, cls = '') { V.msgs.push({ t: performance.now(), text, cls }); }

// ---------- mouse ----------
let lastClick = { t: 0, id: null }, mid = null;
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('mousedown', e => {
  const p = world(e);
  if (e.button === 1) { mid = { x: e.clientX, y: e.clientY, cam: { ...V.cam } }; e.preventDefault(); return; }
  if (e.button === 2) { if (V.place || V.aim || V.amove) { V.place = V.aim = null; V.amove = false; hud(true); return; } return rightClick(p, e); }
  if (V.place) return placeAt(p, e.shiftKey);
  if (V.aim) return aimAt(p, e.shiftKey);
  if (V.amove) {
    V.amove = false; const us = myUnits().filter(u => UNITS[u.type].weapons.length).map(u => u.id);
    const t = entityAt(p); if (t && !mine(t) && t.team !== V.me) order(G, us, { type: 'attack', target: t.id }); else order(G, us, { type: 'amove', x: p.x, y: p.y });
    ping(p, '#ff8a7a'); hud(true); return;
  }
  V.box = { x0: p.sx, y0: p.sy, x1: p.sx, y1: p.sy, add: e.shiftKey };
});
window.addEventListener('mousemove', e => {
  V.client = { x: e.clientX, y: e.clientY };
  if (e.target !== cv && !V.box && !mid) { V.mouse = null; V.screen = null; return; }
  const p = world(e); V.mouse = p; V.screen = { x: p.sx, y: p.sy };
  if (mid) { V.cam.x = mid.cam.x - (e.clientX - mid.x) / V.cell; V.cam.y = mid.cam.y - (e.clientY - mid.y) / V.cell; clampCam(); }
  if (V.box) { V.box.x1 = p.sx; V.box.y1 = p.sy; }
  if (V.place) V.placeCheck = canPlace(G, V.me, V.place, p.x, p.y);
});
window.addEventListener('mouseup', e => {
  if (e.button === 1) { mid = null; return; }
  if (!V.box) return;
  const b = V.box; V.box = null;
  if (Math.abs(b.x1 - b.x0) < 5 && Math.abs(b.y1 - b.y0) < 5) {
    const p = world(e), hit = entityAt(p);
    if (!hit) { if (!b.add) select([]); return; }
    const now = performance.now();
    if (mine(hit) && lastClick.id === hit.id && now - lastClick.t < 350) {
      // (double-click: every one of that kind on screen)
      select([...G.units, ...G.structs].filter(u => mine(u) && u.type === hit.type && onScreen(u)).map(u => u.id), b.add);
    } else if (b.add && mine(hit)) { V.sel.has(hit.id) ? V.sel.delete(hit.id) : V.sel.add(hit.id); hud(true); }
    else select([hit.id]);
    lastClick = { t: now, id: hit.id };
    return;
  }
  const xa = V.cam.x + Math.min(b.x0, b.x1) / V.cell, xb = V.cam.x + Math.max(b.x0, b.x1) / V.cell, ya = V.cam.y + Math.min(b.y0, b.y1) / V.cell, yb = V.cam.y + Math.max(b.y0, b.y1) / V.cell;
  const inside = G.units.filter(u => mine(u) && u.x >= xa && u.x <= xb && u.y >= ya && u.y <= yb);
  // (a box with warships in it takes the warships; workers only if that's all there is)
  const war = inside.filter(u => !UNITS[u.type].worker);
  select((war.length ? war : inside).map(u => u.id), b.add);
});
cv.addEventListener('wheel', e => {
  e.preventDefault();
  const p = world(e), k = Math.exp(-e.deltaY * 0.0015);
  V.cell = Math.max(V.minCell, Math.min(64, V.cell * k));
  V.cam.x = p.x - p.sx / V.cell; V.cam.y = p.y - p.sy / V.cell; clampCam();
}, { passive: false });
const onScreen = u => u.x >= V.cam.x && u.y >= V.cam.y && u.x <= V.cam.x + V.w / V.cell && u.y <= V.cam.y + V.h / V.cell;
function nearestWorker(p, list = myWorkers()) { return [...list].sort((a, b) => busy(a) - busy(b) || Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0]; }
const busy = u => (u.order.type === 'build' ? 1 : 0);
function rightClick(p) {
  const us = myUnits(), yards = myYards();
  if (!us.length) {
    if (yards.length) { for (const y of yards) y.rally = { x: p.x, y: p.y }; ping(p, '#ffd666'); say('Rally point set.'); }
    return;
  }
  const t = entityAt(p);
  if (t && t.team !== V.me && !G.players[V.me].allies.includes(t.team)) {
    const war = us.filter(u => UNITS[u.type].weapons.length);
    if (war.length) { order(G, war.map(u => u.id), { type: 'attack', target: t.id }); ping(p, '#ff8a7a'); }
    const rest = us.filter(u => !war.includes(u)); if (rest.length) order(G, rest.map(u => u.id), { type: 'move', x: p.x, y: p.y });
    return;
  }
  // workers on a free deposit: drill it (a rig, or a Wellhead inside one of your claims)
  const dep = G.m.deposits.find(d => Math.hypot(d.x - p.x, d.y - p.y) < 0.75 && (V.all || G.explored[V.me][(d.y | 0) * G.m.W + (d.x | 0)]));
  const ws = myWorkers();
  if (dep && ws.length && !G.structs.some(s => s.dep === dep.id && (s.type === 'base' || s.type === 'wellhead'))) {
    const w = nearestWorker(p, ws), well = canPlace(G, V.me, 'wellhead', dep.x, dep.y);
    const r = orderBuild(G, w.id, well.ok ? 'wellhead' : 'base', dep.x, dep.y);
    if (!r.ok) say(r.why, 'bad'); else { ping(p, '#ffd666'); say(well.ok ? `Building a Wellhead ($${PLATS.wellhead.cost}).` : `Founding a base: an Outpost rig ($${foundingCost(G, V.me) - 0}).`); }
    const rest = us.filter(u => u !== w).map(u => u.id); if (rest.length) order(G, rest, { type: 'move', x: p.x, y: p.y });
    hud(true); return;
  }
  order(G, us.map(u => u.id), { type: 'move', x: p.x, y: p.y }); ping(p, '#8ef0c8');
}
function ping(p, col) { G.fx.push({ kind: 'ping', x: p.x, y: p.y, col, t: 0, life: 0.5 }); }
function placeAt(p, keep) {
  const w = nearestWorker(p); if (!w) { say('Select a worker to build.', 'bad'); V.place = null; return; }
  const r = orderBuild(G, w.id, V.place, p.x, p.y);
  if (!r.ok) say(r.why, 'bad'); else { ping(p, '#ffd666'); if (!keep) { V.place = null; V.card = 'main'; } }
  hud(true);
}
function aimAt(p, keep) {
  if (V.aim.kind === 'power') { const r = usePower(G, V.me, V.aim.id, p.x, p.y); if (!r.ok) say(r.why, 'bad'); else V.aim = null; hud(true); return; }
  const A = V.aim, srcs = A.srcs.map(id => byId(G, id)).filter(Boolean);
  const ready = srcs.filter(e => !(e.cds[A.id] > 0)).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
  if (!ready.length) { say('Not ready yet.', 'bad'); return; }
  const r = useAbility(G, ready[0].id, A.id, p.x, p.y);
  if (!r.ok) say(r.why || "Can't do that.", 'bad'); else if (!keep) V.aim = null;
  hud(true);
}

// ---------- abilities: what the selection can do ----------
function abilitiesOf(sel) {
  const out = new Map();
  for (const e of sel) {
    if (!mine(e)) continue;
    let list = [];
    if (e.kind === 'unit') list = ud(G, e.team, e.type).abilities.filter(a => a.kind === 'scan' || a.kind === 'strike');
    else if (e.built >= 1 && e.type !== 'base') { const d = PLATS[e.type]; if (d.recon) list.push({ ...d.recon, id: 'recon', name: 'Recon flight', kind: 'scan' }); if (d.strike && !d.strike.auto) list.push({ ...d.strike, id: 'strike', kind: 'strike' }); }
    for (const a of list) { const o = out.get(a.id) || { ...a, srcs: [] }; o.srcs.push(e.id); out.set(a.id, o); }
  }
  return [...out.values()];
}
function startAim(a) {
  V.place = null; V.amove = false;
  V.aim = { id: a.id, kind: a.kind, range: a.range, area: a.kind === 'scan' ? (a.size || 3) / 2 + 0.6 : a.area || 1, srcs: a.srcs };
  say(a.kind === 'scan' ? `${a.name}: click where to look (range ${a.range}).` : `${a.name}: click a target you can see (range ${a.range}).`);
  hud(true);
}

// ---------- keys ----------
window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  const k = e.key.toLowerCase();
  V.keys.add(e.key);
  const menuOpen = !$('#menu').classList.contains('hidden');
  if (k === ' ') { e.preventDefault(); if (!G.over && !menuOpen) setPause(!G.paused); return; }
  if (k === 'escape') {
    if (!$('#help').classList.contains('hidden')) { $('#help').classList.add('hidden'); return; }
    if (researchOpen()) { closeResearch(); return; }
    if (V.place || V.aim || V.amove || V.card !== 'main') { V.place = V.aim = null; V.amove = false; V.card = 'main'; hud(true); return; }
    toggleMenu(); return;
  }
  if (menuOpen) return;
  if (/^[1-9]$/.test(k)) {
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); V.groups[k] = [...V.sel]; say(`Group ${k} set.`); return; }
    const ids = (V.groups[k] || []).filter(id => byId(G, id));
    if (!ids.length) return;
    const same = ids.length === V.sel.size && ids.every(id => V.sel.has(id));
    select(ids);
    if (same) { const us = ids.map(id => byId(G, id)); lookAt(us.reduce((t, u) => t + u.x, 0) / us.length, us.reduce((t, u) => t + u.y, 0) / us.length); }
    return;
  }
  if (e.key === 'Tab') { e.preventDefault(); if (V.all) return; researchOpen() ? closeResearch() : openResearch({ G, team: V.me, say }); return; }
  if (researchOpen() && k !== ' ') return;
  if ((k === 'n' || k === 'm') && !e.ctrlKey && !V.all && !(V.card === 'build' && myWorkers().length)) { const w = powersOf(G, V.me)[k === 'n' ? 0 : 1]; if (w) { power(w); return; } }
  if (k === 'home') { const hq = basesOf(G, V.me).find(b => b.capital); if (hq) { lookAt(hq.x, hq.y); if (!V.all) select([hq.id]); } return; }
  if (k === '.') { const idle = G.units.filter(u => mine(u) && UNITS[u.type].worker && u.order.type === 'idle'); if (!idle.length) { say('No idle workers.'); return; } V.idleI = ((V.idleI || 0) + 1) % idle.length; const w = idle[V.idleI]; select([w.id]); lookAt(w.x, w.y); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const sel = selected(), yards = myYards(), us = myUnits(), ws = myWorkers();
  // a worker's build menu
  if (V.card === 'build' && ws.length) {
    if (k === 'o') { startPlace('base'); return; }
    const t = PLAT_ORDER.find(t => BUILD_KEYS[t].toLowerCase() === k); if (t) { startPlace(t); return; }
    return;
  }
  if (yards.length) { const t = roster().find(t => UNITS[t].key.toLowerCase() === k); if (t) { buildShip(t); return; } }
  if (k === 'u') { const b = sel.find(s => mine(s) && s.type === 'base'); if (b) { upgrade(b); return; } }
  if (k === 'b' && ws.length) { V.card = 'build'; hud(true); return; }
  if (k === 'f') { const ab = abilitiesOf(sel)[0]; if (ab) { startAim(ab); return; } }
  if (k === 'a' && us.some(u => UNITS[u.type].weapons.length)) { V.amove = true; V.place = V.aim = null; say('Attack-move: click a spot (they fight anything on the way) or a target.'); return; }
  if (k === 's' && us.length) { order(G, us.map(u => u.id), { type: 'stop' }); return; }
  if (k === 'h' && us.length) { order(G, us.map(u => u.id), { type: 'hold' }); return; }
});
window.addEventListener('keyup', e => V.keys.delete(e.key));
window.addEventListener('blur', () => V.keys.clear());
// your side's ships, without other commanders' exclusive ones
const roster = () => ROSTER[G.players[V.me].side].filter(t => !UNITS[t].commander || UNITS[t].commander === G.players[V.me].cmd?.id);
function buildShip(type) {
  const yards = myYards().sort((a, b) => a.queue.length - b.queue.length);
  if (!yards.length) return;
  const r = queueUnit(G, yards[0].id, type); if (!r.ok) say(r.why, 'bad');
  hud(true);
}
function power(w) {
  if (powerCd(G, V.me, w.id) > 0) { say(`${w.name}: ready in ${Math.ceil(powerCd(G, V.me, w.id))}s.`, 'bad'); return; }
  if (w.target) { V.place = null; V.amove = false; V.aim = { kind: 'power', id: w.id, area: w.area ? w.area / 2 : w.size ? w.size / 2 : 0.8 }; say(`${w.name}: ${{ seen: 'click a spot you can see', any: 'click anywhere', tide: 'click a spot on your Tide', base: 'click an enemy base', struct: 'click an enemy platform' }[w.target]}.`); hud(true); return; }
  const r = usePower(G, V.me, w.id, 0, 0); if (!r.ok) say(r.why, 'bad'); hud(true);
}
function upgrade(b) { const r = upgradeBase(G, b.id); if (!r.ok) say(r.why, 'bad'); else say(`Upgrading to ${BASE_LEVELS[b.level + 1].name}.`); hud(true); }
function startPlace(t) {
  const cost = t === 'base' ? foundingCost(G, V.me) : PLATS[t].cost;
  if (G.players[V.me].money < cost) { say(`Needs $${cost}.`, 'bad'); return; }
  V.place = t; V.aim = null; V.amove = false;
  say(t === 'base' ? 'Click a free oil deposit to found a base there.' : t === 'wellhead' ? 'Click an oil deposit inside one of your claims.' : `Click a free square inside one of your claims (the dashed squares). Shift-click to place more.`);
  hud(true);
}
function setPause(on) { G.paused = on; $('#pause').textContent = on ? '▶ Resume' : '⏸ Pause'; $('#paused').classList.toggle('hidden', !on || !$('#menu').classList.contains('hidden')); }
function toggleMenu(force) {
  const m = $('#menu'), open = force ?? m.classList.contains('hidden');
  m.classList.toggle('hidden', !open);
  if (open) { V.wasPaused = G.paused; setPause(true); $('#paused').classList.add('hidden'); }
  else setPause(!!V.wasPaused);
}
$('#pause').onclick = () => { if (!G.over) setPause(!G.paused); };
$('#menu-btn').onclick = () => toggleMenu(true);
$('#m-resume').onclick = () => toggleMenu(false);
$('#m-restart').onclick = () => { CFG = { ...CFG, seed: undefined }; start(); };
$('#m-help').onclick = () => $('#help').classList.remove('hidden');
document.querySelectorAll('[data-speed]').forEach(b => b.onclick = () => { G.speed = +b.dataset.speed; document.querySelectorAll('[data-speed]').forEach(x => x.classList.toggle('on', x === b)); });
// the minimap: click or drag to look, right-click to send the selection
mini.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  const go = ev => { const r = mini.getBoundingClientRect(); lookAt((ev.clientX - r.left) / r.width * G.m.W, (ev.clientY - r.top) / r.height * G.m.H); };
  go(e); const mv = ev => go(ev), up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
  window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
});
mini.addEventListener('contextmenu', e => {
  e.preventDefault(); const r = mini.getBoundingClientRect(), p = { x: (e.clientX - r.left) / r.width * G.m.W, y: (e.clientY - r.top) / r.height * G.m.H };
  const us = myUnits(); if (us.length) order(G, us.map(u => u.id), { type: 'move', x: p.x, y: p.y }); else for (const y of myYards()) y.rally = p;
});
// oil sales
$('#res').addEventListener('pointerdown', e => {
  if (e.target.closest('[data-research]')) { researchOpen() ? closeResearch() : openResearch({ G, team: V.me, say }); return; }
  const b = e.target.closest('[data-sell]'); if (!b || V.all) return;
  const P = G.players[V.me], n = b.dataset.sell === 'all' ? Math.floor(P.oil) : +b.dataset.sell;
  const before = Math.floor(P.oil), got = sellOil(G, V.me, n);
  if (got > 0) say(`Sold ${before - Math.floor(P.oil)} oil for $${Math.round(got)}.`); else say('No oil to sell.', 'bad');
  hud(true);
});

// ---------- the HUD ----------
// (buttons act on pointerdown, through one listener per panel, so a HUD refresh under the cursor never eats a click)
$('#card').addEventListener('pointerdown', e => {
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  const d = b.dataset;
  if (d.unit) buildShip(d.unit);
  else if (d.cancel) { cancelQueue(G, +d.yard, +d.cancel); hud(true); }
  else if (d.place) startPlace(d.place);
  else if (d.menu) { V.card = d.menu; V.place = null; hud(true); }
  else if (d.upgrade) upgrade(byId(G, +d.upgrade));
  else if (d.fix) { const r = fixBlowout(G, +d.fix); if (!r.ok) say(r.why, 'bad'); else say('Fixed: the rig is pumping again.'); hud(true); }
  else if (d.ability) { const a = abilitiesOf(selected()).find(a => a.id === d.ability); if (a) startAim(a); }
  else if (d.cmd === 'amove') { V.amove = true; say('Attack-move: click a spot or a target.'); }
  else if (d.cmd) order(G, myUnits().map(u => u.id), { type: d.cmd });
});
$('#cmdr').addEventListener('pointerdown', e => { const b = e.target.closest('[data-power]'); if (!b) return; const w = powersOf(G, V.me).find(w => w.id === b.dataset.power); if (w) power(w); });
$('#sel').addEventListener('pointerdown', e => {
  const b = e.target.closest('[data-pick]'); if (!b) return;
  const type = b.dataset.pick; select(selected().filter(x => x.type === type).map(x => x.id), false);
});
const money = n => (n < 0 ? '−$' : '$') + Math.abs(Math.round(n)).toLocaleString();
const secs = s => (s >= 60 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : `${Math.round(s)}s`);
function weaponLine(w) {
  if (w.ram) return `💥 ${w.name}: rams for ${Math.round(w.dmg)}, then it's gone`;
  return `🎯 ${w.name}: ${Math.round(w.dmg)}${w.shots > 1 ? ` × ${w.shots}` : ''} dmg, range ${w.range}, every ${w.reload.toFixed(1)}s${w.area ? ' · splash' : ''}${w.subsOnly ? ' · subs only' : w.torpedo ? ' · torpedo (hits subs)' : ''}${w.air ? ' · air' : ''}`;
}
function unitTip(t) {
  const d = ud(G, V.me, t), lock = shipLock(G, V.me, t), lines = [`<b>${d.name}</b> <span class="muted">${d.cls || ''}</span>`, ...(lock ? [`<span class="bad">🔒 Needs: ${lock}</span>`] : []), `${money(d.cost)} · 🛢 ${d.oil} · ⚓ ${d.supply} supply · builds in ${secs(d.build)}`,
    `❤ ${d.hp} HP${d.armor ? ` · armor ${d.armor}` : ''} · speed ${d.speed.toFixed(1)} · sight ${d.sight}`];
  for (const w of d.weapons) lines.push(weaponLine(w));
  for (const a of d.abilities) lines.push(a.kind === 'scan' ? `👁 ${a.name} (F): reveals an area up to ${a.range} away, every ${secs(a.cooldown)}` : a.kind === 'strike' ? `🚀 ${a.name} (F): ${Math.round(a.dmg)} dmg up to ${a.range} away, every ${secs(a.cooldown)}${a.money ? `, $${a.money}` : ''}${a.oil ? ` + ${a.oil} oil` : ''}` : `🔧 ${a.name}: mends ships within ${a.range}`);
  if (d.worker) lines.push('🛠 Builds rigs and platforms');
  if (d.submerged) lines.push('🌊 Submerged: seen only up close or by sonar');
  if (d.sonar) lines.push(`📡 Sonar: spots subs within ${d.sonar}`);
  if (d.airDefense) lines.push(`🛡 Air defense: shoots down a missile within ${d.airDefense} every ${secs(6)}`);
  lines.push(`<span class="muted">Upkeep ${money(d.upkeep * 60)}/min</span>`);
  return lines.join('<br>');
}
function platTip(k) {
  const d = pd(G, V.me, k), lock = platLock(G, V.me, k), lines = [`<b>${d.name}</b>`, ...(lock ? [`<span class=bad>🔒 Needs: ${esc(lock)}</span>`] : []), `${money(d.cost)} · builds in ${secs(d.build)} · upkeep ${money(d.upkeep * 60)}/min${d.needsLevel > 1 ? ` · needs a ${BASE_LEVELS[d.needsLevel].name}` : ''}`];
  if (d.text) lines.push(esc(d.text));
  if (d.supply) lines.push(`⚓ +${d.supply} supply`);
  if (d.gun) lines.push(`🎯 ${Math.round(d.gun.dmg)} dmg, range ${d.gun.range}`);
  if (d.onDeposit) lines.push('Goes on an oil deposit inside a claim');
  return lines.join('<br>');
}
let hudT = 0, cardSig = '';
function hud(force) {
  const now = performance.now(); if (!force && now - hudT < 150) return; hudT = now;
  const P = G.players[V.me], sup = supplyOf(G, V.me), r = rates(G, V.me), cap = oilCapOf(G, V.me);
  const income = HQ_INCOME * basesOf(G, V.me).filter(b => b.capital && b.built >= 1).length - r.upkeep, price = sellPrice(G, V.me);
  const mm = Math.floor(G.t / 60), ss = Math.floor(G.t % 60), trend = G.market.price < MARKET.basePrice * 0.97 ? '<span class="bad">▼</span>' : '<span class="good">●</span>';
  const res = V.all ? `<span class="muted">Spectating</span> ${players(G).map(Q => `<span style="color:${Q.color}">${esc(Q.name)}${Q.out ? ' ✖' : ''}</span>`).join(' ')} <span class="muted">${mm}:${String(ss).padStart(2, '0')}</span>`
    : `<span class="money ${P.money < 0 ? 'bad' : ''}" title="Money. Net income per second: Admiralty +$${HQ_INCOME}, minus upkeep on ships and platforms">${money(P.money)} <small class="${income < 0 ? 'bad' : 'muted'}">${income >= 0 ? '+' : '−'}${Math.abs(income).toFixed(1)}/s</small></span>
    <span class="oil ${P.oil >= cap - 1 ? 'bad' : ''}" title="Oil in storage / capacity (Storage Tanks add more). Oil past the cap spills.">🛢 ${Math.floor(P.oil)}<small>/${cap}</small> <small class="muted">+${r.oil.toFixed(1)}/s</small></span>
    <span class="market" title="What a barrel sells for now${price !== G.market.price ? ' (with your refinery and research bonuses)' : ''}. Every barrel you sell knocks it down a little; it recovers over time.">${trend} $${price.toFixed(1)}/bbl
      <button data-sell="10">Sell 10</button><button data-sell="50">50</button><button data-sell="all">All</button></span>
    <span class="supply ${sup.used >= sup.cap ? 'bad' : ''}" title="Supply used / cap: ${SUPPLY.hq} from the Admiralty, +${SUPPLY.quarters} per Crew Quarters, up to ${SUPPLY.max}">⚓ ${sup.used}/${sup.cap}</span>
    ${researchChip(P)}
    <span class="muted">${mm}:${String(ss).padStart(2, '0')}</span>`;
  const resEl = $('#res'); if (resEl.innerHTML !== res) resEl.innerHTML = res;
  selPanel(); cardPanel(); cmdrPanel(); eventsPanel(); renderResearch(); tip();
}
function researchChip(P) {
  const r = P.research, cur = r.current && TECH[r.current];
  if (!cur) return `<button class="rchip idle" data-research data-tip="Nothing being researched. Tab opens the tech tree.">🔬 Pick research</button>`;
  const eta = etaOf(G, V.me), pct = Math.floor((r.progress[cur.id] || 0) / [0, 12, 25, 50, 90, 150][cur.era] * 100);
  return `<button class="rchip" data-research data-tip="Researching ${esc(cur.name)}: ${pct}%${eta !== Infinity ? `, about ${secs(eta)} to go` : ''}. ${(rpIncome(G, V.me).total / 6 * 60).toFixed(0)} points a minute. Tab opens the tech tree.">🔬 ${esc(cur.name)} <small>${pct}%</small><i style="width:${pct}%"></i></button>`;
}
// your commander and their powers (N, M)
function cmdrPanel() {
  const el = $('#cmdr'), P = G.players[V.me], c = !V.all && P.cmd && COMMANDERS[P.cmd.id];
  let html = '';
  if (c) {
    html = `<div class="cm-name" data-tip="<b>${esc(c.name)}</b>: ${esc(c.title)}<br>${esc(c.text)}<br><span class=muted>Level ${P.cmd.level}: perks up to that level are on.</span>">${c.icon} ${esc(c.name)} <small>L${P.cmd.level}</small></div>`;
    const all = c.powers;
    all.forEach((w, i) => {
      const have = powersOf(G, V.me).some(x => x.id === w.id), cd = powerCd(G, V.me, w.id), aiming = V.aim?.kind === 'power' && V.aim.id === w.id;
      html += `<button class="pw ${have ? '' : 'locked'} ${cd > 0 ? 'cooling' : ''} ${aiming ? 'on' : ''}" ${have ? `data-power="${w.id}"` : ''} data-tip="<b>${w.icon} ${esc(w.name)}</b>${have ? '' : ` <span class=bad>(commander level ${w.level})</span>`}<br>${esc(w.text.replace(/(\d+) rounds?/g, (m, n) => `${n * 12}s`).replace(/this turn/g, `for ${6}s`))}<br><span class=muted>Cooldown ${w.cooldown * 6}s</span>"><b>${'NM'[i]}</b> ${w.icon} ${esc(w.name)}<small>${!have ? `level ${w.level}` : cd > 0 ? `${Math.ceil(cd)}s` : 'ready'}</small>${cd > 0 && have ? `<i style="width:${(1 - cd / (w.cooldown * 6)) * 100}%"></i>` : ''}</button>`;
    });
  }
  if (el.innerHTML !== html) el.innerHTML = html;
  el.classList.toggle('hidden', !html);
}
// world events going on now
function eventsPanel() {
  const el = $('#events'), list = [...(G.ev?.active || [])].filter(a => a.until > G.t);
  if (G.ev?.pending) list.unshift({ kind: G.ev.pending.kind, soon: G.ev.pending.at });
  const html = list.map(a => `<div data-tip="${esc(EVENTS[a.kind].desc)}">${EVENTS[a.kind].icon} ${EVENTS[a.kind].name} <small>${a.soon ? `in ${Math.ceil(a.soon - G.t)}s` : `${Math.ceil(a.until - G.t)}s left`}</small></div>`).join('');
  if (el.innerHTML !== html) el.innerHTML = html;
}
function selPanel() {
  const sel = selected(), el = $('#sel');
  let html;
  if (!sel.length) html = `<div class="muted">${V.all ? 'Click anything to see what it is.' : 'Nothing selected. Drag a box round your ships, or click a base. <b>Home</b>: your Admiralty.'}</div>`;
  else if (sel.length === 1) {
    const e = sel[0], P = G.players[e.team], own = mine(e);
    const head = `<div class="sel-name"><span class="dot" style="background:${P.color}"></span>${esc(nameOf(e))} <span class="muted small">${own ? '' : esc(P.name)}</span></div>
      <div class="sel-hp"><div style="width:${e.hp / e.max * 100}%"></div></div><div class="small">❤ ${Math.ceil(e.hp)} / ${Math.round(e.max)}${e.kind === 'struct' && e.built < 1 ? ` · <b>building ${Math.round(e.built * 100)}%</b>` : ''}</div>`;
    let body = '';
    if (e.kind === 'unit') {
      const d = ud(G, e.team, e.type);
      body = d.weapons.map(w => `<div class="small">${weaponLine(w)}</div>`).join('') + `<div class="small muted">⚓ ${d.supply} supply · speed ${d.speed.toFixed(1)} · sight ${d.sight}${d.armor ? ` · armor ${d.armor}` : ''}${d.submerged ? ' · submerged' : ''}${d.sonar ? ` · sonar ${d.sonar}` : ''}${own ? ` · ${e.order.type}` : ''}</div>`;
    } else if (e.type === 'base') {
      const dep = G.m.deposits.find(d => d.id === e.dep), lvl = BASE_LEVELS[e.level];
      body = `<div class="small">${e.capital ? 'Admiralty · ' : ''}${lvl.name} (level ${e.level}) · claim ${claimOf(G, e) * 2 + 1}×${claimOf(G, e) * 2 + 1} · platforms ${usedSlots(G, e)}/${slotsOf(G, e)}</div>
        ${e.blowUntil > G.t ? `<div class="small bad">🔥 Blown out: no oil for ${Math.ceil(e.blowUntil - G.t)}s</div>` : ''}
        ${dep ? `<div class="small">🛢 ${dep.type} deposit: ${dep.reserves > 0 ? `pumps ${PUMP[dep.type].toFixed(1)}/s · ${Math.floor(dep.reserves)} left` : '<span class="bad">dry</span>'}</div>` : ''}
        ${e.upgrading ? `<div class="small">⬆ Upgrading: ${Math.round(e.upgrading.t / e.upgrading.need * 100)}%</div>` : ''}
        ${own ? `<div class="small muted">${platsOf(G, e).map(p => esc(PLATS[p.type].name) + (p.built < 1 ? ' (building)' : '')).join(' · ') || 'No platforms yet: a worker builds them inside the claim.'}</div>` : ''}`;
    } else {
      const d = PLATS[e.type];
      body = `<div class="small">${esc(d.text || '')}</div>${d.gun ? `<div class="small">🎯 ${Math.round(d.gun.dmg)} dmg, range ${d.gun.range}</div>` : ''}`;
    }
    html = head + body;
  } else {
    const counts = {}; for (const e of sel) counts[e.type] = (counts[e.type] || 0) + 1;
    html = `<div class="sel-name">${sel.length} selected</div><div class="sel-list">${Object.entries(counts).map(([t, n]) => `<button class="pick" data-pick="${t}" title="Select just these">${n} × ${esc(UNITS[t]?.name || PLATS[t]?.name || 'Base')}</button>`).join('')}</div>`;
  }
  if (el.innerHTML !== html) el.innerHTML = html;
}
function cardPanel() {
  const sel = selected(), P = G.players[V.me], sup = supplyOf(G, V.me), us = myUnits(), ws = myWorkers(), yards = myYards();
  let html = '';
  if (V.all) html = '';
  else if (V.card === 'build' && ws.length) {
    const fc = foundingCost(G, V.me);
    html += `<button class="cmd ${P.money >= fc ? '' : 'dim'} ${V.place === 'base' ? 'on' : ''}" data-place="base" data-tip="<b>Oil Rig</b><br>Founds a new base on a free oil deposit: it pumps oil and claims the water round it for platforms.<br>${money(fc)} (each base costs more)"><span><b>O</b> Oil rig</span><small>${money(fc)}</small></button>`;
    for (const t of PLAT_ORDER) { const d = PLATS[t], open = platOk(G, V.me, t), cost = pd(G, V.me, t).cost; html += `<button class="cmd ${open && P.money >= cost ? '' : 'dim'} ${open ? '' : 'locked'} ${V.place === t ? 'on' : ''}" data-place="${t}" data-tip="${esc(platTip(t))}"><span><b>${BUILD_KEYS[t]}</b> ${esc(d.name)}</span><small>${open ? `${money(cost)}${d.needsLevel > 1 ? ` · L${d.needsLevel}` : ''}` : '🔒 research'}</small></button>`; }
    html += '<button class="cmd" data-menu="main"><b>Esc</b> Back</button>';
  } else {
    if (yards.length) {
      for (const t of roster()) {
        const d = ud(G, V.me, t), open = shipOk(G, V.me, t), ok = open && P.money >= d.cost && P.oil >= d.oil && sup.used + d.supply <= sup.cap;
        html += `<button class="cmd ${ok ? '' : 'dim'} ${open ? '' : 'locked'}" data-unit="${t}" data-tip="${esc(unitTip(t))}"><span><b>${UNITS[t].key}</b> ${esc(d.name)}</span><small>${open ? `${money(d.cost)} · 🛢${d.oil} · ⚓${d.supply}` : '🔒 research'}</small></button>`;
      }
      html += `<div class="queue">${yards.map(y => y.queue.map((it, i) => `<button class="qi" data-yard="${y.id}" data-cancel="${i}" data-tip="Cancel (full refund)">${esc(UNITS[it.type].name)}<i style="width:${i ? 0 : it.t / UNITS[it.type].build * 100}%"></i></button>`).join('')).join('') || '<span class="muted small">Yard idle. Right-click the sea to set where new ships go.</span>'}</div>`;
    }
    const base = sel.length === 1 && sel[0].type === 'base' && mine(sel[0]) ? sel[0] : null;
    if (base && base.built >= 1) {
      const next = BASE_LEVELS[base.level + 1];
      if (next && !base.upgrading) {
        const needQ = base.level + 1 >= QUARTERS_NEEDED_FROM && !platsOf(G, base).some(p => p.type === 'quarters' && p.built >= 1), cost = upgradeCost(G, base);
        const needT = base.level + 1 > maxLevel(G, V.me) ? Object.values(TECH).find(t => t.unlocks.baseLevel === base.level + 1)?.name : null;
        html += `<button class="cmd ${P.money >= cost && !needQ && !needT ? '' : 'dim'} ${needT ? 'locked' : ''}" data-upgrade="${base.id}" data-tip="<b>Upgrade to ${next.name}</b><br>A bigger claim (if your Rig Engineering research allows), ${next.slots + (base.capital ? 1 : 0)} platform slots, a tougher rig.${needT ? `<br><span class=bad>🔒 Research ${esc(needT)} first.</span>` : ''}${needQ ? '<br><span class=bad>Needs a finished Crew Quarters in this base.</span>' : ''}"><span><b>U</b> Upgrade: ${next.name}</span><small>${needT ? '🔒 research' : money(cost)}</small></button>`;
      }
    }
    if (base?.blowUntil > G.t) html += `<button class="cmd" data-fix="${base.id}" data-tip="Pay to cap the blowout and get the rig pumping again now."><span>🔥 Fix blowout</span><small>$60</small></button>`;
    for (const a of abilitiesOf(sel)) {
      const ready = a.srcs.map(id => byId(G, id)).filter(e => e && !(e.cds[a.id] > 0)).length, cd = Math.min(...a.srcs.map(id => byId(G, id)?.cds[a.id] || 0));
      html += `<button class="cmd ${ready ? '' : 'dim'}" data-ability="${a.id}" data-tip="<b>${esc(a.name)}</b><br>Range ${a.range}. ${a.kind === 'scan' ? 'Reveals an area for a while.' : `${Math.round(a.dmg)} dmg. Needs a target you can see.`}${a.money ? ` $${a.money}` : ''}${a.oil ? ` + ${a.oil} oil` : ''}"><span><b>F</b> ${esc(a.name)}</span><small>${ready ? `${ready} ready` : `ready in ${Math.ceil(cd)}s`}</small></button>`;
    }
    if (ws.length) html += '<button class="cmd" data-menu="build" data-tip="Build an oil rig (a new base) or a platform inside one of your claims."><span><b>B</b> Build…</span><small>rigs and platforms</small></button>';
    if (us.length) {
      if (us.some(u => UNITS[u.type].weapons.length)) html += '<button class="cmd" data-cmd="amove" data-tip="Go there, fighting anything met on the way."><b>A</b> Attack-move</button>';
      html += '<button class="cmd" data-cmd="stop"><b>S</b> Stop</button><button class="cmd" data-cmd="hold" data-tip="Stay put; still fire at anything in range."><b>H</b> Hold</button>';
    }
  }
  const el = $('#card');
  if (html !== cardSig) { el.innerHTML = html; cardSig = html; }
}
// tooltips: whatever data-tip is under the pointer (checked every refresh, since the panels redraw)
function tip() {
  const t = $('#tip'), c = V.client;
  const el = c && document.elementFromPoint(c.x, c.y)?.closest('[data-tip]');
  if (!el) { t.classList.add('hidden'); return; }
  const html = el.dataset.tip; if (t.innerHTML !== html) t.innerHTML = html;
  t.classList.remove('hidden');
  const r = el.getBoundingClientRect(), tw = t.offsetWidth, th = t.offsetHeight;
  t.style.left = Math.max(6, Math.min(window.innerWidth - tw - 6, r.left)) + 'px'; t.style.top = Math.max(6, r.top - th - 8) + 'px';
}
window.addEventListener('pointermove', () => tip());
function feed() {
  for (const m of G.msgs.splice(0)) if (m.team === V.me || m.team < 0 || V.all) say(m.text, /destroyed|repossess|debt|captured|blew/.test(m.text) || (m.team === -2 && m.from !== V.me) ? 'bad' : /Research complete/.test(m.text) ? 'good' : '');
  const now = performance.now(); V.msgs = V.msgs.filter(m => now - m.t < 5500).slice(-5);
  const html = V.msgs.map(m => `<div class="${m.cls}">${esc(m.text)}</div>`).join('');
  const el = $('#msgs'); if (el.innerHTML !== html) el.innerHTML = html;
}
// under fire: a warning (and a ping on the minimap) when something of yours is hit, at most every few seconds
function underFire() {
  if (V.all) return;
  const hit = [...G.units, ...G.structs].filter(e => e.team === V.me && e.hitAt > (V.hitSeen || 0) && e.hitBy !== V.me);
  if (!hit.length) return;
  V.hitSeen = G.t;
  const now = performance.now();
  if (now - (V.lastAlert || 0) < 6000) return;
  const e = hit.find(e => !onScreen(e)) || null; if (!e) return;
  V.lastAlert = now; V.alerts = [...V.alerts.filter(a => now - a.t < 2500), { x: e.x, y: e.y, t: now }];
  V.alertAt = { x: e.x, y: e.y };
  const w = $('#warn'); w.innerHTML = `⚠ Under fire: your ${esc(nameOf(e))} <small>click to look</small>`; w.classList.remove('hidden');
  clearTimeout(V.warnT); V.warnT = setTimeout(() => w.classList.add('hidden'), 3500);
}
$('#warn').onclick = () => { if (V.alertAt) lookAt(V.alertAt.x, V.alertAt.y); $('#warn').classList.add('hidden'); };

// ---------- the end ----------
function checkOver() {
  if (V.over) return;
  const P = G.players[V.me];
  if (!V.all && P.out && !G.over && !V.outShown) { V.outShown = true; showOver('Defeat', 'Every one of your bases is gone.', true); return; }
  if (!G.over) return;
  V.over = true;
  const W = G.players[G.winner], won = !V.all && (G.winner === V.me || P.allies.includes(G.winner));
  showOver(V.all ? `${W.name} wins` : won ? 'Victory' : 'Defeat', `${won ? 'You won' : `${W.name} won`}: ${G.how}. Time ${secs(G.t)}.`, false);
}
function showOver(title, text, canWatch) {
  $('#over-title').textContent = title; $('#over-text').textContent = text;
  $('#over-title').className = /Victory/.test(title) ? 'good' : /Defeat/.test(title) ? 'bad' : '';
  $('#watch').classList.toggle('hidden', !canWatch);
  $('#over').classList.remove('hidden');
}
$('#again').onclick = () => { CFG = { ...CFG, seed: undefined }; start(); };
$('#watch').onclick = () => { V.all = true; V.sel.clear(); $('#over').classList.add('hidden'); };

// ---------- the loop ----------
let last = performance.now();
function frame(now) {
  const real = Math.min(0.1, (now - last) / 1000); last = now;
  // scrolling: arrow keys and the screen edges
  const pan = 18 / V.cell * 60 * real;
  if (V.keys.has('ArrowLeft')) V.cam.x -= pan; if (V.keys.has('ArrowRight')) V.cam.x += pan;
  if (V.keys.has('ArrowUp')) V.cam.y -= pan; if (V.keys.has('ArrowDown')) V.cam.y += pan;
  if (V.screen && document.hasFocus() && !V.box && !mid) { const m = 8; if (V.screen.x < m) V.cam.x -= pan; if (V.screen.x > V.w - m) V.cam.x += pan; if (V.screen.y < m) V.cam.y -= pan; if (V.screen.y > V.h - m) V.cam.y += pan; }
  clampCam();
  if (!G.paused && !G.over) {
    let left = real * G.speed;
    while (left > 0) {
      const dt = Math.min(1 / 30, left); left -= dt; step(G, dt);
      for (const P of G.players) if (P.ai) aiStep(G, P.id, dt);
    }
  }
  if (!G.index) G.index = new Map([...G.units, ...G.structs].map(e => [e.id, e]));
  for (const id of [...V.sel]) if (!byId(G, id)) V.sel.delete(id);
  if (V.card === 'build' && !myWorkers().length) V.card = 'main';
  if (V.place && !myWorkers().length) V.place = null;
  render(V, G); renderMini(V, G, mini); hud(); feed(); underFire(); checkOver();
  requestAnimationFrame(frame);
}
window.addEventListener('resize', resize);
start();
requestAnimationFrame(frame);
window.__rts = { get G() { return G; }, V, start, cfg: () => CFG }; // (for testing)
