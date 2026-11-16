// Bot warfare: defending bases, building a strike fleet, and sending it after the right target.
//
// Ship jobs used here (ctx.mem.tasks[shipId]):
//   { kind: 'defend', base }   sailing to (or guarding) a base under threat
//   { kind: 'strike' }         part of the strike force (gathers at the rally point, then sails as a fleet)
//   { kind: 'raid', x, y }     a raider (subs, fast boats) hunting enemy rigs with its pack
//   { kind: 'mend' }           a hurt raider heading home to heal
// ctx.mem.strikes = [{ fleetId, target: { x, y, what, id }, power0, since }]  (one per strike group)
//
// Everything a bot attacks comes from its own view or memory: enemy home waters are public
// (they're drawn on everyone's map), but the Admiralty inside them has to be found by scouting.
import * as E from '../engine/index.js';
import { SHIPS } from '../data/ships.js';
import { PLATFORMS } from '../data/bases.js';
import { canSpend, cheb, isArmed, myShips, sailSome, sharp, spotNextTo, taskOf } from './context.js';
import { STRIKES } from '../data/economy.js';
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
const warship = (ctx, s) => isArmed(s.type) && (SHIPS[s.type].cost >= 190 || ctx.phase === 'war');

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
// What a strike group should go after, most urgent first. Bots always play to win: the Admiralty
// (Conquest) once they're stronger or the war drags on, and bases (the enemy's oil and claims) otherwise.
// `taken` = targets other strike groups already have (so the groups spread out).
function pickTarget(ctx, taken = []) {
  const { st, p, view, mem } = ctx;
  const rivals = st.players.map((_, i) => i).filter(i => i !== p && !st.players[i].out);
  if (!rivals.length) return null;
  const from = frontier(ctx) || myShips(ctx)[0] || { x: 0, y: 0 };
  const free = b => !taken.includes(b.id);
  // 1) a rival's Fusion Plant: it wins them the game
  const fusion = view.enemyPlatforms.find(o => o.kind === 'fusion');
  if (fusion) return { x: fusion.x, y: fusion.y, what: 'fusion', id: fusion.id, owner: fusion.owner };
  // 2) a rival close to Domination (the streak is shown to everyone): hit their bases
  const dom = rivals.filter(i => st.players[i].domStreak > 0).sort((a, b) => st.players[b].domStreak - st.players[a].domStreak)[0];
  const knownBases = Object.entries(mem.enemyBases || {}).map(([id, b]) => ({ id, ...b })); // forgotten once seen gone (memory.js)
  const nearest = list => list.sort((a, c) => cheb(a, from) - cheb(c, from))[0];
  if (dom != null) {
    const b = nearest(knownBases.filter(x => x.owner === dom && free(x))) || nearest(knownBases.filter(x => x.owner === dom));
    if (b) return { x: b.x, y: b.y, what: 'base', id: b.id, owner: b.owner };
  }
  // 3) the Admiralty when we're the stronger navy, it's close, or the war has dragged on (Conquest wins the game);
  //    raiders and tycoons otherwise bleed the enemy's outlying bases, the others take the nearest base
  const capitals = knownBases.filter(b => b.capital);
  const c = nearest(capitals);
  const strong = navyRatio(ctx) >= 1.5;
  if (c && (strong || cheb(c, from) < 50 || st.round > 70)) return { x: c.x, y: c.y, what: 'capital', id: c.id, owner: c.owner };
  const outlying = ctx.ai.personality === 'raider' || ctx.ai.personality === 'tycoon';
  const b = nearest(knownBases.filter(x => free(x) && (!outlying || !x.capital))) || nearest(knownBases.filter(free)) || c;
  if (b) return { x: b.x, y: b.y, what: b.capital ? 'capital' : 'base', id: b.id, owner: b.owner };
  // 4) nothing found yet: search the nearest rival's home waters (they're on everyone's map), point by point
  const r = rivals.sort((a, c2) => cheb(homeCentre(st, a), from) - cheb(homeCentre(st, c2), from))[0];
  const pt = nextSearchPoint(ctx, r, from, taken);
  return pt && { ...pt, what: 'search', owner: r, id: 'search:' + pt.x + ',' + pt.y };
}
// Search points spread over a rival's home waters (every 7 squares, so ships' sight covers it all) and
// the strip of sea in front of it. Visited points are crossed off; once all are, the search starts over.
function searchPoints(st, r) {
  const h = st.players[r].home, pad = 10, pts = [];
  const box = { x0: Math.max(0, h.x0 - pad), y0: Math.max(0, h.y0 - pad), x1: Math.min(st.W - 1, h.x1 + pad), y1: Math.min(st.H - 1, h.y1 + pad) };
  for (let y = box.y0 + 3; y <= box.y1; y += 7) for (let x = box.x0 + 3; x <= box.x1; x += 7) if (!E.isLand(st, x, y)) pts.push({ x, y });
  return pts;
}
export function nextSearchPoint(ctx, r, from, taken = []) {
  const pts = searchPoints(ctx.st, r), done = (ctx.mem.searched ||= {});
  let open = pts.filter(q => !done[q.x + ',' + q.y] && !taken.includes('search:' + q.x + ',' + q.y));
  if (!open.length) { for (const q of pts) delete done[q.x + ',' + q.y]; open = pts.filter(q => !taken.includes('search:' + q.x + ',' + q.y)); }
  return open.sort((a, b) => cheb(a, from) - cheb(b, from))[0] || null;
}
// Our ships tick off the search points they've come within 4 squares of.
function markSearched(ctx) {
  const { st, p } = ctx, done = (ctx.mem.searched ||= {}), ships = myShips(ctx);
  for (const r of st.players.map((_, i) => i).filter(i => i !== p && !st.players[i].out))
    for (const q of searchPoints(st, r)) if (ships.some(s => cheb(s, q) <= 4)) done[q.x + ',' + q.y] = 1;
}
// Our fighting power against what we've seen of the enemy's lately (1 = even; Infinity = nothing seen).
function navyRatio(ctx) {
  const { st, p } = ctx;
  const ours = myShips(ctx).filter(s => isArmed(s.type)).reduce((t, s) => t + power(st, p, s.type), 0);
  const known = Object.values(ctx.mem.enemies || {}).filter(e => st.turnCount - e.turn < 12 * st.players.length);
  const theirs = known.reduce((t, e) => t + seenPower(e), 0);
  return theirs ? ours / theirs : Infinity;
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
// How strong a strike group should be before it sails. Careful personalities want more, but every bot
// gets bolder as the war drags on (from round 60 the bar drops, down to half by round 160), and a
// bot that clearly outguns what it has seen goes as soon as it has a real group.
function launchPower(ctx) {
  const ag = ctx.pers.aggression;
  const known = Object.values(ctx.mem.enemies || {}).filter(e => ctx.st.turnCount - e.turn < 10 * ctx.st.players.length);
  const enemy = known.reduce((t, e) => t + seenPower(e), 0);
  const urgency = Math.max(0.5, 1 - Math.max(0, ctx.st.round - 60) / 200);
  const base = Math.max(10 + (1 - ag) * 16, enemy * (1.6 - ag * 0.5)) * urgency;
  return navyRatio(ctx) >= 2 ? Math.min(base, 14) : base;
}

// Strike groups: fleets sent after a target. Several can be out at once once the navy is big enough
// (each picks a different target), so a big navy doesn't sit at home while one fleet does all the work.
// ctx.mem.strikes = [{ fleetId, target: { x, y, what, id }, power0, since }]
export async function strike(ctx) {
  const { st, p, mem } = ctx;
  const ships = myShips(ctx);
  const rally = frontier(ctx);
  if (!rally) return;
  if (mem.strike) { mem.strikes = [mem.strike]; delete mem.strike; } // (older saves)
  markSearched(ctx);
  mem.strikes = (mem.strikes || []).filter(g => E.fleetById(st, g.fleetId));
  // new warships join the strike force (some stay home as guards, see defense.js)
  for (const s of ships) if (warship(ctx, s) && !taskOf(ctx, s) && !s.standing) ctx.mem.tasks[s.id] = { kind: 'strike' };
  const force = ships.filter(s => taskOf(ctx, s)?.kind === 'strike' && !E.fleetOf(st, s.id));

  // ---- gathering the next group at the rally point ----
  const lp = launchPower(ctx);
  const maxGroups = Math.min(3, 1 + Math.floor(ships.filter(s => isArmed(s.type)).length / 8));
  for (const s of force) {
    if (cheb(s, rally) > 4) { const spot = spotNextTo(ctx, s, rally.x, rally.y, 3); if (spot) await sailSome(ctx, s, spot.x, spot.y); }
  }
  const gathered = force.filter(s => cheb(s, rally) <= 6 && st.ships.includes(s));
  const ready = gathered.reduce((t, s) => t + power(st, p, s.type), 0);
  const total = force.reduce((t, s) => t + power(st, p, s.type), 0);
  if (mem.strikes.length < maxGroups && gathered.length >= 2 && ready >= lp && (sharp(ctx) || total > lp * 1.3)) {
    const oilIn = st.rigs.filter(r => r.owner === p).reduce((t, r) => t + E.rigRate(st, r), 0);
    const size = Math.max(2, Math.min(12, Math.floor(oilIn / 2) + 2)); // a fleet the oil can actually move
    // the strongest ship leads; a fleet can only take ships within 8 squares of its flagship
    const lead = [...gathered].sort((a, b) => power(st, p, b.type) - power(st, p, a.type))[0];
    const pick = gathered.filter(s => s === lead || cheb(s, lead) <= 8)
      .sort((a, b) => (b === lead) - (a === lead) || power(st, p, b.type) - power(st, p, a.type)).slice(0, size);
    const r = pick.length >= 2 ? await ctx.do({ type: 'formFleet', shipIds: pick.map(s => s.id) }) : { ok: false };
    if (r.ok) {
      const f = E.fleetOf(st, pick[0].id);
      const taken = mem.strikes.map(g => g.target?.id).filter(Boolean);
      mem.strikes.push({ fleetId: f.id, target: pickTarget(ctx, taken), power0: ready, since: st.round });
    }
  }
  // ---- every group at sea ----
  for (const g of [...mem.strikes]) await runGroup(ctx, g);
}

async function runGroup(ctx, g) {
  const { st, p, mem } = ctx;
  const f = E.fleetById(st, g.fleetId);
  if (!f) { mem.strikes = mem.strikes.filter(x => x !== g); return; }
  const fleetShips = E.fleetShips(st, f);
  const now = fleetShips.reduce((t, s) => t + power(st, p, s.type), 0);
  // badly beaten: come home and rebuild (unless the enemy is down to almost nothing: then press on)
  if (now < g.power0 * 0.4 && navyRatio(ctx) < 3) {
    await ctx.do({ type: 'disbandFleet', fleetId: f.id });
    mem.strikes = mem.strikes.filter(x => x !== g);
    for (const s of fleetShips) ctx.mem.tasks[s.id] = { kind: 'strike' }; // they'll regroup at the rally point
    return;
  }
  // re-pick the target if it's gone, or something more urgent appeared (a Fusion Plant, the Admiralty)
  const taken = mem.strikes.filter(x => x !== g).map(x => x.target?.id).filter(Boolean);
  const urgent = pickTarget(ctx, taken);
  const t = g.target;
  const gone = !t || (t.what === 'fusion' ? !ctx.view.enemyPlatforms.some(o => o.id === t.id)
    : t.id && !ctx.mem.enemyBases?.[t.id]);
  const searched = t?.what === 'search' && (mem.searched?.[t.x + ',' + t.y] || cheb(E.flagship(st, f), t) <= 4);
  if (gone || searched || (urgent && urgent.what === 'fusion' && t.what !== 'fusion') || (urgent?.what === 'capital' && t.what !== 'capital' && t.what !== 'fusion')) g.target = urgent;
  const tg = g.target;
  if (!tg) return;
  // sail toward the target, but only as far as this turn's oil allows (then stop, so the fleet
  // doesn't keep burning oil at the end of the turn)
  const L = E.flagship(st, f);
  const dest = spotNextTo(ctx, L, tg.x, tg.y, 2) || spotNextTo(ctx, L, tg.x, tg.y, 5);
  if (!dest) { if (tg.what === 'search') (mem.searched ||= {})[tg.x + ',' + tg.y] = 1; g.target = null; return; } // nowhere to stop there (land): pick again
  if (cheb(L, dest) > 1) {
    const speed = E.fleetSpeed(st, f);
    const cost = fleetShips.reduce((t2, s) => t2 + E.moveCost(st, s, speed), 0);
    if ((ctx.oilBudget ?? ctx.me.oil) >= Math.min(cost, ctx.me.oil) && ctx.me.oil >= cost * 0.5) {
      const before = ctx.me.oil;
      const r = await ctx.do({ type: 'setFleetOrder', fleetId: f.id, points: [{ x: dest.x, y: dest.y }] });
      if (st.fleets.includes(f) && f.order) await ctx.do({ type: 'cancelFleetOrder', fleetId: f.id });
      ctx.oilBudget = Math.max(0, (ctx.oilBudget ?? before) - (before - ctx.me.oil));
      if (!r.ok) { if (tg.what === 'search') (mem.searched ||= {})[tg.x + ',' + tg.y] = 1; g.target = null; } // can't get there: pick something else next turn
    }
  }
}

// ---------- raiders ----------
// Subs and fast boats (Raider personality) hunt enemy rigs on their own, and slip away from warships.
export async function raid(ctx) {
  const { st, p } = ctx;
  if (ctx.ai.personality !== 'raider') return;
  const isRaider = s => SHIPS[s.type].passives?.submerged || ['hydrofoil', 'missileboat', 'corvette'].includes(s.type);
  const raiders = myShips(ctx).filter(s => isRaider(s) && !E.fleetOf(st, s.id) && (!taskOf(ctx, s) || ['raid', 'strike', 'mend'].includes(taskOf(ctx, s).kind)));
  const maxHp = s => E.shipStat(st, p, s.type, 'hp');
  const bases = E.basesOf(st, p).filter(b => !b.wrecked);
  // 1) hurt raiders slip home to heal (inside our claims, next to a Dry Dock if we have one) and rejoin later
  const docks = (st.platforms || []).filter(o => o.owner === p && o.kind === 'drydock' && !o.buildLeft);
  const pack = [];
  for (const s of raiders) {
    const t = taskOf(ctx, s);
    if (t?.kind === 'mend' && s.hp >= maxHp(s)) delete ctx.mem.tasks[s.id];
    const canHeal = docks.length || E.pstat(st, p, 'heal') > 0; // (nothing heals without a Dry Dock or the research)
    if (canHeal && (s.hp <= maxHp(s) / 2 || taskOf(ctx, s)?.kind === 'mend')) {
      ctx.mem.tasks[s.id] = { kind: 'mend' };
      const haven = (docks.length ? docks : bases).sort((a, b) => cheb(a, s) - cheb(b, s))[0];
      if (haven && cheb(haven, s) > 2) { const spot = spotNextTo(ctx, s, haven.x, haven.y, 1); if (spot) await sailSome(ctx, s, spot.x, spot.y); }
      continue;
    }
    pack.push(s);
  }
  // 2) raiders hunt in packs: too few, and they stay home as defenders until the pack is big enough
  const need = sharp(ctx) ? 3 : 2;
  if (pack.length < need) { for (const s of pack) if (taskOf(ctx, s)?.kind === 'raid') delete ctx.mem.tasks[s.id]; return; }
  // 3) the target: an enemy rig we know about, preferring lightly defended ones near the pack
  const cx = pack.reduce((t, s) => t + s.x, 0) / pack.length, cy = pack.reduce((t, s) => t + s.y, 0) / pack.length;
  const rigs = Object.values(ctx.mem.enemyRigs || {}).filter(r => st.rigs.some(x => x.x === r.x && x.y === r.y && x.owner === r.owner));
  const guarded = r => enemiesNear(ctx, r.x, r.y, 5).length;
  const target = rigs.filter(r => guarded(r) * 2 < pack.length)
    .sort((a, b) => guarded(a) * 15 + cheb(a, { x: cx, y: cy }) - guarded(b) * 15 - cheb(b, { x: cx, y: cy }))[0]
    || (() => { const h = pickTarget(ctx); return h && { x: h.x, y: h.y }; })();
  if (!target) return;
  // 4) move as a pack: the ship closest to the target leads, stragglers catch up before it goes in
  const lead = [...pack].sort((a, b) => cheb(a, target) - cheb(b, target))[0];
  const spread = Math.max(...pack.map(s => cheb(s, lead)));
  for (const s of pack) {
    ctx.mem.tasks[s.id] = { kind: 'raid', x: target.x, y: target.y };
    const goal = s === lead && spread > 6 ? null : s === lead ? target : spread > 6 ? lead : target;
    if (!goal || cheb(s, goal) <= 3) continue;
    const spot = spotNextTo(ctx, s, goal.x, goal.y, 3);
    if (spot) await sailSome(ctx, s, spot.x, spot.y);
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
    spyShip = ships.filter(s => !E.fleetOf(st, s.id) && s.type !== 'survey' && (!taskOf(ctx, s) || ['survey', 'strike'].includes(taskOf(ctx, s).kind)) && SHIPS[s.type].cost <= 250 && s.movesLeft > 0)
      .sort((a, b) => SHIPS[b.type].move - SHIPS[a.type].move)[0];
    if (!spyShip) return;
    const r = unknown.sort((a, b) => cheb(homeCentre(st, a), spyShip) - cheb(homeCentre(st, b), spyShip))[0];
    ctx.mem.tasks[spyShip.id] = { kind: 'spy', owner: r, n: 0 };
    if (spyShip.standing) await ctx.do({ type: 'setStanding', shipId: spyShip.id, standing: null });
  }
  const t = taskOf(ctx, spyShip);
  // work through their home waters point by point (shared with the strike groups' search)
  markSearched(ctx);
  const goal = nextSearchPoint(ctx, t.owner, spyShip);
  if (!goal) return;
  const spot = spotNextTo(ctx, spyShip, goal.x, goal.y, 3);
  if (!spot) { (ctx.mem.searched ||= {})[goal.x + ',' + goal.y] = 1; return; }
  // a spy gets a modest slice of the oil
  const saved = ctx.oilBudget;
  ctx.oilBudget = Math.min(saved ?? ctx.me.oil, Math.max(3, Math.round(ctx.me.oil * 0.25)));
  const used0 = ctx.oilBudget;
  const res = await sailSome(ctx, spyShip, spot.x, spot.y);
  if (res === 'noroute' || res === 'stuck') (ctx.mem.searched ||= {})[goal.x + ',' + goal.y] = 1; // can't get there: try the next point
  ctx.oilBudget = Math.max(0, (saved ?? ctx.me.oil) - (used0 - ctx.oilBudget));
}

// ---------- long range ----------
// Recon drones and satellite passes find targets; cruise missiles and bombers hit them.
// (Sub-launched missiles are fired by openFire like any other weapon.)
export async function longRange(ctx) {
  const { st, p, mem } = ctx;
  const ready = () => (st.platforms || []).filter(o => o.owner === p && !o.buildLeft && !(o.cd > 0) && (PLATFORMS[o.kind].strike || PLATFORMS[o.kind].recon) && !E.basesOf(st, p).find(b => b.id === o.baseId)?.wrecked);
  const remembered = [...Object.values(mem.enemyBases || {}), ...Object.values(mem.enemyRigs || {})];
  // 1) ships with long-range missiles: spot a remembered enemy structure in their range (satellite or drone)
  //    so the 'fire' step can hit it, or sail free missile ships to a stand-off spot near one
  const shooters = myShips(ctx).filter(s => SHIPS[s.type].actions.some(a => a.longRange && !E.canUseAction(st, s, a)));
  const prio = b => (b.capital ? 0 : b.center ? 1 : 2);
  for (const s of shooters) {
    const act = SHIPS[s.type].actions.find(a => a.longRange), range = E.actionRange(st, s, act), cells = E.shipCells(s);
    if (!canSpend(ctx, (act.money || 0) + 40, 2)) break;
    const inRange = remembered.filter(b => E.dist(cells, [[b.x, b.y]]) <= range).sort((a, b) => prio(a) - prio(b));
    const t = inRange[0];
    if (t && !E.seesSquare(st, p, t.x, t.y)) {
      if (E.satelliteReady(st, p) && canSpend(ctx, STRIKES.satellite.money, 2)) await ctx.do({ type: 'satellite', x: t.x, y: t.y });
      else {
        const drone = ready().find(o => PLATFORMS[o.kind].recon && cheb(o, t) <= PLATFORMS[o.kind].recon.range);
        if (drone) await ctx.do({ type: 'baseStrike', platformId: drone.id, x: t.x, y: t.y });
      }
    }
    if (!t && !taskOf(ctx, s) && !E.fleetOf(st, s.id) && ctx.phase === 'war') {
      // stand off just inside missile range of the nearest known enemy structure (out of most base guns)
      const near = remembered.filter(b => cheb(b, s) <= range + 15).sort((a, b) => cheb(a, s) - cheb(b, s))[0];
      if (near) { const spot = spotNextTo(ctx, s, near.x, near.y, range - 2); if (spot) await sailSome(ctx, s, spot.x, spot.y); }
    }
  }
  // 2) a satellite pass over a rival we haven't found yet, or their Admiralty
  if (E.satelliteReady(st, p) && canSpend(ctx, STRIKES.satellite.money, 3)) {
    const rivals = st.players.map((_, i) => i).filter(i => i !== p && !st.players[i].out);
    const lost = rivals.find(r => !remembered.some(b => b.owner === r));
    const cap = Object.values(mem.enemyBases || {}).find(b => b.capital);
    const t = lost != null ? homeCentre(st, lost) : cap;
    if (t) await ctx.do({ type: 'satellite', x: t.x, y: t.y });
  }
  // 3) recon drones over the nearest remembered enemy base or rig in range
  for (const o of ready().filter(o => PLATFORMS[o.kind].recon)) {
    if (!canSpend(ctx, PLATFORMS[o.kind].recon.money, 3)) break;
    const r = PLATFORMS[o.kind].recon.range;
    const t = remembered.filter(b => cheb(b, o) <= r).sort((a, b) => cheb(a, o) - cheb(b, o))[0];
    if (t) await ctx.do({ type: 'baseStrike', platformId: o.id, x: t.x, y: t.y });
  }
  // 4) base strikes on whatever we can see, most valuable first
  for (const o of ready().filter(o => PLATFORMS[o.kind].strike)) {
    const s = PLATFORMS[o.kind].strike, v = ctx.view;
    if (ctx.me.oil - s.oil < 4 || ctx.me.money - (s.money || 0) < E.upkeepTotal(st, p) * 2) continue;
    const targets = [
      ...v.enemyPlatforms.filter(x => x.kind === 'fusion').map(x => [x.x, x.y, 0]),
      ...v.enemyRigs.filter(x => x.center && v.enemyBases.some(b => b.id === x.baseId && b.capital)).map(x => [x.x, x.y, 1]),
      ...v.enemyPlatforms.filter(x => ['aa', 'cruise', 'airbase', 'missile', 'gun'].includes(x.kind)).map(x => [x.x, x.y, 2]),
      ...v.enemyShips.map(e => [e.cells[0][0], e.cells[0][1], 3]),
      ...v.enemyRigs.filter(x => x.center).map(x => [x.x, x.y, 4]),
      ...v.enemyPlatforms.map(x => [x.x, x.y, 5]),
      ...v.enemyRigs.map(x => [x.x, x.y, 6]),
    ].filter(([x, y]) => !E.strikeProblem(st, p, o, x, y)).sort((a, b) => a[2] - b[2]);
    if (targets.length) await ctx.do({ type: 'baseStrike', platformId: o.id, x: targets[0][0], y: targets[0][1] });
  }
}
