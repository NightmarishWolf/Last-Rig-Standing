// Bot shipbuilding: what to build, and where.
import * as E from '../engine/index.js';
import { SHIPS, isRole } from '../data/ships.js';
import { chance, income, isArmed, myShips, rand, reserve, roleShip, sharp, weighted } from './context.js';
import { expansionTargets } from './expansion.js';
import { nextProject } from './economy.js';
import { enemiesNear } from './memory.js';

// The shortest line among the yards (home first when tied).
function bestYard(ctx) {
  const { st, p } = ctx;
  return E.yardsOf(st, p)
    .map(y => ({ y, n: E.yardQueue(st, p, y.id).length / y.slots }))
    .sort((a, b) => a.n - b.n || (a.y.kind === 'home' ? -1 : 1))[0].y;
}

async function build(ctx, type) {
  const { st, p } = ctx, yard = bestYard(ctx);
  if (E.yardQueue(st, p, yard.id).length >= yard.slots + 1) return false;
  if (E.buildProblem(st, p, type, yard.id)) return false;
  return (await ctx.do({ type: 'buyShip', ship: type, yard: yard.id })).ok;
}

export async function shipbuilding(ctx) {
  const { st, p, me } = ctx;
  const ships = myShips(ctx), builds = E.buildsOf(st, p);
  const count = f => ships.filter(f).length + builds.filter(b => f({ type: b.ship })).length;
  // founding bases comes first: keep enough for the next one while there's somewhere to found it
  // (while expanding, keep enough for the next base; once established, the fleet comes first)
  const expanding = ctx.phase === 'expand' && (expansionTargets(ctx).length || Object.values(ctx.mem.tasks).some(t => t.kind === 'expand'));
  // ...and once established, part of the money goes into the bases (labs, pumps, defences, upgrades):
  // the shipyard leaves the next project's price alone unless enemies are close to one of our bases
  const underThreat = E.basesOf(st, p).some(b => enemiesNear(ctx, b.x, b.y, 10).length);
  const project = ctx.phase === 'war' && !underThreat && sharp(ctx) ? nextProject(ctx) : null; // (expanding comes first)
  const saving = (expanding ? E.baseFoundCost(st, p) : 0) + (project ? Math.round(project.cost * (1 - ctx.pers.fleetShare / 2)) : 0);
  const cushion = type => ctx.phase === 'war' ? (E.upkeepTotal(st, p) + E.upkeepOf(st, p, type)) * 2 + 20 : reserve(ctx, E.upkeepOf(st, p, type));
  const afford = type => me.money - E.shipCost(st, p, type) >= cushion(type) + saving; // counting the new ship's upkeep
  // keep upkeep within what the oil brings in (sloppy bots overspend)
  const inc = income(ctx).money;
  const upkeepRoom = () => inc * (sharp(ctx) ? 0.7 : 1.2) - E.upkeepTotal(st, p);

  const oilIn = income(ctx).oil;
  // (each faction's version of the job: a Picket Boat or a Skiff Pack, a Survey Ship or a Prospector Skiff...)
  const picket = roleShip(ctx, 'picket'), scout = roleShip(ctx, 'scout');
  // no ships left at all: a picket boat to survey and expand with
  if (!ships.length && !builds.length && me.money >= E.shipCost(st, p, picket)) { await build(ctx, picket); return; }
  // at least two boats that can survey (they find the oil everything else depends on)
  if (ships.filter(s => isRole(s.type, 'picket', 'scout')).length + builds.length < 2 && afford(picket)) await build(ctx, picket);
  // 1) a survey ship for finding oil (more once the economy can feed them)
  const surveyWant = E.basesOf(st, p).length < 2 || oilIn < 5 ? 0 : Math.min(ctx.knobs.scouts + 1, Math.floor(oilIn / 5)); // finding oil pays for itself many times over // the starting boats survey until money allows
  if (count(s => isRole(s.type, 'scout')) < surveyWant && afford(scout)) await build(ctx, scout);
  // 2) a cheap boat for founding bases, when there's oil to claim and no free boat to send
  const targets = expansionTargets(ctx).length;
  const idleCheap = ships.filter(s => SHIPS[s.type].cost <= 190 && (!ctx.mem.tasks[s.id] || ctx.mem.tasks[s.id].kind === 'survey')).length;
  if (ctx.phase === 'expand' && targets > idleCheap && afford(picket) && E.basesOf(st, p).length < 12) await build(ctx, picket);
  // Polar maps: an Icebreaker (two on big maps) to open up the oil under the ice
  if (st.ice && oilIn >= 6 && st.round >= 10 && E.shipUnlocked(st, p, 'icebreaker') && count(s => s.type === 'icebreaker') < (st.W > 200 ? 2 : 1) && afford('icebreaker')) await build(ctx, 'icebreaker');
  // early on every ship eats the oil we need for expanding: no warships until the economy grows
  if (oilIn < 8 && !Object.keys(ctx.mem.enemies || {}).length) return;

  // 3) warships, by personality, with the share of spare money it likes to spend on the fleet
  // with Cruise Missiles researched, every personality wants missile ships: they outrange any base,
  // so they're how a fleet breaks a turtle without sailing into its guns
  // (the Navy's; the Free Tide has no cruise missiles, so its bots stick to their own mix)
  const cruise = ctx.faction === 'navy' && E.hasTech(st, p, 'cruise_missiles');
  // cheap screens (corvettes, picket boats) only alongside real warships: at most 2, plus 1 per 2 bigger ones
  const heavy = count(s => isArmed(s.type) && SHIPS[s.type].cost >= 250);
  const screenOk = k => !isRole(k, 'screen', 'picket') || count(s => s.type === k) < (2 + Math.floor(heavy / 2)) * (SHIPS[k].pack || 1);
  // (a commander's exclusive ship, once it can be built)
  const own = Object.entries(SHIPS).find(([k, d]) => d.commander && d.commander === me.commander?.id && E.shipUnlocked(st, p, k))?.[0];
  // (the small specialists only a few at a time)
  const cap = { landingcraft: 3, ghost: 3, broodraft: 1 }[own];
  const excl = own && !(cap && count(s => s.type === own) >= cap) ? { [own]: { battlecruiser: 4, escortcarrier: 3, landingcraft: 2, broodraft: 1, incendiary: 3, ghost: 2 }[own] || 2 } : {};
  const want = Object.entries({ ...ctx.pers.ships, ...excl, ...(cruise ? { missileboat: Math.max(3, (ctx.pers.ships.missileboat || 0) * 2), cruiser: Math.max(2, ctx.pers.ships.cruiser || 0) } : {}) })
    .filter(([k]) => E.shipUnlocked(st, p, k) && screenOk(k));
  // Good bots at war plan their next warship from what they like (bigger ships preferred, up to what about
  // 10 turns of income buys) and save up for it, instead of buying whatever this turn's spare change
  // covers (which meant a sea of corvettes). Under attack, anything affordable now will do (below).
  if (sharp(ctx) && ctx.phase === 'war' && !underThreat) {
    const cap = Math.max(350, inc * 10);
    const ok = want.filter(([k]) => E.shipCost(st, p, k) <= cap);
    let plan = ctx.mem.warPlan;
    if (!plan || !ok.some(([k]) => k === plan)) plan = ctx.mem.warPlan = ok.length ? weighted(ctx, ok.map(([k, w]) => [k, w * (1 + E.shipCost(st, p, k) / 400)])) : null;
    ctx.mem.warFund = plan ? E.shipCost(st, p, plan) : 0; // (platforms leave part of this alone: economy.js)
    if (plan && upkeepRoom() > 0 && me.money - E.shipCost(st, p, plan) >= cushion(plan) + saving) {
      if (await build(ctx, plan)) { ctx.mem.warPlan = null; ctx.mem.warFund = 0; }
    }
    return;
  }
  ctx.mem.warFund = 0;
  for (let tries = 0; tries < 3; tries++) {
    const spare = me.money - (ctx.phase === 'war' ? E.upkeepTotal(st, p) * 2 + 20 : reserve(ctx)) - saving;
    if (spare <= 0 || upkeepRoom() <= 0) break;
    const budget = spare * (ctx.phase === 'war' ? 0.85 : ctx.pers.fleetShare);
    // prefer the biggest ships it likes that fit the budget; sloppy bots pick anything affordable
    const options = want.filter(([k]) => E.shipCost(st, p, k) <= budget && (!SHIPS[k].passives?.limit || count(s => s.type === k) < SHIPS[k].passives.limit));
    if (!options.length) break;
    const pick = sharp(ctx)
      ? weighted(ctx, options.map(([k, w]) => [k, w * (1 + E.shipCost(st, p, k) / 500)]))
      : options[Math.floor(rand(ctx) * options.length)][0];
    if (!pick || !(await build(ctx, pick))) break;
    if (!chance(ctx, 0.5)) break;
  }
}
