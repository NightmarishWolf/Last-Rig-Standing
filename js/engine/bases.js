// ============================================================
// RIG BASES
// Building a rig on a deposit founds a base. The base claims the water around it
// (3×3 up to 13×13) and you build platforms on that water: Wellheads to pump more
// deposits, Storage, Labs, Pumps, guns and more. Sinking a base's central rig wrecks
// the base: its platforms go offline until the owner rebuilds the centre.
//
// st.bases:     { id, owner, x, y, depId, level, capital, wrecked }
// st.platforms: { id, owner, baseId, kind, x, y, hp, buildLeft }   (Wellheads become rigs when finished)
// st.rigs:      { id, owner, x, y, hp, depId, baseId, center }
// ============================================================
import { ADMIRALTY, BASE_FOUNDING, BASE_LEVELS, PLATFORMS, QUARTERS_NEEDED_FROM } from '../data/bases.js';
import { DEEP_LAYERS, DEPOSITS, RIG } from '../data/economy.js';
import { chokeMult } from './factions.js';
import { SHIPS } from '../data/ships.js';
import { coord, dist, inBounds, isLand, shipCells } from './geometry.js';
import { pstat, shipStat } from './modifiers.js';
import { maxBaseLevel, platformUnlocked } from './research.js';
import { autoTargetOk, fail, log, ok, others, pname, shipAt, tally, tallyUnit } from './util.js';
import { fusionFinished, victoryOn } from './victory.js';
import { hiddenBlocker, revealBlocker } from './visibility.js';
import { sink } from './combat.js';
import { iceAt, payBounty, spillAt } from './world.js';

const MAX_RADIUS = 6; // 13×13

export const baseById = (st, id) => (st.bases || []).find(b => b.id === id);
export const basesOf = (st, p) => (st.bases || []).filter(b => b.owner === p);
export const platformsOf = (st, b) => (st.platforms || []).filter(o => o.baseId === b.id);
export const platformAt = (st, x, y) => (st.platforms || []).find(o => o.x === x && o.y === y);
const active = (st, o) => !o.buildLeft && !baseById(st, o.baseId)?.wrecked;
export const activePlatforms = (st, p, kind) => (st.platforms || []).filter(o => o.owner === p && (!kind || o.kind === kind) && active(st, o));

export function baseRadius(st, b) {
  const extra = b.capital ? ADMIRALTY.bonusRadius : 0;
  const cap = Math.min(MAX_RADIUS, BASE_LEVELS[b.level].radiusCap + extra);
  return Math.min(cap, 1 + pstat(st, b.owner, 'claimRadius') + extra);
}
export const claimSize = (st, b) => 2 * baseRadius(st, b) + 1;
export const baseSlots = (st, b) => BASE_LEVELS[b.level].slots + pstat(st, b.owner, 'slots') + (b.capital ? ADMIRALTY.bonusSlots : 0);
export const slotsUsed = (st, b) => platformsOf(st, b).filter(o => o.kind !== 'wellhead').length;
export const baseName = (st, b) => (b.capital ? ADMIRALTY.name : `Base ${coord(b.x, b.y)}`);
export const baseMaxHp = (st, b) => Math.round(BASE_LEVELS[b.level].hp * pstat(st, b.owner, 'platformHpMult'));
export const platformMaxHp = (st, o) => Math.max(1, Math.round(PLATFORMS[o.kind].hp * pstat(st, o.owner, 'platformHpMult')));
export const platformCost = (st, p, kind) => Math.round(PLATFORMS[kind].cost * pstat(st, p, 'platformCostMult'));
export const baseFoundCost = (st, p) =>
  Math.round(Math.min(BASE_FOUNDING.maxCost, BASE_FOUNDING.baseCost + BASE_FOUNDING.costPerBase * basesOf(st, p).filter(b => !b.wrecked).length) * pstat(st, p, 'baseCostMult'));

// Which live base claims a square (the oldest base wins where claims overlap).
export function claimAt(st, x, y) {
  for (const b of st.bases || []) if (!b.wrecked && Math.max(Math.abs(b.x - x), Math.abs(b.y - y)) <= baseRadius(st, b)) return b;
  return null;
}

