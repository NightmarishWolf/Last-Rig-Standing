// Ship actions: attacks, scans, surveys, mines, repairs, spoofs and salvage.
import { PORT, RIG } from '../data/economy.js';
import { SHIPS } from '../data/ships.js';
import { resolveShot } from './combat.js';
import { coord, dist, inBounds, isLand, shipCells } from './geometry.js';
import { randInt } from './rng.js';
import { commandBonus } from './stats.js';
import { baseById, baseMaxHp, platformAt, platformMaxHp } from './bases.js';
import { pstat, shipStat, weaponStat } from './modifiers.js';
import { checkWin } from './turns.js';
import { hasTech } from './research.js';
import { TECH } from '../data/research.js';
import { scrambled, seesSquare } from './strikes.js';
import { fail, log, ok, others, passives, portAt, r2, rigAt, shipAt } from './util.js';

// ---------- actions ----------
export function actionRange(st, ship, act) {
  if (act.kind === 'attack' || act.kind === 'scan' || act.kind === 'spoof') return weaponStat(st, ship.owner, act, 'range') + commandBonus(st, ship);
  if (act.kind === 'survey') return 0;
  return 1; // mine, repair, salvage: adjacent squares
}

export function canUseAction(st, ship, act) {
  if (ship.owner !== st.current) return 'Not your ship.';
  if (act.needs && !hasTech(st, ship.owner, act.needs)) return `Research ${TECH[act.needs].name} first.`;
  if (act.oil && st.players[ship.owner].oil < act.oil) return `Needs ${act.oil} oil.`;
  if (act.money && st.players[ship.owner].money < act.money) return `Needs $${act.money}.`;
  if ((ship.cooldowns[act.id] || 0) > 0) return `Reloading (${ship.cooldowns[act.id]} turn${ship.cooldowns[act.id] > 1 ? 's' : ''}).`;
  if (act.free) return ship.freeUsed[act.id] ? 'Already used this turn.' : null;
  if (ship.acted) {
    if (ship.activeAction === act.id && ship.shotsLeft > 0) return null;
    return 'Already acted this turn.';
  }
  if (act.kind === 'mine' && st.mines.filter(m => m.layer === ship.id).length >= act.max) return `Max ${act.max} mines out.`;
  return null;
}

function spend(st, ship, act) {
  if (act.free) { ship.freeUsed[act.id] = true; }
  else if (ship.activeAction === act.id && ship.shotsLeft > 0) { ship.shotsLeft--; }
  else { ship.acted = true; ship.activeAction = act.id; ship.shotsLeft = (act.kind === 'attack' ? weaponStat(st, ship.owner, act, 'shots') : 1) - 1; }
  if (act.cooldown && (ship.shotsLeft === 0 || act.free)) ship.cooldowns[act.id] = act.cooldown;
  // every use costs money (each shot, for multi-shot weapons); long-range launches also burn oil
  const pl = st.players[ship.owner];
  if (act.money) pl.money = r2(pl.money - act.money);
  if (act.oil) pl.oil = r2(pl.oil - act.oil);
}

export function doAct(st, a) {
  const ship = st.ships.find(s => s.id === a.shipId);
  if (!ship) return fail('No ship.');
  const act = SHIPS[ship.type].actions.find(x => x.id === a.actionId);
  if (!act) return fail('Unknown action.');
  const why = canUseAction(st, ship, act);
  if (why) return fail(why);
  const cells = shipCells(ship);
  const p = ship.owner;
  const { x, y } = a;
  if (act.kind !== 'survey') {
    if (!inBounds(st, x, y)) return fail('Out of bounds.');
    if (dist(cells, [[x, y]]) > actionRange(st, ship, act)) return fail('Out of range.');
  }
  const firstUse = !ship.acted || ship.activeAction !== act.id;
  switch (act.kind) {
    case 'attack': {
      // long-range weapons need a target square you can actually see, and cost oil per launch
      if (act.longRange && !seesSquare(st, p, x, y)) return fail("You can't see that square: scout it first (a recon drone, a scan or a ship's sight).");
      spend(st, ship, act);
      ship.combatRound = st.round; // firing counts as combat
      if (firstUse) addFlash(st, ship);
      if (act.longRange && scrambled(st, p, x, y)) {
        st.players[p].shots.push({ x, y, r: 'intercepted', turn: st.turnCount });
        log(st, p, `${act.name} was scrambled by enemy jamming and missed.`);
        break;
      }
      resolveShot(st, ship, act, x, y);
      break;
    }
    case 'scan': {
      spend(st, ship, act);
      doScan(st, ship, act, x, y);
      break;
    }
    case 'survey': {
      spend(st, ship, act);
      const radius = act.radius + pstat(st, p, 'surveyRadius');
      const found = st.deposits.filter(d => dist(cells, [[d.x, d.y]]) <= radius);
      const sv = (st.players[p].surveyed ||= {});
      for (const [cx, cy] of cells)
        for (let dy = -radius; dy <= radius; dy++)
          for (let dx = -radius; dx <= radius; dx++)
            if (inBounds(st, cx + dx, cy + dy)) sv[(cx + dx) + ',' + (cy + dy)] = 1;
      let fresh = 0;
      found.forEach(d => { if (!st.players[p].known[d.id]) fresh++; st.players[p].known[d.id] = true; });
      log(st, p, fresh ? `Survey found ${fresh} new oil deposit${fresh > 1 ? 's' : ''}!` : 'Survey found no new oil here.');
      break;
    }
    case 'mine': {
      if (isLand(st, x, y) || shipAt(st, x, y) || rigAt(st, x, y) || (st.platforms || []).some(o => o.x === x && o.y === y) || st.mines.some(m => m.x === x && m.y === y))
        return fail('Square must be empty water.');
      spend(st, ship, act);
      st.mines.push({ id: 'm' + st.nextId++, owner: p, x, y, layer: ship.id, dmg: act.dmg });
      log(st, p, `Mine laid at ${coord(x, y)}.`);
      break;
    }
    case 'repair': {
      const t = shipAt(st, x, y, s => s.owner === p && s.id !== ship.id);
      const r = rigAt(st, x, y), po = portAt(st, x, y), pl = platformAt(st, x, y);
      const obj = t || (r && r.owner === p ? r : null) || (po && po.owner === p ? po : null) || (pl && pl.owner === p ? pl : null);
      if (!obj) return fail('Pick one of your ships, rigs, platforms or ports next to the repair ship.');
      const max = t ? shipStat(st, p, t.type, 'hp') : obj === po ? PORT.hp : obj === pl ? platformMaxHp(st, pl)
        : r.center && baseById(st, r.baseId) ? baseMaxHp(st, baseById(st, r.baseId)) : RIG.hp;
      if (obj.hp >= max) return fail('Already at full health.');
      spend(st, ship, act);
      obj.hp = Math.min(max, obj.hp + act.amount);
      log(st, p, `Repaired ${t ? SHIPS[t.type].name : obj === po ? 'port' : obj === pl ? 'platform' : 'rig'} to ${obj.hp}/${max} HP.`);
      break;
    }
    case 'spoof': {
      spend(st, ship, act);
      for (const o of others(st, p)) st.players[o].spoofs.push({ x, y, turn: st.turnCount, owner: p });
      log(st, p, `Fake contact broadcast at ${coord(x, y)}.`);
      break;
    }
    case 'salvage': {
      const w = st.wrecks.find(w => w.cells.some(([cx, cy]) => cx === x && cy === y));
      if (!w) return fail('Pick a wreck square next to the salvage ship.');
      spend(st, ship, act);
      const gain = Math.floor(w.value * act.share);
      st.players[p].money += gain;
      st.wrecks = st.wrecks.filter(o => o !== w);
      log(st, p, `Salvaged a ${SHIPS[w.type].name} wreck for $${gain}.`);
      break;
    }
  }
  checkWin(st);
  return ok();
}

