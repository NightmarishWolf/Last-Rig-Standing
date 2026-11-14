// Creating a new game: home layouts, islands, oil deposits and starting fleets.
import { DEPOSITS, MARKET, RIG, START } from '../data/economy.js';
import { MAP_SIZES, PLAYER_NAMES } from '../data/maps.js';
import { SHIPS } from '../data/ships.js';
import { cellsOf, inRect, inSpawn, isLand, zoneOf } from './geometry.js';
import { rand, randInt } from './rng.js';
import { startTurn } from './turns.js';

export const SPAWN_DEPTH = 3;

// Home waters and spawn strips for each player count.
function layoutHomes(W, H, n) {
  const homes = [];
  if (n === 2) {
    const hw = Math.round(W * 0.3);
    homes.push({ home: { x0: 0, y0: 0, x1: hw - 1, y1: H - 1 }, spawn: { x0: 0, y0: 0, x1: SPAWN_DEPTH - 1, y1: H - 1 } });
    homes.push({ home: { x0: W - hw, y0: 0, x1: W - 1, y1: H - 1 }, spawn: { x0: W - SPAWN_DEPTH, y0: 0, x1: W - 1, y1: H - 1 } });
    return homes;
  }
  const hw = Math.round(W * 0.3), hh = Math.max(7, Math.round(H * 0.42));
  const corner = (left, top) => {
    const x0 = left ? 0 : W - hw, y0 = top ? 0 : H - hh;
    const home = { x0, y0, x1: x0 + hw - 1, y1: y0 + hh - 1 };
    const spawn = left ? { x0: 0, y0, x1: SPAWN_DEPTH - 1, y1: home.y1 } : { x0: W - SPAWN_DEPTH, y0, x1: W - 1, y1: home.y1 };
    return { home, spawn };
  };
  homes.push(corner(true, true), corner(false, true));
  if (n === 3) {
    const x0 = Math.round((W - hw) / 2), y0 = H - hh;
    homes.push({ home: { x0, y0, x1: x0 + hw - 1, y1: H - 1 }, spawn: { x0, y0: H - SPAWN_DEPTH, x1: x0 + hw - 1, y1: H - 1 } });
  } else {
    homes.push(corner(false, false), corner(true, false)); // clockwise turn order
  }
  return homes;
}

// ---------- new game ----------
// opts: { size: 'standard', players: 2, seats: ['human', 'human', ...], seed }
export function newGame(opts = {}) {
  const size = MAP_SIZES[opts.size] ? opts.size : 'standard';
  const n = Math.min(MAP_SIZES[size].maxPlayers, Math.max(2, opts.players || 2));
  const { w: W, h: H } = MAP_SIZES[size];
  const seed = opts.seed ?? Math.floor(Math.random() * 1e9);
  const layout = layoutHomes(W, H, n);
  const st = {
    version: 2, seed, rng: seed, size, W, H,
    turnCount: 1, round: 1, current: 0,
    turnTimer: opts.turnTimer ?? 90, // seconds per turn, 0 = off
    domination: opts.domination ?? true, // Domination victory on/off
    winReason: null,
    phase: 'playing', winner: null, nextId: 1,
    land: new Array(W * H).fill(0),
    deposits: [], ships: [], rigs: [], ports: [], mines: [], wrecks: [],
    market: { price: MARKET.basePrice },
    players: layout.map((l, i) => ({
      name: PLAYER_NAMES[i], seat: (opts.seats && opts.seats[i]) || 'human', out: false,
      home: l.home, spawn: l.spawn,
      money: START.money, oil: START.oil, known: {}, surveyed: {}, prevTurn: 0, domStreak: 0,
      shots: [], incoming: [], flashes: [], spoofs: [], scans: [],
      reveals: { ships: [], rigs: [] }, log: [],
    })),
  };
  generateMap(st);
  startTurn(st, 0, true);
  return st;
}