// Player-wide numbers that bases add to.
export const oilCapOf = (st, p) => Math.round(pstat(st, p, 'oilCap') + activePlatforms(st, p, 'storage').length * PLATFORMS.storage.oilCap);
export const sellMultOf = (st, p) => pstat(st, p, 'sellMult') * (1 + Math.min(0.3, activePlatforms(st, p, 'refinery').length * PLATFORMS.refinery.sell));
export const platformUpkeep = (st, p) =>
  Math.round((st.platforms || []).filter(o => o.owner === p && !o.onLoan).reduce((t, o) => t + PLATFORMS[o.kind].upkeep, 0) * pstat(st, p, 'platformUpkeepMult'));
export function rigRate(st, r) {
  const d = st.deposits.find(d => d.id === r.depId);
  const b = r.baseId ? baseById(st, r.baseId) : null;
  if (!d || (b && b.wrecked) || r.blowout) return 0; // (a blowout: nothing until it's fixed or settles)
  const pumps = b ? platformsOf(st, b).filter(o => o.kind === 'pump' && !o.buildLeft).length * (PLATFORMS.pump.pump + pstat(st, r.owner, 'pumpBonus')) : 0;
  // (Kade's Choking Smoke: less from rigs inside an oil slick)
  return Math.min(d.reserves, (DEPOSITS[d.type].rate + pstat(st, r.owner, 'rigRate') + pumps) * chokeMult(st, r));
}

// Deeper drilling: a dry deposit under one of p's rigs strikes the next layer, if p has the research.
// Returns the oil found (0 if none). Each deposit remembers how many layers have been tapped.
export function drillDeeper(st, p, d) {
  if (!d || d.reserves > 0) return 0;
  const layer = d.layers || 0;
  if (layer >= Math.min(DEEP_LAYERS.length, pstat(st, p, 'deepLayers'))) return 0;
  const found = Math.max(1, Math.round((d.max || 0) * DEEP_LAYERS[layer]));
  d.layers = layer + 1; d.reserves = found;
  log(st, p, `🛢️ A dry rig at ${coord(d.x, d.y)} drilled deeper and struck oil: ${found} more in layer ${layer + 2}.`, { k: 'oil', x: d.x, y: d.y });
  return found;
}

// ---------- founding / rebuilding ----------
// Building a "rig" on a deposit: founds a new base, rebuilds a wrecked one,
// or (inside your own claim) builds a Wellhead platform.
// How far from a deposit a ship can be and still found a base there (most ships: right next to it).
export const rigReachOf = s => SHIPS[s.type].passives?.rigReach || 1;

export function rigBuildProblem(st, p, x, y) {
  const dep = st.deposits.find(d => d.x === x && d.y === y);
  if (!dep || !st.players[p].known[dep.id]) return 'Rigs go on oil deposits you have discovered.';
  // (the one exception: you can always rebuild your own wrecked Admiralty, so Conquest's short clock stays fair)
  const ownAdmiralty = (st.bases || []).some(b => b.depId === dep.id && b.wrecked && b.owner === p && b.capital);
  if (spillAt(st, x, y) && !ownAdmiralty) return `This deposit is in an oil slick: nothing can be built here until it clears (${spillAt(st, x, y).left} round${spillAt(st, x, y).left > 1 ? 's' : ''}), or a Drillship or Fleet Tender cleans it up.`;
  if (iceAt(st, x, y)) return 'This deposit is under the pack ice: an Icebreaker has to break it open first.';
  const r = st.rigs.find(r => r.x === x && r.y === y);
  if (r && r.owner === p) return 'You already have a rig here.';
  if (platformAt(st, x, y)?.owner === p) return 'A platform is already being built here.';
  const claim = claimAt(st, x, y);
  if (claim && claim.owner !== p) return `This deposit is inside ${pname(st, claim.owner)}'s base claim.`;
  if (claim && claim.owner === p) {
    if (!platformUnlocked(st, p, 'wellhead')) return 'Research Platform Construction to build Wellheads.';
    if (st.players[p].money < platformCost(st, p, 'wellhead')) return 'Not enough money.';
    if (shipAt(st, x, y, s => s.owner === p)) return 'Move your ship off the deposit first.';
    return null;
  }
  if (!st.ships.some(s => s.owner === p && dist(shipCells(s), [[x, y]]) <= rigReachOf(s))) return 'You need a ship right next to the deposit, or a ship with Rig Crews (Survey Ship, Flagship, Fleet Tender, Carrier; Prospector Skiff, Drone Mothership, Tide Queen) within 5 squares, to found a base.';
  if (st.players[p].money < baseFoundCost(st, p)) return 'Not enough money.';
  if (shipAt(st, x, y, s => s.owner === p)) return 'Move your ship off the deposit first.';
  return null;
}

