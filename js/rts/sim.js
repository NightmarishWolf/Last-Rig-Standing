// ============================================================
// RTS · the simulation. step(G, dt) moves the world on by dt seconds; the page calls it every frame
// unless the game is paused. Positions are in squares (fractions allowed), time in seconds.
//
//   ships     sail where they're sent (A* round the islands, then straight lines), turn like ships, shove
//             past each other, fire every weapon on the move at what's in range; subs are hidden unless
//             something is right next to them or a sonar ship is near
//   bases     a rig on an oil deposit (a worker builds it): pumps oil, claims the water round it for
//             platforms, levels up; your Admiralty is your first base and your shipyard
//   oil       pumped into storage (spills past the cap), sold on the market (the price drops as you sell
//             and recovers over time); ships cost money and oil; ships and platforms cost upkeep
//   supply    every ship costs supply; the cap is 10 per Admiralty plus 5 per Crew Quarters, up to 100
//   research  points every second; techs and commander perks change the numbers (tech.js: ud, pd, ps)
//   the Tide  the Free Tide's water round its bases (and Leviathans): its ships there are faster and heal
//   slicks    oil spilled by a destroyed rig: no drilling inside one; burning ones hurt enemy ships
//   powers    each commander's two active powers (powers.js); world events (events.js)
// ============================================================
import { UNITS, PLATS, RIG_HP, SUPPLY, OIL_K, MARKET, BASE_LEVELS, BASE_FOUNDING, ADMIRALTY,
  QUARTERS_NEEDED_FROM, PUMP, ADMIRALTY_HP, ADMIRALTY_GUN, BUILD_REACH, TURN, HP_K, HQ_INCOME, ROUND } from './data.js';
import { TIDE } from '../data/factions.js';
import { DEEP_LAYERS } from '../data/economy.js';
import { clrAt, needFor } from './map.js';
import { findPath } from './path.js';
import { ud, pd, ps, shipOk, platOk, platLock, shipLock, maxLevel, researchStep, TECHS } from './tech.js';
import { powersStep } from './powers.js';
import { eventsStep, inStorm, inFogbank, calmNow } from './events.js';

export const TEAM_COLORS = ['#2bb3a3', '#f08a3c', '#a87cf0', '#d9c84a', '#9a9a9a'];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// ---------- entities ----------
export function addUnit(G, team, type, x, y, a = 0) {
  const d = ud(G, team, type);
  const u = { id: G.nextId++, kind: 'unit', type, team, x, y, a, v: 0, hp: d.hp, max: d.hp, order: { type: 'idle' }, path: [], cds: {}, scanT: Math.random() * 0.3 };
  G.units.push(u); G.index?.set(u.id, u); return u;
}
export function addBase(G, team, dep, { capital = false, built = 1, level = 1 } = {}) {
  const max = capital ? ADMIRALTY_HP : RIG_HP(level);
  const b = { id: G.nextId++, kind: 'struct', type: 'base', team, x: dep.x, y: dep.y, dep: dep.id, level, capital, hp: built ? max : max * 0.1, max, built, queue: [], cds: {}, upgrading: null, doneAt: built ? G.t : null };
  G.structs.push(b); G.index?.set(b.id, b); return b;
}
export function addPlat(G, team, base, kind, x, y, built = 0, dep) {
  const d = pd(G, team, kind);
  const p = { id: G.nextId++, kind: 'struct', type: kind, team, base: base.id, x, y, dep, hp: built ? d.hp : d.hp * 0.1, max: d.hp, built, queue: [], cds: {} };
  G.structs.push(p); G.index?.set(p.id, p); return p;
}
export const byId = (G, id) => G.index?.get(id) || G.units.find(u => u.id === id) || G.structs.find(s => s.id === id);
export const radiusOf = e => (e.kind === 'unit' ? UNITS[e.type].radius : e.type === 'base' ? (e.capital ? 1.0 : 0.6) : 0.5);
function sightOf(G, e) {
  let s = e.kind === 'unit' ? ud(G, e.team, e.type).sight : e.type === 'base' ? (e.capital ? 8 : 4.5) + ps(G, e.team, 'baseSight') : pd(G, e.team, e.type).sight;
  if (e.kind === 'unit' && UNITS[e.type].worker) s += ps(G, e.team, 'surveyRadius');
  return s;
}
export const nameOf = e => (e.kind === 'unit' ? UNITS[e.type].name : e.type === 'base' ? (e.capital ? 'Admiralty' : BASE_LEVELS[e.level].name) : PLATS[e.type].name);
const gapTo = (a, b) => dist(a, b) - radiusOf(b);
export const players = G => G.players.filter(P => !P.neutral);

