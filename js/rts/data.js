// ============================================================
// RTS · the numbers. The turn-based game's data files stay the one source (ships.js, bases.js,
// economy.js); this file turns "per turn" into "per second" with one conversion, so balance changes there
// carry over. Distances in squares, time in seconds, money in dollars, oil in barrels.
// ============================================================
import { SHIPS } from '../data/ships.js';
import { shipStat, weaponStat, pstat } from '../engine/modifiers.js';
import { PLATFORMS, BASE_LEVELS, BASE_FOUNDING, ADMIRALTY, QUARTERS_NEEDED_FROM } from '../data/bases.js';
import { DEPOSITS, MARKET, START, ECONOMY } from '../data/economy.js';

export const TURN = 6;          // one turn of the old game is this many seconds
export const HP_K = 40;          // hit points per old HP
export const RELOAD = 2.4;       // a weapon's basic reload (a "once a turn" weapon)
const DMG_K = HP_K * RELOAD / TURN; // damage per shot per old damage point (keeps time-to-kill the same)

export const SUPPLY = { hq: 10, quarters: 5, max: 100 };
export const START_MONEY = START.money + 400, START_OIL = START.oil;
export const OIL_K = 3; // (storage holds three times the turn-based amounts, research included: you sell every minute or so, not every twenty seconds)
export const OIL_CAP = ECONOMY.oilCap * OIL_K;
export const ROUND = 12; // (world events, oil slicks: one "round" of the turn-based game is this many seconds)
export const UPKEEP_RATE = ECONOMY.upkeepRate / TURN * 0.5; // (share of a ship's price per second: half the old rate, matches run longer)
export const HQ_INCOME = 3; // ($/s the Admiralty brings in on its own: you're never stuck at nothing)
export const RESERVES_K = 8; // (deposits hold this many times the old amounts: a match runs 20–40 minutes)
export { MARKET, BASE_LEVELS, BASE_FOUNDING, ADMIRALTY, QUARTERS_NEEDED_FROM };

// the ships in this stage (more come over later): workers first
export const ROSTER = {
  navy: ['survey', 'patrol', 'corvette', 'hydrofoil', 'submarine', 'destroyer', 'frigate', 'missileboat', 'repair', 'cruiser', 'carrier', 'battleship', 'battlecruiser', 'escortcarrier'],
  tide: ['prospector', 'skiff', 'gunboat', 'lancer', 'smuggler', 'fireship', 'brig', 'rocketjunk', 'incendiary', 'qship', 'mothership', 'leviathan'],
};
const KEYS = 'QWERTYASDFGZXCV';
export const WORKERS = new Set(['survey', 'prospector']);
export const SPRITE_K = 0.62; // (sprites drawn at this many squares per sprite square)

