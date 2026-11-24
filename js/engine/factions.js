// Faction mechanics: the Navy's Logistics (supply), and the Free Tide's raft network, packs,
// plunder and boarding. Numbers live in data/factions.js.
import { BOARDING, PLUNDER, SUPPLY, TIDE, factionOf } from '../data/factions.js';
import { SHIPS, packOf } from '../data/ships.js';
import { baseName, baseMaxHp, baseRadius, oilCapOf, platformsOf } from './bases.js';
import { PLATFORMS } from '../data/bases.js';
import { coord, dist, inRect, shipCells } from './geometry.js';
import { pstat, shipStat } from './modifiers.js';
import { forwardPorts } from './stats.js';
import { tidyFleets } from './fleets.js';
import { sink as sinkShip } from './combat.js';
import { fail, log, pname, passives, r2, shipAt, tally, tallyUnit } from './util.js';

const isNavy = (st, p) => p >= 0 && factionOf(st, p) === 'navy';
export const isTide = (st, p) => p >= 0 && factionOf(st, p) === 'tide';
const cheb = (x, y, b) => Math.max(Math.abs(x - b.x), Math.abs(y - b.y));

// One boat's share of a ship's price (a Skiff Pack's price buys two boats).
export const hullCost = (st, p, type) => shipStat(st, p, type, 'cost') / packOf(type);
// Boats one order launches (Bigger Packs research adds one).
export const packSize = (st, p, type) => (packOf(type) > 1 ? packOf(type) + Math.round(pstat(st, p, 'packBonus')) : 1);

// ============================================================
// NAVY: LOGISTICS
// ============================================================
// Is this ship in supply? Home waters, near one of your bases or ports, or near a Supply Ship.
export function inSupply(st, s) {
  const p = s.owner, pl = st.players[p];
  if (!pl) return true;
  const cells = shipCells(s);
  if (cells.some(([x, y]) => inRect(pl.home, x, y))) return true;
  for (const b of st.bases || []) if (b.owner === p && !b.wrecked) {
    const r = baseRadius(st, b) + SUPPLY.baseExtra;
    if (cells.some(([x, y]) => cheb(x, y, b) <= r)) return true;
  }
  for (const o of forwardPorts(st, p)) if (dist(cells, [[o.x, o.y]]) <= SUPPLY.port) return true;
  return st.ships.some(o => o.owner === p && o.id !== s.id && passives(o).supply && dist(shipCells(o), cells) <= passives(o).supply);
}
export const lowOnSupplies = s => (s.away || 0) >= SUPPLY.lowAfter;
// out of combat: no shots fired or taken this round or last
const quiet = (st, s) => (s.combatRound ?? -99) < st.round - 1;

// Start of a Navy turn: ships in supply repair (out of combat) and stock up; the rest count rounds away.
export function processSupply(st, p) {
  if (!isNavy(st, p)) return;
  let low = 0;
  for (const s of st.ships.filter(s => s.owner === p)) {
    if (inSupply(st, s)) {
      s.away = 0;
      const max = shipStat(st, p, s.type, 'hp');
      // (Hale's Fleet Yards: capital ships repair more)
      const heal = SUPPLY.heal + (SHIPS[s.type].cls === 'capital' ? pstat(st, p, 'capHeal') : 0);
      if (s.hp < max && quiet(st, s)) s.hp = Math.min(max, s.hp + heal);
    } else {
      s.away = (s.away || 0) + 1;
      if (s.away === SUPPLY.lowAfter) low++;
    }
  }
  if (low) log(st, p, `${low} ship${low > 1 ? 's are' : ' is'} low on supplies (−${SUPPLY.lowDmg} damage) after ${SUPPLY.lowAfter} rounds away from your bases, ports and Supply Ships.`, { k: 'fleet' });
}

