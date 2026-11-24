// Research: research points (RP) each turn, the current project and queue, doctrines and unlocks.
import { PLATFORMS } from '../data/bases.js';
import { ADMIRALTY } from '../data/bases.js';
import { ERA_COST, FUNDING, SAME, STARTING_TECHS, TECH, TECHS } from '../data/research.js';
import { SHIPS, forFaction } from '../data/ships.js';
import { factionOf } from '../data/factions.js';
import { EXCLUSIVE_LEVEL } from '../data/commanders.js';
import { pstat, shipStat } from './modifiers.js';
import { fail, log, ok } from './util.js';

export const newResearch = () => ({
  done: Object.fromEntries(STARTING_TECHS.map(id => [id, true])),
  progress: {}, current: null, queue: [], funding: 0, bank: 0,
});
const R = (st, p) => (st.players[p].research ||= newResearch());

export const techCost = id => ERA_COST[TECH[id].era];
// (a Free Tide tech that stands in for a Navy one counts as having it: see `same` in research.js)
export const hasTech = (st, p, id) => { const d = R(st, p).done; return !!d[id] || !!SAME[id]?.some(o => d[o]); };
const doneOrSame = (r, id) => !!r.done[id] || !!SAME[id]?.some(o => r.done[o]);
// Is this tech part of p's faction's research at all?
export const techForFaction = (st, p, id) => !TECH[id].faction || TECH[id].faction === factionOf(st, p);
// p's own version of a tech (the Tide's stand-in for a Navy tech), or the tech itself
export const mine = (st, p, id) => techForFaction(st, p, id) ? id : SAME[id]?.find(o => techForFaction(st, p, o)) || id;

// done | locked (the other side of a doctrine you picked) | available | blocked (needs earlier techs)
export function techStatus(st, p, id) {
  const r = R(st, p), t = TECH[id];
  if (r.done[id]) return 'done';
  if (t.polar && !st.ice) return 'locked'; // (Polar maps only)
  if (!techForFaction(st, p, id)) return 'locked'; // (another faction's)
  if (t.doctrine && TECHS.some(o => o.doctrine === t.doctrine && o.id !== id && r.done[o.id])) return 'locked';
  return t.req.every(q => doneOrSame(r, q)) ? 'available' : 'blocked';
}

// Which tech unlocks a ship / platform / ports / a base level (null = available from the start)
const shipTech = {};
for (const t of TECHS) for (const s of t.unlocks.ships || []) shipTech[s] = t.id;
export const shipNeeds = type => shipTech[type] || SHIPS[type]?.needs || null;
// A commander's exclusive ship: only theirs, from level 3.
export const commanderShipOk = (st, p, type) => { const c = SHIPS[type].commander, me = st.players[p]?.commander; return !c || (me?.id === c && me.level >= EXCLUSIVE_LEVEL); };
export const shipUnlocked = (st, p, type) => !SHIPS[type].hidden && forFaction(type, factionOf(st, p)) && commanderShipOk(st, p, type) && (!shipNeeds(type) || hasTech(st, p, shipNeeds(type)));
export const platformUnlocked = (st, p, kind) => !PLATFORMS[kind].tech || hasTech(st, p, PLATFORMS[kind].tech);
export const portUnlocked = (st, p) => TECHS.some(t => t.unlocks.port && hasTech(st, p, t.id));
export function maxBaseLevel(st, p) {
  let lvl = 1;
  for (const t of TECHS) if (t.unlocks.baseLevel && hasTech(st, p, t.id)) lvl = Math.max(lvl, t.unlocks.baseLevel);
  return lvl;
}

// Where this turn's research points come from.
export function rpIncome(st, p) {
  const admiralty = st.bases?.some(b => b.owner === p && b.capital && !b.wrecked) ? ADMIRALTY.rp : 0;
  const labs = (st.platforms || []).filter(o => o.owner === p && o.kind === 'lab' && !o.buildLeft &&
    !st.bases.find(b => b.id === o.baseId)?.wrecked).length * PLATFORMS.lab.rp;
  const funding = R(st, p).funding || 0;
  const bonus = pstat(st, p, 'rp') + (st.players[p].bonus?.rp || 0);
  return { admiralty, labs, funding, bonus, total: admiralty + labs + funding + bonus };
}

// Start of a player's turn: pay for funding, add RP, finish techs.
export function processResearch(st, p) {
  const r = R(st, p), me = st.players[p];
  let funded = Math.max(0, Math.min(r.funding || 0, Math.floor(me.money / FUNDING.costPerRp)));
  if (funded < (r.funding || 0)) log(st, p, `Not enough money for full research funding: bought ${funded} RP.`);
  me.money -= funded * FUNDING.costPerRp;
  const inc = rpIncome(st, p);
  r.bank += inc.total - inc.funding + funded;
  // spend banked RP on the current project, then the queue
  for (let guard = 0; guard < 10; guard++) {
    if (!r.current || techStatus(st, p, r.current) !== 'available') r.current = nextFromQueue(st, p);
    if (!r.current || r.bank <= 0) break;
    const need = techCost(r.current) - (r.progress[r.current] || 0);
    const spend = Math.min(need, r.bank);
    r.progress[r.current] = (r.progress[r.current] || 0) + spend;
    r.bank -= spend;
    if (r.progress[r.current] >= techCost(r.current)) completeTech(st, p, r.current);
    else break;
  }
}

