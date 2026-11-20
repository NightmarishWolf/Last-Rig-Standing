// Commander powers: each commander's active abilities (data/commanders.js), on cooldowns counted in the
// player's own turns. Action: "power" { power, x?, y? } (x, y for powers with a target).
import { POWERS, POWER_START, powersAt } from '../data/commanders.js';
import { SHIPS } from '../data/ships.js';
import { doScanAt } from './abilities.js';
import { sellMultOf } from './bases.js';
import { resolveShot } from './combat.js';
import { assaultProblem, captureBase, onTide } from './factions.js';
import { addShip } from './setup.js';
import { coord, dist, inBounds, isLand, shipCells } from './geometry.js';
import { shipStat } from './modifiers.js';
import { seesSquare } from './strikes.js';
import { checkWin } from './turns.js';
import { addSpill } from './world.js';
import { fail, log, ok, pname, r2, rigAt, shipAt, tally } from './util.js';

// The powers p's commander has now (by level), each with its cooldown left.
export function powersOf(st, p) {
  const c = st.players[p]?.commander;
  if (!c) return [];
  return powersAt(c.id, c.level).map(w => ({ ...w, cd: st.players[p].powerCd?.[w.id] ?? POWER_START }));
}
// Start of your turn: powers recharge. (A fresh commander's start at POWER_START.)
export function tickPowers(st, p) {
  const pl = st.players[p];
  if (!pl.commander) return;
  pl.powerCd ||= {};
  for (const w of powersAt(pl.commander.id, pl.commander.level)) {
    if (pl.powerCd[w.id] == null) pl.powerCd[w.id] = POWER_START;
    else if (pl.powerCd[w.id] > 0) pl.powerCd[w.id]--;
  }
}

const myShips = (st, p) => st.ships.filter(s => s.owner === p);
const capitals = (st, p) => myShips(st, p).filter(s => SHIPS[s.type].cls === 'capital');
const near = (st, p, x, y, r) => myShips(st, p).some(s => dist(shipCells(s), [[x, y]]) <= r);
// the enemy base at a square: its central rig, any of its rigs or platforms, or its centre
function baseAt(st, x, y) {
  const r = st.rigs.find(o => o.x === x && o.y === y && o.baseId);
  const pl = (st.platforms || []).find(o => o.x === x && o.y === y);
  const id = r?.baseId || pl?.baseId;
  return (st.bases || []).find(b => b.id === id || (b.x === x && b.y === y)) || null;
}

// Why p can't use this power at (x, y) right now (null = they can). Without x, y: just whether it's ready.
export function powerProblem(st, p, id, x, y) {
  const w = powersOf(st, p).find(o => o.id === id);
  if (!w) return "Your commander doesn't have that power.";
  if (w.cd > 0) return `${w.name} is recharging (${w.cd} turn${w.cd > 1 ? 's' : ''}).`;
  if (!w.target || x == null) return null;
  if (!inBounds(st, x, y)) return 'Out of bounds.';
  switch (w.target) {
    case 'seen': return seesSquare(st, p, x, y) ? null : "You can't see that square.";
    case 'tide': return onTide(st, p, x, y) && !isLand(st, x, y) ? null : 'Pick a square on your Tide.';
    case 'base': {
      const b = baseAt(st, x, y);
      if (!b || b.owner === p || b.owner < 0) return 'Pick an enemy base.';
      if (!near(st, p, b.x, b.y, w.range)) return `One of your ships must be within ${w.range} squares of the base.`;
      return assaultProblem(st, { owner: p }, b, { small: true, range: w.range });
    }
    case 'struct': {
      const o = (st.platforms || []).find(o => o.x === x && o.y === y && o.owner !== p && o.owner >= 0);
      const r = rigAt(st, x, y);
      if (!o && !(r && r.owner !== p && r.owner >= 0 && !r.center)) return 'Pick an enemy platform or rig (not a central rig).';
      if (!near(st, p, x, y, w.range)) return `One of your ships must be within ${w.range} squares.`;
      return null;
    }
    default: return null;
  }
}

