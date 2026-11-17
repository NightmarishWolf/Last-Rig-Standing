// Creating a new game: home layouts, islands, oil deposits and starting fleets.
import { DEPOSITS, MARKET, RIG, START } from '../data/economy.js';
import { BOT_NAMES, DIFFICULTY, PERSONALITIES } from '../data/bots.js';
import { HOME_SCALE, MAP_SIZES, PLAYER_NAMES, WATER_PER_DEPOSIT } from '../data/maps.js';
import { SHIPS } from '../data/ships.js';
import { cellsOf, inRect, inSpawn, isLand, zoneOf } from './geometry.js';
import { rand, randInt } from './rng.js';
import { generateTerrain } from './terrain.js';
import { findPath } from './pathfind.js';
import { startTurn } from './turns.js';
import { foundBase } from './bases.js';
import { shipStat } from './modifiers.js';
import { newResearch } from './research.js';

export const SPAWN_DEPTH = 3;

// Home waters and spawn strips for big worlds: square home waters, spread apart,
// each with a spawn strip along its outer map edge.
function layoutWorld(W, H, n) {
  const hs = Math.round(Math.min(W, H) * HOME_SCALE);
  const at = (x0, y0, edge) => {
    const home = { x0, y0, x1: x0 + hs - 1, y1: y0 + hs - 1 };
    const spawn = edge === 'left' ? { x0: 0, y0, x1: SPAWN_DEPTH - 1, y1: home.y1 }
      : edge === 'right' ? { x0: W - SPAWN_DEPTH, y0, x1: W - 1, y1: home.y1 }
      : { x0, y0: H - SPAWN_DEPTH, x1: home.x1, y1: H - 1 };
    return { home, spawn };
  };
  const midY = Math.round((H - hs) / 2), midX = Math.round((W - hs) / 2);
  if (n === 2) return [at(0, midY, 'left'), at(W - hs, midY, 'right')];
  const homes = [at(0, 0, 'left'), at(W - hs, 0, 'right')];
  if (n === 3) homes.push(at(midX, H - hs, 'bottom'));
  else homes.push(at(W - hs, H - hs, 'right'), at(0, H - hs, 'left')); // clockwise turn order
  return homes;
}

// The original small arena layout (now only used by the tutorial map).
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

// A seat: 'human' (default), or { seat: 'ai', difficulty, personality } for a computer player.
function seatOf(o, i, seed) {
  if (!o || o === 'human' || o.seat === 'human') return { name: PLAYER_NAMES[i], seat: 'human', out: false };
  const difficulty = DIFFICULTY[o.difficulty] ? o.difficulty : 'normal';
  const personality = PERSONALITIES[o.personality] ? o.personality : 'admiral';
  return {
    name: PLAYER_NAMES[i], seat: 'ai', out: false,
    ai: { difficulty, personality, rng: (seed * 31 + i * 7919) % 2147483647 || 1, mem: {} },
    bonus: DIFFICULTY[difficulty].bonus || null,
  };
}

