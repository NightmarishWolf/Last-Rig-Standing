// ============================================================
// SHIP DATA: every ship's stats, shape and abilities.
//
// shape: list of [x, y] squares in the default (horizontal) facing.
// oil:   oil burned per square moved (and per 90° turn).
// move:  max squares per turn.
// build: turns a shipyard needs to build it (paid up front; Dry Docks build 1 turn faster).
// cls:   ship class used by research bonuses: light, escort, sub, capital, support.
//        Which research unlocks each ship is set in research.js (no entry = available from the start).
// sight: how far (squares) this ship spots surface enemies (the bright area on the board).
// actions: what the ship can do with its one action per turn.
//   attack: { tag, range, dmg, shots, area (1 or 3), subsOnly, rigMult, air, cooldown,
//             longRange (needs a target you can see), oil/money (cost per use), needs (a tech id) }
//           tag: gun, torpedo, missile, air, depth (research bonuses target tags)
//   scan:   reveals enemy ships/rigs in a size×size box within range.
//   survey: reveals oil deposits within `radius` of the ship.
//   mine, repair, spoof, salvage: see engine/abilities.js.
//   free: true means it does not use up the ship's action.
// passives: armor, submerged, sonar, screen, airDefense, fuelLine,
//   mobileRig, command, jam, hitAndRun, upkeep, limit.
// ============================================================

