// Bot defence: guards at every base, a home reserve, and shooting at enemies in range.
// (Attacking and fleet warfare come in the military step.)
import * as E from '../engine/index.js';
import { SHIPS } from '../data/ships.js';
import { isArmed, myShips, sharp, spotNextTo, taskOf } from './context.js';
import { enemiesNear } from './memory.js';

const free = (ctx, s) => !taskOf(ctx, s) && !s.order && !E.fleetOf(ctx.st, s.id);

export async function guardBases(ctx) {
  const { st, p } = ctx;
  const ships = myShips(ctx);
  const bases = E.basesOf(st, p).filter(b => !b.wrecked);
  // guards whose base is gone are released
  for (const s of ships) { const t = taskOf(ctx, s); if (t?.kind === 'guard' && !bases.some(b => b.id === t.base)) delete ctx.mem.tasks[s.id]; }
  // early on, nobody is coming: guards only once the bot is established or enemies have been seen nearby
  const threatened = b => enemiesNear(ctx, b.x, b.y, 12).length > 0;
  for (const b of bases) {
    const have = ships.filter(s => taskOf(ctx, s)?.kind === 'guard' && taskOf(ctx, s).base === b.id).length;
    const need = threatened(b) ? ctx.knobs.guards : 0; // the strike force covers everything else
    for (let i = have; i < need; i++) {
      const s = ships.filter(s => free(ctx, s) && isArmed(s.type) && !SHIPS[s.type].passives?.submerged)
        .sort((a, c) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) - Math.max(Math.abs(c.x - b.x), Math.abs(c.y - b.y)))[0];
      if (!s) break;
      const spot = spotNextTo(ctx, s, b.x, b.y, 2 + i);
      if (!spot) break;
      ctx.mem.tasks[s.id] = { kind: 'guard', base: b.id };
      await ctx.do({ type: 'setStanding', shipId: s.id, standing: { kind: 'guard', x: spot.x, y: spot.y } });
    }
  }
}

// Every armed ship fires at the weakest enemy it can see in range.
export async function openFire(ctx) {
  const { st, p } = ctx;
  for (const s of myShips(ctx)) {
    for (const act of SHIPS[s.type].actions.filter(a => a.kind === 'attack').sort((a, b) => (b.dmg || 0) - (a.dmg || 0))) {
      for (let shot = 0; shot < 8; shot++) {
        if (!st.ships.includes(s) || E.canUseAction(st, s, act)) break;
        const range = E.actionRange(st, s, act), cells = E.shipCells(s);
        const targets = ctx.view.enemyShips.filter(e => E.dist(cells, e.cells) <= range);
        if (!targets.length) {
          // no ships in range: enemy structures (a base's central rig first, then platforms, ports, wellheads)
          if (act.subsOnly) break;
          const v = ctx.view;
          const structs = [
            ...v.enemyPlatforms.filter(o => o.kind === 'fusion').map(o => [o.x, o.y, 0]),
            ...v.enemyRigs.filter(r => r.center).map(r => [r.x, r.y, 1]),
            ...v.enemyPlatforms.filter(o => o.kind === 'gun' || o.kind === 'missile').map(o => [o.x, o.y, 2]),
            ...v.enemyPorts.map(o => [o.x, o.y, 3]),
            ...v.enemyPlatforms.map(o => [o.x, o.y, 4]),
            ...v.enemyRigs.map(r => [r.x, r.y, 5]),
          ].filter(([x, y]) => E.dist(cells, [[x, y]]) <= range).sort((a, b) => a[2] - b[2]);
          if (!structs.length) break;
          if (!(await ctx.do({ type: 'act', shipId: s.id, actionId: act.id, x: structs[0][0], y: structs[0][1] })).ok) break;
          continue;
        }
        // sloppy bots shoot at whatever comes first; good ones keep hitting the ship they already hit
        // (or the smallest one, which sinks quickest). Enemy health isn't visible, so nobody cheats on it.
        const lastHit = ctx.me.shots.filter(x => x.r === 'hit' && x.turn === st.turnCount).map(x => x.x + ',' + x.y);
        const score = e => (e.cells.some(c => lastHit.includes(c.join(','))) ? -10 : 0) + e.cells.length;
        const t = sharp(ctx) ? [...targets].sort((a, b) => score(a) - score(b))[0] : targets[0];
        const cell = t.cells.find(c => E.dist(cells, [c]) <= range);
        if (!(await ctx.do({ type: 'act', shipId: s.id, actionId: act.id, x: cell[0], y: cell[1] })).ok) break;
      }
    }
  }
}