function generateMap(st) {
  const { W, H } = st;
  const nearHome = (x, y) => st.players.some(pl => x >= pl.home.x0 - 1 && x <= pl.home.x1 + 1 && y >= pl.home.y0 - 1 && y <= pl.home.y1 + 1);
  // Islands only in No Man's Sea
  const islands = Math.round((W * H) / 70) + randInt(st, -1, 2);
  for (let i = 0; i < islands; i++) {
    let x, y, tries = 0;
    do { x = randInt(st, 1, W - 2); y = randInt(st, 1, H - 2); } while (nearHome(x, y) && ++tries < 200);
    if (tries >= 200) continue;
    const size = randInt(st, 2, 6);
    for (let k = 0; k < size; k++) {
      if (!nearHome(x, y)) st.land[y * W + x] = 1;
      const d = randInt(st, 0, 3);
      x = Math.min(W - 2, Math.max(1, x + [1, -1, 0, 0][d]));
      y = Math.min(H - 2, Math.max(1, y + [0, 0, 1, -1][d]));
    }
  }
  // Deposits prefer 3 squares of spacing, but squeeze closer if a home is cramped,
  // so every player always gets the exact same set.
  const pickReserves = (type, where) => { const [a, b] = DEPOSITS[type][where]; return randInt(st, a, b); };
  const placeDeposit = (type, ok, reserves) => {
    for (let tries = 0; tries < 3000; tries++) {
      const x = randInt(st, 0, W - 1), y = randInt(st, 0, H - 1);
      if (!ok(x, y) || isLand(st, x, y)) continue;
      const spacing = tries < 1500 ? 3 : tries < 2500 ? 2 : 1;
      if (st.deposits.some(d => Math.max(Math.abs(d.x - x), Math.abs(d.y - y)) < spacing)) continue;
      const dep = { id: 'd' + st.nextId++, x, y, type, reserves, max: reserves };
      st.deposits.push(dep);
      return dep;
    }
    return null;
  };
  // Equal home deposits for every player (same types, independent positions)
  const homeSet = ['medium', 'small', 'small', 'small', 'medium', ...MAP_SIZES[st.size].extraHome];
  const homeReserves = homeSet.map(t => pickReserves(t, 'home')); // same amounts for everyone
  st.players.forEach((pl, p) => {
    homeSet.forEach((t, i) => {
      const dep = placeDeposit(t, (x, y) => inRect(pl.home, x, y) && !inRect(pl.spawn, x, y), homeReserves[i]);
      if (i === 0 && dep) {
        pl.known[dep.id] = true; // starting rig on the first medium deposit
        st.rigs.push({ id: 'r' + st.nextId++, owner: p, x: dep.x, y: dep.y, hp: RIG.hp, depId: dep.id });
      }
    });
  });
  // No Man's Sea: scales with map size and player count, always at least 2 rich
  const middleCells = W * H - st.players.reduce((t, pl) => t + (pl.home.x1 - pl.home.x0 + 1) * (pl.home.y1 - pl.home.y0 + 1), 0);
  const count = Math.max(4, Math.round(middleCells / 45) + randInt(st, -1, 1) + (st.players.length - 2));
  const midTypes = ['rich', 'rich'];
  while (midTypes.length < count) midTypes.push(rand(st) < 0.45 ? 'rich' : 'medium');
  midTypes.forEach(t => placeDeposit(t, (x, y) => zoneOf(st, x, y) === 'middle', pickReserves(t, 'middle')));

  // Starting fleets: 2 patrol boats each, spread out in the spawn strip
  st.players.forEach((pl, p) => {
    const spots = [];
    for (let y = pl.spawn.y0; y <= pl.spawn.y1; y++)
      for (let x = pl.spawn.x0; x <= pl.spawn.x1; x++) {
        const cells = cellsOf('patrol', x, y, 0);
        if (cells.every(([a, b]) => inSpawn(st, p, a, b) && !isLand(st, a, b))) spots.push([x, y]);
      }
    // prefer the outer edge of the spawn strip
    const horizontal = pl.spawn.x1 - pl.spawn.x0 > pl.spawn.y1 - pl.spawn.y0;
    const outerX = pl.spawn.x0 === 0 ? 0 : st.W - 2;
    const edge = spots.filter(([x, y]) => (horizontal ? y === pl.spawn.y1 : x === outerX));
    const pool = edge.length >= 2 ? edge : spots;
    [Math.floor(pool.length * 0.25), Math.floor(pool.length * 0.75)].forEach(i => addShip(st, p, 'patrol', pool[i][0], pool[i][1], 0, true));
  });
}

export function addShip(st, owner, type, x, y, rot, ready = false) {
  const def = SHIPS[type];
  const ship = {
    id: 's' + st.nextId++, owner, type, x, y, rot, hp: def.hp,
    movesLeft: 0, acted: !ready, shotsLeft: 0, activeAction: null,
    cooldowns: {}, freeUsed: {}, screenUsed: false, adUsed: false,
  };
  st.ships.push(ship);
  return ship;
}