export const SHIPS = {
  // ---------- Light ships and early hulls ----------
  patrol: {
    name: 'Patrol Boat', cls: 'light', cost: 100, build: 1, hp: 2, oil: 1, move: 4, sight: 3,
    shape: [[0, 0], [1, 0]],
    actions: [
      { id: 'gun', kind: 'attack', tag: 'gun', name: 'Light Gun', range: 3, dmg: 1 },
      { id: 'ping', kind: 'scan', tag: 'scan', name: 'Radar Ping', range: 4, size: 3, cooldown: 2 },
      { id: 'survey', kind: 'survey', name: 'Survey', radius: 1 },
    ],
  },
  survey: {
    name: 'Survey Ship', cls: 'light', cost: 150, build: 1, hp: 1, oil: 1, move: 5, sight: 3,
    shape: [[0, 0]],
    actions: [{ id: 'deep', kind: 'survey', name: 'Deep Survey', radius: 2 }],
  },
  corvette: {
    name: 'Corvette', cls: 'light', cost: 150, build: 1, hp: 2, oil: 1, move: 4, sight: 2,
    shape: [[0, 0], [1, 0]],
    passives: { screen: true },
    actions: [{ id: 'gun', kind: 'attack', tag: 'gun', name: 'Light Gun', range: 3, dmg: 1 }],
  },
  hydrofoil: {
    name: 'Hydrofoil Raider', cls: 'light', cost: 200, build: 1, hp: 1, oil: 1, move: 6, sight: 2,
    shape: [[0, 0], [1, 0]],
    passives: { hitAndRun: true },
    actions: [{ id: 'rockets', kind: 'attack', tag: 'gun', name: 'Rockets', range: 2, dmg: 2 }],
  },
  decoy: {
    name: 'Decoy Barge', cls: 'light', cost: 60, build: 1, hp: 1, oil: 1, move: 2, sight: 1,
    shape: [[0, 0], [1, 0], [2, 0]],
    actions: [],
  },
  minelayer: {
    name: 'Minelayer', cls: 'escort', cost: 200, build: 2, hp: 2, oil: 1, move: 3, sight: 2,
    shape: [[0, 0], [0, 1], [1, 1]],
    actions: [{ id: 'mine', kind: 'mine', name: 'Lay Mine', max: 3, dmg: 2 }],
  },
  submarine: {
    name: 'Submarine', cls: 'sub', cost: 250, build: 2, hp: 3, oil: 1, move: 3, sight: 2,
    shape: [[0, 0], [1, 0], [2, 0]],
    passives: { submerged: true },
    actions: [{ id: 'torpedo', kind: 'attack', tag: 'torpedo', name: 'Torpedo', range: 4, dmg: 3 }],
  },
  tanker: {
    name: 'Tanker', cls: 'support', cost: 200, build: 2, hp: 4, oil: 1, move: 3, sight: 1,
    shape: [[0, 0], [1, 0], [2, 0], [3, 0]],
    passives: { fuelLine: 2 },
    actions: [],
  },

  // Tutorial only (hidden: never shows in the shipyard): an unarmed practice target.
  target: {
    name: 'Target Barge', cls: 'support', hidden: true, cost: 0, build: 1, hp: 1, oil: 1, move: 0, sight: 1,
    shape: [[0, 0], [1, 0], [2, 0]],
    actions: [],
  },

  // ---------- Escorts and support ----------
  destroyer: {
    name: 'Destroyer', cls: 'escort', cost: 300, build: 2, hp: 4, oil: 1, move: 3, sight: 3,
    shape: [[0, 0], [1, 0], [2, 0], [3, 0]],
    passives: { sonar: 3 },
    actions: [
      { id: 'gun', kind: 'attack', tag: 'gun', name: 'Gun', range: 3, dmg: 2 },
      { id: 'depth', kind: 'attack', tag: 'depth', name: 'Depth Charges', range: 3, dmg: 2, area: 3, subsOnly: true },
    ],
  },
  missileboat: {
    name: 'Missile Boat', cls: 'escort', cost: 220, build: 2, hp: 2, oil: 1, move: 3, sight: 2,
    shape: [[0, 0], [1, 0], [2, 0]],
    actions: [
      { id: 'missile', kind: 'attack', tag: 'missile', name: 'Anti-ship Missile', range: 7, dmg: 4, air: true, cooldown: 3 },
      // siege weapon: outranges every base weapon, so a turtle has to sail out and fight
      { id: 'cruise', kind: 'attack', tag: 'missile', name: 'Cruise Missile', range: 14, dmg: 3, air: true, longRange: true, oil: 4, cooldown: 2, needs: 'cruise_missiles', rigMult: 2 },
    ],
  },
  frigate: {
    name: 'Frigate', cls: 'escort', cost: 350, build: 3, hp: 4, oil: 1, move: 3, sight: 3,
    shape: [[0, 0], [1, 0], [2, 0], [3, 0]],
    passives: { airDefense: 2 },
    actions: [{ id: 'gun', kind: 'attack', tag: 'gun', name: 'Gun', range: 3, dmg: 2 }],
  },
  jammer: {
    name: 'Jammer Ship', cls: 'escort', cost: 300, build: 2, hp: 3, oil: 1, move: 3, sight: 2,
    shape: [[0, 0], [1, 0], [1, 1]],
    passives: { jam: 2 },
    actions: [{ id: 'spoof', kind: 'spoof', name: 'Spoof Contact', range: 6 }],
  },
  cruiser: {
    name: 'Cruiser', cls: 'capital', cost: 450, build: 3, hp: 5, oil: 2, move: 2, sight: 3,
    shape: [[1, 0], [0, 1], [1, 1], [2, 1], [3, 1]],
    actions: [
      { id: 'missile', kind: 'attack', tag: 'missile', name: 'Long-range Missile', range: 6, dmg: 2, air: true, rigMult: 2 },
      { id: 'cruise', kind: 'attack', tag: 'missile', name: 'Cruise Missile', range: 14, dmg: 3, air: true, longRange: true, oil: 4, cooldown: 2, needs: 'cruise_missiles', rigMult: 2 },
    ],
  },
  salvage: {
    name: 'Salvage Ship', cls: 'support', cost: 250, build: 2, hp: 3, oil: 1, move: 3, sight: 1,
    shape: [[1, 0], [0, 1], [1, 1]],
    actions: [{ id: 'salvage', kind: 'salvage', name: 'Salvage Wreck', share: 0.5 }],
  },
  repair: {
    name: 'Repair Ship', cls: 'support', cost: 350, build: 2, hp: 3, oil: 1, move: 2, sight: 1,
    shape: [[0, 0], [1, 0], [0, 1], [1, 1]],
    actions: [{ id: 'repair', kind: 'repair', name: 'Repair', amount: 2 }],
  },
  drillship: {
    name: 'Drillship', cls: 'support', cost: 400, build: 3, hp: 3, oil: 2, move: 2, sight: 1,
    shape: [[1, 0], [0, 1], [1, 1], [2, 1]],
    passives: { mobileRig: true },
    actions: [],
  },

  // ---------- Capital ships ----------
  carrier: {
    name: 'Carrier', cls: 'capital', cost: 700, build: 5, hp: 6, oil: 2, move: 2, sight: 4,
    shape: [[3, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1]],
    actions: [
      { id: 'recon', kind: 'scan', tag: 'scan', name: 'Recon Flight', range: 8, size: 4, free: true },
      { id: 'strike', kind: 'attack', tag: 'air', name: 'Airstrike', range: 8, dmg: 2, air: true },
    ],
  },
  battleship: {
    name: 'Battleship', cls: 'capital', cost: 800, build: 5, hp: 8, oil: 3, move: 1, sight: 3,
    shape: [[1, 0], [2, 0], [3, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1]],
    passives: { armor: 1 },
    actions: [{ id: 'salvo', kind: 'attack', tag: 'gun', name: 'Salvo', range: 5, dmg: 2, shots: 3 }],
  },
  command: {
    name: 'Command Ship', cls: 'capital', cost: 600, build: 4, hp: 5, oil: 2, move: 2, sight: 4,
    shape: [[2, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1]],
    passives: { command: 3 },
    actions: [],
  },
  nuclearsub: {
    name: 'Nuclear Submarine', cls: 'sub', cost: 900, build: 5, hp: 5, oil: 0, move: 3, sight: 2,
    shape: [[0, 0], [1, 0], [2, 0], [3, 0]],
    passives: { submerged: true, upkeep: 50 },
    actions: [
      { id: 'torpedo', kind: 'attack', tag: 'torpedo', name: 'Heavy Torpedo', range: 5, dmg: 4 },
      // long range: needs research, a target you can see, and 4 oil per launch
      { id: 'slbm', kind: 'attack', tag: 'missile', name: 'Sub-Launched Missile', range: 12, dmg: 3, air: true, longRange: true, oil: 4, cooldown: 3, needs: 'ballistic_missiles' },
    ],
  },
  dreadnought: {
    name: 'Dreadnought', cls: 'capital', cost: 1300, build: 6, hp: 12, oil: 4, move: 1, sight: 3,
    shape: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1]],
    passives: { armor: 2, limit: 1 },
    actions: [{ id: 'battery', kind: 'attack', tag: 'gun', name: 'Main Battery', range: 6, dmg: 3, shots: 4 }],
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
  upkeep: v => `Uses no oil to move (upkeep $${v} per turn)`,
  limit: v => `Limit ${v} per player`,
};