// ---------- bases: claims, slots, founding ----------
// (as in the turn-based game: a 3×3 claim to start, each Pipelines-type tech adds 1, up to the base level's cap)
export function claimOf(G, b) {
  const extra = b.capital ? ADMIRALTY.bonusRadius : 0;
  return Math.min(BASE_LEVELS[b.level].radiusCap + extra, 1 + ps(G, b.team, 'claimRadius') + extra);
}
export const slotsOf = (G, b) => BASE_LEVELS[b.level].slots + ps(G, b.team, 'slots') + (b.capital ? ADMIRALTY.bonusSlots : 0);
export const platsOf = (G, b) => G.structs.filter(s => s.base === b.id);
export const usedSlots = (G, b) => platsOf(G, b).filter(p => !PLATS[p.type].onDeposit).length;
export const basesOf = (G, team) => G.structs.filter(s => s.type === 'base' && s.team === team);
export const foundingCost = (G, team) => Math.round(Math.min(BASE_FOUNDING.maxCost, BASE_FOUNDING.baseCost + BASE_FOUNDING.costPerBase * basesOf(G, team).length) * ps(G, team, 'baseCostMult'));
export const oilCapOf = (G, team) => Math.round(ps(G, team, 'oilCap') * OIL_K + G.structs.filter(s => s.team === team && s.type === 'storage' && s.built >= 1).length * PLATS.storage.oilCap);
export const inClaim = (G, team, x, y) => G.structs.some(b => b.type === 'base' && b.team === team && b.built >= 1 && Math.max(Math.abs(Math.floor(b.x) + 0.5 - x), Math.abs(Math.floor(b.y) + 0.5 - y)) <= claimOf(G, b) + 0.5);
export function supplyOf(G, team) {
  const done = G.structs.filter(s => s.team === team && s.built >= 1);
  const cap = Math.min(SUPPLY.max, done.filter(s => s.type === 'base' && s.capital).length * SUPPLY.hq + done.filter(s => s.type === 'quarters').length * SUPPLY.quarters);
  const used = G.units.filter(u => u.team === team && !u.free).reduce((t, u) => t + UNITS[u.type].supply, 0)
    + G.structs.filter(s => s.team === team).reduce((t, s) => t + s.queue.reduce((q, it) => q + UNITS[it.type].supply, 0), 0);
  return { used, cap };
}
export const sellBonus = (G, team) => Math.min(0.3, G.structs.filter(s => s.team === team && s.type === 'refinery' && s.built >= 1).length * PLATS.refinery.sell);
export const sellPrice = (G, team) => G.market.price * (1 + sellBonus(G, team)) * ps(G, team, 'sellMult');
// what a rig (a base or a Wellhead) pumps a second
export function pumpOf(G, s) {
  const d = G.m.deposits.find(d => d.id === s.dep);
  if (!d || d.reserves <= 0 || s.built < 1 || (s.blowUntil > G.t)) return 0;
  let r = PUMP[d.type] + ps(G, s.team, 'rigRate') * 2 / TURN;
  if (s.type === 'base') r += platsOf(G, s).filter(p => p.type === 'pump' && p.built >= 1).length * (PLATS.pump.pump + ps(G, s.team, 'pumpBonus') / TURN);
  // (Kade's Choking Smoke: rigs inside an oil slick pump less)
  const choke = Math.max(0, ...players(G).filter(P => P.id !== s.team && !P.allies.includes(s.team)).map(P => ps(G, P.id, 'slickChoke')));
  if (choke && slickAt(G, s.x, s.y)) r *= 1 - choke;
  return Math.min(r, d.reserves);
}
export function rates(G, team) {
  let oil = 0, upkeep = 0;
  for (const s of G.structs) {
    if (s.team !== team || s.built < 1) continue;
    if (s.type === 'base' || s.type === 'wellhead') oil += pumpOf(G, s);
    if (s.type !== 'base') upkeep += pd(G, team, s.type).upkeep;
  }
  for (const u of G.units) if (u.team === team && !u.free) upkeep += ud(G, team, u.type).upkeep;
  return { oil, upkeep };
}
export const yardsOf = (G, team) => G.structs.filter(s => s.team === team && s.built >= 1 && ((s.type === 'base' && s.capital) || s.type === 'drydock'));
export const slickAt = (G, x, y) => G.slicks.find(k => Math.hypot(k.x - x, k.y - y) <= k.r + 0.3);

// where a worker could build `what` near (x, y): { ok, x, y, base, dep, cost } or { ok: false, why }
export function canPlace(G, team, what, x, y) {
  const cx = Math.floor(x) + 0.5, cy = Math.floor(y) + 0.5;
  if (clrAt(G.m, cx, cy) < 1) return { ok: false, why: 'Not on land.' };
  if (G.structs.some(s => Math.hypot(s.x - cx, s.y - cy) < 0.9)) return { ok: false, why: 'Something is already built there.' };
  const dep = G.m.deposits.find(d => Math.hypot(d.x - cx, d.y - cy) < 0.6);
  if (what === 'base') {
    if (!dep) return { ok: false, why: 'A rig goes on an oil deposit.' };
    if (slickAt(G, cx, cy)) return { ok: false, why: 'Not inside an oil slick: wait for it to fade.' };
    return { ok: true, x: cx, y: cy, dep: dep.id, cost: foundingCost(G, team) };
  }
  if (!platOk(G, team, what)) return { ok: false, why: `${PLATS[what].name}: ${platLock(G, team, what)} first.` };
  const d = pd(G, team, what);
  const home = basesOf(G, team).filter(b => b.built >= 1 && Math.max(Math.abs(Math.floor(b.x) + 0.5 - cx), Math.abs(Math.floor(b.y) + 0.5 - cy)) <= claimOf(G, b) + 0.01)
    .sort((a, b) => dist(a, { x: cx, y: cy }) - dist(b, { x: cx, y: cy }))[0];
  if (!home) return { ok: false, why: "Platforms go inside one of your bases' claims (the dashed square round a selected base)." };
  if (d.onDeposit && !dep) return { ok: false, why: 'A Wellhead goes on an oil deposit inside the claim.' };
  if (d.onDeposit && slickAt(G, cx, cy)) return { ok: false, why: 'Not inside an oil slick: wait for it to fade.' };
  if (!d.onDeposit && dep) return { ok: false, why: 'Keep deposits free for rigs and wellheads.' };
  if (!d.onDeposit && usedSlots(G, home) >= slotsOf(G, home)) return { ok: false, why: `This ${BASE_LEVELS[home.level].name} has no free platform slots (${slotsOf(G, home)}). Upgrade it.` };
  if (home.level < d.needsLevel) return { ok: false, why: `Needs a level ${d.needsLevel} base (${BASE_LEVELS[d.needsLevel].name}).` };
  return { ok: true, x: cx, y: cy, base: home.id, dep: dep?.id, cost: d.cost };
}