// ============================================================
// FREE TIDE: THE TIDE
// ============================================================
// A base's Tide radius: it starts small and grows while the base stands (a wrecked base loses it).
// (Ruiz's Tidal Surge pushes every source further for a few rounds.)
const surge = (st, p) => (st.players[p]?.surge && st.round < st.players[p].surge.until ? st.players[p].surge.extra : 0);
export function baseTide(st, b) {
  if (b.wrecked || !isTide(st, b.owner)) return 0;
  const p = b.owner, plus = pstat(st, p, 'tideRadius') + surge(st, p);
  return Math.min(TIDE.max + plus + pstat(st, p, 'tideMax'), TIDE.start + plus + Math.floor((b.tideAge || 0) / TIDE.growEvery));
}
// Every source of p's Tide: { x, y, r, id } (bases, and ships like the Leviathan).
export function tideSources(st, p) {
  if (!isTide(st, p)) return [];
  const out = [];
  for (const b of st.bases || []) if (b.owner === p) { const r = baseTide(st, b); if (r > 0) out.push({ x: b.x, y: b.y, r, id: b.id }); }
  for (const s of st.ships) if (s.owner === p && passives(s).tideSource) {
    const cells = shipCells(s), [x, y] = cells[Math.floor(cells.length / 2)];
    out.push({ x, y, r: passives(s).tideSource + pstat(st, p, 'tideShip') + surge(st, p), id: s.id });
  }
  return out;
}
// (a round blob, not a square: dx² + dy² ≤ r² + r)
export const inTideOf = (src, x, y) => src.some(o => { const dx = x - o.x, dy = y - o.y; return dx * dx + dy * dy <= o.r * o.r + o.r; });
export const onTide = (st, p, x, y) => inTideOf(tideSources(st, p), x, y);
export function shipOnTide(st, s, src) {
  if (!isTide(st, s.owner)) return false;
  src ||= tideSources(st, s.owner);
  return src.length > 0 && shipCells(s).some(([x, y]) => inTideOf(src, x, y));
}
// Oil multiplier for a move starting where the ship is now (1 = full price).
// (Nyx's Smuggling Runs make moves off the Tide cheaper too)
export const tideOilMult = (st, s) => shipOnTide(st, s) ? TIDE.oilMult * pstat(st, s.owner, 'tideOilMult') : pstat(st, s.owner, 'offTideOil');
// Extra moves for a ship starting its turn on the Tide.
export const tideMoves = (st, s, src) => shipOnTide(st, s, src) ? TIDE.move + pstat(st, s.owner, 'tideMove') : 0;

// Start of a Tide turn: the Tide grows, and ships on it heal.
export function processTide(st, p) {
  if (!isTide(st, p)) return;
  for (const b of st.bases || []) if (b.owner === p) b.tideAge = b.wrecked ? 0 : (b.tideAge || 0) + 1;
  const src = tideSources(st, p), heal = TIDE.heal + pstat(st, p, 'tideHeal');
  for (const s of st.ships.filter(s => s.owner === p)) {
    const max = shipStat(st, p, s.type, 'hp');
    if (s.hp < max && shipOnTide(st, s, src)) s.hp = Math.min(max, s.hp + heal);
  }
}

// Raft Docks: every Tide base whose Tide is big enough launches boats anywhere on its Tide.
// (Ruiz: Brood Rafts are moving Raft Docks too, and Busy Docks build 2 at once)
export function raftDocks(st, p) {
  if (!isTide(st, p)) return [];
  const slots = 1 + Math.round(pstat(st, p, 'raftSlots'));
  const docks = (st.bases || []).filter(b => b.owner === p && !b.noDock && baseTide(st, b) >= TIDE.yardFrom) // (noDock: a mission's raft-town that builds nothing)
    .map(b => ({ id: 'tide:' + b.id, kind: 'tide', name: `Raft Dock ${coord(b.x, b.y)}`, x: b.x, y: b.y, r: baseTide(st, b), baseId: b.id, slots }));
  for (const s of st.ships) if (s.owner === p && passives(s).raftDock) {
    const src = tideSources(st, p).find(o => o.id === s.id);
    if (src) docks.push({ id: 'tide:' + s.id, kind: 'tide', name: `${SHIPS[s.type].name} ${coord(s.x, s.y)}`, x: src.x, y: src.y, r: src.r, shipId: s.id, slots });
  }
  return docks;
}

