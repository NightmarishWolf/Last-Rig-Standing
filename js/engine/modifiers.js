// ============================================================
// STATS: every ship, weapon and player number goes through here.
// Base values come from the data files; research and doctrines add to them.
// (Factions will plug in here too.)
// ============================================================
import { ECONOMY, PORT } from '../data/economy.js';
import { TECH } from '../data/research.js';
import { SHIPS } from '../data/ships.js';

const PLAYER_DEFAULTS = () => ({
  oilCap: ECONOMY.oilCap, sellMult: 1, priceDropMult: 1, upkeepMult: 1, surveyRadius: 0, rigRate: 0,
  reservesMult: 1, portRange: PORT.range, claimRadius: 0, slots: 0, platformCostMult: 1, platformHpMult: 1,
  platformUpkeepMult: 1, baseCostMult: 1, rp: 0, heal: 0, baseSight: 0, stealth: 0, flashExact: 0,
  platformRange: 0, platformRepair: 0, deepLayers: 0, pumpBonus: 0,
});

// Combine every researched tech's effects for one player (cached until they finish another tech).
const cache = new WeakMap();
function bonuses(st, p) {
  const r = st.players[p].research;
  if (!r) return { ship: {}, weapon: {}, player: {} };
  const n = Object.keys(r.done).length;
  const hit = cache.get(r);
  if (hit && hit.n === n) return hit.b;
  const b = { ship: {}, weapon: {}, player: {} };
  const add = (bucket, who, stat, e) => {
    const o = ((bucket[who] ||= {})[stat] ||= { add: 0, mult: 1 });
    if (e.add) o.add += e.add;
    if (e.mult !== undefined) o.mult *= e.mult;
  };
  for (const id in r.done) for (const e of TECH[id]?.effects || []) {
    if (e.ship) add(b.ship, e.ship, e.stat, e);
    else if (e.weapon) add(b.weapon, e.weapon, e.stat, e);
    else if (e.player) add(b.player, 'me', e.player, e);
  }
  cache.set(r, { n, b });
  return b;
}

const apply = (base, ...mods) => {
  let add = 0, mult = 1;
  for (const m of mods) if (m) { add += m.add; mult *= m.mult; }
  return (base + add) * mult;
};

const ROUNDED = { move: true, hp: true, sight: true, armor: true, cost: true, build: true, sonar: true, jam: true };

// A ship stat for player p: move, hp, sight, armor, oil (per square), cost, sonar, jam.
export function shipStat(st, p, type, stat) {
  const def = SHIPS[type], pas = def.passives || {};
  const base = stat === 'armor' ? pas.armor || 0 : stat === 'sonar' ? pas.sonar || 0 : stat === 'jam' ? pas.jam || 0 : def[stat];
  if (p === null || p === undefined) return base;
  const b = bonuses(st, p).ship;
  const v = apply(base, b.all?.[stat], b[def.cls]?.[stat], b[type]?.[stat]);
  return ROUNDED[stat] ? Math.max(stat === 'hp' || stat === 'move' || stat === 'build' ? 1 : 0, Math.round(v)) : Math.max(0, v);
}

// A weapon/scan stat for player p: range, dmg, shots.
export function weaponStat(st, p, act, stat) {
  const base = stat === 'shots' ? act.shots || 1 : act[stat] || 0;
  if (p === null || p === undefined) return base;
  const b = bonuses(st, p).weapon;
  const all = act.kind === 'attack' ? b.all?.[stat] : null; // "every weapon" bonuses don't apply to scans
  return Math.max(0, Math.round(apply(base, all, b[act.tag]?.[stat])));
}

// A player-wide stat (economy, bases, sensors).
let DEFAULTS = null; // built once (the numbers never change during a game)
export function pstat(st, p, key) {
  const base = (DEFAULTS ||= PLAYER_DEFAULTS())[key];
  const m = bonuses(st, p).player.me?.[key];
  return m ? (base + m.add) * m.mult : base;
}

export const shipName = type => SHIPS[type].name;
