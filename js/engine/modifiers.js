// ============================================================
// STATS: every ship, weapon and player number goes through here.
// Base values come from the data files; research and doctrines add to them.
// (Factions plug in through their own research branches.)
// ============================================================
import { ECONOMY, PORT } from '../data/economy.js';
import { TECH } from '../data/research.js';
import { SHIPS } from '../data/ships.js';
import { perksAt } from '../data/commanders.js';

// which ship each action belongs to (for weapon bonuses aimed at one class or type: `on`)
const ACT_SHIP = new Map();
for (const [type, d] of Object.entries(SHIPS)) for (const a of d.actions || []) ACT_SHIP.set(a, type);

const PLAYER_DEFAULTS = () => ({
  oilCap: ECONOMY.oilCap, sellMult: 1, priceDropMult: 1, upkeepMult: 1, surveyRadius: 0, rigRate: 0,
  reservesMult: 1, portRange: PORT.range, claimRadius: 0, slots: 0, platformCostMult: 1, platformHpMult: 1,
  platformUpkeepMult: 1, baseCostMult: 1, rp: 0, heal: 0, baseSight: 0, stealth: 0, flashExact: 0,
  platformRange: 0, platformRepair: 0, deepLayers: 0, pumpBonus: 0,
  // Free Tide
  tideRadius: 0, tideMax: 0, tideHeal: 0, tideMove: 0, tideOilMult: 1, tideShip: 0, packBonus: 0, plunderMult: 1, plunderRange: 0, boardShare: 0,
  // commander perks
  capHeal: 0, assaultHp: 0, assaultDefenders: 0, captureRepair: 0, captureBounty: 0, adminCapture: 0, airIgnoreAA: 0,
  raftSlots: 0, freeSkiffSurvey: 0, packInstant: 0, spillBig: 0, slickBurn: 0, slickChoke: 0,
  plunderOilAll: 0, siphonMult: 1, offTideOil: 1, plunderStructs: 0, ghostHidden: 0,
});

// Combine every researched tech's effects for one player, and their commander's perks
// (cached until they finish another tech).
const cache = new WeakMap();
function bonuses(st, p) {
  const r = st.players[p]?.research; // (no player: the neutral side, base stats)
  if (!r) return { ship: {}, weapon: {}, player: {} };
  const c = st.players[p].commander;
  const n = Object.keys(r.done).length + (c ? `:${c.id}:${c.level}:${c.mastery || 0}` : '');
  const hit = cache.get(r);
  if (hit && hit.n === n) return hit.b;
  const b = { ship: {}, weapon: {}, player: {} };
  const add = (bucket, who, stat, e) => {
    const o = ((bucket[who] ||= {})[stat] ||= { add: 0, mult: 1 });
    if (e.add) o.add += e.add;
    if (e.mult !== undefined) o.mult *= e.mult;
  };
  const effects = [];
  for (const id in r.done) effects.push(...(TECH[id]?.effects || []));
  if (c) for (const k of perksAt(c.id, c.level, c.mastery)) effects.push(...(k.effects || []));
  for (const e of effects) {
    if (e.ship) add(b.ship, e.ship, e.stat, e);
    else if (e.weapon) add(b.weapon, e.on ? `${e.weapon}@${e.on}` : e.weapon, e.stat, e);
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
  // (…Mult stats, like upkeepMult, start at 1)
  const base = stat === 'armor' ? pas.armor || 0 : stat === 'sonar' ? pas.sonar || 0 : stat === 'jam' ? pas.jam || 0 : def[stat] ?? (stat.endsWith('Mult') ? 1 : 0);
  if (p === null || p === undefined) return base;
  const b = bonuses(st, p).ship;
  const v = apply(base, b.all?.[stat], b[def.cls]?.[stat], b[type]?.[stat]);
  return ROUNDED[stat] ? Math.max(stat === 'hp' || stat === 'move' || stat === 'build' ? 1 : 0, Math.round(v)) : Math.max(0, v);
}

// A weapon/scan stat for player p: range, dmg, shots, area, size, cooldown.
export function weaponStat(st, p, act, stat) {
  const base = stat === 'shots' ? act.shots || 1 : act[stat] || 0;
  if (p === null || p === undefined) return base;
  const b = bonuses(st, p).weapon;
  const atk = act.kind === 'attack'; // "every weapon" bonuses don't apply to scans
  const type = ACT_SHIP.get(act), cls = type && SHIPS[type].cls;
  const v = apply(base, atk ? b.all?.[stat] : null, b[act.tag]?.[stat],
    type ? b[`${act.tag}@${cls}`]?.[stat] : null, type ? b[`${act.tag}@${type}`]?.[stat] : null,
    type && atk ? b[`all@${cls}`]?.[stat] : null, type && atk ? b[`all@${type}`]?.[stat] : null);
  // (a cooldown can go down to nothing; an area stays odd: 1, 3, 5)
  return stat === 'area' && base ? Math.max(1, Math.round(v) | 1) : Math.max(0, Math.round(v));
}

// A player-wide stat (economy, bases, sensors).
let DEFAULTS = null; // built once (the numbers never change during a game)
export function pstat(st, p, key) {
  const base = (DEFAULTS ||= PLAYER_DEFAULTS())[key];
  const m = bonuses(st, p).player.me?.[key];
  return m ? (base + m.add) * m.mult : base;
}

export const shipName = type => SHIPS[type].name;
