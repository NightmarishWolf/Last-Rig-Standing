// What a bot remembers between turns: enemy sightings and the jobs it gave its ships.
// Everything here comes from the bot's own view, so it is exactly what a human would know.
import * as E from '../engine/index.js';

export function updateMemory(ctx) {
  const { st, mem, view } = ctx;
  mem.enemies ||= {};
  mem.enemyBases ||= {};
  mem.enemyRigs ||= {};
  // enemy ships seen this turn
  for (const e of view.enemyShips) mem.enemies[e.id] = { owner: e.owner, cells: e.cells, turn: st.turnCount };
  // forget sightings older than a few rounds
  const old = st.turnCount - 6 * st.players.length;
  for (const id in mem.enemies) if (mem.enemies[id].turn < old) delete mem.enemies[id];
  for (const r of view.enemyRigs) mem.enemyRigs[r.id] = { owner: r.owner, x: r.x, y: r.y, turn: st.turnCount };
  for (const b of view.enemyBases) if (!b.wrecked) mem.enemyBases[b.id] = { owner: b.owner, x: b.x, y: b.y, capital: !!b.capital, turn: st.turnCount };
  // things we remember but can now see are gone (sunk rig, wrecked base, captured...) are forgotten
  const seen = seesSquareFn(ctx);
  for (const id in mem.enemyRigs) { const r = mem.enemyRigs[id]; if (seen(r.x, r.y) && !view.enemyRigs.some(x => x.id === id)) delete mem.enemyRigs[id]; }
  for (const id in mem.enemyBases) {
    const b = mem.enemyBases[id];
    if (seen(b.x, b.y) && !view.enemyBases.some(x => x.id === id && !x.wrecked)) delete mem.enemyBases[id];
    else { const v = view.enemyBases.find(x => x.id === id); if (v) b.capital = !!v.capital; }
  }
  // shots fired at us since our last turn: remember where they came from
  mem.threats = (ctx.me.flashes || []).map(f => ({ x: f.x + Math.floor(f.w / 2), y: f.y + Math.floor(f.h / 2), turn: f.turn }));
  // jobs for ships that no longer exist are dropped
  for (const id in mem.tasks) if (!st.ships.some(s => s.id === id && s.owner === ctx.p)) delete mem.tasks[id];
}

// Can we see this square right now? (cached for the turn)
export function seesSquareFn(ctx) {
  if (ctx._seen) return ctx._seen;
  const src = E.sightSources(ctx.st, ctx.p);
  return (ctx._seen = (x, y) => src.some(([cells, r]) => cells.some(([cx, cy]) => Math.max(Math.abs(cx - x), Math.abs(cy - y)) <= r)));
}

// Recently seen enemy ships within `r` squares of (x, y).
export function enemiesNear(ctx, x, y, r) {
  return Object.values(ctx.mem.enemies || {}).filter(e => e.cells.some(([cx, cy]) => Math.max(Math.abs(cx - x), Math.abs(cy - y)) <= r));
}

export const enemyClaimed = (ctx, x, y) => {
  // a deposit inside a known enemy base claim can't be taken
  const c = E.claimAt(ctx.st, x, y);
  return c && c.owner !== ctx.p && ctx.view.enemyBases.some(b => b.id === c.id);
};