export function doBuyRig(st, a) {
  const p = st.current;
  const why = rigBuildProblem(st, p, a.x, a.y);
  if (why) return fail(why);
  const claim = claimAt(st, a.x, a.y);
  if (claim && claim.owner === p) return doBuildPlatform(st, { kind: 'wellhead', x: a.x, y: a.y });
  const blk = hiddenBlocker(st, p, [[a.x, a.y]], null);
  if (blk) { revealBlocker(st, p, blk); log(st, p, blk.kind === 'ship' ? 'An unseen enemy is sitting on this deposit!' : 'This deposit is already claimed by an enemy rig!'); return ok(); }
  const dep = st.deposits.find(d => d.x === a.x && d.y === a.y);
  st.players[p].money -= baseFoundCost(st, p);
  // a wrecked base on this deposit: yours gets rebuilt, someone else's is cleared away
  const old = (st.bases || []).find(b => b.depId === dep.id && b.wrecked);
  if (old && old.owner === p) {
    old.wrecked = false;
    st.rigs.push({ id: 'r' + st.nextId++, owner: p, x: a.x, y: a.y, hp: baseMaxHp(st, old), depId: dep.id, baseId: old.id, center: true });
    log(st, p, `Rebuilt ${baseName(st, old)}. Its platforms are back online.`);
    return ok();
  }
  if (old) return captureBase(st, p, old, dep);
  foundBase(st, p, dep, false);
  tally(st, p, 'basesFounded');
  log(st, p, `Founded a rig base at ${coord(a.x, a.y)}. It claims the ${claimSize(st, st.bases[st.bases.length - 1])}×${claimSize(st, st.bases[st.bases.length - 1])} water around it.`);
  return ok();
}

export function foundBase(st, p, dep, capital) {
  const b = { id: 'b' + st.nextId++, owner: p, x: dep.x, y: dep.y, depId: dep.id, level: 1, capital, wrecked: false };
  (st.bases ||= []).push(b);
  st.rigs.push({ id: 'r' + st.nextId++, owner: p, x: dep.x, y: dep.y, hp: baseMaxHp(st, b), depId: dep.id, baseId: b.id, center: true });
  return b;
}

// Rebuilding someone else's wrecked base captures it, with all its platforms and rigs.
function captureBase(st, p, b, dep) {
  const from = b.owner, wasCapital = b.capital;
  b.owner = p; b.capital = false; b.wrecked = false;
  for (const o of platformsOf(st, b)) o.owner = p;
  for (const r of st.rigs.filter(r => r.baseId === b.id)) r.owner = p;
  st.rigs.push({ id: 'r' + st.nextId++, owner: p, x: dep.x, y: dep.y, hp: baseMaxHp(st, b), depId: dep.id, baseId: b.id, center: true });
  log(st, p, `You captured ${pname(st, from)}'s ${wasCapital ? 'Admiralty' : 'rig base'} at ${coord(b.x, b.y)}, with ${platformsOf(st, b).length} platforms!`, { k: 'win', x: b.x, y: b.y });
  log(st, from, `${pname(st, p)} captured your ${wasCapital ? 'Admiralty' : 'rig base'} at ${coord(b.x, b.y)}!`, { k: 'hit', x: b.x, y: b.y });
  return ok();
}

export function removeBase(st, b) {
  st.platforms = (st.platforms || []).filter(o => o.baseId !== b.id);
  st.rigs = st.rigs.filter(r => r.baseId !== b.id);
  st.bases = st.bases.filter(o => o !== b);
}

// The central rig was destroyed: the base is wrecked until rebuilt.
export function wreckBase(st, b, by) {
  b.wrecked = true;
  log(st, b.owner, `${baseName(st, b)} has been wrecked! Its platforms are offline until you rebuild the central rig.`, { k: 'hit', x: b.x, y: b.y });
  if (by !== undefined && by !== b.owner) tally(st, by, 'destroyed');
  if (by !== undefined && by !== b.owner) log(st, by, `You wrecked ${pname(st, b.owner)}'s rig base at ${coord(b.x, b.y)}!`, { k: 'win', x: b.x, y: b.y });
}

