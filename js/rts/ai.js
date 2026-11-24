// RTS · computer players. A few times a second each one: sells oil before its storage overflows (or when
// it's short of money), keeps enough workers, drills the nearest free deposits, adds Crew Quarters before
// supply runs out and Storage Tanks when oil spills, levels up its Admiralty, fills its yards with a mix of
// warships, defends whatever of its own is under fire, and sends a wave at the nearest enemy base once its
// fleet is big enough (each wave bigger). Difficulty sets how often it thinks and how big a wave it waits for.
// Research: it works down a plan for its faction (supply and bases first, then its warships, then the rest
// of the tree), builds a Research Lab or two, funds research when it's rich, and uses its commander's powers.
import { UNITS, PLATS, ROSTER, BASE_LEVELS } from './data.js';
import { order, orderBuild, queueUnit, supplyOf, canPlace, sellOil, oilCapOf, basesOf, foundingCost, upgradeBase, yardsOf, platsOf, usedSlots, slotsOf } from './sim.js';
import { shipOk, platOk, queueResearch, setFunding, status, TECHS, ud } from './tech.js';
import { aiPowers } from './powers.js';
import { fixBlowout } from './events.js';

const PLAN = {
  navy: ['modular_platforms', 'crew_quarters', 'destroyer_program', 'pipelines', 'research_labs', 'artillery', 'gun_platforms', 'trading', 'dry_docks', 'fire_control',
    'guided_missiles', 'radar', 'quality', 'base_complex', 'air_defense', 'repair_tenders', 'cruiser_program', 'steel_hulls', 'damage_control', 'hydrofoils', 'naval_aviation',
    'battleship_program', 'subsea_manifolds', 'compartments', 'big_guns', 'refineries', 'storage_tanks', 'deep_water'],
  tide: ['modular_platforms', 'crew_quarters', 'brig_yards', 'fireships', 'pipelines', 'research_labs', 'scrap_guns', 'gun_platforms', 'smuggler_subs', 'raft_lashing',
    'dry_docks', 'rocket_racks', 'trading', 'tide_healers', 'base_complex', 'tough_hulls', 'black_market', 'leviathans', 'q_ships', 'hydrofoils', 'fast_yards',
    'long_rockets', 'drone_swarms', 'subsea_manifolds', 'refineries', 'storage_tanks', 'deep_water'],
};
function research(G, team, P) {
  const r = P.research;
  if (!r.current && r.queue.length < 2) {
    const next = PLAN[P.side].find(id => status(G, team, id) !== 'done' && status(G, team, id) !== 'locked' && !r.queue.includes(id))
      || TECHS.filter(t => status(G, team, t.id) === 'available').sort((a, b) => a.era - b.era)[0]?.id;
    if (next) queueResearch(G, team, next);
  }
  setFunding(G, team, P.money > 2500 ? 10 : P.money > 1500 ? 4 : 0);
}

const LEVEL = { easy: { think: 1.4, wave: 1.5 }, normal: { think: 0.7, wave: 1 }, hard: { think: 0.4, wave: 0.8 } };