// ============================================================
// DAMAGE: the Tide Queen's swarm bonus, and Navy ships low on supplies
// ============================================================
export function dmgBonus(st, ship) {
  let d = 0;
  if (isNavy(st, ship.owner) && lowOnSupplies(ship)) d -= SUPPLY.lowDmg;
  if (isTide(st, ship.owner) && ['light', 'escort'].includes(SHIPS[ship.type]?.cls)) {
    const cells = shipCells(ship);
    if (st.ships.some(o => o.owner === ship.owner && o.id !== ship.id && passives(o).swarmAura && dist(shipCells(o), cells) <= passives(o).swarmAura)) d += 1;
  }
  return d;
}

// ============================================================
// PLUNDER: a ship sinking near a Tide ship (not its own side's) leaves plunder for it.
// Returns the money taken (the wreck is worth that much less).
// ============================================================
export function plunder(st, ship) {
  const cells = shipCells(ship);
  let best = null, bd = Infinity;
  for (const o of st.ships) {
    if (o === ship || o.owner === ship.owner || !isTide(st, o.owner)) continue;
    const d = dist(shipCells(o), cells);
    if (d <= PLUNDER.range + pstat(st, o.owner, 'plunderRange') && d < bd) { best = o; bd = d; }
  }
  if (!best) return 0;
  const p = best.owner, pl = st.players[p];
  const gain = Math.round(hullCost(st, ship.owner, ship.type) * PLUNDER.share * pstat(st, p, 'plunderMult'));
  pl.money = r2(pl.money + gain);
  let oil = 0;
  // (tankers carry oil; with Nyx's Fence every ship gives a little)
  const oilIn = SHIPS[ship.type].role === 'tanker' ? PLUNDER.oil : pstat(st, p, 'plunderOilAll') ? Math.ceil(PLUNDER.oil / 3) : 0;
  if (oilIn) { oil = Math.min(oilIn, Math.max(0, oilCapOf(st, p) - pl.oil)); pl.oil = r2(pl.oil + oil); }
  tally(st, p, 'plunder', gain);
  log(st, p, `☠️ Plunder! Your ${SHIPS[best.type].name} picked over a sinking ${SHIPS[ship.type].unit || SHIPS[ship.type].name}: +$${gain}${oil ? ` and ${oil} oil` : ''}.`, { k: 'win', x: ship.x, y: ship.y });
  return gain;
}

// Nyx's Picked Clean: a destroyed enemy rig or platform near one of her ships leaves plunder too.
export function plunderStruct(st, x, y, victim, value) {
  let best = null, bd = Infinity;
  for (const o of st.ships) {
    if (o.owner === victim || !isTide(st, o.owner) || !pstat(st, o.owner, 'plunderStructs')) continue;
    const d = dist(shipCells(o), [[x, y]]);
    if (d <= PLUNDER.range + pstat(st, o.owner, 'plunderRange') && d < bd) { best = o; bd = d; }
  }
  if (!best) return 0;
  const p = best.owner, gain = Math.round(value * PLUNDER.share * pstat(st, p, 'plunderMult'));
  st.players[p].money = r2(st.players[p].money + gain);
  tally(st, p, 'plunder', gain);
  log(st, p, `☠️ Plunder! Your ${SHIPS[best.type].name} picked over the wreckage at ${coord(x, y)}: +$${gain}.`, { k: 'win', x, y });
  return gain;
}

// Nyx's Ghost Boat: siphon oil from an adjacent enemy rig (out of its owner's storage).
export function doSiphon(st, ship, act, x, y, spend) {
  const p = ship.owner;
  const rig = st.rigs.find(r => r.x === x && r.y === y && r.owner !== p && r.owner >= 0);
  if (!rig) return fail('Pick an enemy rig next to the Ghost Boat.');
  const victim = st.players[rig.owner];
  const want = Math.round(act.steal * pstat(st, p, 'siphonMult'));
  const got = Math.min(want, Math.max(0, victim.oil), Math.max(0, oilCapOf(st, p) - st.players[p].oil));
  if (got <= 0) return fail(victim.oil <= 0 ? 'Their tanks are empty.' : 'Your storage is full.');
  spend();
  victim.oil = r2(victim.oil - got);
  st.players[p].oil = r2(st.players[p].oil + got);
  tally(st, p, 'siphoned', got);
  log(st, p, `🦜 Your Ghost Boat siphoned ${got} oil from ${pname(st, rig.owner)}'s rig at ${coord(x, y)}.`, { k: 'win', x, y });
  log(st, rig.owner, `Oil is going missing from your rig at ${coord(x, y)}: ${got} oil siphoned off by someone you can't see.`, { k: 'hit', x, y });
  return null;
}