// ---------- platforms ----------
export function platformProblem(st, p, kind, x, y) {
  const def = PLATFORMS[kind];
  if (!def) return 'Unknown platform.';
  if (!platformUnlocked(st, p, kind)) return 'Not researched yet.';
  if (!inBounds(st, x, y) || isLand(st, x, y)) return 'Platforms go on water.';
  const b = claimAt(st, x, y);
  if (!b || b.owner !== p) return 'Platforms go inside one of your base claims.';
  if (st.players[p].money < platformCost(st, p, kind)) return 'Not enough money.';
  const dep = st.deposits.find(d => d.x === x && d.y === y);
  if (def.onDeposit) {
    if (!dep || !st.players[p].known[dep.id]) return 'Wellheads go on oil deposits you have discovered.';
  } else if (dep) return 'Keep deposits free for Wellheads.';
  if (def.needsLevel && !def.megaproject && b.level < def.needsLevel) return `Needs a level ${def.needsLevel} base.`;
  if (def.megaproject) {
    if (!victoryOn(st, 'postoil')) return 'The Post-Oil victory is switched off in this game.';
    if (b.level < def.needsLevel) return `Needs a level ${def.needsLevel} base (Hub).`;
    if ((st.platforms || []).some(o => o.owner === p && o.kind === kind)) return 'You are already building one.';
  }
  if (!def.onDeposit && slotsUsed(st, b) >= baseSlots(st, b)) return `${baseName(st, b)} has no free platform slots (upgrade the base or research more).`;
  if (platformAt(st, x, y) || st.rigs.some(r => r.x === x && r.y === y && r.owner === p)) return 'Something is already built there.';
  if ((st.ports || []).some(o => o.x === x && o.y === y)) return 'Something is already built there.';
  if (shipAt(st, x, y, s => s.owner === p)) return 'Move your ship out of the way first.';
  return null;
}

export function doBuildPlatform(st, a) {
  const p = st.current;
  const why = platformProblem(st, p, a.kind, a.x, a.y);
  if (why) return fail(why);
  const blk = hiddenBlocker(st, p, [[a.x, a.y]], null);
  if (blk) { revealBlocker(st, p, blk); log(st, p, 'An unseen enemy is in the way of your construction crew!'); return ok(); }
  const b = claimAt(st, a.x, a.y), def = PLATFORMS[a.kind];
  st.players[p].money -= platformCost(st, p, a.kind);
  const o = { id: 'f' + st.nextId++, owner: p, baseId: b.id, kind: a.kind, x: a.x, y: a.y, hp: 1, buildLeft: def.turns };
  o.hp = platformMaxHp(st, o);
  (st.platforms ||= []).push(o);
  log(st, p, `Started building a ${def.name} at ${coord(a.x, a.y)} (${def.turns} turns).`);
  if (def.megaproject) for (const o of others(st, p)) log(st, o, `⚛ ${pname(st, p)} has started a ${def.name} at ${coord(a.x, a.y)}! It finishes in ${def.turns} turns unless someone destroys it.`, { k: 'world', x: a.x, y: a.y });
  return ok();
}

export function upgradeProblem(st, p, b) {
  if (!b || b.owner !== p) return 'Not your base.';
  if (b.wrecked) return 'Rebuild the central rig first.';
  const next = BASE_LEVELS[b.level + 1];
  if (!next) return 'Already at the highest level.';
  if (maxBaseLevel(st, p) < b.level + 1) return `Research ${next.tech === 'crew_quarters' ? 'Crew Quarters' : next.tech === 'base_complex' ? 'Base Complexes' : 'Mega-Platform Hubs'} first.`;
  if (b.level + 1 >= QUARTERS_NEEDED_FROM && !platformsOf(st, b).some(o => o.kind === 'quarters' && !o.buildLeft)) return 'Build Crew Quarters in this base first.';
  if (st.players[p].money < next.cost) return 'Not enough money.';
  return null;
}
export function doUpgradeBase(st, a) {
  const p = st.current, b = baseById(st, a.baseId);
  const why = upgradeProblem(st, p, b);
  if (why) return fail(why);
  const oldMax = baseMaxHp(st, b);
  st.players[p].money -= BASE_LEVELS[b.level + 1].cost;
  b.level++;
  const center = st.rigs.find(r => r.baseId === b.id && r.center);
  if (center) center.hp += baseMaxHp(st, b) - oldMax;
  log(st, p, `${baseName(st, b)} is now a ${BASE_LEVELS[b.level].name}: claim ${claimSize(st, b)}×${claimSize(st, b)}, ${baseSlots(st, b)} platform slots.`, { k: 'done', x: b.x, y: b.y });
  return ok();
}

