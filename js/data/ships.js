// ============================================================
// SHIP DATA — tweak balance here. Every number in the game
// that describes a ship lives in this file.
//
// shape: list of [x, y] squares in the default (horizontal) facing.
// oil:   oil burned per square moved (and per 90° turn).
// move:  max squares per turn.
// tier:  1 = always available, 2 = needs TIER_RIGS[2] rigs, 3 = needs TIER_RIGS[3].
// sight: how far (squares) this ship automatically spots surface enemies.
// actions: what the ship can do with its one action per turn.
//   attack: { range, dmg, shots, area (1 or 3), subsOnly, rigMult, air, cooldown }
//   scan:   reveals enemy ships/rigs in a size×size box within range.
//   survey: reveals oil deposits within `radius` of the ship.
//   mine, repair, spoof, salvage: see engine.js.
//   free: true means it does not use up the ship's action.
// passives: armor, submerged, sonar, screen, airDefense, fuelLine,
//   mobileRig, command, jam, hitAndRun, upkeep, limit.
// ============================================================

export const TIER_RIGS = { 1: 0, 2: 3, 3: 5 };

export const RIG = {
  name: 'Oil Rig',
  baseCost: 200,
  costPerRig: 50, // each rig you already own adds this to the price
  hp: 2,
  sight: 1,
};

export const DEPOSITS = {
  small: { rate: 2, reserves: 30, label: 'S' },
  medium: { rate: 3, reserves: 45, label: 'M' },
  rich: { rate: 5, reserves: 70, label: 'R' },
};

export const MARKET = {
  basePrice: 15,   // $ per oil when the market is calm
  minPrice: 4,
  dropPerUnit: 0.25, // every unit sold lowers the price this much
  recoverPerTurn: 1,
};

export const START = { money: 400, oil: 12 };

// Map sizes offered on the new-game screen.
// extraHome: deposits added to every player's home waters on bigger maps.
export const MAP_SIZES = {
  small:    { name: 'Small',    w: 24, h: 14, maxPlayers: 3, extraHome: [] },
  standard: { name: 'Standard', w: 30, h: 18, maxPlayers: 4, extraHome: [] },
  large:    { name: 'Large',    w: 40, h: 24, maxPlayers: 4, extraHome: ['small', 'medium'] },
  huge:     { name: 'Huge',     w: 52, h: 30, maxPlayers: 4, extraHome: ['small', 'small', 'medium'] },
};

// Each player's colour (ships, rigs, labels).
export const PLAYER_COLORS = ['#2bb3a3', '#f08a3c', '#a87cf0', '#d9c84a'];
export const PLAYER_NAMES = ['Player 1', 'Player 2', 'Player 3', 'Player 4'];