// ---------- new game ----------
// opts: { size: 'standard', players: 2, seats: ['human', { seat: 'ai', difficulty, personality }, ...], seed }
export function newGame(opts = {}) {
  const size = MAP_SIZES[opts.size] ? opts.size : 'standard';
  const n = Math.min(MAP_SIZES[size].maxPlayers, Math.max(2, opts.players || 2));
  const { w: W, h: H } = MAP_SIZES[size];
  const seed = opts.seed ?? Math.floor(Math.random() * 1e9);
  const layout = MAP_SIZES[size].classic ? layoutHomes(W, H, n) : layoutWorld(W, H, n);
  const st = {
    version: 3, seed, rng: seed, size, W, H,
    // mirrored map (default): every player's side of the map is the same, so nobody starts with better
    // islands or closer oil. Off = a fully random map.
    mirror: opts.mirror !== false && !MAP_SIZES[size].classic,
    // simultaneous rounds: everyone plays at once and the round ends when all are ready (actions.js)
    simul: !!opts.simultaneous,
    turnCount: 1, round: 1, current: 0,
    turnTimer: opts.turnTimer ?? 90, // seconds per turn, 0 = off
    victory: { domination: true, postoil: true, lastrig: true, ...(opts.victory || {}) }, // which victories are on (Conquest always is)
    winReason: null,
    phase: 'playing', winner: null, nextId: 1,
    land: new Array(W * H).fill(0),
    deposits: [], ships: [], rigs: [], ports: [], mines: [], wrecks: [], bases: [], platforms: [], fleets: [],
    market: { price: MARKET.basePrice },
    players: layout.map((l, i) => ({
      ...seatOf(opts.seats && opts.seats[i], i, seed),
      home: l.home, spawn: l.spawn,
      money: START.money, oil: START.oil, known: {}, surveyed: {}, prevTurn: 0, domStreak: 0, exile: null, research: newResearch(),
      builds: [], explored: {},
      shots: [], incoming: [], flashes: [], spoofs: [], scans: [],
      reveals: { ships: [], rigs: [], ports: [], platforms: [] }, log: [],
    })),
  };
  // the same bot never shows up twice
  const usedNames = new Set();
  for (const pl of st.players) if (pl.seat === 'ai') {
    let k = (pl.ai.rng + st.players.indexOf(pl)) % BOT_NAMES.length;
    while (usedNames.has(k)) k = (k + 1) % BOT_NAMES.length;
    usedNames.add(k); pl.name = BOT_NAMES[k];
  }
  generateMap(st);
  st.oilTotal = st.deposits.reduce((t, d) => t + d.reserves, 0); // for Last Rig Standing
  if (st.simul) { st.ready = st.players.map(() => false); st.players.forEach((_, p) => startTurn(st, p, true)); st.current = 0; }
  else startTurn(st, 0, true);
  return st;
}

function generateMap(st) {
  if (MAP_SIZES[st.size].classic) return generateClassic(st);
  const { W, H } = st;
  const cfg = MAP_SIZES[st.size];
  // terrain: try a few worlds until every home shares one ocean
  // (and warships, not just one-square boats, must be able to sail from every home to every other)
  let okWorld = false;
  for (let attempt = 0; attempt < 8 && !okWorld; attempt++) okWorld = generateTerrain(st, cfg.landShare) && warshipsCanCross(st);
  if (!okWorld) { st.land.fill(0); generateTerrain(st, cfg.landShare * 0.5) || st.land.fill(0); }
  if (!warshipsCanCross(st)) carveSeaLanes(st);

  const pickReserves = (type, where) => { const [a, b] = DEPOSITS[type][where]; return randInt(st, a, b); };
  const placeDeposit = (type, rect, ok, reserves) => {
    for (let tries = 0; tries < 4000; tries++) {
      const x = randInt(st, rect.x0, rect.x1), y = randInt(st, rect.y0, rect.y1);
      if (!ok(x, y) || isLand(st, x, y)) continue;
      const spacing = tries < 2000 ? 4 : tries < 3200 ? 2 : 1;
      if (st.deposits.some(d => Math.max(Math.abs(d.x - x), Math.abs(d.y - y)) < spacing)) continue;
      const dep = { id: 'd' + st.nextId++, x, y, type, reserves, max: reserves };
      st.deposits.push(dep);
      return dep;
    }
    return null;
  };
  // equal home deposits for every player (same types and amounts; on a mirrored map, mirrored positions too)
  const homeSet = ['medium', 'small', 'small', 'small', 'medium', ...cfg.extraHome];
  const homeReserves = homeSet.map(t => pickReserves(t, 'home'));
  const sym = st.mirror ? symmetry(st) : null;
  if (sym) {
    // place player 1's deposits, then copy them to each mirrored player (a 3rd player at the bottom gets its own)
    homeSet.forEach((t, i) => {
      const dep = placeDeposit(t, st.players[0].home, (x, y) => !inRect(st.players[0].spawn, x, y), homeReserves[i]);
      if (!dep) return;
      sym.images(dep.x, dep.y).forEach(([x, y], k) => {
        const p = sym.players[k];
        const d = k === 0 ? dep : addDeposit(st, t, x, y, homeReserves[i]);
        if (i === 0) { st.players[p].known[d.id] = true; foundBase(st, p, d, true); }
      });
    });
  }
  st.players.forEach((pl, p) => {
    if (sym && sym.players.includes(p)) return; // already done
    homeSet.forEach((t, i) => {
      const dep = placeDeposit(t, pl.home, (x, y) => !inRect(pl.spawn, x, y), homeReserves[i]);
      if (i === 0 && dep) {
        pl.known[dep.id] = true; // starting rig on the first medium deposit
        foundBase(st, p, dep, true); // your Admiralty: the starting rig base
      }
    });
  });
  // No Man's Sea: about one deposit per WATER_PER_DEPOSIT open-water squares, ~40% rich
  let water = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!isLand(st, x, y) && zoneOf(st, x, y) === 'middle') water++;
  const count = Math.max(6, Math.round(water / WATER_PER_DEPOSIT));
  const midTypes = ['rich', 'rich'];
  while (midTypes.length < count) midTypes.push(rand(st) < 0.4 ? 'rich' : 'medium');
  const whole = { x0: 0, y0: 0, x1: W - 1, y1: H - 1 };
  if (sym) {
    // place in one mirrored section and copy (squares on the mirror line would copy onto themselves: skip them)
    const n = Math.max(1, Math.round(midTypes.length / sym.parts));
    midTypes.slice(0, n).forEach(t => {
      const res = pickReserves(t, 'middle');
      const dep = placeDeposit(t, sym.section, (x, y) => zoneOf(st, x, y) === 'middle' && sym.images(x, y).every(([a, b], k) => k === 0 || a !== x || b !== y), res);
      if (dep) sym.images(dep.x, dep.y).slice(1).forEach(([x, y]) => addDeposit(st, t, x, y, res));
    });
  } else midTypes.forEach(t => placeDeposit(t, whole, (x, y) => zoneOf(st, x, y) === 'middle', pickReserves(t, 'middle')));
  placeStartingFleets(st);
  giveHeadStarts(st);
}

