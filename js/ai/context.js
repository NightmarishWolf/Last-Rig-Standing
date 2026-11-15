// What a bot knows on its turn, plus small helpers every part of the brain shares.
//
// FAIR PLAY: a bot only looks at its own pieces and at getView(st, p), exactly what a human
// in its seat would see. It never reads enemy ships, rigs or deposits straight from `st`.
// (The engine's "can I build here?" checks are fine: a human gets the same answers as error messages.)
import * as E from '../engine/index.js';
import { DIFFICULTY, PERSONALITIES } from '../data/bots.js';
import { SHIPS } from '../data/ships.js';

export function makeContext(st, p, act) {
  const me = st.players[p], ai = me.ai;
  ai.mem ||= {};
  ai.mem.tasks ||= {};
  const ctx = {
    st, p, me, ai, act,
    mem: ai.mem,
    knobs: DIFFICULTY[ai.difficulty] || DIFFICULTY.normal,
    pers: PERSONALITIES[ai.personality] || PERSONALITIES.admiral,
    actions: 0,
    // the view is cached and refreshed after every action
    _view: null,
    get view() { return (this._view ||= E.getView(st, p)); },
  };
  // run one action (through the UI when there is one, so it can be animated)
  ctx.do = async a => {
    if (st.phase !== 'playing' || st.current !== p || ctx.actions > 400) return { ok: false };
    ctx.actions++;
    const r = await act(a);
    ctx._view = null;
    return r || { ok: false };
  };
  return ctx;
}

// The bot's own random numbers (kept in its save data, separate from the game's).
export function rand(ctx) {
  let t = (ctx.ai.rng = (ctx.ai.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const chance = (ctx, p) => rand(ctx) < p;
// A sensible choice happens with probability `skill`; otherwise the bot is sloppy.
export const sharp = ctx => chance(ctx, ctx.knobs.skill);
export function weighted(ctx, entries) {
  const total = entries.reduce((t, [, w]) => t + w, 0);
  if (total <= 0) return null;
  let r = rand(ctx) * total;
  for (const [k, w] of entries) { r -= w; if (r <= 0) return k; }
  return entries[entries.length - 1][0];
}

export const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
export const myShips = ctx => ctx.st.ships.filter(s => s.owner === ctx.p);
export const isArmed = type => SHIPS[type].actions.some(a => a.kind === 'attack');
export const canSurvey = type => SHIPS[type].actions.some(a => a.kind === 'survey');
export const taskOf = (ctx, s) => ctx.mem.tasks[s.id] || null;

// Money the bot wants to keep in hand (a few turns of upkeep plus a cushion; sloppy bots keep less).
export function reserve(ctx, extraUpkeep = 0) {
  return Math.round((E.upkeepTotal(ctx.st, ctx.p) + extraUpkeep) * (2 + 3 * ctx.knobs.skill) + 40);
}
export const spare = ctx => Math.max(0, ctx.me.money - reserve(ctx));

// Oil income per turn and a rough money value of it.
export function income(ctx) {
  const st = ctx.st, p = ctx.p;
  const oil = st.rigs.filter(r => r.owner === p).reduce((t, r) => t + E.rigRate(st, r), 0) * (ctx.me.bonus?.oil || 1);
  return { oil, money: oil * st.market.price * E.sellMultOf(st, p) };
}

// A water spot next to (x, y) where `ship` fits, as close to the ship as possible (anchor coordinates).
export function spotNextTo(ctx, ship, x, y, range = 1) {
  const st = ctx.st, vis = E.visibility(st, ctx.p);
  let best = null;
  for (let dy = -range - 4; dy <= range + 4; dy++) for (let dx = -range - 4; dx <= range + 4; dx++) {
    const ax = x + dx, ay = y + dy;
    for (const r of [ship.rot, (ship.rot + 1) % 4]) {
      const cells = E.cellsOf(ship.type, ax, ay, r);
      const d = E.dist(cells, [[x, y]]);
      if (d < 1 || d > range) continue;
      if (!E.placementOk(st, ctx.p, cells, ship.id, vis)) continue;
      const score = Math.abs(ax - ship.x) + Math.abs(ay - ship.y);
      if (!best || score < best.score) best = { x: ax, y: ay, rot: r, score };
    }
  }
  return best;
}

// Sail part of the way toward (x, y) this turn, spending at most the turn's oil budget
// (bots move ship by ship instead of using voyages, so they never burn oil they meant to sell).
// Returns 'arrived', 'moving', 'waiting', 'nooil', 'noroute' or 'stuck'.
export async function sailSome(ctx, s, x, y, rot = null) {
  const st = ctx.st;
  if (s.x === x && s.y === y && (rot == null || s.rot === rot)) return 'arrived';
  if ((s.acted && !E.passives(s).hitAndRun) || s.movesLeft <= 0) return 'waiting';
  const path = E.findPath(st, s, x, y, rot);
  if (!path) return 'noroute';
  if (!path.length) return 'arrived';
  let k = Math.min(path.length, s.movesLeft);
  const budget = Math.min(ctx.oilBudget ?? ctx.me.oil, ctx.me.oil);
  while (k > 0 && E.moveCost(st, s, k) > budget) k--;
  if (k <= 0) return 'nooil';
  const n = path[k - 1], before = ctx.me.oil;
  const r = await ctx.do({ type: 'move', shipId: s.id, x: n.x, y: n.y, rot: n.r });
  ctx.oilBudget = (ctx.oilBudget ?? before) - (before - ctx.me.oil);
  if (!r.ok) return 'stuck';
  return s.x === x && s.y === y ? 'arrived' : 'moving';
}