export function doPower(st, a) {
  const p = st.current, pl = st.players[p];
  const why = powerProblem(st, p, a.power, a.x, a.y);
  if (why) return fail(why);
  const w = POWERS[a.power];
  if (w.target && a.x == null) return fail('Pick a target square.');
  const { x, y } = a;
  pl.powerCd = { ...(pl.powerCd || {}), [w.id]: w.cooldown };
  tally(st, p, 'powers');
  const say = (text, extra = {}) => log(st, p, `${w.icon} ${w.name}: ${text}`, { k: 'win', ...extra });
  switch (w.id) {
    case 'broadside': {
      const caps = capitals(st, p);
      for (const s of caps) { s.acted = false; s.shotsLeft = 0; s.activeAction = null; s.cooldowns = {}; s.freeUsed = {}; }
      say(`${caps.length} capital ship${caps.length === 1 ? '' : 's'} reloaded and ready to fire again.`);
      break;
    }
    case 'damagecontrol': {
      let n = 0;
      for (const s of myShips(st, p)) {
        const max = shipStat(st, p, s.type, 'hp'), heal = SHIPS[s.type].cls === 'capital' ? 4 : 2;
        if (s.hp < max) { s.hp = Math.min(max, s.hp + heal); n++; }
      }
      say(`${n} ship${n === 1 ? '' : 's'} repaired.`);
      break;
    }
    case 'carrierstrike': case 'firestorm': {
      const fire = w.id === 'firestorm';
      say(`launched at ${coord(x, y)}.`, { x, y });
      resolveShot(st, { owner: p, x, y, type: null, unit: 'power:' + w.id }, { kind: 'attack', tag: fire ? 'fire' : 'air', name: w.name, dmg: w.dmg, area: w.area, air: !fire, longRange: true, rigMult: 1 }, x, y);
      if (fire && !isLand(st, x, y)) addSpill(st, x, y, 'fire', 0, p);
      checkWin(st);
      break;
    }
    case 'reconblanket':
      doScanAt(st, p, { name: w.name, size: w.size }, x, y);
      break;
    case 'beachlanding':
      captureBase(st, p, baseAt(st, x, y));
      checkWin(st);
      break;
    case 'sabotage': {
      const o = (st.platforms || []).find(o => o.x === x && o.y === y && o.owner !== p);
      const victim = o ? o.owner : rigAt(st, x, y).owner;
      if (o) st.platforms = st.platforms.filter(q => q !== o);
      else { const r = rigAt(st, x, y); st.rigs = st.rigs.filter(q => q !== r); addSpill(st, x, y, 'rig'); }
      tally(st, p, 'destroyed');
      say(`commandos blew up ${pname(st, victim)}'s ${o ? 'platform' : 'rig'} at ${coord(x, y)}.`, { x, y });
      log(st, victim, `Saboteurs blew up your ${o ? 'platform' : 'rig'} at ${coord(x, y)}!`, { k: 'hit', x, y });
      checkWin(st);
      break;
    }
    case 'swarmcall': {
      // the nearest free squares on your Tide around the target
      const spots = [];
      for (let r = 0; r <= 3 && spots.length < w.boats; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || spots.length >= w.boats) continue;
        const cx = x + dx, cy = y + dy;
        if (!inBounds(st, cx, cy) || isLand(st, cx, cy) || !onTide(st, p, cx, cy) || shipAt(st, cx, cy) || rigAt(st, cx, cy)) continue;
        spots.push([cx, cy]);
      }
      for (const [cx, cy] of spots) addShip(st, p, 'skiff', cx, cy, 0, true);
      say(`${spots.length} Skiffs launched around ${coord(x, y)}.`, { x, y });
      break;
    }
    case 'tidalsurge':
      pl.surge = { extra: w.extra, until: st.round + w.rounds };
      say(`your Tide reaches ${w.extra} squares further for ${w.rounds} rounds.`);
      break;
    case 'ignite': {
      let n = 0;
      for (const o of st.spills || []) if (!o.fire) { o.fire = true; o.by = p; o.burnLeft = w.rounds; n++; }
      say(`${n} oil slick${n === 1 ? '' : 's'} set alight for ${w.rounds} rounds.`);
      break;
    }
    case 'blackmarket': {
      const n = r2(Math.min(w.oil, pl.oil));
      if (n <= 0) { pl.powerCd[w.id] = 0; return fail('No oil to sell.'); }
      const money = r2(n * st.market.price * sellMultOf(st, p) * w.mult);
      pl.oil = r2(pl.oil - n); pl.money = r2(pl.money + money);
      tally(st, p, 'oilSold', n); tally(st, p, 'oilMoney', money);
      say(`sold ${n} oil for $${money} on the quiet.`);
      break;
    }
    case 'smugglerun':
      for (const s of myShips(st, p)) s.movesLeft = (s.movesLeft || 0) + w.moves;
      pl.freeMoves = st.round;
      say(`every ship gets +${w.moves} moves, and moves cost no oil this turn.`);
      break;
  }
  return ok();
}
