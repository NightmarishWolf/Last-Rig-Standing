// Bot warfare: defending bases, building a strike fleet, and sending it after the right target.
//
// Ship jobs used here (ctx.mem.tasks[shipId]):
//   { kind: 'defend', base }   sailing to (or guarding) a base under threat
//   { kind: 'strike' }         part of the strike force (gathers at the rally point, then sails as a fleet)
//   { kind: 'raid', x, y }     a lone raider (subs, fast boats) hunting enemy rigs
// ctx.mem.strike = { fleetId, target: { x, y, what, id }, power0, since }
//
// Everything a bot attacks comes from its own view or memory: enemy home waters are public
// (they're drawn on everyone's map), but the Admiralty inside them has to be found by scouting.
import * as E from '../engine/index.js';
import { SHIPS } from '../data/ships.js';
import { cheb, isArmed, myShips, sailSome, sharp, spotNextTo, taskOf } from './context.js';
import { enemiesNear } from './memory.js';

// ---------- strength ----------
// A rough fighting value for a ship type: health plus firepower (damage × shots, longer range counts more).
export function power(st, p, type) {
  const def = SHIPS[type];
  let fire = 0;
  for (const a of def.actions) if (a.kind === 'attack' && !a.subsOnly) fire = Math.max(fire, E.weaponStat(st, p, a, 'dmg') * E.weaponStat(st, p, a, 'shots') * (1 + E.weaponStat(st, p, a, 'range') / 6));
  return E.shipStat(st, p, type, 'hp') + E.shipStat(st, p, type, 'armor') * 2 + fire * 2;
}
// Enemy ships seen recently: we don't know their type, so size stands in for it.
const seenPower = e => e.cells.length * 3;
// anything armed can join the strike force once the bot is in its war phase (patrol boats too)
const warship = (ctx, s) => isArmed(s.type) && (SHIPS[s.type].cost >= 150 || ctx.phase === 'war');

// ---------- defence ----------
// Enemies spotted near one of our bases: send the closest free warships there.
export async function defend(ctx) {
  const { st, p } = ctx;
  const bases = E.basesOf(st, p).filter(b => !b.wrecked);
  const ships = myShips(ctx);
  // release defenders whose base is safe again
  for (const s of ships) {
    const t = taskOf(ctx, s);
    if (t?.kind !== 'defend') continue;
    const b = bases.find(x => x.id === t.base);
    if (!b || !enemiesNear(ctx, b.x, b.y, 12).some(e => st.turnCount - e.turn <= 2 * st.players.length)) {
      delete ctx.mem.tasks[s.id];
      if (s.standing) await ctx.do({ type: 'setStanding', shipId: s.id, standing: null });
    }
  }
  for (const b of bases) {
    const threats = enemiesNear(ctx, b.x, b.y, 10).filter(e => st.turnCount - e.turn <= 2 * st.players.length);
    if (!threats.length) continue;
    const threat = threats.reduce((t, e) => t + seenPower(e), 0);
    let have = ships.filter(s => taskOf(ctx, s)?.kind === 'defend' && taskOf(ctx, s).base === b.id).reduce((t, s) => t + power(st, p, s.type), 0);
    const free = ships.filter(s => isArmed(s.type) && !E.fleetOf(st, s.id) && !['defend', 'expand'].includes(taskOf(ctx, s)?.kind))
      .sort((a, c) => cheb(a, b) - cheb(c, b));
    for (const s of free) {
      if (have >= threat * 1.3) break;
      if (cheb(s, b) > 40) break;
      ctx.mem.tasks[s.id] = { kind: 'defend', base: b.id };
      have += power(st, p, s.type);
    }
    // defenders head to the base, then hold there and shoot whatever comes
    for (const s of ships.filter(s => taskOf(ctx, s)?.kind === 'defend' && taskOf(ctx, s).base === b.id)) {
      if (cheb(s, b) > 3) {
        const spot = spotNextTo(ctx, s, b.x, b.y, 2);
        if (spot) await sailSome(ctx, s, spot.x, spot.y, spot.rot);
      } else if (!s.standing) await ctx.do({ type: 'setStanding', shipId: s.id, standing: { kind: 'guard', x: s.x, y: s.y } });
    }
  }
}

