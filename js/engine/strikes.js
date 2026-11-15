// Long-range warfare: recon drones, cruise missiles, bombers, satellite passes.
// The idea: striking far away costs oil (and money) per shot instead of per square sailed,
// so a player who turtles at home can still be hit, and has to spend on air defence.
//
// Platforms with `recon` or `strike` (data/bases.js) are aimed from the base card:
//   "baseStrike" { platformId, x, y }
// The satellite pass (Satellite Reconnaissance research) is aimed from the Admiralty:
//   "satellite" { x, y }
// Strikes need a target square you can see right now (your vision, or a scan/recon this turn).
import { PLATFORMS } from '../data/bases.js';
import { STRIKES } from '../data/economy.js';
import { TECH } from '../data/research.js';
import { SHIPS } from '../data/ships.js';
import { baseById } from './bases.js';
import { resolveShot } from './combat.js';
import { coord, dist, inBounds, shipCells } from './geometry.js';
import { shipStat } from './modifiers.js';
import { hasTech } from './research.js';
import { rand } from './rng.js';
import { checkWin } from './turns.js';
import { fail, log, ok, others, passives } from './util.js';
import { doScanAt } from './abilities.js';
import { sightSources } from './visibility.js';

// Can player p see this square right now (ships, rigs, platforms, ports, or a scan made this turn)?
export function seesSquare(st, p, x, y) {
  if ((st.players[p].scans || []).some(sc => sc.cells.some(([cx, cy]) => cx === x && cy === y) && !sc.jammed.some(([jx, jy]) => jx === x && jy === y))) return true;
  return sightSources(st, p).some(([cells, r]) => cells.some(([cx, cy]) => Math.max(Math.abs(cx - x), Math.abs(cy - y)) <= r));
}

// Is a strike aimed here scrambled by an enemy Jammer Ship? (rolled once per strike)
export function scrambled(st, p, x, y) {
  const jam = st.ships.some(s => s.owner !== p && passives(s).jam && dist(shipCells(s), [[x, y]]) <= shipStat(st, s.owner, s.type, 'jam'));
  return jam && rand(st) < STRIKES.jamChance;
}

const activeOwn = (st, p, id) => {
  const o = (st.platforms || []).find(x => x.id === id);
  if (!o || o.owner !== p) return null;
  if (o.buildLeft || baseById(st, o.baseId)?.wrecked) return null;
  return o;
};

// Why a platform can't fire at (x, y) right now (null = it can).
export function strikeProblem(st, p, o, x, y) {
  const def = PLATFORMS[o.kind], s = def.strike || def.recon;
  if (!s) return 'That platform has no long-range action.';
  if (o.cd > 0) return `Reloading (${o.cd} turn${o.cd > 1 ? 's' : ''}).`;
  if (x == null) return null;
  if (!inBounds(st, x, y)) return 'Out of bounds.';
  if (Math.max(Math.abs(x - o.x), Math.abs(y - o.y)) > s.range) return `Out of range (${s.range} squares).`;
  if (def.strike) {
    if (st.players[p].oil < (s.oil || 0)) return `Needs ${s.oil} oil.`;
    if (st.players[p].money < (s.money || 0)) return `Needs $${s.money}.`;
    if (!seesSquare(st, p, x, y)) return "You can't see that square: scout it first (a recon drone, a scan or a ship's sight).";
  }
  return null;
}

export function doBaseStrike(st, a) {
  const p = st.current;
  const o = activeOwn(st, p, a.platformId);
  if (!o) return fail('That platform is not ready.');
  const why = strikeProblem(st, p, o, a.x, a.y);
  if (why) return fail(why);
  const def = PLATFORMS[o.kind];
  if (def.recon) {
    o.cd = def.recon.cooldown;
    doScanAt(st, p, { name: 'Recon drone', size: def.recon.size }, a.x, a.y);
    return ok();
  }
  const s = def.strike, me = st.players[p];
  me.oil -= s.oil || 0; me.money -= s.money || 0;
  o.cd = s.cooldown;
  // the launch site is no secret: everyone gets a flash on it
  for (const q of others(st, p)) st.players[q].flashes.push({ x: o.x, y: o.y, w: 1, h: 1, turn: st.turnCount, owner: p });
  if (scrambled(st, p, a.x, a.y)) {
    me.shots.push({ x: a.x, y: a.y, r: 'intercepted', turn: st.turnCount });
    log(st, p, `${s.name} was scrambled by enemy jamming and missed.`);
    return ok();
  }
  log(st, p, `${s.name} launched at ${coord(a.x, a.y)}.`);
  resolveShot(st, { owner: p, x: o.x, y: o.y, type: null }, { kind: 'attack', tag: 'missile', name: s.name, dmg: s.dmg, area: s.area, air: true, longRange: true, rigMult: 1 }, a.x, a.y);
  checkWin(st);
  return ok();
}

// ---------- satellite pass ----------
export const satelliteReady = (st, p) => hasTech(st, p, 'satellites') && !(st.players[p].satCd > 0);
export function doSatellite(st, a) {
  const p = st.current;
  if (!hasTech(st, p, 'satellites')) return fail(`Research ${TECH.satellites.name} first.`);
  if (st.players[p].satCd > 0) return fail(`The satellite is back over you in ${st.players[p].satCd} turns.`);
  if (!inBounds(st, a.x, a.y)) return fail('Out of bounds.');
  st.players[p].satCd = STRIKES.satellite.cooldown;
  doScanAt(st, p, { name: 'Satellite pass', size: STRIKES.satellite.size }, a.x, a.y);
  return ok();
}

// Start of your turn: launchers reload.
export function tickStrikes(st, p) {
  for (const o of st.platforms || []) if (o.owner === p && o.cd > 0) o.cd--;
  if (st.players[p].satCd > 0) st.players[p].satCd--;
}

export const strikeName = kind => (PLATFORMS[kind].strike || PLATFORMS[kind].recon) && (PLATFORMS[kind].strike?.name || 'Recon drone');
export const isLongRangeShip = type => SHIPS[type]?.actions.some(a => a.longRange);
