// ============================================================
// RULES ENGINE
// Pure game logic: no DOM, no canvas. The whole game is one plain
// JSON object (`state`). Every change goes through applyAction().
// That is what makes online play easy later: send the action to
// Firebase/Supabase, and every client runs applyAction() on it.
// ============================================================
import { SHIPS, RIG, DEPOSITS, MARKET, START, TIER_RIGS } from './data/ships.js';

export const W = 30;
export const H = 18;
export const HOME_WIDTH = 9;   // columns of home waters per side
export const SPAWN_WIDTH = 3;  // columns where new ships appear

// ---------- random numbers (seeded, so games can be replayed/synced) ----------
function rand(state) {
  let t = (state.rng += 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const randInt = (s, a, b) => a + Math.floor(rand(s) * (b - a + 1));

// ---------- geometry ----------
export function cellsOf(type, x, y, rot = 0) {
  let pts = SHIPS[type].shape.map(([a, b]) => [a, b]);
  for (let i = 0; i < rot; i++) pts = pts.map(([a, b]) => [-b, a]);
  const minX = Math.min(...pts.map(p => p[0]));
  const minY = Math.min(...pts.map(p => p[1]));
  return pts.map(([a, b]) => [a - minX + x, b - minY + y]);
}
export const shipCells = s => cellsOf(s.type, s.x, s.y, s.rot);
export function dist(cellsA, cellsB) {
  let best = Infinity;
  for (const [ax, ay] of cellsA)
    for (const [bx, by] of cellsB) {
      const d = Math.max(Math.abs(ax - bx), Math.abs(ay - by));
      if (d < best) best = d;
    }
  return best;
}
const inBounds = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
export const isLand = (st, x, y) => st.land[y * W + x] === 1;
export function zoneOf(x) {
  if (x < HOME_WIDTH) return 0;
  if (x >= W - HOME_WIDTH) return 1;
  return 'middle';
}
export const inSpawn = (p, x) => (p === 0 ? x < SPAWN_WIDTH : x >= W - SPAWN_WIDTH);

// ---------- new game ----------
export function newGame(seed = Math.floor(Math.random() * 1e9)) {
  const st = {
    version: 1, seed, rng: seed, turnCount: 1, current: 0,
    phase: 'playing', winner: null, nextId: 1,
    land: new Array(W * H).fill(0),
    deposits: [], ships: [], rigs: [], mines: [], wrecks: [],
    market: { price: MARKET.basePrice },
    players: [0, 1].map(() => ({
      money: START.money, oil: START.oil, known: {},
      shots: [], incoming: [], flashes: [], spoofs: [], scans: [],
      reveals: { ships: [], rigs: [] }, log: [],
    })),
  };
  generateMap(st);
  startTurn(st, 0, true);
  return st;
}

function generateMap(st) {
  // Islands only in No Man's Sea
  const islands = randInt(st, 6, 9);
  for (let i = 0; i < islands; i++) {
    let x = randInt(st, HOME_WIDTH + 1, W - HOME_WIDTH - 2);
    let y = randInt(st, 1, H - 2);
    const size = randInt(st, 2, 6);
    for (let k = 0; k < size; k++) {
      st.land[y * W + x] = 1;
      const d = randInt(st, 0, 3);
      x = Math.min(W - HOME_WIDTH - 2, Math.max(HOME_WIDTH + 1, x + [1, -1, 0, 0][d]));
      y = Math.min(H - 2, Math.max(1, y + [0, 0, 1, -1][d]));
    }
  }
  const placeDeposit = (type, xMin, xMax) => {
    for (let tries = 0; tries < 500; tries++) {
      const x = randInt(st, xMin, xMax), y = randInt(st, 0, H - 1);
      if (isLand(st, x, y)) continue;
      if (st.deposits.some(d => Math.max(Math.abs(d.x - x), Math.abs(d.y - y)) < 3)) continue;
      const dep = { id: 'd' + st.nextId++, x, y, type, reserves: DEPOSITS[type].reserves };
      st.deposits.push(dep);
      return dep;
    }
    return null;
  };
  // Equal home deposits for both sides (same types, independent positions)
  const homeSet = ['medium', 'small', 'small', 'small', 'medium'];
  [0, 1].forEach(p => {
    const xMin = p === 0 ? SPAWN_WIDTH : W - HOME_WIDTH;
    const xMax = p === 0 ? HOME_WIDTH - 1 : W - SPAWN_WIDTH - 1;
    homeSet.forEach((t, i) => {
      const dep = placeDeposit(t, xMin, xMax);
      if (i === 0 && dep) {
        // starting rig on the first medium deposit
        st.players[p].known[dep.id] = true;
        st.rigs.push({ id: 'r' + st.nextId++, owner: p, x: dep.x, y: dep.y, hp: RIG.hp, depId: dep.id });
      }
    });
  });
  // No Man's Sea: random count, always at least 2 rich
  const extra = randInt(st, 3, 5);
  const midTypes = ['rich', 'rich'];
  for (let i = 0; i < extra; i++) midTypes.push(rand(st) < 0.45 ? 'rich' : 'medium');
  midTypes.forEach(t => placeDeposit(t, HOME_WIDTH, W - HOME_WIDTH - 1));

  // Starting fleets: 2 patrol boats each
  [0, 1].forEach(p => {
    const x = p === 0 ? 0 : W - 2;
    [5, 12].forEach(y => addShip(st, p, 'patrol', x, y, 0, true));
  });
}

function addShip(st, owner, type, x, y, rot, ready = false) {
  const def = SHIPS[type];
  const ship = {
    id: 's' + st.nextId++, owner, type, x, y, rot, hp: def.hp,
    movesLeft: 0, acted: !ready, shotsLeft: 0, activeAction: null,
    cooldowns: {}, freeUsed: {}, screenUsed: false, adUsed: false,
  };
  st.ships.push(ship);
  return ship;
}

// ---------- helpers ----------
const enemyOf = p => 1 - p;
export const rigsOwned = (st, p) => st.rigs.filter(r => r.owner === p).length;
export const rigCost = (st, p) => RIG.baseCost + RIG.costPerRig * rigsOwned(st, p);
export const tierUnlocked = (st, p, tier) => rigsOwned(st, p) >= TIER_RIGS[tier];
const passives = s => SHIPS[s.type].passives || {};
const log = (st, p, text) => {
  st.players[p].log.unshift({ turn: st.turnCount, text });
  st.players[p].log.length = Math.min(st.players[p].log.length, 80);
};
const shipAt = (st, x, y, filter = () => true) =>
  st.ships.find(s => filter(s) && shipCells(s).some(([a, b]) => a === x && b === y));
const rigAt = (st, x, y) => st.rigs.find(r => r.x === x && r.y === y);
const depositAt = (st, x, y) => st.deposits.find(d => d.x === x && d.y === y);

function commandBonus(st, ship) {
  const cells = shipCells(ship);
  return st.ships.some(o => o.owner === ship.owner && o.id !== ship.id && passives(o).command &&
    dist(shipCells(o), cells) <= passives(o).command) ? 1 : 0;
}
function fuelLineActive(st, ship) {
  const cells = shipCells(ship);
  return st.ships.some(o => o.owner === ship.owner && o.id !== ship.id && passives(o).fuelLine &&
    dist(shipCells(o), cells) <= passives(o).fuelLine);
}
export function moveCost(st, ship, steps) {
  const rate = SHIPS[ship.type].oil;
  return fuelLineActive(st, ship) ? Math.ceil((steps * rate) / 2) : steps * rate;
}

// ---------- visibility ----------
export function visibility(st, p) {
  const mine = st.ships.filter(s => s.owner === p);
  const myRigs = st.rigs.filter(r => r.owner === p);
  const rev = st.players[p].reveals;
  const ships = new Set(), rigs = new Set();
  const seenBy = cells => {
    for (const s of mine) if (dist(shipCells(s), cells) <= SHIPS[s.type].sight) return true;
    for (const r of myRigs) if (dist([[r.x, r.y]], cells) <= RIG.sight) return true;
    return false;
  };
  for (const e of st.ships) {
    if (e.owner === p) continue;
    const cells = shipCells(e);
    if (rev.ships.includes(e.id)) { ships.add(e.id); continue; }
    if (passives(e).submerged) {
      const near = mine.some(s => dist(shipCells(s), cells) <= 1 ||
        (passives(s).sonar && dist(shipCells(s), cells) <= passives(s).sonar));
      if (near) ships.add(e.id);
    } else if (seenBy(cells)) ships.add(e.id);
  }
  for (const r of st.rigs) {
    if (r.owner === p) continue;
    if (rev.rigs.includes(r.id) || seenBy([[r.x, r.y]])) rigs.add(r.id);
  }
  return { ships, rigs };
}

// Is a footprint legal for `owner`? Hidden enemies are ignored here
// (you can plan a move through fog); they are discovered on contact.
export function placementOk(st, owner, cells, ignoreId, vis) {
  for (const [x, y] of cells) {
    if (!inBounds(x, y) || isLand(st, x, y)) return false;
    const s = shipAt(st, x, y, o => o.id !== ignoreId && (o.owner === owner || vis.ships.has(o.id)));
    if (s) return false;
    const r = rigAt(st, x, y);
    if (r && (r.owner === owner || vis.rigs.has(r.id))) return false;
  }
  return true;
}
function hiddenBlocker(st, owner, cells, ignoreId) {
  for (const [x, y] of cells) {
    const s = shipAt(st, x, y, o => o.id !== ignoreId && o.owner !== owner);
    if (s) return { kind: 'ship', obj: s };
    const r = rigAt(st, x, y);
    if (r && r.owner !== owner) return { kind: 'rig', obj: r };
  }
  return null;
}

// ---------- movement ----------
export function reachable(st, ship) {
  const res = new Map();
  const def = SHIPS[ship.type];
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
  void def;
  return res;
}

function doMove(st, a) {
  const ship = st.ships.find(s => s.id === a.shipId);
  if (!ship || ship.owner !== st.current) return fail('Not your ship.');
  const map = reachable(st, ship);
  const target = map.get(a.x + ',' + a.y);
  if (!target) return fail('Cannot reach that spot.');
  const path = [];
  for (let n = target; n && n.prev; n = map.get(n.prev)) path.unshift(n);
  const p = ship.owner, cost1 = moveCost(st, ship, path.length);
  let steps = 0;
  for (const step of path) {
    const cells = cellsOf(ship.type, step.x, step.y, ship.rot);
    const blk = hiddenBlocker(st, p, cells, ship.id);
    if (blk) {
      st.players[p].reveals[blk.kind === 'ship' ? 'ships' : 'rigs'].push(blk.obj.id);
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
      log(st, enemyOf(p), `One of your mines exploded at ${coord(mine.x, mine.y)}.`);
      if (ship.hp <= 0) sink(st, ship, enemyOf(p));
      break;
    }
  }
  const cost = steps === path.length ? cost1 : moveCost(st, ship, steps);
  st.players[p].oil -= cost;
  ship.movesLeft -= steps;
  return ok();
}

function doRotate(st, a) {
  const ship = st.ships.find(s => s.id === a.shipId);
  if (!ship || ship.owner !== st.current) return fail('Not your ship.');
  if (ship.acted && !passives(ship).hitAndRun) return fail('This ship already acted and cannot move.');
  if (ship.movesLeft < 1) return fail('No movement left.');
  const cost = moveCost(st, ship, 1);
  if (st.players[ship.owner].oil < cost) return fail('Not enough oil.');
  const rot = (ship.rot + 1) % 4;
  // rotate around the ship's middle so it doesn't jump sideways
  const old = shipCells(ship);
  const cx = Math.round(old.reduce((t, c) => t + c[0], 0) / old.length);
  const cy = Math.round(old.reduce((t, c) => t + c[1], 0) / old.length);
  const raw = cellsOf(ship.type, 0, 0, rot);
  const rcx = Math.round(raw.reduce((t, c) => t + c[0], 0) / raw.length);
  const rcy = Math.round(raw.reduce((t, c) => t + c[1], 0) / raw.length);
  const nx = cx - rcx, ny = cy - rcy;
  const cells = cellsOf(ship.type, nx, ny, rot);
  const vis = visibility(st, ship.owner);
  if (!placementOk(st, ship.owner, cells, ship.id, vis)) return fail('No room to turn here.');
  const blk = hiddenBlocker(st, ship.owner, cells, ship.id);
  if (blk) {
    st.players[ship.owner].reveals[blk.kind === 'ship' ? 'ships' : 'rigs'].push(blk.obj.id);
    log(st, ship.owner, 'Turn blocked by an unseen enemy contact!');
    return ok();
  }
  ship.x = nx; ship.y = ny; ship.rot = rot;
  ship.movesLeft -= 1;
  st.players[ship.owner].oil -= cost;
  return ok();
}

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

function doAct(st, a) {
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
    if (!inBounds(x, y)) return fail('Out of bounds.');
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
      const r = rigAt(st, x, y);
      const obj = t || (r && r.owner === p ? r : null);
      if (!obj) return fail('Pick one of your ships or rigs next to the repair ship.');
      const max = t ? SHIPS[t.type].hp : RIG.hp;
      if (obj.hp >= max) return fail('Already at full health.');
      spend(ship, act);
      obj.hp = Math.min(max, obj.hp + act.amount);
      log(st, p, `Repaired ${t ? SHIPS[t.type].name : 'rig'} to ${obj.hp}/${max} HP.`);
      break;
    }
    case 'spoof': {
      spend(ship, act);
      st.players[enemyOf(p)].spoofs.push({ x, y, turn: st.turnCount });
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
  // Firing gives away your rough position for the enemy's next turn.
  const cells = shipCells(ship);
  const [cx, cy] = cells[Math.floor(cells.length / 2)];
  const ox = randInt(st, -1, 1), oy = randInt(st, -1, 1);
  st.players[enemyOf(ship.owner)].flashes.push({ x: cx + ox - 2, y: cy + oy - 2, w: 5, h: 5, turn: st.turnCount });
}

function resolveShot(st, ship, act, tx, ty) {
  const p = ship.owner, e = enemyOf(p);
  const me = st.players[p];
  const record = r => me.shots.push({ x: tx, y: ty, r, turn: st.turnCount });
  st.players[e].incoming.push({ x: tx, y: ty, turn: st.turnCount });

  if (act.air) {
    const fr = st.ships.find(s => s.owner === e && passives(s).airDefense && !s.adUsed &&
      dist(shipCells(s), [[tx, ty]]) <= passives(s).airDefense);
    if (fr) {
      fr.adUsed = true;
      record('intercepted');
      log(st, p, `${act.name} was intercepted by enemy air defense!`);
      log(st, e, `Your Frigate intercepted an incoming ${act.name.toLowerCase()}.`);
      return;
    }
  }
  const squares = [];
  const r = act.area === 3 ? 1 : 0;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++)
    if (inBounds(tx + dx, ty + dy)) squares.push([tx + dx, ty + dy]);

  const hitShips = new Set();
  let anyHit = false, sunkName = null;
  for (const [x, y] of squares) {
    let target = shipAt(st, x, y, s => s.owner === e);
    if (target && act.subsOnly && !passives(target).submerged) target = null;
    if (target && !hitShips.has(target.id)) {
      hitShips.add(target.id);
      // corvette screen
      const tc = shipCells(target);
      const cv = st.ships.find(s => s.owner === e && s.id !== target.id && passives(s).screen && !s.screenUsed &&
        dist(shipCells(s), tc) <= 1);
      if (cv) { cv.screenUsed = true; log(st, e, `Your Corvette screened a hit meant for your ${SHIPS[target.type].name}.`); target = cv; }
      const dmg = Math.max(0, act.dmg - (passives(target).armor || 0));
      target.hp -= dmg;
      anyHit = true;
      log(st, e, `Your ${SHIPS[target.type].name} was hit for ${dmg} damage (${Math.max(0, target.hp)}/${SHIPS[target.type].hp} HP).`);
      if (target.hp <= 0) { sunkName = SHIPS[target.type].name; sink(st, target, p); }
      continue;
    }
    if (!act.subsOnly) {
      const rig = rigAt(st, x, y);
      if (rig && rig.owner === e) {
        rig.hp -= act.dmg * (act.rigMult || 1);
        anyHit = true;
        if (rig.hp <= 0) {
          st.rigs = st.rigs.filter(o => o !== rig);
          log(st, p, `You destroyed an enemy oil rig at ${coord(x, y)}!`);
          log(st, e, `Your oil rig at ${coord(x, y)} was destroyed!`);
          sunkName = sunkName || 'rig';
        } else {
          log(st, e, `Your oil rig at ${coord(x, y)} was hit!`);
        }
      }
    }
  }
  record(sunkName ? 'sunk' : anyHit ? 'hit' : 'miss');
  if (sunkName && sunkName !== 'rig') log(st, p, `You sank an enemy ${sunkName}!`);
  else if (anyHit && !sunkName) log(st, p, `${act.name}: HIT at ${coord(tx, ty)}!`);
  else if (!anyHit) log(st, p, `${act.name}: miss at ${coord(tx, ty)}.`);
}

function sink(st, ship, by) {
  st.ships = st.ships.filter(s => s !== ship);
  st.wrecks.push({ id: 'w' + st.nextId++, cells: shipCells(ship), type: ship.type, value: SHIPS[ship.type].cost });
  log(st, ship.owner, `Your ${SHIPS[ship.type].name} was sunk!`);
  void by;
}

function doScan(st, ship, act, tx, ty) {
  const p = ship.owner, e = enemyOf(p);
  const lo = -Math.floor((act.size - 1) / 2), hi = lo + act.size - 1;
  const box = [];
  for (let dy = lo; dy <= hi; dy++) for (let dx = lo; dx <= hi; dx++)
    if (inBounds(tx + dx, ty + dy)) box.push([tx + dx, ty + dy]);
  const jammers = st.ships.filter(s => s.owner === e && passives(s).jam);
  const jammed = ([x, y]) => jammers.some(j => dist(shipCells(j), [[x, y]]) <= passives(j).jam);
  const clear = box.filter(c => !jammed(c));
  const jam = box.filter(c => jammed(c));
  const rev = st.players[p].reveals;
  let found = 0;
  for (const s of st.ships) {
    if (s.owner !== e || passives(s).submerged) continue;
    if (dist(shipCells(s), clear) === 0 && !rev.ships.includes(s.id)) { rev.ships.push(s.id); found++; }
  }
  for (const r of st.rigs) {
    if (r.owner !== e) continue;
    if (clear.some(([x, y]) => x === r.x && y === r.y) && !rev.rigs.includes(r.id)) { rev.rigs.push(r.id); found++; }
  }
  st.players[p].scans.push({ cells: box, jammed: jam, turn: st.turnCount });
  log(st, p, `${act.name}: ${found ? found + ' contact' + (found > 1 ? 's' : '') + ' found' : 'nothing found'}${jam.length ? ' (signal jammed in part of the area)' : ''}.`);
}

// ---------- economy ----------
function doBuyShip(st, a) {
  const p = st.current, def = SHIPS[a.ship];
  if (!def) return fail('Unknown ship.');
  if (!tierUnlocked(st, p, def.tier)) return fail(`Tier ${def.tier} needs ${TIER_RIGS[def.tier]} rigs.`);
  if (st.players[p].money < def.cost) return fail('Not enough money.');
  const lim = def.passives?.limit;
  if (lim && st.ships.filter(s => s.owner === p && s.type === a.ship).length >= lim) return fail(`Limit ${lim}.`);
  const cells = cellsOf(a.ship, a.x, a.y, a.rot);
  if (!cells.every(([x]) => inSpawn(p, x))) return fail('New ships must be placed in your spawn zone (your back 3 columns).');
  const vis = visibility(st, p);
  if (!placementOk(st, p, cells, null, vis)) return fail('That spot is blocked.');
  const blk = hiddenBlocker(st, p, cells, null);
  if (blk) {
    st.players[p].reveals[blk.kind === 'ship' ? 'ships' : 'rigs'].push(blk.obj.id);
    log(st, p, 'Launch blocked: an enemy is lurking in your spawn zone!');
    return ok();
  }
  st.players[p].money -= def.cost;
  addShip(st, p, a.ship, a.x, a.y, a.rot);
  log(st, p, `Bought a ${def.name}. It will be ready next turn.`);
  return ok();
}

export function rigBuildProblem(st, p, x, y) {
  const dep = depositAt(st, x, y);
  if (!dep || !st.players[p].known[dep.id]) return 'Rigs go on oil deposits you have discovered.';
  const r = rigAt(st, x, y);
  if (r && r.owner === p) return 'You already have a rig here.';
  if (!st.ships.some(s => s.owner === p && dist(shipCells(s), [[x, y]]) <= 1)) return 'One of your ships must be next to the deposit.';
  if (st.players[p].money < rigCost(st, p)) return 'Not enough money.';
  if (shipAt(st, x, y, s => s.owner === p)) return 'Move your ship off the deposit first.';
  return null;
}
function doBuyRig(st, a) {
  const p = st.current;
  const why = rigBuildProblem(st, p, a.x, a.y);
  if (why) return fail(why);
  const blk = hiddenBlocker(st, p, [[a.x, a.y]], null);
  if (blk) {
    st.players[p].reveals[blk.kind === 'ship' ? 'ships' : 'rigs'].push(blk.obj.id);
    log(st, p, blk.kind === 'rig' ? 'This deposit is already claimed by an enemy rig!' : 'An unseen enemy is sitting on this deposit!');
    return ok();
  }
  st.players[p].money -= rigCost(st, p);
  const dep = depositAt(st, a.x, a.y);
  st.rigs.push({ id: 'r' + st.nextId++, owner: p, x: a.x, y: a.y, hp: RIG.hp, depId: dep.id });
  log(st, p, `Built an oil rig at ${coord(a.x, a.y)}.`);
  return ok();
}

export function sellValue(st, amount) {
  let price = st.market.price, total = 0;
  for (let i = 0; i < amount; i++) { total += price; price = Math.max(MARKET.minPrice, price - MARKET.dropPerUnit); }
  return { total: Math.floor(total), price };
}
function doSell(st, a) {
  const p = st.current, me = st.players[p];
  const n = Math.min(Math.floor(a.amount), me.oil);
  if (n <= 0) return fail('No oil to sell.');
  const { total, price } = sellValue(st, n);
  me.oil -= n; me.money += total; st.market.price = price;
  log(st, p, `Sold ${n} oil for $${total}.`);
  return ok();
}

// ---------- turns ----------
function startTurn(st, p, first = false) {
  const me = st.players[p];
  const keep = o => o.turn >= st.turnCount - 1;
  me.incoming = me.incoming.filter(keep);
  me.flashes = me.flashes.filter(keep);
  me.spoofs = me.spoofs.filter(keep);
  me.scans = [];
  me.shots = me.shots.filter(o => o.turn >= st.turnCount - 4);
  me.reveals = { ships: [], rigs: [] };
  st.market.price = Math.min(MARKET.basePrice, st.market.price + MARKET.recoverPerTurn);

  let produced = 0;
  for (const r of st.rigs.filter(r => r.owner === p)) {
    const d = st.deposits.find(d => d.id === r.depId);
    const amt = Math.min(DEPOSITS[d.type].rate, d.reserves);
    d.reserves -= amt; produced += amt;
  }
  for (const s of st.ships.filter(s => s.owner === p && passives(s).mobileRig)) {
    const d = st.deposits.find(d => shipCells(s).some(([x, y]) => x === d.x && y === d.y) && !rigAt(st, d.x, d.y));
    if (d && d.reserves > 0) {
      const amt = Math.min(Math.max(1, DEPOSITS[d.type].rate - 1), d.reserves);
      d.reserves -= amt; produced += amt;
      me.known[d.id] = true;
    }
  }
  me.oil += produced;
  for (const s of st.ships.filter(s => s.owner === p && passives(s).upkeep)) {
    if (me.money >= passives(s).upkeep) me.money -= passives(s).upkeep;
    else { s.hp -= 1; log(st, p, `Couldn't pay upkeep — ${SHIPS[s.type].name} loses 1 HP.`); if (s.hp <= 0) sink(st, s, enemyOf(p)); }
  }
  for (const s of st.ships.filter(s => s.owner === p)) {
    s.acted = false; s.shotsLeft = 0; s.activeAction = null; s.freeUsed = {};
    s.screenUsed = false; s.adUsed = false;
    for (const k in s.cooldowns) s.cooldowns[k] = Math.max(0, s.cooldowns[k] - 1);
    s.movesLeft = SHIPS[s.type].move + commandBonus(st, s);
  }
  const dry = st.rigs.filter(r => r.owner === p && st.deposits.find(d => d.id === r.depId).reserves === 0).length;
  if (!first) log(st, p, `Turn ${Math.ceil(st.turnCount / 2)}: rigs produced ${produced} oil.${dry ? ` ${dry} rig${dry > 1 ? 's have' : ' has'} run dry.` : ''}`);
  else log(st, p, 'Your fleet is ready. Survey for oil, build rigs, and outlast the enemy.');
  checkWin(st);
}

function checkWin(st) {
  if (st.phase !== 'playing') return;
  for (const p of [0, 1]) {
    const alive = st.ships.some(s => s.owner === p) || st.rigs.some(r => r.owner === p) || st.players[p].money >= 60;
    if (!alive) { st.phase = 'over'; st.winner = enemyOf(p); }
  }
}

// ---------- entry point ----------
const ok = () => ({ ok: true });
const fail = error => ({ ok: false, error });
export const coord = (x, y) => `${String.fromCharCode(65 + (y % 26))}${x + 1}`;

export function applyAction(st, a) {
  if (st.phase !== 'playing') return fail('Game over.');
  switch (a.type) {
    case 'move': return doMove(st, a);
    case 'rotate': return doRotate(st, a);
    case 'act': return doAct(st, a);
    case 'buyShip': return doBuyShip(st, a);
    case 'buyRig': return doBuyRig(st, a);
    case 'sell': return doSell(st, a);
    case 'endTurn': {
      st.turnCount++;
      st.current = enemyOf(st.current);
      startTurn(st, st.current);
      return ok();
    }
    case 'surrender': {
      st.phase = 'over'; st.winner = enemyOf(st.current);
      return ok();
    }
  }
  return fail('Unknown action.');
}

// What player p is allowed to see. The UI draws only this, so in online
// play you could send each player just their own view.
export function getView(st, p) {
  const vis = visibility(st, p);
  const me = st.players[p];
  return {
    me, p,
    myShips: st.ships.filter(s => s.owner === p),
    myRigs: st.rigs.filter(r => r.owner === p),
    myMines: st.mines.filter(m => m.owner === p),
    enemyShips: st.ships.filter(s => s.owner !== p && vis.ships.has(s.id)).map(s => ({ id: s.id, cells: shipCells(s) })),
    enemyRigs: st.rigs.filter(r => r.owner !== p && vis.rigs.has(r.id)),
    deposits: st.deposits.filter(d => me.known[d.id]),
    wrecks: st.wrecks,
  };
}