export function aiStep(G, team, dt) {
  const P = G.players[team]; if (P.out) return;
  const L = LEVEL[P.difficulty] || LEVEL.normal;
  const A = (G.ai ||= {})[team] ||= { t: Math.random(), wave: 0 };
  A.t -= dt; if (A.t > 0) return; A.t = L.think;
  const [worker, ...war] = ROSTER[P.side];
  const bases = basesOf(G, team), hq = bases.find(b => b.capital && b.built >= 1); if (!hq) return;
  const mine = G.units.filter(u => u.team === team), workers = mine.filter(u => UNITS[u.type].worker), army = mine.filter(u => !UNITS[u.type].worker);
  const sup = supplyOf(G, team), cap = oilCapOf(G, team);
  research(G, team, P); aiPowers(G, team);
  for (const b of bases) if (b.blowUntil > G.t && P.money > 400) fixBlowout(G, b.id);
  // oil: sell before it spills, or when money's short
  if (P.oil > cap * 0.7 || (P.money < 200 && P.oil > 8)) sellOil(G, team, Math.ceil(P.oil * 0.5));
  const busy = w => w.order.type === 'build';
  const freeWorker = () => workers.find(w => !busy(w));
  const tryBuild = (what, b) => {
    const w = freeWorker(); if (!w || !platOk(G, team, what) || P.money < (PLATS[what]?.cost || 0)) return false;
    const r = 1 + Math.random() * 2.2;
    for (let k = 0; k < 16; k++) { const a = Math.random() * Math.PI * 2; if (orderBuild(G, w.id, what, b.x + Math.cos(a) * r, b.y + Math.sin(a) * r).ok) return true; }
    return false;
  };
  const building = what => workers.some(w => busy(w) && w.order.what === what) || G.structs.some(s => s.team === team && s.type === what && s.built < 1);
  // supply first, then storage, then a level for the Admiralty
  const tight = sup.cap < 100 && sup.cap - sup.used <= 4 && !building('quarters') && platOk(G, team, 'quarters');
  if (tight) for (const b of bases.filter(b => b.built >= 1 && usedSlots(G, b) < slotsOf(G, b))) if (tryBuild('quarters', b)) break;
  if (P.oil >= cap * 0.9 && !building('storage')) { const b = bases.find(b => b.built >= 1 && usedSlots(G, b) < slotsOf(G, b)); if (b) tryBuild('storage', b); }
  // levels: the Admiralty first, then the other bases (each needs Crew Quarters of its own from level 2)
  for (const b of [hq, ...bases.filter(b => b !== hq && b.built >= 1)]) {
    if (b.level >= 3 || b.upgrading || P.money < (BASE_LEVELS[b.level + 1]?.cost || 1e9) + 200) continue;
    if (upgradeBase(G, b.id).ok) break;
    if (!platsOf(G, b).some(p => p.type === 'quarters') && usedSlots(G, b) < slotsOf(G, b) && !building('quarters')) { tryBuild('quarters', b); break; }
  }
  // workers out to the free deposits nearest home
  const claimed = new Set([...G.structs.map(s => s.dep), ...workers.filter(busy).map(w => w.order.dep)].filter(Boolean));
  for (const w of workers.filter(w => !busy(w))) {
    if (tight && !building('quarters')) break; // (a worker waits for the money for Crew Quarters rather than wandering off)
    const d = P.money < foundingCost(G, team) ? null : G.m.deposits.filter(d => !claimed.has(d.id) && d.reserves > 0)
      .sort((a, b) => Math.hypot(a.x - hq.x, a.y - hq.y) - Math.hypot(b.x - hq.x, b.y - hq.y)).slice(0, 6).find(d => canPlace(G, team, 'base', d.x, d.y).ok);
    if (d && P.money >= foundingCost(G, team) && bases.length < 3 + Math.floor(G.t / 120)) { if (orderBuild(G, w.id, 'base', d.x, d.y).ok) claimed.add(d.id); continue; }
    // spare money: a wellhead on a deposit inside a claim, or a gun platform
    const inside = P.money > 300 && G.m.deposits.find(dd => !claimed.has(dd.id) && bases.some(b => Math.abs(b.x - dd.x) <= 7 && Math.abs(b.y - dd.y) <= 7) && canPlace(G, team, 'wellhead', dd.x, dd.y).ok);
    if (inside && P.money > 300) { if (orderBuild(G, w.id, 'wellhead', inside.x, inside.y).ok) claimed.add(inside.id); continue; }
    const labs = G.structs.filter(s => s.team === team && s.type === 'lab').length;
    if (P.money > 700 && labs < 1 + Math.floor(G.t / 400) && platOk(G, team, 'lab')) { const b = bases.find(b => b.built >= 1 && usedSlots(G, b) < slotsOf(G, b) - 1); if (b && tryBuild('lab', b)) continue; }
    if (P.money > 1200 && !G.structs.some(s => s.team === team && s.type === 'drydock') && platOk(G, team, 'drydock')) { const b = bases.find(b => b.built >= 1 && usedSlots(G, b) < slotsOf(G, b) - 1); if (b && tryBuild('drydock', b)) continue; }
    if (P.money > 900) { const b = bases[Math.floor(Math.random() * bases.length)]; if (b?.built >= 1 && usedSlots(G, b) < slotsOf(G, b) - 1) tryBuild(Math.random() < 0.6 ? 'gun' : 'radar', b); } // (one slot kept free for Crew Quarters)
  }
  // the yards
  for (const y of yardsOf(G, team)) {
    if (y.queue.length >= 2) continue;
    const want = Math.min(8, 3 + bases.length);
    let pick = workers.length < want && y.capital && !G.structs.some(s => s.queue.some(q => q.type === worker)) ? worker : null;
    if (!pick) {
      const late = G.t / 60, open = war.filter(t => shipOk(G, team, t)), pool = open.filter((t, i) => i < 3 + Math.floor(late * 1.2)); // (the bigger ships come into the mix over time)
      pick = pool[Math.floor(Math.pow(Math.random(), 1.4) * pool.length)];
    }
    if (pick && P.money > 0 && P.money >= ud(G, team, pick).cost + (pick === worker ? 0 : 80) && P.oil >= ud(G, team, pick).oil) queueUnit(G, y.id, pick);
  }
  // defend
  const hurt = [...G.structs, ...workers].find(e => e.team === team && e.hitAt && G.t - e.hitAt < 4);
  const home = army.filter(u => u.order.type === 'idle');
  if (hurt && home.length) order(G, home.map(u => u.id), { type: 'amove', x: hurt.x, y: hurt.y });
  // attack
  const armySupply = army.reduce((t, u) => t + UNITS[u.type].supply, 0);
  if (armySupply >= Math.min((12 + A.wave * 6) * L.wave, Math.max(8, sup.cap * 0.6))) {
    const foes = G.structs.filter(s => s.team !== team && s.type === 'base' && !G.players[s.team].out && !P.allies.includes(s.team))
      .sort((a, b) => Math.hypot(a.x - hq.x, a.y - hq.y) - Math.hypot(b.x - hq.x, b.y - hq.y));
    const t = foes.find(s => !s.capital) || foes[0];
    if (t) { order(G, army.map(u => u.id), { type: 'amove', x: t.x, y: t.y }); A.wave++; G.msgs.push({ team: t.team, text: `${P.name}'s fleet is moving on your ${t.capital ? 'Admiralty' : 'base'}!`, t: G.t }); }
  }
  // stragglers left idle far from home after a wave push on to the nearest enemy base
  if (A.wave) {
    const out = army.filter(u => u.order.type === 'idle' && Math.hypot(u.x - hq.x, u.y - hq.y) > 15);
    if (out.length) {
      const c = out[0], t = G.structs.filter(s => s.team !== team && s.type === 'base' && !P.allies.includes(s.team)).sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))[0];
      if (t) order(G, out.map(u => u.id), { type: 'amove', x: t.x, y: t.y });
    }
  }
  void platsOf;
}
