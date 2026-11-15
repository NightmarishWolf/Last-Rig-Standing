// Bot economy: selling oil, research and funding, base platforms and upgrades.
import * as E from '../engine/index.js';
import { BASE_LEVELS, PLATFORMS } from '../data/bases.js';
import { FUNDING, TECHS } from '../data/research.js';
import { MARKET } from '../data/economy.js';
import { chance, cheb, myShips, rand, reserve, sharp, spare } from './context.js';

// ---------- oil ----------
// Selling oil. Oil moves the fleet and can't be bought back; money pays upkeep, bases and ships.
//   1) upkeep must always be covered (whatever the price)
//   2) then raise money toward this turn's goal (a cushion, plus the next base when an expander is close)
//   3) then sell the surplus (not while still exploring early on)
//   4) and never let the tanks overflow
// Good bots don't sell into a crashed market (the price is shared by everyone and recovers each turn).
export async function sellOil(ctx) {
  const { st, p, me } = ctx;
  const cap = E.oilCapOf(st, p), U = E.upkeepTotal(st, p);
  const ships = myShips(ctx);
  const perTurn = ships.reduce((t, s) => t + E.shipStat(st, p, s.type, 'oil') * E.shipStat(st, p, s.type, 'move'), 0);
  const coming = st.rigs.filter(r => r.owner === p).reduce((t, r) => t + E.rigRate(st, r), 0);
  const early = E.basesOf(st, p).length < 3;
  const expanding = ships.some(s => { const t = ctx.mem.tasks[s.id]; return t?.kind === 'expand' && cheb(s, t) <= (early ? 16 : 6); });
  const keep = expanding ? 6 : Math.min(cap - 5, Math.max(10, Math.round(perTurn)));
  const floorPrice = sharp(ctx) ? MARKET.basePrice * 0.6 : 0;
  const sellTo = (goal, cond) => { let n = 0; while (n < me.oil && me.money + E.sellValue(st, n, p).total < goal && cond(n)) n++; return n; };
  let amount = 0;
  // 1) upkeep
  amount = Math.max(amount, sellTo(U * 2 + 10, () => true));
  // 2) money goal
  const goal = U * 4 + 40 + (expanding ? E.baseFoundCost(st, p) : 0);
  amount = Math.max(amount, Math.min(Math.max(0, me.oil - keep), sellTo(goal, n => E.sellValue(st, n + 1, p).price >= floorPrice)));
  // 3) surplus
  if (!early || !sharp(ctx)) {
    let n = 0;
    while (n < me.oil - keep && E.sellValue(st, n + 1, p).price >= floorPrice) n++;
    if (!sharp(ctx) && me.oil < cap * 0.6) n = 0; // sloppy bots only notice when the tanks look full
    amount = Math.max(amount, n);
  }
  // 4) overflow
  amount = Math.max(amount, me.oil + coming - cap);
  amount = Math.min(amount, me.oil);
  if (amount > 0) await ctx.do({ type: 'sell', amount });
  // what's left is this turn's budget for sailing (expanders first, then surveyors, the spy and the fleet)
  ctx.oilBudget = Math.max(0, me.oil - (sharp(ctx) ? 1 : 0));
}

// ---------- research ----------
export async function research(ctx) {
  const { st, p } = ctx, r = st.players[p].research;
  if (!r.current && !r.queue.length) {
    let pick = null;
    // the personality's plan, in order (good bots get better surveys first: finding oil is everything early)
    const plan = sharp(ctx) ? ['seismic', ...ctx.pers.research] : ctx.pers.research;
    for (const id of plan) {
      const s = techState(st, p, id);
      if (s === 'available' || s === 'blocked') { pick = id; break; }
    }
    // sloppy bots (or a finished plan): something random that's available
    if (!pick || !sharp(ctx)) {
      const avail = TECHS.filter(t => E.techStatus(st, p, t.id) === 'available' && (t.era < 5 || E.victoryOn(st, 'postoil')));
      if (avail.length && (!pick || chance(ctx, 0.5))) pick = avail[Math.floor(rand(ctx) * avail.length)].id;
    }
    if (pick) await ctx.do({ type: 'queueResearch', tech: pick });
  }
  // buy extra research with money we don't need
  const want = Math.min(FUNDING.maxRp, Math.floor(spare(ctx) * ctx.knobs.funding / FUNDING.costPerRp / 4));
  if ((r.funding || 0) !== want) await ctx.do({ type: 'setFunding', rp: want });
}
function techState(st, p, id) {
  try { return E.techStatus(st, p, id); } catch { return 'unknown'; }
}