// Next project: the first queued tech you can start. If a queued tech still needs
// something that isn't queued, start on that prerequisite instead.
function nextFromQueue(st, p) {
  const r = R(st, p);
  r.queue = r.queue.filter(id => !r.done[id] && techStatus(st, p, id) !== 'locked');
  const i = r.queue.findIndex(id => techStatus(st, p, id) === 'available');
  if (i >= 0) return r.queue.splice(i, 1)[0];
  const firstReady = id => {
    if (techStatus(st, p, id) === 'available') return id;
    for (const q of TECH[id].req) if (!doneOrSame(r, q)) { const f = firstReady(mine(st, p, q)); if (f) return f; }
    return null;
  };
  for (const id of r.queue) { const f = firstReady(id); if (f) return f; }
  return null;
}

export function completeTech(st, p, id) {
  const r = R(st, p);
  // ships keep the same damage taken when their max HP goes up
  const before = st.ships.filter(s => s.owner === p).map(s => [s, shipStat(st, p, s.type, 'hp')]);
  r.done[id] = true;
  delete r.progress[id];
  if (r.current === id) r.current = null;
  for (const [s, oldMax] of before) { const nm = shipStat(st, p, s.type, 'hp'); if (nm > oldMax) s.hp += nm - oldMax; else s.hp = Math.min(s.hp, nm); }
  const t = TECH[id];
  const locked = t.doctrine ? TECHS.filter(o => o.doctrine === t.doctrine && o.id !== id).map(o => o.name) : [];
  log(st, p, `Research complete: ${t.name}.${locked.length ? ` (${locked.join(', ')} is now closed to you.)` : ''}`, { k: 'done' });
}

export function doResearch(st, a) {
  const p = st.current, r = R(st, p);
  if (!TECH[a.tech]) return fail('Unknown tech.');
  const status = techStatus(st, p, a.tech);
  if (status === 'done') return fail('Already researched.');
  if (status === 'locked') return fail('You chose the other doctrine.');
  if (status === 'blocked') return fail('Research the techs it needs first (or add it to the queue).');
  // switching away keeps the old project (and its progress) at the front of the queue
  if (r.current && r.current !== a.tech && !r.done[r.current]) r.queue.unshift(r.current);
  r.current = a.tech;
  r.queue = r.queue.filter(id => id !== a.tech);
  // spend any banked points right away
  if (r.bank > 0) processBank(st, p);
  return ok();
}
function processBank(st, p) {
  const r = R(st, p);
  if (!r.current) return;
  const need = techCost(r.current) - (r.progress[r.current] || 0);
  const spend = Math.min(need, r.bank);
  r.progress[r.current] = (r.progress[r.current] || 0) + spend;
  r.bank -= spend;
  if (r.progress[r.current] >= techCost(r.current)) completeTech(st, p, r.current);
}

// Add a tech to the queue, along with any earlier techs it needs (in a sensible order).
export function doQueue(st, a) {
  const p = st.current, r = R(st, p);
  if (!TECH[a.tech]) return fail('Unknown tech.');
  const status = techStatus(st, p, a.tech);
  if (status === 'done' || status === 'locked') return fail(status === 'done' ? 'Already researched.' : 'You chose the other doctrine.');
  const order = [];
  const visit = id => {
    if (doneOrSame(r, id) || order.includes(id)) return;
    // another faction's tech: the queue takes this faction's stand-in for it instead
    if (!techForFaction(st, p, id)) { const alt = mine(st, p, id); if (alt === id) throw new Error(TECH[id].name); return visit(alt); }
    if (techStatus(st, p, id) === 'locked') throw new Error(TECH[id].name);
    TECH[id].req.forEach(visit);
    order.push(id);
  };
  try { visit(a.tech); } catch (e) { return fail(`It needs ${e.message}, which is closed to you.`); }
  for (const id of order) if (id !== r.current && !r.queue.includes(id)) r.queue.push(id);
  if (!r.current) { r.current = nextFromQueue(st, p); processBank(st, p); }
  return ok();
}

export function doDequeue(st, a) {
  const r = R(st, st.current);
  r.queue = r.queue.filter(id => id !== a.tech);
  if (r.current === a.tech) r.current = null;
  return ok();
}

export function doFunding(st, a) {
  const r = R(st, st.current);
  r.funding = Math.max(0, Math.min(FUNDING.maxRp, Math.round(a.rp)));
  return ok();
}

// Turns until the current project finishes at the current income (Infinity if no income).
export function turnsLeft(st, p, id = R(st, p).current) {
  if (!id) return null;
  const inc = rpIncome(st, p).total;
  const left = techCost(id) - (R(st, p).progress[id] || 0) - R(st, p).bank;
  return left <= 0 ? 0 : inc > 0 ? Math.ceil(left / inc) : Infinity;
}
