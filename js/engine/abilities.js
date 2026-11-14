// Ship actions: attacks, scans, surveys, mines, repairs, spoofs and salvage.
import { PORT, RIG } from '../data/economy.js';
import { SHIPS } from '../data/ships.js';
import { resolveShot } from './combat.js';
import { coord, dist, inBounds, isLand, shipCells } from './geometry.js';
import { randInt } from './rng.js';
import { commandBonus } from './stats.js';
import { checkWin } from './turns.js';
import { fail, log, ok, others, passives, portAt, rigAt, shipAt } from './util.js';

// ---------- actions ----------
export function actionRange(st, ship, act) {
  if (act.kind === 'attack' || act.kind === 'scan' || act.kind === 'spoof') return act.range + commandBonus(st, ship);
  if (act.kind === 'survey') return 0;
  return 1; // mine, repair, salvage: adjacent squares
}

export function canUseAction(st, ship, act) {
  if (ship.owner !== st.current) return 'Not your ship.';
  if ((ship.cooldowns[act.id] || 0) > 0) return `Reloading (${ship.cooldowns[act.id]} turn${ship.cooldowns[act.id] > 1 ? 's' : ''}).`;
  if (act.free) return ship.freeUsed[act.id] ? 'Already used this turn.' : null;
  if (ship.acted) {
    if (ship.activeAction === act.id && ship.shotsLeft > 0) return null;
    return 'Already acted this turn.';
  }
  if (act.kind === 'mine' && st.mines.filter(m => m.layer === ship.id).length >= act.max) return `Max ${act.max} mines out.`;
  return null;
}

function spend(ship, act) {
  if (act.free) { ship.freeUsed[act.id] = true; }
  else if (ship.activeAction === act.id && ship.shotsLeft > 0) { ship.shotsLeft--; }
  else { ship.acted = true; ship.activeAction = act.id; ship.shotsLeft = (act.shots || 1) - 1; }
  if (act.cooldown && (ship.shotsLeft === 0 || act.free)) ship.cooldowns[act.id] = act.cooldown;
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
      spend(ship, act);
      if (firstUse) addFlash(st, ship);
      resolveShot(st, ship, act, x, y);
      break;
    }
    case 'scan': {
      spend(ship, act);
      doScan(st, ship, act, x, y);
      break;
    }
    case 'survey': {
      spend(ship, act);
      const found = st.deposits.filter(d => dist(cells, [[d.x, d.y]]) <= act.radius);
      const sv = (st.players[p].surveyed ||= {});
      for (const [cx, cy] of cells)
        for (let dy = -act.radius; dy <= act.radius; dy++)
          for (let dx = -act.radius; dx <= act.radius; dx++)
            if (inBounds(st, cx + dx, cy + dy)) sv[(cx + dx) + ',' + (cy + dy)] = 1;
      let fresh = 0;
      found.forEach(d => { if (!st.players[p].known[d.id]) fresh++; st.players[p].known[d.id] = true; });
      log(st, p, fresh ? `Survey found ${fresh} new oil deposit${fresh > 1 ? 's' : ''}!` : 'Survey found no new oil here.');
      break;
    }
    case 'mine': {
      if (isLand(st, x, y) || shipAt(st, x, y) || rigAt(st, x, y) || st.mines.some(m => m.x === x && m.y === y))
        return fail('Square must be empty water.');
      spend(ship, act);
      st.mines.push({ id: 'm' + st.nextId++, owner: p, x, y, layer: ship.id, dmg: act.dmg });
      log(st, p, `Mine laid at ${coord(x, y)}.`);
      break;
    }
    case 'repair': {
      const t = shipAt(st, x, y, s => s.owner === p && s.id !== ship.id);
      const r = rigAt(st, x, y), po = portAt(st, x, y);
      const obj = t || (r && r.owner === p ? r : null) || (po && po.owner === p ? po : null);
      if (!obj) return fail('Pick one of your ships, rigs or ports next to the repair ship.');
      const max = t ? SHIPS[t.type].hp : obj === po ? PORT.hp : RIG.hp;
      if (obj.hp >= max) return fail('Already at full health.');
      spend(ship, act);
      obj.hp = Math.min(max, obj.hp + act.amount);
      log(st, p, `Repaired ${t ? SHIPS[t.type].name : obj === po ? 'port' : 'rig'} to ${obj.hp}/${max} HP.`);
      break;
    }
    case 'spoof': {
      spend(ship, act);
      for (const o of others(st, p)) st.players[o].spoofs.push({ x, y, turn: st.turnCount, owner: p });
      log(st, p, `Fake contact broadcast at ${coord(x, y)}.`);
      break;
    }
    case 'salvage': {
      const w = st.wrecks.find(w => w.cells.some(([cx, cy]) => cx === x && cy === y));
      if (!w) return fail('Pick a wreck square next to the salvage ship.');
      spend(ship, act);
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
  for (const o of others(st, ship.owner))
    st.players[o].flashes.push({ x: cx + ox - 2, y: cy + oy - 2, w: 5, h: 5, turn: st.turnCount, owner: ship.owner });
}

function doScan(st, ship, act, tx, ty) {
  const p = ship.owner;
  const lo = -Math.floor((act.size - 1) / 2), hi = lo + act.size - 1;
  const box = [];
  for (let dy = lo; dy <= hi; dy++) for (let dx = lo; dx <= hi; dx++)
    if (inBounds(st, tx + dx, ty + dy)) box.push([tx + dx, ty + dy]);
  const jammers = st.ships.filter(s => s.owner !== p && passives(s).jam);
  const jammed = ([x, y]) => jammers.some(j => dist(shipCells(j), [[x, y]]) <= passives(j).jam);
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
    rev.ports ||= [];
    for (const o of st.ports || []) {
      if (o.owner === p) continue;
      if (clear.some(([x, y]) => x === o.x && y === o.y) && !rev.ports.includes(o.id)) { rev.ports.push(o.id); found++; }
    }
  }
  st.players[p].scans.push({ cells: box, jammed: jam, turn: st.turnCount });
  log(st, p, `${act.name}: ${found ? found + ' contact' + (found > 1 ? 's' : '') + ' found' : 'nothing found'}${jam.length ? ' (signal jammed in part of the area)' : ''}.`);
}
