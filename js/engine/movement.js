// Moving and turning ships, including running into hidden enemies and mines.
import { SHIPS } from '../data/ships.js';
import { sink } from './combat.js';
import { cellsOf, coord, shipCells, turnAnchor } from './geometry.js';
import { chargeMove, moveCost } from './stats.js';
import { shipStat } from './modifiers.js';
import { checkWin } from './turns.js';
import { fail, log, ok, passives } from './util.js';
import { hiddenBlocker, placementOk, revealBlocker, visibility } from './visibility.js';
import { blockedGrid } from './pathfind.js';

// ---------- movement ----------
// Everywhere a ship can get to this turn, in any facing. Each step is either one square
// sideways/forward/back (costs a move and oil) or a 90° turn around the ship's middle (free:
// it only needs room to swing). Keys are "x,y,rot"; values hold the squares sailed (d) and the previous state.
export function reachable(st, ship) {
  const res = new Map();
  if (ship.acted && !passives(ship).hitAndRun) return res;
  let maxSteps = Math.max(0, ship.movesLeft);
  const oil = st.players[ship.owner].oil;
  while (maxSteps > 0 && moveCost(st, ship, maxSteps) > oil) maxSteps--;
  // one grid of blocked squares for the whole search (same rules as placementOk, much faster)
  const grid = blockedGrid(st, ship.owner, ship.id), W = st.W, H = st.H;
  const fits = cells => cells.every(([cx, cy]) => cx >= 0 && cy >= 0 && cx < W && cy < H && !grid[cy * W + cx]);
  const key = (x, y, r) => x + ',' + y + ',' + r;
  const start = key(ship.x, ship.y, ship.rot);
  // 0-1 search: turns (cost 0) go to the front of the queue, squares (cost 1) to the back
  const q = [[ship.x, ship.y, ship.rot]];
  res.set(start, { d: 0, prev: null, x: ship.x, y: ship.y, r: ship.rot, turn: false });
  const done = new Set();
  while (q.length) {
    const [x, y, r] = q.shift();
    const k0 = key(x, y, r);
    if (done.has(k0)) continue;
    done.add(k0);
    const cur = res.get(k0);
    const next = [];
    for (const nr of [(r + 1) % 4, (r + 3) % 4]) next.push([...turnAnchor(ship.type, x, y, r, nr), nr, 0]);
    if (cur.d < maxSteps) next.push([x + 1, y, r, 1], [x - 1, y, r, 1], [x, y + 1, r, 1], [x, y - 1, r, 1]);
    for (const [nx, ny, nr, c] of next) {
      const k = key(nx, ny, nr);
      const old = res.get(k);
      if (old && old.d <= cur.d + c) continue;
      if (!fits(cellsOf(ship.type, nx, ny, nr))) continue;
      res.set(k, { d: cur.d + c, prev: k0, x: nx, y: ny, r: nr, turn: c === 0 });
      if (c === 0) q.unshift([nx, ny, nr]); else q.push([nx, ny, nr]);
    }
  }
  res.delete(start);
  return res;
}

// Paths mix squares and free turns: a step that changes facing is a turn.
// How many squares (moves) a path sails, starting from facing startRot:
export function pathMoves(path, startRot) {
  let r = startRot, m = 0;
  for (const n of path) { if (n.r === r) m++; r = n.r; }
  return m;
}
// The longest start of a path that sails at most `moves` squares (turns along the way are free).
export function prefixWithin(path, startRot, moves) {
  let r = startRot, m = 0, i = 0;
  for (; i < path.length; i++) {
    const sq = path[i].r === r ? 1 : 0;
    if (m + sq > moves) break;
    m += sq; r = path[i].r;
  }
  return path.slice(0, i);
}
// The most squares of this path the ship can sail right now (its moves and the oil in the tanks).
export function affordableMoves(st, ship, path) {
  let mv = Math.min(Math.max(0, ship.movesLeft), pathMoves(path, ship.rot));
  while (mv > 0 && moveCost(st, ship, mv) > st.players[ship.owner].oil) mv--;
  return mv;
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
    ship.combatRound = st.round;
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
  let steps = 0, sailed = 0;
  for (const step of path) {
    const r = step.r ?? ship.rot, turn = r !== ship.rot;
    const res = stepShip(st, ship, step.x, step.y, r);
    if (res === 'blocked') break;
    steps++;
    if (!turn) sailed++; // turning is free: only squares cost moves and oil
    if (res === 'stopped') break;
  }
  chargeMove(st, ship, sailed);
  ship.movesLeft -= sailed;
  return steps;
}

export function doRotate(st, a) {
  const ship = st.ships.find(s => s.id === a.shipId);
  if (!ship || ship.owner !== st.current) return fail('Not your ship.');
  if (ship.acted && !passives(ship).hitAndRun) return fail('This ship already acted and cannot move.');
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
  // turning is free (no moves, no oil)
  return ok();
}