// Hard and Admiral+ bots cheat with a head start (js/data/bots.js): extra Survey Ships, money and rig bases.
function giveHeadStarts(st) {
  st.players.forEach((pl, p) => {
    const start = pl.seat === 'ai' && DIFFICULTY[pl.ai.difficulty].start;
    if (!start) return;
    pl.money += start.money || 0;
    // extra rig bases on its own home deposits (the richest ones not already taken)
    for (let i = 0; i < (start.bases || 0); i++) {
      const dep = st.deposits.filter(d => inRect(pl.home, d.x, d.y) && !st.rigs.some(r => r.depId === d.id))
        .sort((a, b) => b.reserves - a.reserves)[0];
      if (!dep) break;
      pl.known[dep.id] = true;
      foundBase(st, p, dep, false);
    }
    // extra Survey Ships anywhere free in the spawn strip
    let n = start.survey || 0;
    for (let y = pl.spawn.y0; y <= pl.spawn.y1 && n > 0; y += 3)
      for (let x = pl.spawn.x0; x <= pl.spawn.x1 && n > 0; x++) {
        const near = st.ships.some(s => E_cells(s).some(([a, b]) => Math.abs(a - x) <= 1 && Math.abs(b - y) <= 1));
        if (near || isLand(st, x, y) || !inSpawn(st, p, x, y)) continue;
        addShip(st, p, 'survey', x, y, 0, true); n--;
      }
  });
}

