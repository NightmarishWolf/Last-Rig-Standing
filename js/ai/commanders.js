// Bots and their commanders' special ships: marines (Assault Ships, Landing Craft) go for enemy bases
// they can take, and Ghost Boats siphon oil from enemy rigs. (Perks need nothing: they're just stats.)
import * as E from '../engine/index.js';
import { SHIPS } from '../data/ships.js';
import { canSpend, myShips, sailSome, spotNextTo, taskOf } from './context.js';

const actOf = (s, kind) => SHIPS[s.type].actions.find(a => a.kind === kind);
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

// Tag along 2–3 squares behind the warship closest to a recently seen enemy (the strike force), so marines
// are on hand when the guns knock a base down.
export async function followFleet(ctx, s) {
  const { st } = ctx;
  const recent = Object.values(ctx.mem.enemies || {}).filter(e => st.turnCount - e.turn <= st.players.length * 3);
  const rigs = ctx.view.enemyRigs.filter(r => r.center).map(r => ({ cells: [[r.x, r.y]] }));
  const marks = [...recent, ...rigs];
  if (!marks.length) return;
  const lead = myShips(ctx).filter(o => o !== s && SHIPS[o.type].actions.some(a => a.kind === 'attack') && SHIPS[o.type].cost >= 250)
    .map(o => ({ o, d: Math.min(...marks.map(e => E.dist(E.shipCells(o), e.cells))) })).filter(x => x.d <= 12).sort((a, b) => a.d - b.d)[0]?.o;
  if (lead && cheb(lead, s) > 2) { const spot = spotNextTo(ctx, s, lead.x, lead.y, 2); if (spot) await sailSome(ctx, s, spot.x, spot.y); }
}

export async function commanderShips(ctx) {
  await marines(ctx);
  await siphons(ctx);
}

// Marines: the nearest enemy base they could take (central rig damaged enough, or for Landing Craft
// no platforms in sight) within a few turns' sail; land when in range.
async function marines(ctx) {
  const { st, p, view } = ctx;
  const ships = myShips(ctx).filter(s => actOf(s, 'assault') && !E.fleetOf(st, s.id) && !s.standing);
  if (!ships.length) return;
  const share = Math.min(0.9, 0.5 + E.pstat(st, p, 'assaultHp'));
  for (const s of ships) {
    if (!st.ships.includes(s) || s.acted) continue;
    const act = actOf(s, 'assault'), small = !!act.small;
    const targets = view.enemyRigs.filter(r => r.center && r.owner >= 0).map(r => ({ r, b: (st.bases || []).find(b => b.id === r.baseId) }))
      .filter(({ r, b }) => b && !b.wrecked && (!b.capital || (!small && E.pstat(st, p, 'adminCapture') > 0 && r.hp <= E.baseMaxHp(st, b) * 0.25))
        && (small ? !view.enemyPlatforms?.some(o => o.baseId === b.id) : r.hp <= E.baseMaxHp(st, b) * share))
      .map(t => ({ ...t, d: E.dist(E.shipCells(s), [[t.r.x, t.r.y]]) })).filter(t => t.d <= s.movesLeft * 4 + 2).sort((a, b) => a.d - b.d);
    const t = targets[0];
    ctx.mem.tasks[s.id] = { kind: 'assault' };
    if (!t) { await followFleet(ctx, s); continue; }
    const range = E.actionRange(st, s, act);
    if (t.d > range) {
      const spot = spotNextTo(ctx, s, t.r.x, t.r.y, range);
      if (spot) await sailSome(ctx, s, spot.x, spot.y, spot.rot);
    }
    if (st.ships.includes(s) && E.dist(E.shipCells(s), [[t.r.x, t.r.y]]) <= range && !E.canUseAction(st, s, act) && canSpend(ctx, act.money, 1))
      await ctx.do({ type: 'act', shipId: s.id, actionId: act.id, x: t.r.x, y: t.r.y });
  }
}

// Ghost Boats: sail up to the nearest enemy rig and siphon its owner's oil.
async function siphons(ctx) {
  const { st, p, view } = ctx;
  for (const s of myShips(ctx).filter(s => actOf(s, 'siphon') && !E.fleetOf(st, s.id) && !s.standing)) {
    if (!st.ships.includes(s) || s.acted) continue;
    const act = actOf(s, 'siphon');
    const rig = view.enemyRigs.filter(r => r.owner >= 0 && st.players[r.owner].oil > 0)
      .map(r => ({ r, d: E.dist(E.shipCells(s), [[r.x, r.y]]) })).sort((a, b) => a.d - b.d)[0]?.r;
    ctx.mem.tasks[s.id] = { kind: 'siphon' };
    if (!rig) continue;
    if (E.dist(E.shipCells(s), [[rig.x, rig.y]]) > 1) {
      const spot = spotNextTo(ctx, s, rig.x, rig.y, 1);
      if (spot) await sailSome(ctx, s, spot.x, spot.y, spot.rot);
    }
    if (st.ships.includes(s) && E.dist(E.shipCells(s), [[rig.x, rig.y]]) <= 1 && !E.canUseAction(st, s, act) && canSpend(ctx, act.money, 1))
      await ctx.do({ type: 'act', shipId: s.id, actionId: act.id, x: rig.x, y: rig.y });
  }
}
void taskOf;

// ============================================================
// COMMANDER POWERS
// 'before' (at the start of the turn): powers that help the turn's moves (Smuggling Run, Tidal Surge,
// Swarm Call, Recon Blanket, Black Market Sale, Damage Control). 'after' (once the guns have fired):
// strikes and the rest; a Full Broadside then fires everything again.
// ============================================================
const ready = (ctx, id) => E.powersOf(ctx.st, ctx.p).some(w => w.id === id && w.cd <= 0);
const use = (ctx, id, x, y) => ctx.do(x == null ? { type: 'power', power: id } : { type: 'power', power: id, x, y });
const enemyCells = ctx => ctx.view.enemyShips.filter(e => e.owner >= 0 || true).flatMap(e => e.cells);