// ---------- orders ----------
export function order(G, ids, cmd) {
  const us = ids.map(id => byId(G, id)).filter(u => u && u.kind === 'unit');
  if (!us.length) return;
  if (cmd.type === 'move' || cmd.type === 'amove') {
    const cx = us.reduce((t, u) => t + u.x, 0) / us.length, cy = us.reduce((t, u) => t + u.y, 0) / us.length;
    const spread = Math.max(...us.map(u => dist(u, { x: cx, y: cy }))), k = spread > 3 ? 2.5 / spread : 0.85;
    for (const u of us) setGoal(G, u, { type: cmd.type, x: us.length > 1 ? cmd.x + (u.x - cx) * k : cmd.x, y: us.length > 1 ? cmd.y + (u.y - cy) * k : cmd.y });
  } else if (cmd.type === 'attack') for (const u of us) { u.order = { type: 'attack', target: cmd.target }; u.path = []; u.repath = 0; }
  else if (cmd.type === 'stop' || cmd.type === 'hold') for (const u of us) { u.order = { type: cmd.type === 'hold' ? 'hold' : 'idle' }; u.path = []; }
}
export function setGoal(G, u, o) { u.order = o; u.path = findPath(G.m, u.x, u.y, o.x, o.y, needFor(UNITS[u.type].radius)); }
export function orderBuild(G, workerId, what, x, y) {
  const u = byId(G, workerId), team = u?.team;
  if (!u || !UNITS[u.type].worker) return { ok: false, why: 'Only a Survey Ship or a Prospector builds.' };
  const p = canPlace(G, team, what, x, y);
  if (!p.ok) return p;
  const P = G.players[team];
  if (P.money < p.cost) return { ok: false, why: `Needs $${p.cost}.` };
  if (u.order.type === 'build' && !u.order.site) P.money += u.order.paid; // (a new build order refunds one not started)
  P.money -= p.cost;
  u.order = { type: 'build', what, x: p.x, y: p.y, dep: p.dep, base: p.base, paid: p.cost };
  u.path = findPath(G.m, u.x, u.y, p.x, p.y, needFor(UNITS[u.type].radius));
  return { ok: true };
}
export function queueUnit(G, yardId, type) {
  const y = byId(G, yardId), team = y?.team, P = G.players[team];
  if (!y || !(y.capital || y.type === 'drydock') || !UNITS[type] || (UNITS[type].side !== P.side && UNITS[type].side !== 'any')) return { ok: false, why: "Can't build that here." };
  if (!shipOk(G, team, type)) return { ok: false, why: `${UNITS[type].name}: ${shipLock(G, team, type)} first.` };
  const d = ud(G, team, type);
  if (y.queue.length >= 5) return { ok: false, why: 'A yard queues five ships.' };
  const sup = supplyOf(G, team);
  if (sup.used + d.supply > sup.cap) return { ok: false, why: `Not enough supply (${sup.used}/${sup.cap}): build Crew Quarters.` };
  if (P.money < d.cost) return { ok: false, why: `Needs $${d.cost}.` };
  if (P.oil < d.oil) return { ok: false, why: `Needs ${d.oil} oil.` };
  P.money -= d.cost; P.oil -= d.oil;
  y.queue.push({ type, t: 0, need: d.build, cost: d.cost, oil: d.oil });
  return { ok: true };
}
export function cancelQueue(G, yardId, i) {
  const y = byId(G, yardId), it = y?.queue[i]; if (!it) return;
  y.queue.splice(i, 1); const P = G.players[y.team]; P.money += it.cost ?? UNITS[it.type].cost; P.oil += it.oil ?? UNITS[it.type].oil;
}
const LEVEL_TECH = Object.fromEntries(TECHS.filter(t => t.unlocks.baseLevel).map(t => [t.unlocks.baseLevel, t.name]));
export function upgradeBase(G, baseId) {
  const b = byId(G, baseId), P = G.players[b?.team], next = BASE_LEVELS[(b?.level || 0) + 1];
  if (!b || b.type !== 'base' || !next) return { ok: false, why: 'Already the biggest kind of base.' };
  if (b.built < 1) return { ok: false, why: 'Finish building it first.' };
  if (b.upgrading) return { ok: false, why: 'Already upgrading.' };
  if (b.level + 1 > maxLevel(G, b.team)) return { ok: false, why: `${next.name}: research ${LEVEL_TECH[b.level + 1] || 'more Rig Engineering'} first.` };
  if (b.level + 1 >= QUARTERS_NEEDED_FROM && !platsOf(G, b).some(p => p.type === 'quarters' && p.built >= 1)) return { ok: false, why: 'Needs a finished Crew Quarters in this base.' };
  const cost = Math.round(next.cost * ps(G, b.team, 'baseCostMult'));
  if (P.money < cost) return { ok: false, why: `Needs $${cost}.` };
  P.money -= cost; b.upgrading = { t: 0, need: 3 * TURN };
  return { ok: true };
}
export const upgradeCost = (G, b) => BASE_LEVELS[b.level + 1] ? Math.round(BASE_LEVELS[b.level + 1].cost * ps(G, b.team, 'baseCostMult')) : 0;
export function sellOil(G, team, n, { mult = 1, fixed = false } = {}) {
  const P = G.players[team]; n = Math.min(Math.floor(P.oil), n); if (n <= 0) return 0;
  let got = 0; const k = (1 + sellBonus(G, team)) * ps(G, team, 'sellMult') * mult, drop = MARKET.dropShare * ps(G, team, 'priceDropMult');
  for (let i = 0; i < n; i++) { got += G.market.price * k; if (!fixed) G.market.price -= (G.market.price - MARKET.minPrice) * drop; }
  P.oil -= n; P.money += got; P.sold = (P.sold || 0) + got;
  return got;
}
// an ability: a scan (reveal an area), a long-range strike, or a platform's strike / recon
export function useAbility(G, srcId, abilityId, x, y) {
  const e = byId(G, srcId); if (!e) return { ok: false };
  const P = G.players[e.team];
  const ab = e.kind === 'unit' ? ud(G, e.team, e.type).abilities.find(a => a.id === abilityId) : abilityId === 'recon' ? PLATS[e.type].recon : PLATS[e.type].strike;
  if (!ab) return { ok: false, why: 'No such ability.' };
  if ((e.cds[abilityId] || 0) > 0) return { ok: false, why: `Ready in ${Math.ceil(e.cds[abilityId])}s.` };
  if (Math.hypot(x - e.x, y - e.y) > ab.range + 0.5) return { ok: false, why: `Out of range (${ab.range} squares).` };
  if ((ab.money || 0) > P.money || (ab.oil || 0) > P.oil) return { ok: false, why: `Needs $${ab.money || 0}${ab.oil ? ` and ${ab.oil} oil` : ''}.` };
  const scan = ab.kind === 'scan' || abilityId === 'recon';
  if (!scan && !G.vis[e.team][(y | 0) * G.m.W + (x | 0)]) return { ok: false, why: 'You need to see the target.' };
  if ((abilityId === 'recon' || ab.air || (e.kind === 'unit' && /carrier|mothership/.test(e.type))) && (inStorm(G, x, y) || inStorm(G, e.x, e.y))) return { ok: false, why: 'Nothing flies in the storm.' };
  P.money -= ab.money || 0; P.oil -= ab.oil || 0; e.cds[abilityId] = ab.cooldown;
  if (scan) reveal(G, e.team, x, y, (ab.size || 3) / 2 + 0.6, TURN * 1.5);
  else G.shots.push({ x: e.x, y: e.y, tx: x, ty: y, speed: 8, dmg: ab.dmg, area: ab.area || 1, team: e.team, air: true, big: true });
  return { ok: true };
}
export function reveal(G, team, x, y, r, secs) {
  G.reveals.push({ team, x, y, r, until: G.t + secs });
  G.fx.push({ kind: 'scan', x, y, r, t: 0, life: 1.2, team }); G.visT = 0;
}

