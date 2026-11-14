// Moving and turning ships, including running into hidden enemies and mines.
import { SHIPS } from '../data/ships.js';
import { sink } from './combat.js';
import { cellsOf, coord, shipCells } from './geometry.js';
import { moveCost } from './stats.js';
import { checkWin } from './turns.js';
import { fail, log, ok, passives } from './util.js';
import { hiddenBlocker, placementOk, revealBlocker, visibility } from './visibility.js';

// ---------- movement ----------
export function reachable(st, ship) {
  const res = new Map();
  if (ship.acted && !passives(ship).hitAndRun) return res;
  let maxSteps = ship.movesLeft;
  const oil = st.players[ship.owner].oil;
  while (maxSteps > 0 && moveCost(st, ship, maxSteps) > oil) maxSteps--;
  if (maxSteps <= 0) return res;
  const vis = visibility(st, ship.owner);
  const key = (x, y) => x + ',' + y;
  const q = [[ship.x, ship.y]];
  res.set(key(ship.x, ship.y), { d: 0, prev: null, x: ship.x, y: ship.y });
  while (q.length) {
    const [x, y] = q.shift();
    const cur = res.get(key(x, y));
    if (cur.d >= maxSteps) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = key(nx, ny);
      if (res.has(k)) continue;
      if (!placementOk(st, ship.owner, cellsOf(ship.type, nx, ny, ship.rot), ship.id, vis)) continue;
      res.set(k, { d: cur.d + 1, prev: key(x, y), x: nx, y: ny });
      q.push([nx, ny]);
    }
  }
  res.delete(key(ship.x, ship.y));
  return res;
}

export function doMove(st, a) {
  const ship = st.ships.find(s => s.id === a.shipId);
  if (!ship || ship.owner !== st.current) return fail('Not your ship.');
  const map = reachable(st, ship);
  const target = map.get(a.x + ',' + a.y);
  if (!target) return fail('Cannot reach that spot.');
  const path = [];
  for (let n = target; n && n.prev; n = map.get(n.prev)) path.unshift(n);
  const p = ship.owner, fullCost = moveCost(st, ship, path.length);
  let steps = 0;
  for (const step of path) {
    const cells = cellsOf(ship.type, step.x, step.y, ship.rot);
    const blk = hiddenBlocker(st, p, cells, ship.id);
    if (blk) {
      revealBlocker(st, p, blk);
      log(st, p, `${SHIPS[ship.type].name} ran into an unseen enemy ${blk.kind === 'ship' ? 'contact' : 'rig'} and stopped.`);
      break;
    }
    ship.x = step.x; ship.y = step.y; steps++;
    const mine = st.mines.find(m => m.owner !== p && cells.some(([cx, cy]) => cx === m.x && cy === m.y));
    if (mine) {
      st.mines = st.mines.filter(m => m !== mine);
      const dmg = Math.max(0, mine.dmg - (passives(ship).armor || 0));
      ship.hp -= dmg;
      log(st, p, `${SHIPS[ship.type].name} hit a mine! (−${dmg} HP)`);
      if (!st.players[mine.owner].out) log(st, mine.owner, `One of your mines exploded at ${coord(mine.x, mine.y)}.`);
      if (ship.hp <= 0) sink(st, ship);
      break;
    }
  }
  st.players[p].oil -= steps === path.length ? fullCost : moveCost(st, ship, steps);
  ship.movesLeft -= steps;
  checkWin(st);
  return ok();
}

export function doRotate(st, a) {
  const ship = st.ships.find(s => s.id === a.shipId);
  if (!ship || ship.owner !== st.current) return fail('Not your ship.');
  if (ship.acted && !passives(ship).hitAndRun) return fail('This ship already acted and cannot move.');
  if (ship.movesLeft < 1) return fail('No movement left.');
  const cost = moveCost(st, ship, 1);
  if (st.players[ship.owner].oil < cost) return fail('Not enough oil.');
  const rot = (ship.rot + 1) % 4;
  // rotate around the ship's middle so it doesn't jump sideways
  const centre = cs => [Math.round(cs.reduce((t, c) => t + c[0], 0) / cs.length), Math.round(cs.reduce((t, c) => t + c[1], 0) / cs.length)];
  const [cx, cy] = centre(shipCells(ship));
  const [rcx, rcy] = centre(cellsOf(ship.type, 0, 0, rot));
  const nx = cx - rcx, ny = cy - rcy;
  const cells = cellsOf(ship.type, nx, ny, rot);
  if (!placementOk(st, ship.owner, cells, ship.id, visibility(st, ship.owner))) return fail('No room to turn here.');
  const blk = hiddenBlocker(st, ship.owner, cells, ship.id);
  if (blk) {
    revealBlocker(st, ship.owner, blk);
    log(st, ship.owner, 'Turn blocked by an unseen enemy contact!');
    return ok();
  }
  ship.x = nx; ship.y = ny; ship.rot = rot;
  ship.movesLeft -= 1;
  st.players[ship.owner].oil -= cost;
  return ok();
}
