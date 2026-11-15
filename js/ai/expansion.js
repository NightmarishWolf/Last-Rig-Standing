// Bot expansion: finding oil (surveying home waters, exploring) and founding new rig bases.
//
// Ship jobs (ctx.mem.tasks[shipId]):
//   { kind: 'survey' }                  sweep home waters with the Survey action
//   { kind: 'scout' }                   Explore standing order (surveys as it goes)
//   { kind: 'expand', dep, x, y }       sail next to a deposit and found a base there
import * as E from '../engine/index.js';
import { SHIPS } from '../data/ships.js';
import { canSurvey, cheb, isArmed, myShips, sailSome, sharp, spotNextTo, taskOf } from './context.js';
import { enemiesNear, enemyClaimed } from './memory.js';

const free = (ctx, s) => !taskOf(ctx, s) && !s.order && !E.fleetOf(ctx.st, s.id);
const cheap = s => SHIPS[s.type].cost <= 200;

// Distance from a deposit to the nearest of our ships or bases.
function nearestOwn(ctx, d) {
  let best = Infinity;
  for (const s of ctx.st.ships) if (s.owner === ctx.p) best = Math.min(best, cheb(s, d));
  for (const b of E.basesOf(ctx.st, ctx.p)) best = Math.min(best, cheb(b, d));
  return best;
}

// Deposits worth founding a base on: known, not empty, not ours, not inside a known enemy claim.
export function expansionTargets(ctx) {
  const { st, p } = ctx;
  const taken = new Set(Object.values(ctx.mem.tasks).filter(t => t.kind === 'expand').map(t => t.dep));
  return ctx.view.deposits
    .filter(d => d.reserves >= 20 && !taken.has(d.id) && !st.rigs.some(r => r.x === d.x && r.y === d.y && r.owner === p))
    .filter(d => !ctx.view.enemyRigs.some(r => r.x === d.x && r.y === d.y))
    .filter(d => { const c = E.claimAt(st, d.x, d.y); return !c || c.owner !== p; })
    .filter(d => !enemyClaimed(ctx, d.x, d.y))
    .filter(d => enemiesNear(ctx, d.x, d.y, 4).length === 0)
    // sailing costs oil, so close deposits win unless a far one is much richer
    .map(d => ({ d, score: Math.min(d.reserves, 60 + 25 * Math.min(4, E.basesOf(st, p).length)) / (nearestOwn(ctx, d) + 8) }))
    .sort((a, b) => b.score - a.score)
    .map(o => o.d);
}

// Survey sweep: the map is split into a grid of survey spots (one survey covers one spot's square).
// A surveyor heads for the nearest spot nobody has surveyed (skipping enemy home waters and
// spots another surveyor is already heading for), surveys it, and moves on.
function surveySpot(ctx, s, claimed, bad = []) {
  const { st, p } = ctx;
  const sv = st.players[p].surveyed || {};
  const act = SHIPS[s.type].actions.find(a => a.kind === 'survey');
  const r = act.radius + E.pstat(st, p, 'surveyRadius');
  const step = 2 * r + 1;
  const enemyHomes = st.players.filter((_, i) => i !== p).map(o => o.home);
  const inEnemyHome = (x, y) => enemyHomes.some(h => x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1);
  // the survey focus drifts from home waters out to No Man's Sea (where the big deposits are) over the first rounds
  const h = st.players[p].home, f = Math.min(0.85, st.round / 8);
  const hc = { x: (h.x0 + h.x1) / 2 * (1 - f) + st.W / 2 * f, y: (h.y0 + h.y1) / 2 * (1 - f) + st.H / 2 * f };
  let best = null;
  const R = 40; // look this far around the ship first (keeps it cheap on huge maps)
  for (let pass = 0; pass < 2 && !best; pass++) {
    const lim = pass ? Math.max(st.W, st.H) : R;
    const x0 = Math.max(r, s.x - lim), x1 = Math.min(st.W - 1, s.x + lim), y0 = Math.max(r, s.y - lim), y1 = Math.min(st.H - 1, s.y + lim);
    for (let y = y0 - ((y0 - r) % step); y <= y1; y += step) for (let x = x0 - ((x0 - r) % step); x <= x1; x += step) {
      if (y < 0 || x < 0 || sv[x + ',' + y] || E.isLand(st, x, y) || inEnemyHome(x, y)) continue;
      if (claimed.some(c => Math.abs(c.x - x) < step && Math.abs(c.y - y) < step)) continue;
      if (bad.includes(x + ',' + y)) continue;
      // the ship must fit there as it faces now (no land, nothing of ours in the way)
      if (!E.cellsOf(s.type, x, y, s.rot).every(([cx, cy]) => E.inBounds(st, cx, cy) && !E.isLand(st, cx, cy) && !E.shipAt(st, cx, cy, o => o.owner === p && o.id !== s.id)
        && !ctx.view.deposits.some(d => d.x === cx && d.y === cy))) continue; // never park on a deposit
      // nearby first, but pulled toward the middle of home waters and then out toward No Man's Sea
      // (not along the map edge, where there's half as much water to find)
      const d = cheb(s, { x, y }) + 0.6 * cheb(hc, { x, y }) + (x < step || y < step || x >= st.W - step || y >= st.H - step ? 6 : 0);
      if (!best || d < best.d) best = { x, y, d };
    }
  }
  return best;
}