// the square whose 3×3 area holds the most enemy ship squares (+ central rigs count double)
function bestBlast(ctx, okAt) {
  const pts = new Map();
  const add = (x, y, w) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const k = (x + dx) + ',' + (y + dy); pts.set(k, (pts.get(k) || 0) + w); } };
  for (const [x, y] of enemyCells(ctx)) add(x, y, 1);
  for (const r of ctx.view.enemyRigs) add(r.x, r.y, r.center ? 2 : 0.5);
  let best = null;
  for (const [k, v] of pts) { if (best && v <= best.v) continue; const [x, y] = k.split(',').map(Number); if (okAt(x, y)) best = { x, y, v }; }
  return best;
}

export async function powersBefore(ctx) {
  const { st, p, view } = ctx, me = st.players[p];
  if (!me.commander) return;
  if (ready(ctx, 'blackmarket') && me.oil >= 15) await use(ctx, 'blackmarket');
  if (ready(ctx, 'damagecontrol')) {
    const lost = myShips(ctx).reduce((t, s) => t + Math.min(SHIPS[s.type].cls === 'capital' ? 4 : 2, E.shipStat(st, p, s.type, 'hp') - s.hp), 0);
    if (lost >= 4) await use(ctx, 'damagecontrol');
  }
  // fighting near home: more Tide, more boats
  const nearHome = view.enemyShips.filter(e => e.owner >= 0 && E.tideSources(st, p).some(o => E.dist(e.cells, [[o.x, o.y]]) <= o.r + 4));
  if (ready(ctx, 'tidalsurge') && nearHome.length) await use(ctx, 'tidalsurge');
  if (ready(ctx, 'swarmcall')) {
    const foe = nearHome[0], src = E.tideSources(st, p);
    const aim = foe ? foe.cells[0] : st.round > 10 && src.length ? [src[0].x, src[0].y] : null;
    if (aim) {
      // the Tide square nearest the aim point that the power accepts
      let spot = null;
      for (let r = 0; r <= 6 && !spot; r++) for (let dy = -r; dy <= r && !spot; dy++) for (let dx = -r; dx <= r && !spot; dx++)
        if (!E.powerProblem(st, p, 'swarmcall', aim[0] + dx, aim[1] + dy)) spot = [aim[0] + dx, aim[1] + dy];
      if (spot) await use(ctx, 'swarmcall', spot[0], spot[1]);
    }
  }
  if (ready(ctx, 'reconblanket') && st.round > 12) {
    // where the enemy was last seen, or the middle of the map
    const seen = Object.values(ctx.mem.enemies || {}).sort((a, b) => b.turn - a.turn)[0];
    const [x, y] = seen ? seen.cells[0] : [Math.floor(st.W / 2), Math.floor(st.H / 2)];
    await use(ctx, 'reconblanket', x, y);
  }
  // a fleet with somewhere to be: everyone sails further, for free
  if (ready(ctx, 'smugglerun') && Object.values(ctx.mem.tasks).filter(t => ['strike', 'raid', 'hunt', 'assault', 'siphon'].includes(t.kind)).length >= 3) await use(ctx, 'smugglerun');
}

export async function powersAfter(ctx) {
  const { st, p, view } = ctx, me = st.players[p];
  if (!me.commander) return;
  for (const id of ['carrierstrike', 'firestorm']) {
    if (!ready(ctx, id)) continue;
    const t = bestBlast(ctx, (x, y) => !E.powerProblem(st, p, id, x, y));
    if (t && t.v >= 2) await use(ctx, id, t.x, t.y);
  }
  if (ready(ctx, 'beachlanding')) {
    const r = view.enemyRigs.find(r => r.center && !E.powerProblem(st, p, 'beachlanding', r.x, r.y));
    if (r) await use(ctx, 'beachlanding', r.x, r.y);
  }
  if (ready(ctx, 'sabotage')) {
    // guns first, then whatever's there
    const pl = [...(view.enemyPlatforms || [])].sort((a, b) => (/gun|missile|cruise|aa/.test(b.kind) ? 1 : 0) - (/gun|missile|cruise|aa/.test(a.kind) ? 1 : 0))
      .find(o => !E.powerProblem(st, p, 'sabotage', o.x, o.y));
    const r = pl ? null : view.enemyRigs.find(r => !r.center && !E.powerProblem(st, p, 'sabotage', r.x, r.y));
    const t = pl || r;
    if (t) await use(ctx, 'sabotage', t.x, t.y);
  }
  if (ready(ctx, 'ignite') && (st.spills || []).length) {
    const inSlick = view.enemyShips.filter(e => e.owner >= 0 && e.cells.some(([x, y]) => st.spills.some(o => Math.max(Math.abs(x - o.x), Math.abs(y - o.y)) <= o.r))).length;
    if (inSlick >= 1) await use(ctx, 'ignite');
  }
  if (ready(ctx, 'broadside')) {
    // only worth it when capital ships have just fired and still have targets in range
    const caps = myShips(ctx).filter(s => SHIPS[s.type].cls === 'capital' && s.acted);
    const busy = caps.filter(s => SHIPS[s.type].actions.some(a => a.kind === 'attack' && view.enemyShips.some(e => E.dist(E.shipCells(s), e.cells) <= E.actionRange(st, s, a))));
    if (busy.length) { await use(ctx, 'broadside'); return 'fire again'; }
  }
  return null;
}