function addFlash(st, ship) {
  // Firing gives away your rough position to everyone else for their next turn.
  const cells = shipCells(ship);
  const [cx, cy] = cells[Math.floor(cells.length / 2)];
  const ox = randInt(st, -1, 1), oy = randInt(st, -1, 1);
  for (const o of others(st, ship.owner)) {
    // Signals Intelligence pinpoints the exact square; everyone else gets a rough 5×5 box
    if (pstat(st, o, 'flashExact')) st.players[o].flashes.push({ x: cx, y: cy, w: 1, h: 1, turn: st.turnCount, owner: ship.owner });
    else st.players[o].flashes.push({ x: cx + ox - 2, y: cy + oy - 2, w: 5, h: 5, turn: st.turnCount, owner: ship.owner });
  }
}

function doScan(st, ship, act, tx, ty) { return doScanAt(st, ship.owner, act, tx, ty); }

// Reveal a size×size box for player p (ship scans, recon drones, satellite passes).
export function doScanAt(st, p, act, tx, ty) {
  const lo = -Math.floor((act.size - 1) / 2), hi = lo + act.size - 1;
  const box = [];
  for (let dy = lo; dy <= hi; dy++) for (let dx = lo; dx <= hi; dx++)
    if (inBounds(st, tx + dx, ty + dy)) box.push([tx + dx, ty + dy]);
  const jammers = st.ships.filter(s => s.owner !== p && passives(s).jam);
  const jammed = ([x, y]) => jammers.some(j => dist(shipCells(j), [[x, y]]) <= shipStat(st, j.owner, j.type, 'jam'));
  const clear = box.filter(c => !jammed(c));
  const jam = box.filter(c => jammed(c));
  const rev = st.players[p].reveals;
  let found = 0;
  if (clear.length) {
    for (const s of st.ships) {
      if (s.owner === p || passives(s).submerged) continue;
      if (dist(shipCells(s), clear) === 0 && !rev.ships.includes(s.id)) { rev.ships.push(s.id); found++; }
    }
    for (const r of st.rigs) {
      if (r.owner === p) continue;
      if (clear.some(([x, y]) => x === r.x && y === r.y) && !rev.rigs.includes(r.id)) { rev.rigs.push(r.id); found++; }
    }
    rev.platforms ||= [];
    for (const o of st.platforms || []) {
      if (o.owner === p) continue;
      if (clear.some(([x, y]) => x === o.x && y === o.y) && !rev.platforms.includes(o.id)) { rev.platforms.push(o.id); found++; }
    }
    rev.ports ||= [];
    for (const o of st.ports || []) {
      if (o.owner === p) continue;
      if (clear.some(([x, y]) => x === o.x && y === o.y) && !rev.ports.includes(o.id)) { rev.ports.push(o.id); found++; }
    }
  }
  st.players[p].scans.push({ cells: box, jammed: jam, turn: st.turnCount });
  log(st, p, `${act.name}: ${found ? found + ' contact' + (found > 1 ? 's' : '') + ' found' : 'nothing found'}${jam.length ? ' (signal jammed in part of the area)' : ''}.`);
}