// ---------- choosing a target ----------
// What the strike force should go after, most urgent first.
function pickTarget(ctx) {
  const { st, p, view, mem } = ctx;
  const rivals = st.players.map((_, i) => i).filter(i => i !== p && !st.players[i].out);
  if (!rivals.length) return null;
  const from = frontier(ctx) || myShips(ctx)[0] || { x: 0, y: 0 };
  // 1) a rival's Fusion Plant: it wins them the game
  const fusion = view.enemyPlatforms.find(o => o.kind === 'fusion');
  if (fusion) return { x: fusion.x, y: fusion.y, what: 'fusion', id: fusion.id, owner: fusion.owner };
  // 2) a rival close to Domination (the streak is shown to everyone): hit their bases
  const dom = rivals.filter(i => st.players[i].domStreak > 0).sort((a, b) => st.players[b].domStreak - st.players[a].domStreak)[0];
  const knownBases = Object.entries(mem.enemyBases || {}).map(([id, b]) => ({ id, ...b })); // forgotten once seen gone (memory.js)
  if (dom != null) {
    const b = knownBases.filter(x => x.owner === dom).sort((a, c) => cheb(a, from) - cheb(c, from))[0];
    if (b) return { x: b.x, y: b.y, what: 'base', id: b.id, owner: b.owner };
  }
  // 3) raiders and tycoons go for rigs and outlying bases; the others for the Admiralty (Conquest)
  const capitals = knownBases.filter(b => b.capital);
  const nearest = list => list.sort((a, c) => cheb(a, from) - cheb(c, from))[0];
  if (ctx.ai.personality === 'raider' || ctx.ai.personality === 'tycoon') {
    const b = nearest(knownBases.filter(b => !b.capital)) || nearest(capitals);
    if (b) return { x: b.x, y: b.y, what: 'base', id: b.id, owner: b.owner };
  }
  // the Admiralty (Conquest) when it's within reach or late in the war; otherwise the nearest base
  const c = nearest(capitals), b = nearest(knownBases);
  if (c && (cheb(c, from) < 50 || st.round > 90 || !b)) return { x: c.x, y: c.y, what: 'capital', id: c.id, owner: c.owner };
  if (b) return { x: b.x, y: b.y, what: 'base', id: b.id, owner: b.owner };
  // 4) nothing found yet: sweep No Man's Sea toward the nearest rival's home (their home waters are on everyone's map)
  const r = rivals.sort((a, c) => cheb(homeCentre(st, a), from) - cheb(homeCentre(st, c), from))[0];
  const h = homeCentre(st, r), d = Math.max(1, cheb(h, from)), k = Math.min(1, (25 + 10 * ((ctx.mem.searches || 0) % 4)) / d);
  return { x: Math.round(from.x + (h.x - from.x) * k), y: Math.round(from.y + (h.y - from.y) * k), what: 'search', owner: r };
}
// Our base closest to the nearest rival's home: where the strike force gathers (sailing costs oil,
// so wars are fought at the frontier, not across the whole map).
export function frontier(ctx) {
  const { st, p } = ctx;
  const bases = E.basesOf(st, p).filter(b => !b.wrecked);
  if (!bases.length) return null;
  const rivals = st.players.map((_, i) => i).filter(i => i !== p && !st.players[i].out);
  if (!rivals.length) return bases[0];
  const score = b => Math.min(...rivals.map(r => cheb(b, homeCentre(st, r))));
  return [...bases].sort((a, b) => score(a) - score(b))[0];
}
const homeCentre = (st, i) => { const h = st.players[i].home; return { x: Math.round((h.x0 + h.x1) / 2), y: Math.round((h.y0 + h.y1) / 2) }; };

// ---------- the strike force ----------
// How strong the strike force should be before it sails (more for careful personalities).
function launchPower(ctx) {
  const ag = ctx.pers.aggression;
  const known = Object.values(ctx.mem.enemies || {}).filter(e => ctx.st.turnCount - e.turn < 10 * ctx.st.players.length);
  const enemy = known.reduce((t, e) => t + seenPower(e), 0);
  return Math.max(10 + (1 - ag) * 16, enemy * (1.6 - ag * 0.5));
}

