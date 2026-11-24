// ============================================================
// RTS · research and commanders. The tech tree (data/research.js) and commanders (data/commanders.js) are
// the turn-based game's, and so are the rules that read them (engine/research.js: what's available, what a
// tech unlocks; engine/modifiers.js: what research and perks add to every number). They work on an
// engine-style "view" of the match: { players: [{ research, commander, faction }] }.
//
// Research points come in every second instead of every turn (the old per-turn amounts ÷ TURN): 4 a turn
// from the Admiralty, 3 per Research Lab, plus funding (money → points, up to 20 a turn) and research bonuses.
// A ship's numbers for one player (research + commander perks included) come from ud(); a platform's from pd().
// ============================================================
import { TECH, TECHS, ERA_COST, FUNDING } from '../data/research.js';
import { PLATFORMS } from '../data/bases.js';
import { techStatus, hasTech, shipUnlocked, platformUnlocked, maxBaseLevel, mine, newResearch, shipNeeds } from '../engine/research.js';
import { pstat } from '../engine/modifiers.js';
import { convertShip, UNITS, PLATS, TURN, ADMIRALTY } from './data.js';

export { TECH, TECHS, ERA_COST, FUNDING, newResearch, shipNeeds };

// the engine-style view of the match (cached: the player records inside it are the live ones)
export function view(G) {
  if (G._view && G._view.n === G.players.length) return G._view;
  G._view = { n: G.players.length, ice: false, ships: [], bases: [], platforms: [],
    players: G.players.map(P => ({ get research() { return P.research; }, get commander() { return P.cmd; }, get faction() { return P.side; }, bonus: null })) };
  return G._view;
}
const R = (G, team) => (G.players[team].research ||= newResearch());
const doneCount = (G, team) => Object.keys(R(G, team).done).length;

// ---------- numbers for one player ----------
export const ps = (G, team, key) => pstat(view(G), team, key);
export function ud(G, team, type) {
  const P = G.players[team];
  if (!P) return UNITS[type];
  const k = doneCount(G, team);
  if (!P._ud || P._ud.k !== k) P._ud = { k, m: {} };
  return (P._ud.m[type] ||= Object.assign(convertShip(type, view(G), team), { key: UNITS[type]?.key || '' }));
}
export function pd(G, team, kind) {
  const P = G.players[team], base = PLATS[kind];
  if (!P || !base) return base;
  const k = doneCount(G, team);
  if (!P._pd || P._pd.k !== k) P._pd = { k, m: {} };
  return (P._pd.m[kind] ||= {
    ...base,
    cost: Math.round(base.cost * ps(G, team, 'platformCostMult')), hp: base.hp * ps(G, team, 'platformHpMult'),
    upkeep: base.upkeep * ps(G, team, 'platformUpkeepMult'), sight: base.sight + ps(G, team, 'baseSight'),
    gun: base.gun ? { ...base.gun, range: base.gun.range + ps(G, team, 'platformRange') } : null,
  });
}

// ---------- what's open to a player ----------
export const status = (G, team, id) => techStatus(view(G), team, id);
export const has = (G, team, id) => hasTech(view(G), team, id);
export const shipOk = (G, team, type) => shipUnlocked(view(G), team, type);
export const platOk = (G, team, kind) => platformUnlocked(view(G), team, kind);
export const maxLevel = (G, team) => maxBaseLevel(view(G), team);
export const mineOf = (G, team, id) => mine(view(G), team, id);
export const techCost = id => ERA_COST[TECH[id].era];
// what a ship / platform is waiting on: a tech's name, or the commander it belongs to
export function shipLock(G, team, type) {
  if (shipOk(G, team, type)) return null;
  const c = UNITS[type]?.commander;
  if (c && G.players[team].cmd?.id !== c) return 'another commander\'s ship';
  if (c && G.players[team].cmd?.level < 3) return 'commander level 3';
  const need = shipNeeds(type); return need ? `research ${TECH[mineOf(G, team, need)]?.name || need}` : 'not available';
}
export function platLock(G, team, kind) {
  if (platOk(G, team, kind)) return null;
  const need = PLATFORMS[kind].tech; return need ? `research ${TECH[mineOf(G, team, need)]?.name || need}` : 'not available';
}

// ---------- research points ----------
export function rpIncome(G, team) {
  const done = G.structs.filter(s => s.team === team && s.built >= 1);
  const admiralty = done.some(s => s.type === 'base' && s.capital) ? ADMIRALTY.rp : 0;
  const labs = done.filter(s => s.type === 'lab').length * PLATFORMS.lab.rp;
  const funding = R(G, team).funding || 0, bonus = ps(G, team, 'rp');
  return { admiralty, labs, funding, bonus, total: admiralty + labs + funding + bonus }; // (per turn: ÷ TURN for per second)
}
// seconds until a tech is done at the current rate
export function etaOf(G, team, id = R(G, team).current) {
  if (!id) return null;
  const r = R(G, team), left = techCost(id) - (r.progress[id] || 0), rate = rpIncome(G, team).total / TURN;
  return left <= 0 ? 0 : rate > 0 ? left / rate : Infinity;
}

