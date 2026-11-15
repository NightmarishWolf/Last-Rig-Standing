// Bot shipbuilding: what to build, and where.
import * as E from '../engine/index.js';
import { SHIPS } from '../data/ships.js';
import { chance, income, isArmed, myShips, rand, reserve, sharp, weighted } from './context.js';
import { expansionTargets } from './expansion.js';

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
  const saving = expanding ? E.baseFoundCost(st, p) : 0;
  const cushion = type => ctx.phase === 'war' ? (E.upkeepTotal(st, p) + E.upkeepOf(st, p, type)) * 2 + 20 : reserve(ctx, E.upkeepOf(st, p, type));
  const afford = type => me.money - E.shipCost(st, p, type) >= cushion(type) + saving; // counting the new ship's upkeep
  // keep upkeep within what the oil brings in (sloppy bots overspend)
  const inc = income(ctx).money;
  const upkeepRoom = () => inc * (sharp(ctx) ? 0.7 : 1.2) - E.upkeepTotal(st, p);

  const oilIn = income(ctx).oil;
  // no ships left at all: a patrol boat to survey and expand with
  if (!ships.length && !builds.length && me.money >= E.shipCost(st, p, 'patrol')) { await build(ctx, 'patrol'); return; }
  // at least two boats that can survey (they find the oil everything else depends on)
  if (ships.filter(s => s.type === 'patrol' || s.type === 'survey').length + builds.length < 2 && afford('patrol')) await build(ctx, 'patrol');
  // 1) a survey ship for finding oil (more once the economy can feed them)
  const surveyWant = E.basesOf(st, p).length < 2 || oilIn < 5 ? 0 : Math.min(ctx.knobs.scouts + 1, Math.floor(oilIn / 5)); // finding oil pays for itself many times over // the starting boats survey until money allows
  if (count(s => s.type === 'survey') < surveyWant && afford('survey')) await build(ctx, 'survey');
  // 2) a cheap boat for founding bases, when there's oil to claim and no free boat to send
  const targets = expansionTargets(ctx).length;
  const idleCheap = ships.filter(s => SHIPS[s.type].cost <= 150 && (!ctx.mem.tasks[s.id] || ctx.mem.tasks[s.id].kind === 'survey')).length;
  if (ctx.phase === 'expand' && targets > idleCheap && afford('patrol') && E.basesOf(st, p).length < 12) await build(ctx, 'patrol');
  // early on every ship eats the oil we need for expanding: no warships until the economy grows
  if (oilIn < 8 && !Object.keys(ctx.mem.enemies || {}).length) return;

  // 3) warships, by personality, with the share of spare money it likes to spend on the fleet
  const want = Object.entries(ctx.pers.ships).filter(([k]) => E.shipUnlocked(st, p, k));
  for (let tries = 0; tries < 3; tries++) {
    const spare = me.money - (ctx.phase === 'war' ? E.upkeepTotal(st, p) * 2 + 20 : reserve(ctx)) - saving;
    if (spare <= 0 || upkeepRoom() <= 0) break;
    const budget = spare * (ctx.phase === 'war' ? 0.85 : ctx.pers.fleetShare);
    // prefer the biggest ships it likes that fit the budget; sloppy bots pick anything affordable
    const options = want.filter(([k]) => E.shipCost(st, p, k) <= budget && (!SHIPS[k].passives?.limit || count(s => s.type === k) < SHIPS[k].passives.limit));
    if (!options.length) break;
    const pick = sharp(ctx)
      ? weighted(ctx, options.map(([k, w]) => [k, w * (1 + E.shipCost(st, p, k) / 400)]))
      : options[Math.floor(rand(ctx) * options.length)][0];
    if (!pick || !(await build(ctx, pick))) break;
    if (!chance(ctx, 0.5)) break;
  }
}