// ---------- the world, a step at a time ----------
export function step(G, dt) {
  if (G.over) return;
  G.t += dt;
  G.index = new Map([...G.units, ...G.structs].map(e => [e.id, e]));
  buildGrid(G);
  // the market recovers; oil flows; upkeep is paid; research
  G.market.price += (MARKET.basePrice - G.market.price) * (MARKET.recoverShare / TURN) * dt;
  for (const P of players(G)) {
    if (P.out) continue;
    const r = rates(G, P.id), cap = oilCapOf(G, P.id);
    P.oil = Math.min(cap, P.oil + r.oil * dt); P.money += (HQ_INCOME * basesOf(G, P.id).filter(b => b.capital && b.built >= 1).length - r.upkeep) * dt;
    for (const s of G.structs) if (s.team === P.id && (s.type === 'base' || s.type === 'wellhead')) drain(G, s, dt);
  }
  researchStep(G, dt, note);
  // deep in debt: the bank takes your most expensive ship
  for (const P of players(G)) if (!P.out && P.money < -400) {
    const u = G.units.filter(u => u.team === P.id).sort((a, b) => UNITS[b.type].cost - UNITS[a.type].cost)[0];
    if (u) { u.gone = true; P.money += UNITS[u.type].cost * 0.25; note(G, P.id, `In debt: the bank repossessed your ${UNITS[u.type].name}.`); }
  }
  G.units = G.units.filter(u => !u.gone);
  G.tideT = (G.tideT || 0) - dt; if (G.tideT <= 0) { G.tideT = 0.5; updateTide(G); }
  powersStep(G, dt); eventsStep(G, dt);
  for (const s of G.structs) structStep(G, s, dt);
  for (const u of G.units) unitStep(G, u, dt);
  separate(G);
  for (const sh of G.shots) shotStep(G, sh, dt);
  G.shots = G.shots.filter(sh => !sh.done);
  slicksStep(G, dt);
  for (const e of [...G.units, ...G.structs]) if (e.hp <= 0 && !e.gone) {
    e.gone = true;
    G.fx.push({ kind: 'boom', x: e.x, y: e.y, r: radiusOf(e) * 2.2, t: 0, life: 0.9 });
    if (e.type === 'base') { for (const p of platsOf(G, e)) p.hp = 0; note(G, e.team, `Your ${nameOf(e)} was destroyed!`); }
    if ((e.type === 'base' || e.type === 'wellhead') && e.built >= 1) {
      const big = e.hitBy >= 0 && ps(G, e.hitBy, 'spillBig') ? 1 : 0;
      G.slicks.push({ x: e.x, y: e.y, r: 2 + big, until: G.t + (12 + big * 4) * ROUND });
    }
    const K = G.players[e.team];
    if (K?.neutral && e.kind === 'unit' && e.bounty && G.players[e.hitBy] && !G.players[e.hitBy].neutral) { G.players[e.hitBy].money += e.bounty; note(G, e.hitBy, `Bounty: $${e.bounty} for sinking the ${K.name === 'Pirates' ? 'pirate' : 'rogue'} ${UNITS[e.type].name}.`); }
  }
  G.units = G.units.filter(u => !u.gone); G.structs = G.structs.filter(s => !s.gone);
  G.structs = G.structs.filter(s => s.type === 'base' || G.structs.some(b => b.id === s.base)); // (platforms go down with their base)
  for (const f of G.fx) f.t += dt;
  G.fx = G.fx.filter(f => f.t < f.life);
  G.reveals = G.reveals.filter(r => r.until > G.t);
  G.visT -= dt; if (G.visT <= 0) { G.visT = 0.2; updateVision(G); }
  checkOut(G);
}
export function note(G, team, text) { G.msgs.push({ team, text, t: G.t }); }
// a rig pumps its deposit down; once dry, Deeper Wells research strikes another layer
function drain(G, s, dt) {
  const d = G.m.deposits.find(d => d.id === s.dep); if (!d || s.built < 1) return;
  d.reserves = Math.max(0, d.reserves - pumpOf(G, s) * dt);
  if (d.reserves <= 0) {
    const layer = d.layer || 0;
    if (layer < Math.min(DEEP_LAYERS.length, ps(G, s.team, 'deepLayers'))) { d.layer = layer + 1; d.reserves = d.max * DEEP_LAYERS[layer]; note(G, s.team, `A dry rig drilled deeper and struck oil again (layer ${layer + 2}).`); }
  }
}