// ============================================================
// BOARDING (Free Tide): capture a burning enemy ship next to the Boarding Skiff
// ============================================================
// Burning: at a third of full HP or less (Grappling Hooks: half). Everyone can see a ship burning.
export function burning(st, s, by) {
  const max = shipStat(st, s.owner, s.type, 'hp');
  const share = BOARDING.share + (by >= 0 ? pstat(st, by, 'boardShare') : 0);
  return s.hp <= Math.max(1, Math.floor(max * share + 1e-9));
}

export function doBoard(st, ship, act, x, y, spend) {
  const p = ship.owner;
  const t = shipAt(st, x, y, s => s.owner !== p);
  if (!t) return fail('Pick an enemy ship next to the Boarding Skiff.');
  if (passives(t).submerged) return fail("You can't board a submerged submarine.");
  spend();
  const name = SHIPS[t.type].unit || SHIPS[t.type].name;
  if (!burning(st, t, p)) {
    // repelled: the boarders are beaten back and the skiff takes a hit
    ship.hp -= 1; ship.combatRound = st.round;
    log(st, p, `Boarders repelled by the ${name}'s crew: it isn't badly damaged enough yet.`, { k: 'hit', x: t.x, y: t.y });
    log(st, t.owner, `Your ${name} fought off a boarding party from ${pname(st, p)}!`, { k: 'hit', x: t.x, y: t.y });
    if (ship.hp <= 0) st.ships = st.ships.filter(s => s !== ship);
    return null;
  }
  const from = t.owner;
  t.owner = p; t.order = null; t.standing = null; t.acted = true; t.movesLeft = 0; t.away = 0;
  t.combatRound = st.round; t.cooldowns = {}; t.freeUsed = {};
  st.ships = st.ships.filter(s => s !== ship); // the boarding crew stays aboard their prize
  tidyFleets(st);
  tally(st, p, 'captures');
  tallyUnit(st, p, ship.type, 'kills'); tallyUnit(st, p, ship.type, 'killValue', hullCost(st, from, t.type));
  tally(st, from, 'shipsLost'); tallyUnit(st, from, t.type, 'lost');
  log(st, p, `🏴 Boarded and captured a ${name} from ${pname(st, from)}! It's yours now.`, { k: 'win', x: t.x, y: t.y });
  log(st, from, `Your ${name} was boarded and captured by ${pname(st, p)}!`, { k: 'hit', x: t.x, y: t.y });
  return null;
}

// ============================================================
// AMPHIBIOUS ASSAULT (Navy): marines capture an enemy base
// ============================================================
// act.small (Ortiz's Landing Craft): only bases with no working platforms, but at any HP.
// Ortiz's perks: land sooner (assaultHp), past a defender (assaultDefenders), and (mastery) take Admiralties.
export function assaultProblem(st, ship, b, act = {}) {
  const p = ship.owner;
  if (!b || b.owner === p || b.owner < 0) return `Pick an enemy rig base (its central rig) within ${act.range || 2} squares.`;
  const admin = b.capital && pstat(st, p, 'adminCapture') > 0;
  if (b.capital && (!admin || act.small)) return "An Admiralty can't be taken by marines: sink it instead.";
  if (b.wrecked) return 'That base is already wrecked: rebuild its central rig to take it.';
  const rig = st.rigs.find(r => r.baseId === b.id && r.center), max = baseMaxHp(st, b);
  if (act.small) {
    if (platformsOf(st, b).some(o => !o.buildLeft)) return 'Landing Craft can only take bases with no working platforms.';
  } else {
    const share = admin ? 0.25 : Math.min(0.9, 0.5 + pstat(st, p, 'assaultHp'));
    if (rig && rig.hp > max * share) return `Its central rig must be down to ${Math.round(share * 100)}% HP or less first (${rig.hp}/${max}).`;
  }
  const defenders = st.ships.filter(s => s.owner === b.owner && dist(shipCells(s), [[b.x, b.y]]) <= 2).length;
  if (defenders > pstat(st, p, 'assaultDefenders')) return 'Defending ships within 2 squares of the base hold off the marines.';
  return null;
}
export function doAssault(st, ship, act, x, y, spend) {
  const p = ship.owner;
  const rig = st.rigs.find(r => r.x === x && r.y === y && r.center);
  const b = rig ? (st.bases || []).find(o => o.id === rig.baseId) : (st.bases || []).find(o => o.x === x && o.y === y);
  const why = assaultProblem(st, ship, b, act);
  if (why) return fail(why);
  spend();
  captureBase(st, p, b);
  return null;
}

