// Bots and the world: fixing well blowouts, cleaning up oil slicks over deposits they want, and
// Icebreakers on Polar maps (they sail to the nearest oil under the ice and break it open).
import * as E from '../engine/index.js';
import { EVENT_TUNING, SPILLS } from '../data/events.js';
import { SHIPS } from '../data/ships.js';
import { canSpend, cheb, myShips, sailSome, taskOf } from './context.js';

export async function worldChores(ctx) {
  const { st, p } = ctx;
  // 1) blowouts: a rig earning nothing costs more than the fix, as long as upkeep is covered
  for (const r of st.rigs.filter(r => r.owner === p && r.blowout)) {
    if (!canSpend(ctx, EVENT_TUNING.blowout.fixCost, 1)) break;
    await ctx.do({ type: 'fixBlowout', rigId: r.id });
  }
  // 2) slicks over deposits we know and haven't built on: clean them if a cleanup ship is close
  if (st.spills?.length) {
    for (const s of myShips(ctx).filter(s => SHIPS[s.type].actions.some(a => a.kind === 'clean') && !s.acted)) {
      const slick = st.spills.find(o => E.dist(E.shipCells(s), [[o.x, o.y]]) <= SPILLS.clean.range + o.r
        && st.deposits.some(d => st.players[p].known[d.id] && cheb(d, o) <= o.r && !st.rigs.some(r => r.depId === d.id)));
      if (!slick || !canSpend(ctx, SPILLS.clean.money, 1)) continue;
      // the closest square of the slick in range
      let best = null;
      for (let dy = -slick.r; dy <= slick.r; dy++) for (let dx = -slick.r; dx <= slick.r; dx++) {
        const x = slick.x + dx, y = slick.y + dy;
        if (!E.inBounds(st, x, y)) continue;
        const d = E.dist(E.shipCells(s), [[x, y]]);
        if (d <= SPILLS.clean.range && (!best || d < best.d)) best = { x, y, d };
      }
      if (best) await ctx.do({ type: 'act', shipId: s.id, actionId: 'clean', x: best.x, y: best.y });
    }
  }
  // 3) Icebreakers: break into the ice and survey as they go; a deposit found under the ice gets opened
  //    (and founded on, if it's free and we can afford it)
  if (st.ice) {
    const done = (ctx.mem.iceDone ||= {});
    for (const s of myShips(ctx).filter(s => s.type === 'icebreaker' && !E.fleetOf(st, s.id))) {
      const t = (ctx.mem.tasks[s.id] ||= { kind: 'icebreak' });
      if (t.kind !== 'icebreak') continue;
      const known = st.deposits.filter(d => st.players[p].known[d.id] && !st.rigs.some(r => r.depId === d.id) && cheb(d, s) <= 25
        && (E.iceAt(st, d.x, d.y) || st.ice.some((v, i) => v && Math.abs(i % st.W - d.x) <= 1 && Math.abs(Math.floor(i / st.W) - d.y) <= 1)));
      // a deposit right here: found a base on it if we can
      const here = known.find(d => !E.iceAt(st, d.x, d.y) && E.dist(E.shipCells(s), [[d.x, d.y]]) <= 1 && !E.rigBuildProblem(st, p, d.x, d.y));
      if (here && canSpend(ctx, E.baseFoundCost(st, p), 1)) { await ctx.do({ type: 'buyRig', x: here.x, y: here.y }); continue; }
      const target = known.filter(d => E.iceAt(st, d.x, d.y)).sort((a, b) => cheb(a, s) - cheb(b, s))[0];
      let goal = target ? { x: target.x, y: target.y } : t.goal;
      if (!target && (!goal || cheb(goal, s) <= 1)) {
        if (goal) done[goal.x + ',' + goal.y] = 1;
        goal = nextIceGoal(st, s, E.basesOf(st, p)[0] || s, done);
      }
      if (!goal) continue;
      t.goal = goal;
      const r = await sailSome(ctx, s, goal.x, goal.y);
      if (r === 'noroute') { done[goal.x + ',' + goal.y] = 1; t.goal = null; }
      // survey from wherever it got to (that's how oil under the ice is found)
      if (!s.acted && canSpend(ctx, 15, 1) && !st.players[p].surveyed?.[s.x + ',' + s.y]) await ctx.do({ type: 'act', shipId: s.id, actionId: 'icesurvey' });
    }
  }
}
// Somewhere new inside the ice, not too far from home, that hasn't been visited yet.
function nextIceGoal(st, s, home, done) {
  let best = null;
  for (let y = 2; y < st.H - 2; y += 4) for (let x = 2; x < st.W - 2; x += 4) {
    if (!E.iceAt(st, x, y) || cheb({ x, y }, home) > 40) continue;
    if (Object.keys(done).some(k => { const [a, b] = k.split(',').map(Number); return Math.max(Math.abs(a - x), Math.abs(b - y)) < 6; })) continue;
    const d = cheb({ x, y }, s) + cheb({ x, y }, home) * 0.5;
    if (!best || d < best.d) best = { x, y, d };
  }
  return best && { x: best.x, y: best.y };
}
// The closest ice square to our home that has open water next to it (somewhere to start breaking).
function nearestIce(st, s, home) {
  let best = null;
  const R = 30;
  for (let y = Math.max(1, home.y - R); y < Math.min(st.H - 1, home.y + R); y += 2)
    for (let x = Math.max(1, home.x - R); x < Math.min(st.W - 1, home.x + R); x += 2) {
      if (!E.iceAt(st, x, y)) continue;
      const d = cheb({ x, y }, home) + cheb({ x, y }, s) * 0.3;
      if (!best || d < best.d) best = { x, y, d };
    }
  return best;
}