export async function strike(ctx) {
  const { st, p, mem } = ctx;
  const ships = myShips(ctx);
  const rally = frontier(ctx);
  if (!rally) return;
  // new warships join the strike force (some stay home as guards, see defense.js)
  for (const s of ships) if (warship(ctx, s) && !taskOf(ctx, s) && !s.standing) ctx.mem.tasks[s.id] = { kind: 'strike' };
  const force = ships.filter(s => taskOf(ctx, s)?.kind === 'strike');
  let f = mem.strike?.fleetId && E.fleetById(st, mem.strike.fleetId);
  if (mem.strike && !f) mem.strike = null; // the fleet was destroyed or disbanded

  // ---- gathering ----
  if (!f) {
    const total = force.reduce((t, s) => t + power(st, p, s.type), 0);
    for (const s of force) {
      if (cheb(s, rally) > 5) { const spot = spotNextTo(ctx, s, rally.x, rally.y, 4); if (spot) await sailSome(ctx, s, spot.x, spot.y); }
    }
    const gathered = force.filter(s => cheb(s, rally) <= 6);
    const ready = gathered.reduce((t, s) => t + power(st, p, s.type), 0);
    if (gathered.length >= 2 && ready >= launchPower(ctx) && (sharp(ctx) || total > launchPower(ctx) * 1.3)) {
      const oilIn = st.rigs.filter(r => r.owner === p).reduce((t, r) => t + E.rigRate(st, r), 0);
      const size = Math.max(2, Math.min(12, Math.floor(oilIn / 2) + 2)); // a fleet the oil can actually move
      const pick = gathered.sort((a, b) => power(st, p, b.type) - power(st, p, a.type)).slice(0, size);
      const r = await ctx.do({ type: 'formFleet', shipIds: pick.map(s => s.id) });
      if (r.ok) {
        f = E.fleetOf(st, pick[0].id);
        mem.strike = { fleetId: f.id, target: pickTarget(ctx), power0: ready, since: st.round };
      }
    }
    if (!f) return;
  }

  // ---- at sea ----
  const fleetShips = E.fleetShips(st, f);
  const now = fleetShips.reduce((t, s) => t + power(st, p, s.type), 0);
  // badly beaten: come home and rebuild
  if (now < mem.strike.power0 * 0.4) {
    await ctx.do({ type: 'disbandFleet', fleetId: f.id });
    mem.strike = null;
    for (const s of fleetShips) ctx.mem.tasks[s.id] = { kind: 'strike' }; // they'll regroup at the rally point
    return;
  }
  // re-pick the target if it's gone, or something more urgent appeared (a Fusion Plant, a Domination streak)
  const urgent = pickTarget(ctx);
  const t = mem.strike.target;
  const gone = !t || (t.what === 'fusion' ? !ctx.view.enemyPlatforms.some(o => o.id === t.id)
    : t.id && !ctx.mem.enemyBases?.[t.id]);
  const searched = t?.what === 'search' && cheb(E.flagship(st, f), t) <= 4;
  if (searched) mem.searches = (mem.searches || 0) + 1; // next sweep goes a little further
  if (gone || searched || (urgent && ['fusion'].includes(urgent.what) && t.what !== 'fusion') || (urgent?.what === 'capital' && t.what === 'search')) mem.strike.target = urgent;
  const tg = mem.strike.target;
  if (!tg) return;
  // sail toward the target, but only as far as this turn's oil allows (then stop, so the fleet
  // doesn't keep burning oil at the end of the turn)
  const L = E.flagship(st, f);
  const dest = spotNextTo(ctx, L, tg.x, tg.y, 2) || spotNextTo(ctx, L, tg.x, tg.y, 5);
  if (!dest) { if (tg.what === 'search') mem.searches = (mem.searches || 0) + 1; mem.strike.target = null; return; } // nowhere to stop there (land): pick again
  if (cheb(L, dest) > 1) {
    const speed = E.fleetSpeed(st, f);
    const cost = fleetShips.reduce((t, s) => t + E.moveCost(st, s, speed), 0);
    if ((ctx.oilBudget ?? ctx.me.oil) >= Math.min(cost, ctx.me.oil) && ctx.me.oil >= fleetShips.length) {
      const before = ctx.me.oil;
      const r = await ctx.do({ type: 'setFleetOrder', fleetId: f.id, points: [{ x: dest.x, y: dest.y }] });
      if (st.fleets.includes(f) && f.order) await ctx.do({ type: 'cancelFleetOrder', fleetId: f.id });
      ctx.oilBudget = Math.max(0, (ctx.oilBudget ?? before) - (before - ctx.me.oil));
      if (!r.ok) { if (tg.what === 'search') mem.searches = (mem.searches || 0) + 1; mem.strike.target = null; } // can't get there: pick something else next turn
    }
  }
}