// ---------- start of turn ----------
// Finish construction, heal, repair, and let gun platforms fire.
export function processBases(st, p, visibleShips, ident = null) {
  for (const o of (st.platforms || []).filter(o => o.owner === p && o.buildLeft > 0)) {
    if (baseById(st, o.baseId)?.wrecked) continue;
    o.buildLeft--;
    if (o.buildLeft > 0) {
      if (PLATFORMS[o.kind].megaproject) for (const e of others(st, p)) log(st, e, `⚛ ${pname(st, p)}'s ${PLATFORMS[o.kind].name} at ${coord(o.x, o.y)}: ${o.buildLeft} turn${o.buildLeft > 1 ? 's' : ''} left!`);
      continue;
    }
    if (PLATFORMS[o.kind].megaproject) { fusionFinished(st, p, o); return; }
    if (o.kind === 'wellhead') {
      st.platforms = st.platforms.filter(x => x !== o);
      const dep = st.deposits.find(d => d.x === o.x && d.y === o.y);
      if (dep && !dep.tapped) { dep.reserves = Math.round(dep.reserves * pstat(st, p, 'reservesMult')); dep.tapped = true; }
      st.rigs.push({ id: 'r' + st.nextId++, owner: p, x: o.x, y: o.y, hp: RIG.hp, depId: dep?.id, baseId: o.baseId, center: false });
      log(st, p, `Wellhead finished at ${coord(o.x, o.y)}: it starts pumping next turn.`, { k: 'done', x: o.x, y: o.y });
    } else log(st, p, `${PLATFORMS[o.kind].name} finished at ${coord(o.x, o.y)}.`, { k: 'done', x: o.x, y: o.y });
  }
  // healing inside your claims, and dry dock repairs
  const heal = pstat(st, p, 'heal');
  const docks = activePlatforms(st, p, 'drydock');
  for (const s of st.ships.filter(s => s.owner === p)) {
    const max = shipStat(st, p, s.type, 'hp');
    if (s.hp >= max) continue;
    let h = 0;
    if (heal && shipCells(s).some(([x, y]) => claimAt(st, x, y)?.owner === p)) h += heal;
    if (docks.some(d => dist(shipCells(s), [[d.x, d.y]]) <= 1)) h += PLATFORMS.drydock.repair;
    if (h) s.hp = Math.min(max, s.hp + h);
  }
  const fix = pstat(st, p, 'platformRepair');
  if (fix) {
    for (const o of activePlatforms(st, p)) o.hp = Math.min(platformMaxHp(st, o), o.hp + fix);
    for (const r of st.rigs.filter(r => r.owner === p)) {
      const b = r.baseId && baseById(st, r.baseId);
      r.hp = Math.min(r.center && b ? baseMaxHp(st, b) : RIG.hp, r.hp + fix);
    }
  }
  // gun platforms and missile batteries fire at the nearest enemy ship they can see
  for (const o of activePlatforms(st, p).filter(o => PLATFORMS[o.kind].dmg)) {
    const def = PLATFORMS[o.kind], range = def.range + pstat(st, p, 'platformRange');
    let best = null, bd = Infinity;
    for (const s of st.ships) {
      if (s.owner === p || !visibleShips.has(s.id) || !autoTargetOk(st, p, s, ident)) continue;
      const d = dist(shipCells(s), [[o.x, o.y]]);
      if (d <= range && d < bd) { best = s; bd = d; }
    }
    if (!best) continue;
    const dmg = Math.max(0, def.dmg - shipStat(st, best.owner, best.type, 'armor'));
    best.hp -= dmg;
    best.combatRound = st.round;
    tallyUnit(st, p, 'defense:' + o.kind, 'dmg', dmg);
    log(st, p, `Your ${def.name} at ${coord(o.x, o.y)} hit an enemy ship for ${dmg}.`);
    log(st, best.owner, `Your ship was hit for ${dmg} by ${pname(st, p)}'s ${def.name} at ${coord(o.x, o.y)}!`, { k: 'hit', x: best.x, y: best.y });
    if (best.hp <= 0) { payBounty(st, p, best); tallyUnit(st, p, 'defense:' + o.kind, 'kills'); tallyUnit(st, p, 'defense:' + o.kind, 'killValue', shipStat(st, best.owner, best.type, 'cost') / (SHIPS[best.type].pack || 1)); sink(st, best); tally(st, p, 'kills'); log(st, p, `Your ${def.name} sank an enemy ship!`, { k: 'win', x: o.x, y: o.y }); }
  }
}
