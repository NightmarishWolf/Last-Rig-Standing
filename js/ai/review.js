// Bot fleet review: is every ship still worth its upkeep?
//
// Ships cost money every turn. Once a turn the bot looks at what it has and sells (for half price,
// scaled by damage) the ships it no longer needs:
//   - survey ships once there's little unsurveyed water left (one is kept to found rig bases with)
//   - Patrol Boats once a real navy has taken over and money is tight
//   - in a money crisis (upkeep it can't pay even by selling oil): the least useful ship for its upkeep
// A ship it wants to sell that's out at sea first sails back into its own waters (it can only be sold there).
// Never while enemies are close: a ship that might be needed in a fight stays.
import * as E from '../engine/index.js';
import { SHIPS, isRole } from '../data/ships.js';
import { canSurvey, chance, cheb, income, isArmed, myShips, sailSome, sharp, spotNextTo, taskOf } from './context.js';
import { enemiesNear } from './memory.js';

// Share of the water a bot could still survey (No Man's Sea and its own home waters) that nobody has surveyed.
function unsurveyedShare(ctx) {
  const { st, p } = ctx;
  const sv = st.players[p].surveyed || {};
  let tot = 0, open = 0;
  for (let y = 0; y < st.H; y += 2) for (let x = 0; x < st.W; x += 2) {
    if (E.isLand(st, x, y)) continue;
    const z = E.zoneOf(st, x, y);
    if (z !== 'middle' && z !== p) continue;
    tot++; if (!sv[x + ',' + y]) open++;
  }
  return tot ? open / tot : 0;
}

// How much the bot needs this ship right now (higher = keep).
function usefulness(ctx, s) {
  const t = taskOf(ctx, s), def = SHIPS[s.type];
  let v = isArmed(s.type) ? 2 + def.hp / 2 : 1;
  if (t?.kind === 'guard' || t?.kind === 'expand') v += 4;
  if (t?.kind === 'strike' || E.fleetOf(ctx.st, s.id)) v += 3;
  if (t?.kind === 'survey' || t?.kind === 'scout') v += 1;
  if (t?.kind === 'board') v += 2; // (Free Tide Boarding Skiffs: unarmed, but there to capture ships)
  v *= Math.max(0.3, s.hp / E.shipStat(ctx.st, ctx.p, s.type, 'hp')); // badly damaged ships are worth less
  return v / Math.max(1, E.upkeepOf(ctx.st, ctx.p, s.type));
}

export async function reviewFleet(ctx) {
  const { st, p, me } = ctx;
  if (st.round < 12) return; // the opening fleet is all needed
  if (!sharp(ctx) && chance(ctx, 0.5)) return; // sloppy bots don't keep the books
  const ships = myShips(ctx);
  const U = E.upkeepTotal(st, p), inc = income(ctx).money;
  const quiet = s => !enemiesNear(ctx, s.x, s.y, 10).length;
  const sellable = s => !E.shipSaleProblem(st, s) && quiet(s);
  const want = []; // [ship, reason]

  // 1) money crisis: upkeep we can't cover even by selling all our oil
  const f = E.upkeepForecast(st, p);
  if (f.red && f.oilToCover == null) {
    const pick = ships.filter(sellable).sort((a, b) => usefulness(ctx, a) - usefulness(ctx, b))[0];
    if (pick) want.push([pick, 'crisis']);
  }

  // 2) more survey ships than the water left to survey needs (always keeping one for founding bases
  //    from 5 squares away): every one costs upkeep that could pay for a warship
  const surveyShips = ships.filter(s => isRole(s.type, 'scout'));
  const open = unsurveyedShare(ctx);
  const keep = open > 0.5 ? 4 : open > 0.3 ? 3 : open > (sharp(ctx) ? 0.15 : 0.08) ? 2 : 1;
  if (surveyShips.length > keep) {
    const spare = surveyShips.filter(s => !taskOf(ctx, s) || ['survey', 'retire', 'scout'].includes(taskOf(ctx, s).kind))
      .sort((a, b) => a.hp - b.hp);
    for (const s of spare.slice(0, surveyShips.length - keep)) want.push([s, 'survey done']);
  }

  // 3) Patrol Boats once real warships have taken over and upkeep eats most of the income
  const warships = ships.filter(s => isArmed(s.type) && E.shipCost(st, p, s.type) >= 280).length;
  if (ctx.phase === 'war' && warships >= 4 && U > inc * 0.6) {
    const patrols = ships.filter(s => s.type === 'patrol' && !canSurveyNeeded(ctx, s) && (!taskOf(ctx, s) || taskOf(ctx, s).kind === 'retire'));
    if (patrols.length) want.push([patrols[0], 'outclassed']);
  }

  // sell the ones in our waters; send the rest home (one sale per turn, two in a crisis)
  let sold = 0;
  for (const [s, why] of want) {
    if (!st.ships.includes(s)) continue;
    if (sellable(s)) {
      if (sold >= (why === 'crisis' ? 2 : 1)) break;
      if ((await ctx.do({ type: 'sellShip', shipId: s.id })).ok) { sold++; delete ctx.mem.tasks[s.id]; }
      continue;
    }
    if (E.shipSaleProblem(st, s)?.startsWith('Saw combat')) continue;
    // out at sea: head for the nearest own base (or home) and sell it there
    const home = E.basesOf(st, p).filter(b => !b.wrecked).sort((a, b) => cheb(a, s) - cheb(b, s))[0];
    if (!home) continue;
    if (s.standing) await ctx.do({ type: 'setStanding', shipId: s.id, standing: null });
    if (E.fleetOf(st, s.id)) await ctx.do({ type: 'leaveFleet', shipId: s.id });
    ctx.mem.tasks[s.id] = { kind: 'retire' };
    const spot = spotNextTo(ctx, s, home.x, home.y, 2);
    if (spot) await sailSome(ctx, s, spot.x, spot.y, spot.rot);
    if (sellable(s) && sold < 1 && (await ctx.do({ type: 'sellShip', shipId: s.id })).ok) { sold++; delete ctx.mem.tasks[s.id]; }
  }
  // a retiring ship that's no longer on the list goes back to normal duties
  for (const s of ships) if (taskOf(ctx, s)?.kind === 'retire' && st.ships.includes(s) && !want.some(([w]) => w === s)) delete ctx.mem.tasks[s.id];
}

// A patrol boat still doing the survey sweep keeps its job while there's water to survey.
const canSurveyNeeded = (ctx, s) => canSurvey(s.type) && taskOf(ctx, s)?.kind === 'survey' && unsurveyedShare(ctx) >= 0.2;