function structStep(G, s, dt) {
  for (const k in s.cds) s.cds[k] = Math.max(0, s.cds[k] - dt);
  if (s.built < 1) return;
  const P = G.players[s.team];
  // base upgrades
  if (s.upgrading) { s.upgrading.t += dt; if (s.upgrading.t >= s.upgrading.need) { s.level++; s.upgrading = null; if (!s.capital) { const f = s.hp / s.max; s.max = RIG_HP(s.level); s.hp = s.max * f; } note(G, s.team, `${BASE_LEVELS[s.level].name} ready: more claim, more platform slots.`); } }
  // yards
  if (s.queue.length) {
    const it = s.queue[0]; it.t += dt;
    if (it.t >= (it.need || UNITS[it.type].build)) {
      s.queue.shift();
      const r = s.rally || { x: s.x + 2, y: s.y }, ang = Math.atan2(r.y - s.y, r.x - s.x);
      const u = addUnit(G, s.team, it.type, s.x + Math.cos(ang) * 1.6, s.y + Math.sin(ang) * 1.6, ang);
      if (clrAt(G.m, u.x, u.y) < 1) { u.x = s.x; u.y = s.y; }
      setGoal(G, u, { type: 'move', x: r.x + (Math.random() - 0.5), y: r.y + (Math.random() - 0.5) });
    }
  }
  // guns: the Admiralty's, gun and missile platforms
  const gun = s.capital ? ADMIRALTY_GUN : s.type !== 'base' ? pd(G, s.team, s.type).gun : null;
  if (gun && !(s.cds.gun > 0)) { const t = nearestEnemy(G, s, gun.range, {}); if (t) { fire(G, s, t, gun); s.cds.gun = gun.reload; } }
  // cruise batteries fire on their own (and cost money and oil per missile)
  const st = s.type !== 'base' && PLATS[s.type].strike;
  if (st?.auto && !(s.cds.strike > 0) && P.money >= st.money && P.oil >= st.oil) {
    const t = nearestEnemy(G, s, st.range, {});
    if (t) { P.money -= st.money; P.oil -= st.oil; s.cds.strike = st.cooldown; G.shots.push({ x: s.x, y: s.y, tx: t.x, ty: t.y, speed: 8, dmg: st.dmg, area: st.area, team: s.team, air: true, big: true }); }
  }
  // dry docks mend your ships close by; platforms with Rapid Repair-type research mend themselves
  if (s.type === 'drydock') for (const u of near(G, s.x, s.y, 2.5)) if (u.kind === 'unit' && u.team === s.team) u.hp = Math.min(u.max, u.hp + PLATS.drydock.repair * dt);
  const fix = ps(G, s.team, 'platformRepair'); if (fix && s.hp < s.max) s.hp = Math.min(s.max, s.hp + fix * HP_K / TURN * dt);
}