export async function expansion(ctx) {
  const { st, p, me } = ctx;
  const ships = myShips(ctx);

  // ---- 1) expanders that have arrived found their base ----
  for (const s of ships) {
    const t = taskOf(ctx, s);
    if (t?.kind !== 'expand') continue;
    const d = ctx.view.deposits.find(x => x.id === t.dep);
    const gone = !d || d.reserves <= 0 || st.rigs.some(r => r.x === t.x && r.y === t.y) || enemyClaimed(ctx, t.x, t.y)
      || st.round - (t.since ?? st.round) > 14; // taking too long: give up and rethink
    if (gone) { delete ctx.mem.tasks[s.id]; continue; }
    // one of our own ships parked on the deposit: shift it off
    const sitter = E.shipAt(st, t.x, t.y, o => o.owner === p);
    if (sitter && !sitter.acted) {
      const off = spotNextTo(ctx, sitter, t.x, t.y, 2);
      if (off) await sailSome(ctx, sitter, off.x, off.y, off.rot);
    }
    if (E.dist(E.shipCells(s), [[t.x, t.y]]) <= 1 && !E.shipAt(st, t.x, t.y, o => o.owner === p)) {
      if (me.money >= E.baseFoundCost(st, p) + Math.max(40, E.upkeepTotal(st, p) * 3)) {
        const r = await ctx.do({ type: 'buyRig', x: t.x, y: t.y });
        if (r.ok && st.rigs.some(x => x.x === t.x && x.y === t.y && x.owner === p)) delete ctx.mem.tasks[s.id];
      }
      continue;
    }
    // not there yet: sail on (the spot is re-checked every turn in case something moved into it)
    const spot = spotNextTo(ctx, s, t.x, t.y);
    const res = spot ? await sailSome(ctx, s, spot.x, spot.y, spot.rot) : 'noroute';
    if (res === 'noroute' || res === 'stuck') { t.fails = (t.fails || 0) + 1; if (t.fails > 2) delete ctx.mem.tasks[s.id]; }
    if (E.dist(E.shipCells(s), [[t.x, t.y]]) <= 1 && me.money >= E.baseFoundCost(st, p) + Math.max(40, E.upkeepTotal(st, p) * 3)) {
      const r = await ctx.do({ type: 'buyRig', x: t.x, y: t.y });
      if (r.ok && st.rigs.some(x => x.x === t.x && x.y === t.y && x.owner === p)) delete ctx.mem.tasks[s.id];
    }
  }

  // ---- 2) new expansion jobs ----
  const busy = Object.values(ctx.mem.tasks).filter(t => t.kind === 'expand').length;
  const oilIn = st.rigs.filter(r => r.owner === p).reduce((t, r) => t + E.rigRate(st, r), 0);
  let slots = Math.min(ctx.knobs.expanders, 1 + Math.floor(oilIn / 4)) - busy; // only as many as the oil can move
  if (slots > 0 && me.money >= E.baseFoundCost(st, p) * 0.6) {
    for (const d of expansionTargets(ctx)) {
      if (slots <= 0) break;
      const cands = ships.filter(s => (free(ctx, s) || ['survey', 'reserve'].includes(taskOf(ctx, s)?.kind)) && !E.fleetOf(st, s.id) && (cheap(s) || !isArmed(s.type)) && s.movesLeft > 0)
        .sort((a, b) => cheb(a, d) + (a.type === 'survey' ? 25 : 0) - cheb(b, d) - (b.type === 'survey' ? 25 : 0));
      const s = cands[0];
      if (!s) break;
      const far = cheb(s, d);
      // don't send a ship further than a few turns of oil can carry it
      const reach = me.oil + oilIn * 5;
      if (far * E.shipStat(st, p, s.type, 'oil') > reach && sharp(ctx)) continue;
      if (far > 120) continue;
      const spot = spotNextTo(ctx, s, d.x, d.y);
      if (!spot) continue;
      ctx.mem.tasks[s.id] = { kind: 'expand', dep: d.id, x: d.x, y: d.y, since: st.round };
      if (s.standing) await ctx.do({ type: 'setStanding', shipId: s.id, standing: null });
      if (s.order) await ctx.do({ type: 'cancelOrder', shipId: s.id });
      if (E.dist(E.shipCells(s), [[d.x, d.y]]) > 1 && (await sailSome(ctx, s, spot.x, spot.y, spot.rot)) === 'noroute') { delete ctx.mem.tasks[s.id]; continue; }
      slots--;
    }
  }

  // ---- 3) survey sweep ----
  // survey ships first: they cover the most water per drop of oil
  const maxSurveyors = ctx.knobs.scouts + 1;
  let surveyors = ships.filter(s => taskOf(ctx, s)?.kind === 'survey')
    .sort((a, b) => (b.type === 'survey') - (a.type === 'survey'));
  for (const s of surveyors.slice(maxSurveyors)) delete ctx.mem.tasks[s.id];
  surveyors = surveyors.slice(0, maxSurveyors);
  // a survey ship always takes over from a patrol boat
  const better = ships.find(s => s.type === 'survey' && free(ctx, s) && !s.standing);
  if (better && surveyors.length >= maxSurveyors && surveyors[surveyors.length - 1].type !== 'survey') {
    delete ctx.mem.tasks[surveyors.pop().id];
  }
  for (const s of ships.filter(s => free(ctx, s) && canSurvey(s.type) && !s.standing).sort((a, b) => (b.type === 'survey') - (a.type === 'survey'))) {
    if (surveyors.length >= maxSurveyors) break;
    ctx.mem.tasks[s.id] = { kind: 'survey' }; surveyors.push(s);
  }
  const claimed = [];
  // once established, surveying only gets a slice of the oil (the fleet needs the rest)
  const fullBudget = ctx.oilBudget ?? me.oil;
  // plenty of known deposits waiting for a base: stop spending oil on surveys and turn it into money for founding
  // (only deposits we could actually sail to soon count: a far-off one shouldn't stop the search)
  const backlog = expansionTargets(ctx).filter(d => nearestOwn(ctx, d) <= me.oil + oilIn * 5).length;
  const early = E.basesOf(st, p).length < 3;
  const surveyCap = (backlog >= 3 || (early && backlog >= 1)) && sharp(ctx) ? 0 : backlog >= 2 ? Math.round(oilIn * 0.3) : ctx.phase === 'war' ? Math.max(4, Math.round(oilIn * 0.7))
    : early && sharp(ctx) ? Math.max(0, fullBudget - 8) : fullBudget; // early: keep enough oil to reach whatever we find
  ctx.oilBudget = Math.min(fullBudget, surveyCap);
  const spentBefore = ctx.oilBudget;
  for (const s of surveyors) {
    const t = taskOf(ctx, s), act = SHIPS[s.type].actions.find(a => a.kind === 'survey');
    const sv = st.players[p].surveyed || {};
    // survey wherever enough of the water around the ship is new (not just the exact square it's on)
    const fresh = () => {
      const r = act.radius + E.pstat(st, p, 'surveyRadius');
      let n = 0, tot = 0;
      for (const [cx, cy] of E.shipCells(s)) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx, y = cy + dy;
        if (!E.inBounds(st, x, y) || E.isLand(st, x, y)) continue;
        tot++; if (!sv[x + ',' + y]) n++;
      }
      return tot && n / tot >= 0.4;
    };
    const surveyHere = async () => { if (fresh() && !E.canUseAction(st, s, act)) await ctx.do({ type: 'act', shipId: s.id, actionId: act.id }); };
    await surveyHere();
    if (s.acted) { if (t.x != null) claimed.push(t); continue; }
    if (t.x == null || sv[t.x + ',' + t.y]) {
      const spot = surveySpot(ctx, s, claimed, t.bad || []);
      if (!spot) { delete ctx.mem.tasks[s.id]; continue; }
      t.x = spot.x; t.y = spot.y;
    }
    claimed.push(t);
    if (s.order) await ctx.do({ type: 'cancelOrder', shipId: s.id });
    const res = await sailSome(ctx, s, t.x, t.y);
    if (res === 'noroute' || res === 'stuck') { (t.bad ||= []).push(t.x + ',' + t.y); if (t.bad.length > 20) t.bad.shift(); t.x = null; continue; }
    // survey wherever it got to, if that's new water (even if it couldn't reach the spot this turn)
    await surveyHere();
  }

  ctx.oilBudget = Math.max(0, fullBudget - (spentBefore - ctx.oilBudget));

  // ---- 4) scouts: explorers that survey on the way ----
  const scouts = ships.filter(s => taskOf(ctx, s)?.kind === 'scout');
  for (const s of scouts) {
    if (!s.standing && !s.order) delete ctx.mem.tasks[s.id]; // nothing left to explore
    else if (me.oil < 10) { await ctx.do({ type: 'setStanding', shipId: s.id, standing: null }); delete ctx.mem.tasks[s.id]; } // save oil
  }
  const want = ctx.knobs.scouts - ships.filter(s => taskOf(ctx, s)?.kind === 'scout').length;
  // (exploring burns a whole turn of movement every turn: only once the oil is really flowing)
  for (let i = 0; i < want && ctx.phase === 'war' && me.oil > 50 && oilIn >= 15; i++) {
    const s = ships.filter(s => free(ctx, s) && !s.standing && (s.type === 'survey' || (cheap(s) && ships.length > 3)))
      .sort((a, b) => (b.type === 'survey') - (a.type === 'survey'))[0];
    if (!s) break;
    if ((await ctx.do({ type: 'setStanding', shipId: s.id, standing: { kind: 'explore' } })).ok) ctx.mem.tasks[s.id] = { kind: 'scout' };
  }
}

