// Moving and turning ships, including running into hidden enemies and mines.
import { SHIPS } from '../data/ships.js';
import { sink } from './combat.js';
import { cellsOf, coord, shipCells, turnAnchor } from './geometry.js';
import { moveCost } from './stats.js';
import { shipStat } from './modifiers.js';
import { checkWin } from './turns.js';
import { fail, log, ok, passives } from './util.js';
import { hiddenBlocker, placementOk, revealBlocker, visibility } from './visibility.js';

// ---------- movement ----------
// Everywhere a ship can get to this turn, in any facing. Each step is either one square
// sideways/forward/back or a 90° turn (which pivots around the ship's middle).
// Keys are "x,y,rot" (anchor and facing); values hold the step count and the previous state.
export function reachable(st, ship) {
  const res = new Map();
  if (ship.acted && !passives(ship).hitAndRun) return res;
  let maxSteps = ship.movesLeft;
  const oil = st.players[ship.owner].oil;
  while (maxSteps > 0 && moveCost(st, ship, maxSteps) > oil) maxSteps--;
  if (maxSteps <= 0) return res;
  const vis = visibility(st, ship.owner);
  const key = (x, y, r) => x + ',' + y + ',' + r;
  const start = key(ship.x, ship.y, ship.rot);
  const q = [[ship.x, ship.y, ship.rot]];
  res.set(start, { d: 0, prev: null, x: ship.x, y: ship.y, r: ship.rot });
  while (q.length) {
    const [x, y, r] = q.shift();
    const cur = res.get(key(x, y, r));
    if (cur.d >= maxSteps) continue;
    const next = [[x + 1, y, r], [x - 1, y, r], [x, y + 1, r], [x, y - 1, r]];
    for (const nr of [(r + 1) % 4, (r + 3) % 4]) next.push([...turnAnchor(ship.type, x, y, r, nr), nr]);
    for (const [nx, ny, nr] of next) {
      const k = key(nx, ny, nr);
      if (res.has(k)) continue;
      if (!placementOk(st, ship.owner, cellsOf(ship.type, nx, ny, nr), ship.id, vis)) continue;
      res.set(k, { d: cur.d + 1, prev: key(x, y, r), x: nx, y: ny, r: nr });
      q.push([nx, ny, nr]);
    }
  }
  res.delete(start);
  return res;
}

export function doMove(st, a) {
  const ship = st.ships.find(s => s.id === a.shipId);
  if (!ship || ship.owner !== st.current) return fail('Not your ship.');
  const map = reachable(st, ship);
  const target = map.get(a.x + ',' + a.y + ',' + (a.rot ?? ship.rot));
  if (!target) return fail('Cannot reach that spot.');
  const path = [];
  for (let n = target; n && n.prev; n = map.get(n.prev)) path.unshift(n);
  ship.order = null; // steering by hand cancels any voyage
  sailPath(st, ship, path);
  checkWin(st);
  return ok();
}

// One step for one ship (no oil charged here). Returns 'ok', 'blocked' (an unseen enemy is
// in the way: the ship stays put) or 'stopped' (it moved but hit a mine, and may have sunk).
export function stepShip(st, ship, x, y, r) {
  const p = ship.owner;
  const cells = cellsOf(ship.type, x, y, r);
  const blk = hiddenBlocker(st, p, cells, ship.id);
  if (blk) {
    revealBlocker(st, p, blk);
    log(st, p, `${SHIPS[ship.type].name} ran into an unseen enemy ${blk.kind === 'ship' ? 'contact' : 'rig'} and stopped.`);
    return 'blocked';
  }
  ship.x = x; ship.y = y; ship.rot = r;
  const mine = st.mines.find(m => m.owner !== p && cells.some(([cx, cy]) => cx === m.x && cy === m.y));
  if (mine) {
    st.mines = st.mines.filter(m => m !== mine);
    const dmg = Math.max(0, mine.dmg - shipStat(st, p, ship.type, 'armor'));
    ship.hp -= dmg;
    log(st, p, `${SHIPS[ship.type].name} hit a mine! (−${dmg} HP)`);
    if (!st.players[mine.owner].out) log(st, mine.owner, `One of your mines exploded at ${coord(mine.x, mine.y)}.`);
    if (ship.hp <= 0) sink(st, ship);
    return 'stopped';
  }
  return 'ok';
}

// Sail a ship along a list of {x, y} steps: stops early on hidden enemies or mines,
// pays oil for the squares actually sailed. Returns how many steps were taken.
export function sailPath(st, ship, path) {
  const fullCost = moveCost(st, ship, path.length);
  let steps = 0;
  for (const step of path) {
    const res = stepShip(st, ship, step.x, step.y, step.r ?? ship.rot);
    if (res === 'blocked') break;
    steps++;
    if (res === 'stopped') break;
  }
  st.players[ship.owner].oil -= steps === path.length ? fullCost : moveCost(st, ship, steps);
  ship.movesLeft -= steps;
  return steps;
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
  const [nx, ny] = turnAnchor(ship.type, ship.x, ship.y, ship.rot, rot);
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