export const SHIPS = {
  // ---------- Tier 1 ----------
  patrol: {
    name: 'Patrol Boat', tier: 1, cost: 100, hp: 2, oil: 1, move: 4, sight: 2,
    shape: [[0, 0], [1, 0]],
    actions: [
      { id: 'gun', kind: 'attack', name: 'Light Gun', range: 3, dmg: 1 },
      { id: 'ping', kind: 'scan', name: 'Radar Ping', range: 4, size: 3, cooldown: 2 },
      { id: 'survey', kind: 'survey', name: 'Survey', radius: 1 },
    ],
  },
  survey: {
    name: 'Survey Ship', tier: 1, cost: 150, hp: 1, oil: 1, move: 5, sight: 3,
    shape: [[0, 0]],
    actions: [{ id: 'deep', kind: 'survey', name: 'Deep Survey', radius: 2 }],
  },
  corvette: {
    name: 'Corvette', tier: 1, cost: 150, hp: 2, oil: 1, move: 4, sight: 2,
    shape: [[0, 0], [1, 0]],
    passives: { screen: true },
    actions: [{ id: 'gun', kind: 'attack', name: 'Light Gun', range: 3, dmg: 1 }],
  },
  hydrofoil: {
    name: 'Hydrofoil Raider', tier: 1, cost: 200, hp: 1, oil: 1, move: 6, sight: 2,
    shape: [[0, 0], [1, 0]],
    passives: { hitAndRun: true },
    actions: [{ id: 'rockets', kind: 'attack', name: 'Rockets', range: 2, dmg: 2 }],
  },
  decoy: {
    name: 'Decoy Barge', tier: 1, cost: 60, hp: 1, oil: 1, move: 2, sight: 1,
    shape: [[0, 0], [1, 0], [2, 0]],
    actions: [],
  },
  minelayer: {
    name: 'Minelayer', tier: 1, cost: 200, hp: 2, oil: 2, move: 3, sight: 2,
    shape: [[0, 0], [0, 1], [1, 1]],
    actions: [{ id: 'mine', kind: 'mine', name: 'Lay Mine', max: 3, dmg: 2 }],
  },
  submarine: {
    name: 'Submarine', tier: 1, cost: 250, hp: 3, oil: 2, move: 3, sight: 2,
    shape: [[0, 0], [1, 0], [2, 0]],
    passives: { submerged: true },
    actions: [{ id: 'torpedo', kind: 'attack', name: 'Torpedo', range: 4, dmg: 3 }],
  },
  tanker: {
    name: 'Tanker', tier: 1, cost: 200, hp: 4, oil: 1, move: 3, sight: 2,
    shape: [[0, 0], [1, 0], [2, 0], [3, 0]],
    passives: { fuelLine: 2 },
    actions: [],
  },

  // ---------- Tier 2 ----------
  destroyer: {
    name: 'Destroyer', tier: 2, cost: 300, hp: 4, oil: 2, move: 3, sight: 2,
    shape: [[0, 0], [1, 0], [2, 0], [3, 0]],
    passives: { sonar: 3 },
    actions: [
      { id: 'gun', kind: 'attack', name: 'Gun', range: 3, dmg: 2 },
      { id: 'depth', kind: 'attack', name: 'Depth Charges', range: 3, dmg: 2, area: 3, subsOnly: true },
    ],
  },
  missileboat: {
    name: 'Missile Boat', tier: 2, cost: 220, hp: 2, oil: 2, move: 3, sight: 2,
    shape: [[0, 0], [1, 0], [2, 0]],
    actions: [{ id: 'missile', kind: 'attack', name: 'Anti-ship Missile', range: 7, dmg: 4, air: true, cooldown: 3 }],
  },
  frigate: {
    name: 'Frigate', tier: 2, cost: 350, hp: 4, oil: 2, move: 3, sight: 2,
    shape: [[0, 0], [1, 0], [2, 0], [3, 0]],
    passives: { airDefense: 2 },
    actions: [{ id: 'gun', kind: 'attack', name: 'Gun', range: 3, dmg: 2 }],
  },
  jammer: {
    name: 'Jammer Ship', tier: 2, cost: 300, hp: 3, oil: 2, move: 3, sight: 2,
    shape: [[0, 0], [1, 0], [1, 1]],
    passives: { jam: 2 },
    actions: [{ id: 'spoof', kind: 'spoof', name: 'Spoof Contact', range: 6 }],
  },
  cruiser: {
    name: 'Cruiser', tier: 2, cost: 450, hp: 5, oil: 3, move: 2, sight: 2,
    shape: [[1, 0], [0, 1], [1, 1], [2, 1], [3, 1]],
    actions: [{ id: 'missile', kind: 'attack', name: 'Long-range Missile', range: 6, dmg: 2, air: true, rigMult: 2 }],
  },
  salvage: {
    name: 'Salvage Ship', tier: 2, cost: 250, hp: 3, oil: 2, move: 3, sight: 2,
    shape: [[1, 0], [0, 1], [1, 1]],
    actions: [{ id: 'salvage', kind: 'salvage', name: 'Salvage Wreck', share: 0.5 }],
  },
  repair: {
    name: 'Repair Ship', tier: 2, cost: 350, hp: 3, oil: 2, move: 2, sight: 2,
    shape: [[0, 0], [1, 0], [0, 1], [1, 1]],
    actions: [{ id: 'repair', kind: 'repair', name: 'Repair', amount: 2 }],
  },
  drillship: {
    name: 'Drillship', tier: 2, cost: 400, hp: 3, oil: 3, move: 2, sight: 2,
    shape: [[1, 0], [0, 1], [1, 1], [2, 1]],
    passives: { mobileRig: true },
    actions: [],
  },

  // ---------- Tier 3 ----------
  carrier: {
    name: 'Carrier', tier: 3, cost: 700, hp: 6, oil: 4, move: 2, sight: 3,
    shape: [[3, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1]],
    actions: [
      { id: 'recon', kind: 'scan', name: 'Recon Flight', range: 8, size: 4, free: true },
      { id: 'strike', kind: 'attack', name: 'Airstrike', range: 8, dmg: 2, air: true },
    ],
  },
  battleship: {
    name: 'Battleship', tier: 3, cost: 800, hp: 8, oil: 5, move: 1, sight: 2,
    shape: [[1, 0], [2, 0], [3, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1]],
    passives: { armor: 1 },
    actions: [{ id: 'salvo', kind: 'attack', name: 'Salvo', range: 5, dmg: 2, shots: 3 }],
  },
  command: {
    name: 'Command Ship', tier: 3, cost: 600, hp: 5, oil: 3, move: 2, sight: 3,
    shape: [[2, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1]],
    passives: { command: 3 },
    actions: [],
  },
  nuclearsub: {
    name: 'Nuclear Submarine', tier: 3, cost: 900, hp: 5, oil: 0, move: 3, sight: 2,
    shape: [[0, 0], [1, 0], [2, 0], [3, 0]],
    passives: { submerged: true, upkeep: 50 },
    actions: [{ id: 'torpedo', kind: 'attack', name: 'Heavy Torpedo', range: 5, dmg: 4 }],
  },
  dreadnought: {
    name: 'Dreadnought', tier: 3, cost: 1300, hp: 12, oil: 7, move: 1, sight: 2,
    shape: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1]],
    passives: { armor: 2, limit: 1 },
    actions: [{ id: 'battery', kind: 'attack', name: 'Main Battery', range: 6, dmg: 3, shots: 4 }],
  },
};

// Short plain-language descriptions shown in the shop/tooltips.
export const PASSIVE_TEXT = {
  armor: v => `Armor: takes ${v} less damage per hit`,
  submerged: () => 'Submerged: only spotted when an enemy is adjacent, or by destroyer sonar',
  sonar: v => `Sonar: detects submarines within ${v} squares`,
  screen: () => 'Screen: takes the first hit aimed at an adjacent friendly ship each round',
  airDefense: v => `Air Defense: intercepts one missile/airstrike within ${v} squares each round`,
  fuelLine: v => `Fuel Line: your ships starting a move within ${v} squares pay half oil`,
  mobileRig: () => 'Mobile Rig: produces oil while parked on a deposit (1 less than a rig)',
  command: v => `Fleet Command: your ships within ${v} squares get +1 move and +1 range`,
  jam: v => `Jam: enemy scans within ${v} squares of this ship see nothing`,
  hitAndRun: () => 'Hit and Run: can still move after attacking',
  upkeep: v => `Uses no oil, but costs $${v} per turn`,
  limit: v => `Limit ${v} per player`,
};