// a ship in seconds and squares. With a player (st = the engine-style view from tech.js, p = their seat) the
// numbers include their research and commander perks (engine/modifiers.js does the adding up, as in the
// turn-based game); without one, the base numbers.
export function convertShip(type, st = null, p = null) {
  const d = SHIPS[type], pas = d.passives || {};
  const S = k => shipStat(st, p, type, k), Wp = (a, k) => weaponStat(st, p, a, k);
  const len = Math.max(...d.shape.map(([x]) => x)) + 1, beam = Math.max(...d.shape.map(([, y]) => y)) + 1;
  const weapons = [], abilities = [];
  for (const a of d.actions || []) {
    if (a.kind === 'attack') {
      if (a.selfDestruct) { weapons.push({ id: a.id, name: a.name, ram: true, range: 0.3 + (Wp(a, 'range') - (a.range || 1)), dmg: Wp(a, 'dmg') * HP_K * 0.9, area: (Wp(a, 'area') || 1) * 0.6, tag: a.tag }); continue; }
      if (a.longRange) { abilities.push({ id: a.id, name: a.name, kind: 'strike', range: Wp(a, 'range'), dmg: Wp(a, 'dmg') * HP_K, area: 1.2, cooldown: (a.cooldown || 1) * TURN * 2, money: a.money || 0, oil: a.oil || 0, air: true, needs: a.needs }); continue; }
      weapons.push({ id: a.id, name: a.name, tag: a.tag, range: Wp(a, 'range') + 0.5, dmg: Wp(a, 'dmg') * DMG_K, shots: Wp(a, 'shots'), reload: RELOAD * Math.max(0.5, Wp(a, 'cooldown') || a.cooldown || 1),
        area: a.area ? 0.9 + (Wp(a, 'area') - a.area) * 0.5 : 0, air: !!a.air, subsOnly: !!a.subsOnly, torpedo: a.tag === 'torpedo', fireSlick: !!a.fireSlick, shell: a.air ? 9 : a.tag === 'torpedo' ? 6 : 16 });
    } else if (a.kind === 'scan') abilities.push({ id: a.id, name: a.name, kind: 'scan', range: Wp(a, 'range'), size: Wp(a, 'size') || 3, cooldown: (a.cooldown || 1) * TURN, money: a.money || 0 });
    else if (a.id === 'repair') abilities.push({ id: 'repair', name: 'Repair', kind: 'aura', range: 2, heal: 1.5 * HP_K / TURN });
  }
  const cost = S('cost'), oilK = d.oil ? S('oil') / d.oil : 1;
  return {
    type, name: d.name, side: d.faction || 'any', cls: d.cls, hp: S('hp') * HP_K, armor: S('armor') * 4,
    speed: 0.9 + S('move') * 0.6, turn: 4.5 / Math.max(1, Math.sqrt(len)),
    radius: Math.max(0.32, Math.max(len, beam * 1.4) * SPRITE_K * 0.42), len, beam,
    sight: S('sight') + 2.5, sonar: S('sonar') ? S('sonar') + 1 : 0, airDefense: pas.airDefense || 0, submerged: !!pas.submerged,
    cost, oil: Math.round(d.cost / 25 * oilK), supply: Math.max(1, Math.round(d.cost / 170)), build: Math.max(1, S('build')) * TURN * 0.9,
    upkeep: cost * UPKEEP_RATE * (p === null ? 1 : pstat(st, p, 'upkeepMult') * S('upkeepMult')),
    tideSource: pas.tideSource || 0, commander: d.commander || null,
    weapons, abilities, worker: WORKERS.has(type), desc: d.desc || '',
  };
}
export const UNITS = {};
for (const side of ['navy', 'tide']) ROSTER[side].forEach((t, i) => { UNITS[t] = convertShip(t); UNITS[t].key = KEYS[i] || ''; });

// structures: the Admiralty, a base's central rig, and the fifteen platforms
export const RIG_HP = lvl => BASE_LEVELS[lvl].hp * HP_K * 2.5;
export const PLATS = {};
for (const [k, p] of Object.entries(PLATFORMS)) {
  PLATS[k] = {
    kind: k, name: p.name, code: p.code, cost: p.cost, build: p.turns * TURN, hp: p.hp * HP_K * 1.5, upkeep: p.upkeep / TURN, text: p.text,
    onDeposit: !!p.onDeposit, oilCap: (p.oilCap || 0) * 3, rp: p.rp ? p.rp / TURN : 0, pump: p.pump ? p.pump / TURN : 0, sell: p.sell || 0,
    sight: p.sight ? p.sight + 1 : 2.5, airDefense: p.airDefense || 0, needsLevel: p.needsLevel || 1, megaproject: !!p.megaproject,
    gun: p.range ? { range: p.range + 0.5, dmg: p.dmg * DMG_K, reload: RELOAD, shell: 16 } : null,
    strike: p.strike ? { name: p.strike.name, range: p.strike.range + 0.5, dmg: p.strike.dmg * HP_K * 0.8, area: (p.strike.area || 1) * 0.7, cooldown: p.strike.cooldown * TURN, money: p.strike.money, oil: p.strike.oil, air: true, auto: k === 'cruise' } : null,
    recon: p.recon ? { range: p.recon.range, size: p.recon.size, cooldown: p.recon.cooldown * TURN, money: p.recon.money } : null,
    yard: k === 'drydock', repair: p.repair ? p.repair * HP_K / TURN : 0, supply: k === 'quarters' ? SUPPLY.quarters : 0,
  };
}
export const PLAT_ORDER = ['wellhead', 'storage', 'quarters', 'gun', 'radar', 'pump', 'refinery', 'lab', 'drydock', 'aa', 'helipad', 'missile', 'cruise', 'airbase', 'fusion'];
export const PLAT_KEYS = {};
PLAT_ORDER.forEach((k, i) => { PLAT_KEYS[k] = '1234567890'[i] || ''; });

// oil: a rig pumps its deposit at the old per-turn rate, spread over the turn
export const PUMP = Object.fromEntries(Object.entries(DEPOSITS).map(([k, d]) => [k, d.rate * 2 / TURN]));
export const ADMIRALTY_HP = 12 * HP_K * 3;
export const ADMIRALTY_GUN = { range: 4.5, dmg: 2 * DMG_K, reload: RELOAD, shell: 16 };
export const BUILD_REACH = 2.2; // (a worker builds from this close)