// every second: pay for funding, earn points, spend them on the current tech, then the queue
export function researchStep(G, dt, note) {
  for (const P of G.players) {
    if (P.out || P.neutral) continue;
    const r = R(G, P.id), inc = rpIncome(G, P.id);
    const want = (r.funding || 0) * FUNDING.costPerRp / TURN * dt;
    let funded = r.funding || 0;
    if (want > 0) { if (P.money >= want) P.money -= want; else funded = 0; }
    r.bank = Math.min(250, r.bank + (inc.total - inc.funding + funded) / TURN * dt);
    for (let guard = 0; guard < 5; guard++) {
      if (!r.current || status(G, P.id, r.current) !== 'available') r.current = nextFromQueue(G, P.id);
      if (!r.current || r.bank <= 0) break;
      const need = techCost(r.current) - (r.progress[r.current] || 0), spend = Math.min(need, r.bank);
      r.progress[r.current] = (r.progress[r.current] || 0) + spend; r.bank -= spend;
      if (r.progress[r.current] >= techCost(r.current) - 1e-9) complete(G, P.id, r.current, note); else break;
    }
  }
}
function nextFromQueue(G, team) {
  const r = R(G, team);
  r.queue = r.queue.filter(id => !r.done[id] && status(G, team, id) !== 'locked');
  const i = r.queue.findIndex(id => status(G, team, id) === 'available');
  if (i >= 0) return r.queue.splice(i, 1)[0];
  const firstReady = id => {
    if (status(G, team, id) === 'available') return id;
    for (const q of TECH[id].req) if (!has(G, team, q)) { const f = firstReady(mineOf(G, team, q)); if (f) return f; }
    return null;
  };
  for (const id of r.queue) { const f = firstReady(id); if (f) return f; }
  return null;
}
function complete(G, team, id, note) {
  const r = R(G, team);
  r.done[id] = true; delete r.progress[id]; if (r.current === id) r.current = null;
  // ships and platforms keep the damage they've taken when their max HP goes up (or down)
  for (const u of G.units) if (u.team === team) { const max = ud(G, team, u.type).hp; if (max !== u.max) { u.hp = Math.max(1, Math.min(max, u.hp + max - u.max)); u.max = max; } }
  for (const s of G.structs) if (s.team === team && s.type !== 'base') { const max = pd(G, team, s.type).hp; if (max !== s.max) { s.hp = Math.max(1, s.hp * max / s.max); s.max = max; } }
  const t = TECH[id], rivals = t.doctrine ? TECHS.filter(o => o.doctrine === t.doctrine && o.id !== id).map(o => o.name) : [];
  note?.(G, team, `Research complete: ${t.name}.${rivals.length ? ` (${rivals.join(', ')} is now closed to you.)` : ''}`);
}

// ---------- orders ----------
// research this now (what you were on goes back to the front of the queue, progress kept)
export function setResearch(G, team, id) {
  const r = R(G, team), s = TECH[id] && status(G, team, id);
  if (!s) return { ok: false, why: 'Unknown tech.' };
  if (s === 'done') return { ok: false, why: 'Already researched.' };
  if (s === 'locked') return { ok: false, why: 'Closed to you.' };
  if (s === 'blocked') return queueResearch(G, team, id);
  if (r.current && r.current !== id && !r.done[r.current]) r.queue.unshift(r.current);
  r.current = id; r.queue = r.queue.filter(q => q !== id);
  return { ok: true };
}
// queue a tech with everything it needs first
export function queueResearch(G, team, id) {
  const r = R(G, team);
  if (!TECH[id]) return { ok: false, why: 'Unknown tech.' };
  const s = status(G, team, id);
  if (s === 'done' || s === 'locked') return { ok: false, why: s === 'done' ? 'Already researched.' : 'Closed to you.' };
  const order = [];
  const visit = q => {
    if (has(G, team, q) || order.includes(q)) return;
    const own = mineOf(G, team, q);
    if (own !== q) return visit(own);
    if (status(G, team, q) === 'locked') throw new Error(TECH[q].name);
    TECH[q].req.forEach(visit); order.push(q);
  };
  try { visit(id); } catch (e) { return { ok: false, why: `It needs ${e.message}, which is closed to you.` }; }
  for (const q of order) if (q !== r.current && !r.queue.includes(q)) r.queue.push(q);
  return { ok: true };
}
export function dequeueResearch(G, team, id) { const r = R(G, team); r.queue = r.queue.filter(q => q !== id); if (r.current === id) r.current = null; }
export function setFunding(G, team, rp) { R(G, team).funding = Math.max(0, Math.min(FUNDING.maxRp, Math.round(rp))); }