// how fast a ship is going right now: the Tide, calm seas, storms, a Smuggling Run
function speedOf(G, u, d) {
  let s = d.speed;
  if (u.onTide) s += (TIDE.move + ps(G, u.team, 'tideMove')) * 0.4;
  if (calmNow(G)) s += 0.6;
  if (G.players[u.team]?.runUntil > G.t) s += 1.8;
  if (inStorm(G, u.x, u.y)) s *= 0.5;
  return s;
}
function unitStep(G, u, dt) {
  const d = ud(G, u.team, u.type), need = needFor(d.radius), o = u.order;
  for (const k in u.cds) u.cds[k] = Math.max(0, u.cds[k] - dt);
  let goal = null, tgt = null;
  if (o.type === 'attack') { tgt = byId(G, o.target); if (!tgt || tgt.hp <= 0 || !seen(G, u.team, tgt)) { u.order = { type: 'idle' }; tgt = null; } }
  // look for trouble now and then (not every frame: it's the slow part)
  u.scanT -= dt;
  if (!tgt && u.scanT <= 0 && (o.type === 'amove' || o.type === 'idle' || o.type === 'hold') && d.weapons.length) {
    u.scanT = 0.3; u.near = nearestEnemy(G, u, o.type === 'amove' ? d.sight : maxRange(d) + (o.type === 'hold' ? 0 : 1.2), { subs: d.weapons.some(w => w.subsOnly || w.torpedo) });
  }
  if (!tgt && (o.type === 'amove' || o.type === 'idle') && u.near && u.near.hp > 0 && seen(G, u.team, u.near)) tgt = u.near;
  if (tgt) {
    const reach = d.weapons.some(w => w.ram) ? 0.2 : maxRange(d) - 0.4;
    if (gapTo(u, tgt) > reach) {
      u.repath = (u.repath || 0) - dt;
      if (u.repath <= 0 || !u.path.length) { u.path = findPath(G.m, u.x, u.y, tgt.x, tgt.y, need); u.repath = 0.8; }
      goal = u.path[0];
    } else u.path = [];
  } else if ((o.type === 'move' || o.type === 'amove') && u.path.length) goal = u.path[0];
  else if (o.type === 'build') {
    const dd = dist(u, o);
    if (dd > BUILD_REACH) { if (!u.path.length) u.path = findPath(G.m, u.x, u.y, o.x, o.y, need); goal = u.path[0]; }
    else buildStep(G, u, o, dt);
  }
  if ((o.type === 'move' || o.type === 'amove') && !u.path.length && !tgt) u.order = { type: 'idle' };
  steer(G, u, d, goal, dt, need, o, tgt);
  // every weapon fires on its own (Full Broadside: twice as fast for a turn)
  const fast = u.rapidUntil > G.t ? 0.5 : 1;
  const holdT = o.type === 'hold' ? u.near : null;
  for (const w of d.weapons) {
    if ((u.cds[w.id] || 0) > 0) continue;
    if (w.ram) { if (tgt && gapTo(u, tgt) <= radiusOf(u) + 0.35 + Math.max(0, w.range - 0.3)) { for (const e of enemiesNear(G, u.team, tgt.x, tgt.y, w.area + 0.6)) hurt(G, e, w.dmg * (e === tgt ? 1 : 0.6), u.team); G.fx.push({ kind: 'fire', x: tgt.x, y: tgt.y, r: w.area + 0.8, t: 0, life: 1.2 }); u.hp = 0; } continue; }
    const t0 = tgt || holdT;
    const pick = t0 && okTarget(w, t0) && gapTo(u, t0) <= w.range && seen(G, u.team, t0) ? t0 : nearestEnemy(G, u, w.range, { only: w });
    if (pick) { fire(G, u, pick, w); u.cds[w.id] = w.reload * fast; }
  }
  // repair ships mend what's close; ships in your claims heal with Damage Control research; the Tide heals its own
  for (const ab of d.abilities) if (ab.kind === 'aura') for (const e of near(G, u.x, u.y, ab.range)) if (e.kind === 'unit' && e.team === u.team && e !== u) e.hp = Math.min(e.max, e.hp + ab.heal * dt);
  if (u.hp < u.max) {
    u.healT = (u.healT || 0) - dt;
    if (u.healT <= 0) { u.healT = 0.5; u.inClaim = inClaim(G, u.team, u.x, u.y); }
    let heal = 0;
    if (u.inClaim) heal += ps(G, u.team, 'heal') + (d.cls === 'capital' ? ps(G, u.team, 'capHeal') * 2 : 0);
    if (u.onTide) heal += TIDE.heal + ps(G, u.team, 'tideHeal');
    if (heal) u.hp = Math.min(u.max, u.hp + heal * HP_K / TURN * dt);
  }
}
const maxRange = d => Math.max(0.5, ...d.weapons.map(w => w.range));
const okTarget = (w, e) => (w.subsOnly ? e.kind === 'unit' && UNITS[e.type].submerged : w.torpedo ? true : !(e.kind === 'unit' && UNITS[e.type].submerged));
function steer(G, u, d, goal, dt, need, o, tgt) {
  const top0 = speedOf(G, u, d);
  if (goal) {
    const dx = goal[0] - u.x, dy = goal[1] - u.y, dd = Math.hypot(dx, dy);
    if (dd < 0.3 + (u.path.length > 1 ? 0.4 : 0)) u.path.shift();
    const want = Math.atan2(dy, dx), diff = ((want - u.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    u.a += Math.max(-d.turn * dt, Math.min(d.turn * dt, diff));
    const last = u.path.length <= 1, top = top0 * Math.max(0.15, Math.cos(diff)) * (last ? Math.min(1, dd / 1.2 + 0.25) : 1);
    u.v += Math.max(-top0 * 2 * dt, Math.min(top0 * 1.5 * dt, top - u.v));
  } else u.v = Math.max(0, u.v - top0 * 2.5 * dt);
  if (u.v > 0.001) {
    const nx = u.x + Math.cos(u.a) * u.v * dt, ny = u.y + Math.sin(u.a) * u.v * dt;
    if (clrAt(G.m, nx, ny) >= need) { u.x = nx; u.y = ny; }
    else if (clrAt(G.m, nx, u.y) >= need) u.x = nx;
    else if (clrAt(G.m, u.x, ny) >= need) u.y = ny;
    else { u.v = 0; if (goal) { const g = tgt || o; u.path = findPath(G.m, u.x, u.y, g.x ?? u.x, g.y ?? u.y, need); } }
  }
}
function buildStep(G, u, o, dt) {
  let s = o.site && byId(G, o.site);
  if (!s) {
    const P = G.players[u.team];
    if (G.structs.some(x => Math.hypot(x.x - o.x, x.y - o.y) < 0.9)) { P.money += o.paid; u.order = { type: 'idle' }; return; }
    if (o.what === 'base') { const dep = G.m.deposits.find(d => d.id === o.dep); s = addBase(G, u.team, dep, { built: 0 }); }
    else { const b = byId(G, o.base); if (!b) { P.money += o.paid; u.order = { type: 'idle' }; return; } s = addPlat(G, u.team, b, o.what, o.x, o.y, 0, o.dep); }
    o.site = s.id;
  }
  u.path = []; u.v = 0;
  const need = s.type === 'base' ? 2.5 * TURN : PLATS[s.type].build;
  s.built = Math.min(1, s.built + dt / need); s.hp = Math.min(s.max, s.hp + s.max * 0.9 * dt / need);
  if (s.built >= 1) {
    u.order = { type: 'idle' }; s.doneAt = G.t;
    // (a new rig taps its deposit: Strategic Reserve-type research finds more oil in it)
    const d = (s.type === 'base' || s.type === 'wellhead') && G.m.deposits.find(d => d.id === s.dep);
    if (d && !d.tapped) { d.tapped = true; const k = ps(G, u.team, 'reservesMult'); d.reserves *= k; d.max *= k; }
    if (s.type === 'fusion') { note(G, -1, `${G.players[u.team].name} finished a Deep-Sea Fusion Plant!`); if (G.cfg.victory?.postoil !== false) win(G, u.team, 'the Post-Oil victory: a Deep-Sea Fusion Plant'); }
  }
}

// ---------- the Tide ----------
// every Free Tide base spreads it (2 squares to start, growing 1 every 3 turns up to 5, research adds to
// both); Leviathans carry their own. Tidal Surge (Ruiz) pushes it 2 further for a while.
export function tideSources(G, team) {
  const P = G.players[team]; if (!P || P.side !== 'tide') return [];
  const out = [], surge = P.surgeUntil > G.t ? 2 : 0;
  for (const s of G.structs) if (s.team === team && s.type === 'base' && s.built >= 1) {
    const grown = Math.floor((G.t - (s.doneAt || 0)) / (TIDE.growEvery * TURN));
    out.push({ x: s.x, y: s.y, r: Math.min(TIDE.max + ps(G, team, 'tideMax'), TIDE.start + ps(G, team, 'tideRadius') + grown) + surge });
  }
  for (const u of G.units) if (u.team === team && UNITS[u.type]?.tideSource) out.push({ x: u.x, y: u.y, r: UNITS[u.type].tideSource + ps(G, team, 'tideShip') + surge });
  return out;
}
export const onTideOf = (G, team, x, y) => (G.tide?.[team] || []).some(t => Math.hypot(t.x - x, t.y - y) <= t.r + 0.5);
function updateTide(G) {
  G.tide = G.players.map(P => tideSources(G, P.id));
  for (const u of G.units) u.onTide = onTideOf(G, u.team, u.x, u.y);
}

// ---------- oil slicks ----------
// burning ones (Ignite, Firestorm, the Incendiary Junk) hurt the ships of everyone but whoever lit them;
// with Kade's Slicks Burn, every slick hurts Kade's enemies
function slicksStep(G, dt) {
  G.slicks = G.slicks.filter(k => k.until > G.t);
  if (!G.slicks.length) return;
  const burners = players(G).filter(P => ps(G, P.id, 'slickBurn') > 0).map(P => P.id);
  for (const k of G.slicks) {
    const lit = k.burnUntil > G.t ? k.burnTeam : null;
    if (lit === null && !burners.length) continue;
    for (const e of near(G, k.x, k.y, k.r)) {
      if (e.kind !== 'unit' || Math.hypot(e.x - k.x, e.y - k.y) > k.r + 0.3) continue;
      const by = lit !== null && enemyOf(G, lit, e.team) ? lit : burners.find(b => enemyOf(G, b, e.team));
      if (by === undefined || by === null) continue;
      e.hp -= HP_K / TURN * dt; e.hitAt = G.t; e.hitBy = by;
    }
  }
}

// ---------- the spatial grid (who's near what, fast) ----------
const CELL = 6;
function buildGrid(G) {
  const gw = Math.ceil(G.m.W / CELL) + 1, gh = Math.ceil(G.m.H / CELL) + 1, grid = Array.from({ length: gw * gh }, () => []);
  for (const e of G.units) grid[Math.floor(e.y / CELL) * gw + Math.floor(e.x / CELL)]?.push(e);
  for (const e of G.structs) grid[Math.floor(e.y / CELL) * gw + Math.floor(e.x / CELL)]?.push(e);
  G.grid = { gw, gh, grid };
}
export function near(G, x, y, r) {
  const { gw, gh, grid } = G.grid, out = [];
  for (let gy = Math.max(0, Math.floor((y - r - 2) / CELL)); gy <= Math.min(gh - 1, Math.floor((y + r + 2) / CELL)); gy++)
    for (let gx = Math.max(0, Math.floor((x - r - 2) / CELL)); gx <= Math.min(gw - 1, Math.floor((x + r + 2) / CELL)); gx++)
      for (const e of grid[gy * gw + gx]) if (Math.hypot(e.x - x, e.y - y) <= r + radiusOf(e)) out.push(e);
  return out;
}
export const enemyOf = (G, a, b) => a !== b && b >= 0 && a >= 0 && !G.players[a]?.allies?.includes(b);
export function enemiesNear(G, team, x, y, r) { return near(G, x, y, r).filter(e => enemyOf(G, team, e.team) && e.hp > 0); }
// can `team` see e? (fog of war, submerged subs, Stealth Doctrine, fog banks)
export function seen(G, team, e) {
  if (e.team === team) return true;
  const sub = e.kind === 'unit' && UNITS[e.type].submerged;
  if (G.fog.length && inFogbank(G, e.x, e.y) && !closeTo(G, team, e, 1.6)) return false;
  if (G.cfg.fog !== 'off' && !G.vis[team][(e.y | 0) * G.m.W + (e.x | 0)]) return false;
  if (sub) return sonarSees(G, team, e);
  // (Stealth Doctrine: you have to come closer to see their ships)
  if (e.kind === 'unit' && G.cfg.fog !== 'off') { const sth = ps(G, e.team, 'stealth'); if (sth && !closeTo(G, team, e, 0, sth)) return false; }
  return true;
}
function closeTo(G, team, e, r, less = 0) {
  return near(G, e.x, e.y, r || 12).some(o => o.team === team && (o.kind === 'unit' || o.built >= 1) && dist(o, e) <= (r || sightOf(G, o) - less));
}
function sonarSees(G, team, e) { return near(G, e.x, e.y, 6).some(o => o.team === team && o.kind === 'unit' && (dist(o, e) <= 1.6 + radiusOf(o) || (ud(G, team, o.type).sonar && dist(o, e) <= ud(G, team, o.type).sonar + 0.5))); }
function nearestEnemy(G, from, range, { subs = false, only = null } = {}) {
  let best = null, bd = Infinity;
  for (const e of near(G, from.x, from.y, range)) {
    if (!enemyOf(G, from.team, e.team) || e.hp <= 0 || !seen(G, from.team, e)) continue;
    if (only && !okTarget(only, e)) continue;
    if (!only && !subs && e.kind === 'unit' && UNITS[e.type].submerged) continue;
    const d = gapTo(from, e); if (d <= range && d < bd) { bd = d; best = e; }
  }
  return best;
}
function separate(G) {
  for (const a of G.units) {
    const ra = UNITS[a.type].radius;
    for (const b of near(G, a.x, a.y, ra + 1.5)) {
      if (b === a) continue;
      if (b.kind === 'unit') {
        if (b.id < a.id) continue;
        const rb = UNITS[b.type].radius, dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = (ra + rb) * 0.85;
        if (d >= min || d === 0) continue;
        const push = (min - d) / 2, nx = dx / d, ny = dy / d;
        nudge(G, a, -nx * push, -ny * push); nudge(G, b, nx * push, ny * push);
      } else {
        const dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy), min = ra + radiusOf(b) * 0.8;
        if (d < min && d > 0) nudge(G, a, dx / d * (min - d), dy / d * (min - d));
      }
    }
  }
}
function nudge(G, u, dx, dy) { if (clrAt(G.m, u.x + dx, u.y + dy) >= needFor(UNITS[u.type].radius)) { u.x += dx; u.y += dy; } }

// ---------- shells, missiles and torpedoes ----------
export function fire(G, from, to, w) {
  const r = radiusOf(from) * 0.6, a = from.a || Math.atan2(to.y - from.y, to.x - from.x);
  const armor = to.kind === 'unit' ? ud(G, to.team, to.type).armor : 0;
  for (let i = 0; i < (w.shots || 1); i++)
    G.shots.push({ x: from.x + Math.cos(a) * r, y: from.y + Math.sin(a) * r, target: to.id, tx: to.x + (i ? (Math.random() - 0.5) * 0.6 : 0), ty: to.y + (i ? (Math.random() - 0.5) * 0.6 : 0), speed: w.shell || 16, dmg: (w.dmg || 0) - armor, area: w.area || 0, team: from.team, air: !!w.air, torpedo: !!w.torpedo, fireSlick: !!w.fireSlick, delay: i * 0.12 });
  G.fx.push({ kind: 'flash', x: from.x, y: from.y, a: Math.atan2(to.y - from.y, to.x - from.x), r: radiusOf(from), t: 0, life: 0.12 });
}
function shotStep(G, sh, dt) {
  if (sh.delay > 0) { sh.delay -= dt; return; }
  const t = sh.target && byId(G, sh.target);
  if (t && t.hp > 0 && !sh.big) { sh.tx = t.x; sh.ty = t.y; }
  // aircraft and missiles: storms ground them; AA platforms and frigates knock down one each per turn
  if (sh.air && inStorm(G, sh.x, sh.y)) { sh.done = true; G.fx.push({ kind: 'hit', x: sh.x, y: sh.y, t: 0, life: 0.35, aa: true }); return; }
  if (sh.air && !sh.checked && Math.hypot(sh.tx - sh.x, sh.ty - sh.y) < 3.2) {
    sh.checked = true;
    const aa = near(G, sh.tx, sh.ty, 3.5).find(e => enemyOf(G, sh.team, e.team) && e.built !== 0 && (e.kind === 'unit' ? UNITS[e.type].airDefense : e.type !== 'base' && PLATS[e.type].airDefense) && !(e.cds.aa > 0) && Math.hypot(e.x - sh.tx, e.y - sh.ty) <= (e.kind === 'unit' ? UNITS[e.type].airDefense + 0.5 : 3.5));
    if (aa && !(Math.random() < ps(G, sh.team, 'airIgnoreAA'))) { aa.cds.aa = TURN; sh.done = true; G.fx.push({ kind: 'hit', x: sh.x, y: sh.y, t: 0, life: 0.35, aa: true }); return; }
  }
  const dx = sh.tx - sh.x, dy = sh.ty - sh.y, d = Math.hypot(dx, dy), mv = sh.speed * dt;
  if (d <= mv) {
    sh.done = true;
    if (sh.area) for (const e of enemiesNear(G, sh.team, sh.tx, sh.ty, sh.area)) hurt(G, e, e === t ? sh.dmg : sh.dmg * 0.6, sh.team);
    else if (t && t.hp > 0 && Math.hypot(t.x - sh.tx, t.y - sh.ty) < radiusOf(t) + 0.6) hurt(G, t, sh.dmg, sh.team);
    if (sh.fireSlick && clrAt(G.m, sh.tx, sh.ty) >= 1) G.slicks.push({ x: sh.tx, y: sh.ty, r: 1, until: G.t + 3 * ROUND, burnUntil: G.t + 3 * ROUND, burnTeam: sh.team });
    G.fx.push({ kind: sh.big ? 'boom' : 'hit', x: sh.tx, y: sh.ty, r: (sh.area || 0.5) * 1.6, t: 0, life: sh.big ? 0.8 : 0.35 });
  } else { sh.x += dx / d * mv; sh.y += dy / d * mv; }
}
export function hurt(G, e, dmg, by) {
  dmg = Math.max(1, dmg); e.hp -= dmg; e.hitAt = G.t; e.hitBy = by;
  G.fx.push({ kind: 'dmg', x: e.x, y: e.y - radiusOf(e) - 0.2, n: Math.round(dmg), t: 0, life: 0.9, team: e.team });
  if (e.kind === 'unit' && e.order.type === 'idle' && UNITS[e.type].weapons.length) e.near = near(G, e.x, e.y, UNITS[e.type].sight).find(o => o.team === by && o.kind === 'unit') || e.near;
}

// ---------- fog of war ----------
function updateVision(G) {
  const { W, H } = G.m;
  for (const P of G.players) {
    const v = G.vis[P.id]; if (G.cfg.fog !== 'reveal') v.fill(0); // (fog 'reveal': what you've seen stays live)
    const mark = (x0, y0, r) => {
      // (inside a fog bank nothing sees further than a square or so)
      if (G.fog.length && inFogbank(G, x0, y0)) r = Math.min(r, 1.6);
      const r2 = r * r;
      for (let y = Math.max(0, Math.floor(y0 - r)); y <= Math.min(H - 1, Math.floor(y0 + r)); y++)
        for (let x = Math.max(0, Math.floor(x0 - r)); x <= Math.min(W - 1, Math.floor(x0 + r)); x++)
          if ((x + 0.5 - x0) ** 2 + (y + 0.5 - y0) ** 2 <= r2 && (!G.fog.length || (x + 0.5 - x0) ** 2 + (y + 0.5 - y0) ** 2 <= 2.6 || !inFogbank(G, x + 0.5, y + 0.5))) v[y * W + x] = 1;
    };
    const mates = [P.id, ...(P.allies || [])];
    for (const e of [...G.units, ...G.structs]) if (mates.includes(e.team) && (e.kind === 'unit' || e.built >= 1)) mark(e.x, e.y, sightOf(G, e));
    for (const r of G.reveals) if (mates.includes(r.team)) mark(r.x, r.y, r.r);
    const ex = G.explored[P.id]; for (let i = 0; i < v.length; i++) if (v[i]) ex[i] = 1;
  }
}

// ---------- who's still in it ----------
function checkOut(G) {
  for (const P of players(G)) {
    if (P.out || basesOf(G, P.id).some(b => b.built >= 1 || b.hp > 0)) continue;
    P.out = true; G.units = G.units.filter(u => u.team !== P.id);
    note(G, -1, `${P.name} is out: every base lost.`);
  }
  const left = players(G).filter(P => !P.out);
  const sides = new Set(left.map(P => [P.id, ...(P.allies || [])].sort().join()));
  if (left.length && sides.size === 1 && players(G).length > 1) win(G, left[0].id, 'Conquest: everyone else is out');
}
function win(G, team, how) { if (G.over) return; G.over = true; G.winner = team; G.how = how; }

export { HP_K };