// Can a Cruiser (a long ship that needs room to turn) sail from player 1's spawn strip to every other one?
function warshipsCanCross(st) {
  const grid = Uint8Array.from(st.land);
  const spotIn = rect => {
    for (const r of [1, 0]) for (let y = rect.y0; y <= rect.y1; y++) for (let x = rect.x0; x <= rect.x1; x++)
      if (cellsOf('cruiser', x, y, r).every(([a, b]) => inRect(rect, a, b) && !grid[b * st.W + a])) return { x, y, r };
    return null;
  };
  const a = spotIn(st.players[0].spawn);
  if (!a) return false;
  const ship = { type: 'cruiser', x: a.x, y: a.y, rot: a.r, owner: 0 };
  return st.players.slice(1).every(pl => { const b = spotIn(pl.spawn); return b && findPath(st, ship, b.x, b.y, null, grid) != null; });
}
// Last resort: open 5-square-wide sea lanes between the homes (straight through, kept symmetric).
function carveSeaLanes(st) {
  const { W, H } = st;
  const open = (x, y) => { if (x >= 0 && y >= 0 && x < W && y < H) st.land[y * W + x] = 0; };
  const mid = pl => ({ x: Math.round((pl.home.x0 + pl.home.x1) / 2), y: Math.round((pl.home.y0 + pl.home.y1) / 2) });
  const rows = new Set(st.players.map(pl => mid(pl).y));
  for (const y of rows) for (let x = 0; x < W; x++) for (let d = -2; d <= 2; d++) open(x, y + d);
  if (st.players.length > 2) {
    const cols = new Set(st.players.map(pl => mid(pl).x));
    if (st.players.length === 3) cols.add(Math.floor(W / 2)).add(W - 1 - Math.floor(W / 2));
    for (const x of cols) for (let y = 0; y < H; y++) for (let d = -2; d <= 2; d++) open(x + d, y);
  }
}

// Map symmetry for fair maps: the mirror images of a square (the first is the square itself), which
// player owns the home each image falls in, how many parts the map splits into, and the section to place in.
function symmetry(st) {
  const { W, H } = st, n = st.players.length;
  if (n === 4) return {
    parts: 4, players: [0, 1, 2, 3], section: { x0: 0, y0: 0, x1: Math.floor(W / 2) - 1, y1: Math.floor(H / 2) - 1 },
    images: (x, y) => [[x, y], [W - 1 - x, y], [W - 1 - x, H - 1 - y], [x, H - 1 - y]],
  };
  return { parts: 2, players: [0, 1], section: { x0: 0, y0: 0, x1: Math.floor(W / 2) - 1, y1: H - 1 }, images: (x, y) => [[x, y], [W - 1 - x, y]] };
}
function addDeposit(st, type, x, y, reserves) {
  const dep = { id: 'd' + st.nextId++, x, y, type, reserves, max: reserves };
  st.deposits.push(dep);
  return dep;
}

// Starting fleets: 2 patrol boats and 2 survey ships each, spread out along the outer edge of the spawn strip
function placeStartingFleets(st) {
  st.players.forEach((pl, p) => {
    const spots = [];
    for (let y = pl.spawn.y0; y <= pl.spawn.y1; y++)
      for (let x = pl.spawn.x0; x <= pl.spawn.x1; x++) {
        const cells = cellsOf('patrol', x, y, 0);
        if (cells.every(([a, b]) => inSpawn(st, p, a, b) && !isLand(st, a, b))) spots.push([x, y]);
      }
    const horizontal = pl.spawn.x1 - pl.spawn.x0 > pl.spawn.y1 - pl.spawn.y0;
    const outerX = pl.spawn.x0 === 0 ? 0 : st.W - 2;
    const edge = spots.filter(([x, y]) => (horizontal ? y === pl.spawn.y1 : x === outerX));
    const pool = edge.length >= 2 ? edge : spots;
    [Math.floor(pool.length * 0.4), Math.floor(pool.length * 0.6)].forEach(i => addShip(st, p, 'patrol', pool[i][0], pool[i][1], 0, true));
    // survey ships further out along the strip (they're one square, so any free spot will do)
    for (const f of [0.2, 0.8]) {
      const free = ([x, y]) => !st.ships.some(s => E_cells(s).some(([a, b]) => Math.abs(a - x) <= 1 && Math.abs(b - y) <= 1));
      const order = [...spots].sort((a, b) => Math.abs(spots.indexOf(a) - spots.length * f) - Math.abs(spots.indexOf(b) - spots.length * f));
      const pick = [Math.floor(pool.length * f)].map(i => pool[i]).find(c => c && free(c)) || order.find(free);
      if (pick) addShip(st, p, 'survey', pick[0], pick[1], 0, true);
    }
  });
}
const E_cells = s => cellsOf(s.type, s.x, s.y, s.rot);