// ---------- bases ----------
// How many of each platform a bot wants in a base (and in total).
function wanted(ctx, b, kind, have, total) {
  const st = ctx.st, rigs = st.rigs.filter(r => r.baseId === b.id).length;
  switch (kind) {
    case 'storage': return E.oilCapOf(st, ctx.p) - ctx.me.oil < 15 && have < 2;
    case 'lab': return have < (b.capital ? 2 : 1);
    case 'quarters': return have < 1 && b.level < E.maxBaseLevel(st, ctx.p);
    case 'pump': return rigs >= 2 && have < 1;
    case 'gun': return have < (ctx.pers.aggression < 0.4 ? 2 : 1);
    case 'radar': return have < 1 && b.level >= 2;
    case 'drydock': return total < (st.round > 40 ? 2 : 1) && b.level >= 2;
    case 'refinery': return total < 3 && have < 1;
    case 'aa': return have < 1 && b.level >= 3;
    case 'missile': return have < 1 && b.level >= 3;
    case 'helipad': return total < 1 && b.level >= 2;
    case 'cruise': return have < 1 && total < 3;
    case 'airbase': return total < 1;
    case 'fusion': return E.victoryOn(st, 'postoil') && b.level >= 4;
    default: return false;
  }
}

// A free square for a platform: as close to the middle of the base as possible.
function platformSpot(ctx, b, kind) {
  const st = ctx.st, r = E.baseRadius(st, b);
  let best = null;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = b.x + dx, y = b.y + dy;
    if (E.platformProblem(st, ctx.p, kind, x, y)) continue;
    const d = Math.max(Math.abs(dx), Math.abs(dy)) + (Math.abs(dx) + Math.abs(dy)) * 0.01;
    // leave the ring right next to the central rig open for ships when we can
    const score = d <= 1 ? d + 2.5 : d;
    if (!best || score < best.score) best = { x, y, score };
  }
  return best;
}

export async function buildBases(ctx) {
  const { st, p, me } = ctx;
  let started = 0;
  const bases = E.basesOf(st, p).filter(b => !b.wrecked).sort((a, b) => (b.capital ? 1 : 0) - (a.capital ? 1 : 0));
  // 1) wellheads on every deposit we know inside our claims
  for (const b of bases) {
    const r = E.baseRadius(st, b);
    for (const d of ctx.view.deposits) {
      if (started >= ctx.knobs.platforms + 2) break;
      if (d.reserves <= 0 || Math.max(Math.abs(d.x - b.x), Math.abs(d.y - b.y)) > r) continue;
      if (E.claimAt(st, d.x, d.y)?.id !== b.id) continue;
      if (E.platformProblem(st, p, 'wellhead', d.x, d.y)) continue;
      if (me.money - E.platformCost(st, p, 'wellhead') < reserve(ctx)) break;
      if ((await ctx.do({ type: 'buildPlatform', kind: 'wellhead', x: d.x, y: d.y })).ok) started++;
    }
  }
  if (!sharp(ctx) && chance(ctx, 0.5)) return; // sloppy bots forget about their bases now and then
  // platforms cost upkeep: wait until the oil is flowing
  const oilIn = st.rigs.filter(r => r.owner === p).reduce((t, r) => t + E.rigRate(st, r), 0);
  if (oilIn < 5 && me.money < 600) return;
  const platReserve = E.upkeepTotal(st, p) * 3 + 40;
  // 2) upgrades
  for (const b of bases) {
    const next = BASE_LEVELS[b.level + 1];
    if (!next || E.upgradeProblem(st, p, b)) continue;
    if (me.money - next.cost < platReserve + 50) continue;
    await ctx.do({ type: 'upgradeBase', baseId: b.id });
  }
  // 3) other platforms, in the personality's order
  const all = (st.platforms || []).filter(o => o.owner === p);
  for (const kind of ctx.pers.platforms) {
    if (kind === 'wellhead' || !E.platformUnlocked(st, p, kind)) continue;
    for (const b of bases) {
      if (started >= ctx.knobs.platforms) return;
      const have = all.filter(o => o.baseId === b.id && o.kind === kind).length;
      const total = all.filter(o => o.kind === kind).length;
      if (!wanted(ctx, b, kind, have, total)) continue;
      const cost = E.platformCost(st, p, kind);
      if (me.money - cost < platReserve + (kind === 'lab' ? 0 : 40)) continue;
      const spot = platformSpot(ctx, b, kind);
      if (!spot) continue;
      const r = await ctx.do({ type: 'buildPlatform', kind, x: spot.x, y: spot.y });
      if (r.ok) { started++; all.push({ baseId: b.id, kind }); }
    }
  }
  // 4) the Fusion Plant, when Post-Oil is on and we have a Hub
  if (E.victoryOn(st, 'postoil') && E.platformUnlocked(st, p, 'fusion') && !E.fusionOf(st, p)) {
    for (const b of bases.filter(b => b.level >= 4)) {
      const spot = platformSpot(ctx, b, 'fusion');
      if (spot && (await ctx.do({ type: 'buildPlatform', kind: 'fusion', x: spot.x, y: spot.y })).ok) break;
    }
  }
}

// Lost the Admiralty? Move it to the best surviving base.
export async function saveAdmiralty(ctx) {
  const { st, p, me } = ctx;
  if (me.exile == null) return;
  const options = E.basesOf(st, p).filter(b => !E.moveCapitalProblem(st, p, b)).sort((a, b) => b.level - a.level);
  if (options.length) await ctx.do({ type: 'moveCapital', baseId: options[0].id });
}