// Marines take a base: it changes hands with its platforms and rigs (Ortiz's perks: repaired, bounty).
export function captureBase(st, p, b) {
  const from = b.owner;
  b.owner = p;
  for (const o of platformsOf(st, b)) o.owner = p;
  for (const r of st.rigs.filter(r => r.baseId === b.id)) r.owner = p;
  if (pstat(st, p, 'captureRepair')) { const c = st.rigs.find(r => r.baseId === b.id && r.center); if (c) c.hp = baseMaxHp(st, b); }
  const bounty = Math.round(platformsOf(st, b).reduce((t, o) => t + (PLATFORMS[o.kind]?.cost || 0), 0) * pstat(st, p, 'captureBounty'));
  if (bounty) { st.players[p].money = r2(st.players[p].money + bounty); log(st, p, `Spoils of war: +$${bounty} from the captured base.`, { k: 'win' }); }
  tally(st, p, 'captures');
  log(st, p, `⚓ Marines captured ${pname(st, from)}'s ${baseName(st, b)} at ${coord(b.x, b.y)}, with ${platformsOf(st, b).length} platforms!`, { k: 'win', x: b.x, y: b.y });
  log(st, from, `${pname(st, p)}'s marines captured your base at ${coord(b.x, b.y)}!`, { k: 'hit', x: b.x, y: b.y });
}

// ============================================================
// BURNING SLICKS (Kade the Burner): fire slicks from an Incendiary Junk hurt other players' ships that
// start their turn in them; with Slicks Burn, every oil slick hurts the enemies of the player who has it.
// ============================================================
export function burnSlicks(st, p) {
  if (!st.spills?.length) return;
  const burners = st.players.map((pl, o) => o).filter(o => o !== p && !st.players[o].out && pstat(st, o, 'slickBurn') > 0);
  let hurt = 0;
  for (const s of st.ships.filter(s => s.owner === p)) {
    const cells = shipCells(s);
    const sp = st.spills.find(o => cells.some(([x, y]) => Math.max(Math.abs(x - o.x), Math.abs(y - o.y)) <= o.r) && (o.fire ? o.by !== p : burners.length));
    if (!sp) continue;
    s.hp -= 1; s.combatRound = st.round; hurt++;
    if (s.hp <= 0) { log(st, p, `Your ${SHIPS[s.type].unit || SHIPS[s.type].name} burned and sank in a burning oil slick.`, { k: 'hit', x: s.x, y: s.y }); sinkShip(st, s); }
  }
  if (hurt) log(st, p, `🔥 ${hurt} of your ships ${hurt > 1 ? 'were' : 'was'} burned (−1 HP) in burning oil.`, { k: 'hit' });
}
// Kade's Choking Smoke: enemy rigs inside a slick pump less (multiplier for a rig's output).
export function chokeMult(st, r) {
  if (!st.spills?.length) return 1;
  const choke = Math.max(0, ...st.players.map((pl, o) => (o !== r.owner && !pl.out ? pstat(st, o, 'slickChoke') : 0)));
  if (!choke) return 1;
  return st.spills.some(o => Math.max(Math.abs(r.x - o.x), Math.abs(r.y - o.y)) <= o.r) ? 1 - choke : 1;
}