// The original small-arena generator (tutorial only).
function generateClassic(st) {
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
        foundBase(st, p, dep, true); // your Admiralty: the starting rig base
      }
    });
  });
  // No Man's Sea: scales with map size and player count, always at least 2 rich
  const middleCells = W * H - st.players.reduce((t, pl) => t + (pl.home.x1 - pl.home.x0 + 1) * (pl.home.y1 - pl.home.y0 + 1), 0);
  const count = Math.max(4, Math.round(middleCells / 45) + randInt(st, -1, 1) + (st.players.length - 2));
  const midTypes = ['rich', 'rich'];
  while (midTypes.length < count) midTypes.push(rand(st) < 0.45 ? 'rich' : 'medium');
  midTypes.forEach(t => placeDeposit(t, (x, y) => zoneOf(st, x, y) === 'middle', pickReserves(t, 'middle')));

  // Can a Cruiser (a long ship that needs room to turn) sail from player 1's spawn strip to every other one?
function warshipsCanCross(st) {
  const grid = Uint8Array.from(st.land);
  const spotIn = rect => {
    for (const r of [1, 0]) for (let y = rect.y0; y <= rect.y1; y++) for (let x = rect.x0; x <= rect.x1; x++)
      if (cellsOf('cruiser', x, y, r).every(([a, b]) => inRect(rect, a, b) && !grid[b * st.W + a])) return { x, y, r };
    return null;
  };
  const a = spotIn(st.players[0].spawn);
  if (!a) return false;
  const ship = { type: 'cruiser', x: a.x, y: a.y, rot: a.r, owner: 0 };
  return st.players.slice(1).every(pl => { const b = spotIn(pl.spawn); return b && findPath(st, ship, b.x, b.y, null, grid) != null; });
}
// Last resort: open 5-square-wide sea lanes between the homes (straight through, kept symmetric).
function carveSeaLanes(st) {
  const { W, H } = st;
  const open = (x, y) => { if (x >= 0 && y >= 0 && x < W && y < H) st.land[y * W + x] = 0; };
  const mid = pl => ({ x: Math.round((pl.home.x0 + pl.home.x1) / 2), y: Math.round((pl.home.y0 + pl.home.y1) / 2) });
  const rows = new Set(st.players.map(pl => mid(pl).y));
  for (const y of rows) for (let x = 0; x < W; x++) for (let d = -2; d <= 2; d++) open(x, y + d);
  if (st.players.length > 2) {
    const cols = new Set(st.players.map(pl => mid(pl).x));
    if (st.players.length === 3) cols.add(Math.floor(W / 2)).add(W - 1 - Math.floor(W / 2));
    for (const x of cols) for (let y = 0; y < H; y++) for (let d = -2; d <= 2; d++) open(x + d, y);
  }
}

// Map symmetry for fair maps: the mirror images of a square (the first is the square itself), which
// player owns the home each image falls in, how many parts the map splits into, and the section to place in.
function symmetry(st) {
  const { W, H } = st, n = st.players.length;
  if (n === 4) return {
    parts: 4, players: [0, 1, 2, 3], section: { x0: 0, y0: 0, x1: Math.floor(W / 2) - 1, y1: Math.floor(H / 2) - 1 },
    images: (x, y) => [[x, y], [W - 1 - x, y], [W - 1 - x, H - 1 - y], [x, H - 1 - y]],
  };
  return { parts: 2, players: [0, 1], section: { x0: 0, y0: 0, x1: Math.floor(W / 2) - 1, y1: H - 1 }, images: (x, y) => [[x, y], [W - 1 - x, y]] };
}
function addDeposit(st, type, x, y, reserves) {
  const dep = { id: 'd' + st.nextId++, x, y, type, reserves, max: reserves };
  st.deposits.push(dep);
  return dep;
}

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
    id: 's' + st.nextId++, owner, type, x, y, rot, hp: shipStat(st, owner, type, 'hp'),
    movesLeft: 0, acted: !ready, shotsLeft: 0, activeAction: null,
    cooldowns: {}, freeUsed: {}, screenUsed: false, adUsed: false,
  };
  st.ships.push(ship);
  return ship;
}