// ---------- raiders ----------
// Subs and fast boats (Raider personality) hunt enemy rigs on their own, and slip away from warships.
export async function raid(ctx) {
  const { st, p } = ctx;
  if (ctx.ai.personality !== 'raider') return;
  const raiders = myShips(ctx).filter(s => (SHIPS[s.type].passives?.submerged || s.type === 'hydrofoil' || s.type === 'missileboat') && !E.fleetOf(st, s.id));
  const rigs = Object.values(ctx.mem.enemyRigs || {}).filter(r => st.rigs.some(x => x.x === r.x && x.y === r.y && x.owner === r.owner));
  for (const s of raiders) {
    const t = taskOf(ctx, s);
    if (t && t.kind !== 'raid' && t.kind !== 'strike') continue;
    const target = rigs.sort((a, b) => cheb(a, s) - cheb(b, s))[0] || (() => { const h = pickTarget(ctx); return h && { x: h.x, y: h.y }; })();
    if (!target) continue;
    ctx.mem.tasks[s.id] = { kind: 'raid', x: target.x, y: target.y };
    if (cheb(s, target) > 3) { const spot = spotNextTo(ctx, s, target.x, target.y, 3); if (spot) await sailSome(ctx, s, spot.x, spot.y); }
  }
}

// ---------- spying ----------
// You can't attack what you can't find: once settled, a cheap boat sails toward each rival's home waters
// until it has spotted one of their bases (then the strike force knows where to go).
export async function spy(ctx) {
  const { st, p, mem } = ctx;
  const oilIn = st.rigs.filter(r => r.owner === p).reduce((t, r) => t + E.rigRate(st, r), 0);
  if (st.round < 18 || (ctx.phase !== 'war' && oilIn < 10)) return; // only once the economy can spare it
  const rivals = st.players.map((_, i) => i).filter(i => i !== p && !st.players[i].out);
  const unknown = rivals.filter(r => !Object.values(mem.enemyBases || {}).some(b => b.owner === r));
  const ships = myShips(ctx);
  for (const s of ships) {
    const t = taskOf(ctx, s);
    if (t?.kind === 'spy' && !unknown.includes(t.owner)) delete ctx.mem.tasks[s.id]; // found them: back to normal duties
  }
  if (!unknown.length) return;
  let spyShip = ships.find(s => taskOf(ctx, s)?.kind === 'spy');
  if (!spyShip) {
    spyShip = ships.filter(s => !E.fleetOf(st, s.id) && s.type !== 'survey' && (!taskOf(ctx, s) || ['survey', 'strike'].includes(taskOf(ctx, s).kind)) && SHIPS[s.type].cost <= 200 && s.movesLeft > 0)
      .sort((a, b) => SHIPS[b.type].move - SHIPS[a.type].move)[0];
    if (!spyShip) return;
    const r = unknown.sort((a, b) => cheb(homeCentre(st, a), spyShip) - cheb(homeCentre(st, b), spyShip))[0];
    ctx.mem.tasks[spyShip.id] = { kind: 'spy', owner: r, n: 0 };
    if (spyShip.standing) await ctx.do({ type: 'setStanding', shipId: spyShip.id, standing: null });
  }
  const t = taskOf(ctx, spyShip), h = homeCentre(st, t.owner);
  // aim at the middle of their home waters, then circle through it
  const ring = [[0, 0], [8, -8], [8, 8], [-8, 8], [-8, -8]][t.n % 5];
  const goal = { x: Math.max(0, Math.min(st.W - 1, h.x + ring[0])), y: Math.max(0, Math.min(st.H - 1, h.y + ring[1])) };
  const spot = spotNextTo(ctx, spyShip, goal.x, goal.y, 3);
  if (!spot || cheb(spyShip, goal) <= 4) { t.n++; return; }
  // a spy gets a modest slice of the oil
  const saved = ctx.oilBudget;
  ctx.oilBudget = Math.min(saved ?? ctx.me.oil, Math.max(3, Math.round(ctx.me.oil * 0.25)));
  const used0 = ctx.oilBudget;
  await sailSome(ctx, spyShip, spot.x, spot.y);
  ctx.oilBudget = Math.max(0, (saved ?? ctx.me.oil) - (used0 - ctx.oilBudget));
}
