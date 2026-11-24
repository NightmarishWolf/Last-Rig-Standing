// ============================================================
// SHIP DATA: every ship's stats, shape and abilities.
//
// shape: list of [x, y] squares in the default (horizontal) facing.
// oil:   oil burned per square moved (turning is free). Fractions add up across moves:
//        a ship at 0.2 sails 5 squares on 1 oil, however you split the moves.
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
//   money: $ every use costs (every shot, for weapons with several shots). Every ability has one,
//          so firing and surveying cost money while sailing stays cheap.
// faction: 'navy' | 'tide' (none = every faction's). role: what the ship is for (bots pick ships by role, so each
//   faction's version of a job is found the same way: 'scout', 'picket', 'line', 'tanker'...).
// commander: only that commander's (from level 3); needs: a tech required besides
// pack: one order builds this many boats (each gets `cost / pack` of the price for upkeep and wreck value).
// passives: armor, submerged, sonar, screen, airDefense, fuelLine,
//   mobileRig, command, jam, hitAndRun, upkeep, limit, rigReach (found rig bases from this many squares away).
// ============================================================

export const SHIPS = {
  // ---------- Light ships and early hulls ----------
  patrol: {
    faction: 'navy', role: 'picket', name: 'Picket Boat', cls: 'light', cost: 130, build: 1, hp: 2, oil: 0.25, move: 4, sight: 3,
    shape: [[0, 0], [1, 0]],
    actions: [
      { id: 'gun', kind: 'attack', tag: 'gun', name: 'Light Gun', range: 3, dmg: 1, money: 5 },
      { id: 'ping', kind: 'scan', tag: 'scan', name: 'Radar Ping', range: 4, size: 3, cooldown: 2, money: 5 },
      { id: 'survey', kind: 'survey', name: 'Survey', radius: 1, money: 10 },
    ],
  },
  survey: {
    faction: 'navy', role: 'scout', name: 'Survey Ship', cls: 'light', cost: 190, build: 1, hp: 1, oil: 0.2, move: 5, sight: 3,
    passives: { rigReach: 5 },
    shape: [[0, 0]],
    actions: [{ id: 'deep', kind: 'survey', name: 'Deep Survey', radius: 2, money: 15 }],
  },
  corvette: {
    faction: 'navy', role: 'screen', name: 'Corvette', cls: 'light', cost: 190, build: 1, hp: 2, oil: 0.25, move: 4, sight: 2,
    shape: [[0, 0], [1, 0]],
    passives: { screen: true },
    actions: [{ id: 'gun', kind: 'attack', tag: 'gun', name: 'Light Gun', range: 3, dmg: 1, money: 5 }],
  },
  hydrofoil: {
    faction: 'navy', role: 'raider', name: 'Fast Attack Craft', cls: 'light', cost: 250, build: 1, hp: 1, oil: 0.3, move: 6, sight: 2,
    shape: [[0, 0], [1, 0]],
    passives: { hitAndRun: true },
    actions: [{ id: 'rockets', kind: 'attack', tag: 'gun', name: 'Rockets', range: 2, dmg: 2, money: 8 }],
  },
  decoy: {
    faction: 'navy', role: 'decoy', name: 'Decoy Barge', cls: 'light', cost: 75, build: 1, hp: 1, oil: 0.2, move: 2, sight: 1,
    shape: [[0, 0], [1, 0], [2, 0]],
    actions: [],
  },
  minelayer: {
    faction: 'navy', role: 'minelayer', name: 'Minelayer', cls: 'escort', cost: 250, build: 2, hp: 2, oil: 0.4, move: 3, sight: 2,
    shape: [[0, 0], [0, 1], [1, 1]],
    actions: [{ id: 'mine', kind: 'mine', name: 'Lay Mine', max: 3, dmg: 2, money: 15 }],
  },
  submarine: {
    faction: 'navy', role: 'sub', name: 'Attack Submarine', cls: 'sub', cost: 310, build: 2, hp: 3, oil: 0.4, move: 3, sight: 2,
    shape: [[0, 0], [1, 0], [2, 0]],
    passives: { submerged: true },
    actions: [{ id: 'torpedo', kind: 'attack', tag: 'torpedo', name: 'Torpedo', range: 4, dmg: 3, money: 15 }],
  },
  tanker: {
    faction: 'navy', role: 'tanker', name: 'Tanker', cls: 'support', cost: 250, build: 2, hp: 4, oil: 0.5, move: 3, sight: 1,
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

  // campaign only: families from the raft-towns, following the fleet because there's nowhere else to go
  refugee: {
    name: 'Refugee Boat', cls: 'support', hidden: true, cost: 0, build: 1, hp: 2, oil: 0, move: 3, sight: 1,
    shape: [[0, 0], [1, 0]],
    actions: [],
  },

  // ---------- Escorts and support ----------
  destroyer: {
    faction: 'navy', role: 'line', name: 'Destroyer', cls: 'escort', cost: 380, build: 2, hp: 4, oil: 0.5, move: 3, sight: 3,
    shape: [[0, 0], [1, 0], [2, 0], [3, 0]],
    passives: { sonar: 3 },
    actions: [
      { id: 'gun', kind: 'attack', tag: 'gun', name: 'Gun', range: 3, dmg: 2, money: 8 },
      { id: 'depth', kind: 'attack', tag: 'depth', name: 'Depth Charges', range: 3, dmg: 2, area: 3, subsOnly: true, money: 10 },
    ],
  },
  missileboat: {
    // a glass cannon that hits from far away: its radar mast sees farther than other small ships, so it
    // can spot for itself out to half its missile range (beyond that it needs someone else to spot)
    faction: 'navy', role: 'missile', name: 'Missile Corvette', cls: 'escort', cost: 250, build: 2, hp: 2, oil: 0.4, move: 3, sight: 4,
    shape: [[0, 0], [1, 0], [2, 0]],
    actions: [
      { id: 'missile', kind: 'attack', tag: 'missile', name: 'Anti-ship Missile', range: 7, dmg: 4, air: true, cooldown: 2, money: 20 },
      // siege weapon: outranges every base weapon, so a turtle has to sail out and fight
      { id: 'cruise', kind: 'attack', tag: 'missile', name: 'Cruise Missile', range: 14, dmg: 3, air: true, longRange: true, oil: 4, cooldown: 2, needs: 'cruise_missiles', rigMult: 2, money: 35 },
    ],
  },
  frigate: {
    faction: 'navy', role: 'aa', name: 'Frigate', cls: 'escort', cost: 440, build: 3, hp: 4, oil: 0.5, move: 3, sight: 3,
    shape: [[0, 0], [1, 0], [2, 0], [3, 0]],
    passives: { airDefense: 2 },
    actions: [{ id: 'gun', kind: 'attack', tag: 'gun', name: 'Gun', range: 3, dmg: 2, money: 8 }],
  },
  jammer: {
    faction: 'navy', role: 'ew', name: 'Electronic Warfare Ship', cls: 'escort', cost: 380, build: 2, hp: 3, oil: 0.4, move: 3, sight: 2,
    shape: [[0, 0], [1, 0], [1, 1]],
    passives: { jam: 2 },
    actions: [{ id: 'spoof', kind: 'spoof', name: 'Spoof Contact', range: 6, money: 10 }],
  },
  cruiser: {
    faction: 'navy', role: 'cruiser', name: 'Guided Missile Cruiser', cls: 'capital', cost: 520, build: 3, hp: 6, oil: 0.75, move: 3, sight: 3,
    shape: [[1, 0], [0, 1], [1, 1], [2, 1], [3, 1]],
    actions: [
      { id: 'missile', kind: 'attack', tag: 'missile', name: 'Long-range Missile', range: 6, dmg: 2, air: true, rigMult: 2, money: 15 },
      { id: 'cruise', kind: 'attack', tag: 'missile', name: 'Cruise Missile', range: 14, dmg: 3, air: true, longRange: true, oil: 4, cooldown: 2, needs: 'cruise_missiles', rigMult: 2, money: 35 },
    ],
  },
  salvage: {
    faction: 'navy', role: 'salvage', name: 'Salvage Tender', cls: 'support', cost: 310, build: 2, hp: 3, oil: 0.5, move: 3, sight: 1,
    shape: [[1, 0], [0, 1], [1, 1]],
    actions: [{ id: 'salvage', kind: 'salvage', name: 'Salvage Wreck', share: 0.5 }],
  },
  repair: {
    faction: 'navy', role: 'repair', name: 'Fleet Tender', cls: 'support', cost: 440, build: 2, hp: 3, oil: 0.5, move: 2, sight: 1,
    passives: { rigReach: 5 },
    shape: [[0, 0], [1, 0], [0, 1], [1, 1]],
    actions: [{ id: 'repair', kind: 'repair', name: 'Repair', amount: 2, money: 10 },
      { id: 'clean', kind: 'clean', name: 'Clean Up Spill', range: 2, money: 30 }],
  },
  drillship: {
    faction: 'navy', role: 'drill', name: 'Drillship', cls: 'support', cost: 500, build: 3, hp: 3, oil: 0.75, move: 2, sight: 1,
    shape: [[1, 0], [0, 1], [1, 1], [2, 1]],
    passives: { mobileRig: true },
    actions: [{ id: 'clean', kind: 'clean', name: 'Clean Up Spill', range: 2, money: 30 }],
  },
  // Polar maps: breaks a lane through the pack ice as it sails (the ice slowly closes up again)
  icebreaker: {
    polar: true, // only on Polar maps
    role: 'icebreaker', name: 'Icebreaker', cls: 'support', cost: 300, build: 2, hp: 5, oil: 0.6, move: 3, sight: 3,
    shape: [[0, 0], [1, 0], [2, 0]],
    passives: { iceBreaker: true, armor: 1 },
    actions: [{ id: 'icesurvey', kind: 'survey', name: 'Ice Core Survey', radius: 2, money: 15 }],
  },

  // ---------- Capital ships ----------
  carrier: {
    faction: 'navy', role: 'carrier', name: 'Fleet Carrier', cls: 'capital', cost: 880, build: 5, hp: 6, oil: 1, move: 2, sight: 4,
    passives: { rigReach: 5 },
    shape: [[3, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1]],
    actions: [
      { id: 'recon', kind: 'scan', tag: 'scan', name: 'Recon Flight', range: 8, size: 4, free: true, money: 10 },
      { id: 'strike', kind: 'attack', tag: 'air', name: 'Airstrike', range: 8, dmg: 2, air: true, money: 20 },
    ],
  },
  battleship: {
    faction: 'navy', role: 'battleship', name: 'Battleship', cls: 'capital', cost: 1000, build: 5, hp: 8, oil: 1, move: 1, sight: 3,
    shape: [[1, 0], [2, 0], [3, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1]],
    passives: { armor: 1 },
    actions: [{ id: 'salvo', kind: 'attack', tag: 'gun', name: 'Salvo', range: 5, dmg: 2, shots: 3, money: 10 }],
  },
  command: {
    faction: 'navy', role: 'command', name: 'Flagship', cls: 'capital', cost: 750, build: 4, hp: 5, oil: 0.75, move: 2, sight: 4,
    shape: [[2, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1]],
    passives: { rigReach: 5, command: 3 },
    actions: [],
  },
  nuclearsub: {
    faction: 'navy', role: 'nuke', name: 'Nuclear Attack Sub', cls: 'sub', cost: 1130, build: 5, hp: 5, oil: 0, move: 3, sight: 2,
    shape: [[0, 0], [1, 0], [2, 0], [3, 0]],
    passives: { submerged: true, upkeep: 50 },
    actions: [
      { id: 'torpedo', kind: 'attack', tag: 'torpedo', name: 'Heavy Torpedo', range: 5, dmg: 4, money: 25 },
      // long range: needs research, a target you can see, and 4 oil per launch
      { id: 'slbm', kind: 'attack', tag: 'missile', name: 'Sub-Launched Missile', range: 12, dmg: 3, air: true, longRange: true, oil: 4, cooldown: 3, needs: 'ballistic_missiles', money: 50 },
    ],
  },
  dreadnought: {
    faction: 'navy', role: 'dread', name: 'Dreadnought', cls: 'capital', cost: 1630, build: 6, hp: 12, oil: 1.5, move: 1, sight: 3,
    shape: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1]],
    passives: { armor: 2, limit: 1 },
    actions: [{ id: 'battery', kind: 'attack', tag: 'gun', name: 'Main Battery', range: 6, dmg: 3, shots: 4, money: 12 }],
  },

  // ---------- Coalition Navy: Logistics ships ----------
  supply: {
    // a moving supply line: ships near it count as in supply (they repair, and never run low)
    faction: 'navy', role: 'supply', name: 'Supply Ship', cls: 'support', cost: 340, build: 2, hp: 4, oil: 0.5, move: 3, sight: 2,
    shape: [[0, 0], [1, 0], [2, 0], [1, 1]],
    passives: { supply: 4, fuelLine: 1 },
    actions: [],
  },
  assault: {
    // marines take an enemy base whole (its platforms and rigs) once its central rig is badly damaged
    faction: 'navy', role: 'assault', name: 'Amphibious Assault Ship', cls: 'support', cost: 600, build: 3, hp: 5, oil: 0.6, move: 3, sight: 2,
    shape: [[0, 0], [1, 0], [2, 0], [3, 0], [1, 1], [2, 1]],
    actions: [{ id: 'assault', kind: 'assault', tag: 'assault', name: 'Land Marines', range: 2, cooldown: 3, money: 40 }],
  },

  // ============================================================
  // THE FREE TIDE: cheap, fast and fragile. `pack`: one order launches this many boats.
  // ============================================================
  skiff: {
    faction: 'tide', role: 'picket', name: 'Skiff Pack', unit: 'Skiff', pack: 2, cls: 'light', cost: 150, build: 1, hp: 1, oil: 0.2, move: 5, sight: 3,
    shape: [[0, 0]],
    actions: [
      { id: 'gun', kind: 'attack', tag: 'gun', name: 'Deck Gun', range: 2, dmg: 1, money: 4 },
      { id: 'survey', kind: 'survey', name: 'Survey', radius: 1, money: 10 },
    ],
  },
  prospector: {
    faction: 'tide', role: 'scout', name: 'Prospector Skiff', cls: 'light', cost: 150, build: 1, hp: 1, oil: 0.15, move: 6, sight: 3,
    passives: { rigReach: 5 },
    shape: [[0, 0]],
    actions: [{ id: 'deep', kind: 'survey', name: 'Deep Survey', radius: 2, money: 15 }],
  },
  barge: {
    faction: 'tide', role: 'tanker', name: 'Oil Barge', cls: 'support', cost: 220, build: 2, hp: 4, oil: 0.5, move: 3, sight: 1,
    shape: [[0, 0], [1, 0], [2, 0], [3, 0]],
    passives: { fuelLine: 2 },
    actions: [],
  },
  rigraft: {
    faction: 'tide', role: 'drill', name: 'Rig Raft', cls: 'support', cost: 420, build: 2, hp: 3, oil: 0.6, move: 2, sight: 1,
    shape: [[0, 0], [1, 0], [0, 1], [1, 1]],
    passives: { mobileRig: true },
    actions: [{ id: 'clean', kind: 'clean', name: 'Clean Up Spill', range: 2, money: 30 }],
  },
  gunboat: {
    faction: 'tide', role: 'screen', name: 'Gunboat', cls: 'light', cost: 170, build: 1, hp: 2, oil: 0.25, move: 4, sight: 2,
    shape: [[0, 0], [1, 0]],
    actions: [{ id: 'gun', kind: 'attack', tag: 'gun', name: 'Twin Guns', range: 3, dmg: 1, shots: 2, money: 4 }],
  },
  lancer: {
    faction: 'tide', role: 'raider', name: 'Sea Lancer', cls: 'light', cost: 230, build: 1, hp: 1, oil: 0.3, move: 7, sight: 2,
    shape: [[0, 0], [1, 0]],
    passives: { hitAndRun: true },
    actions: [{ id: 'torpedo', kind: 'attack', tag: 'torpedo', name: 'Spar Torpedo', range: 3, dmg: 2, money: 10 }],
  },
  minejunk: {
    // lays mines as it sails: laying one doesn't use up its action
    faction: 'tide', role: 'minelayer', name: 'Mine Junk', cls: 'escort', cost: 220, build: 2, hp: 2, oil: 0.35, move: 3, sight: 2,
    shape: [[0, 0], [1, 0], [0, 1]],
    actions: [{ id: 'mine', kind: 'mine', name: 'Drop Mine', max: 4, dmg: 2, free: true, money: 12 }],
  },
  smuggler: {
    faction: 'tide', role: 'sub', name: 'Smuggler Sub', cls: 'sub', cost: 240, build: 1, hp: 2, oil: 0.3, move: 3, sight: 2,
    shape: [[0, 0], [1, 0]],
    passives: { submerged: true },
    actions: [{ id: 'torpedo', kind: 'attack', tag: 'torpedo', name: 'Torpedo', range: 3, dmg: 2, money: 10 }],
  },
  brig: {
    faction: 'tide', role: 'line', name: 'Raider Brig', cls: 'escort', cost: 320, build: 2, hp: 4, oil: 0.45, move: 3, sight: 3,
    shape: [[0, 0], [1, 0], [2, 0], [3, 0]],
    passives: { sonar: 2 },
    actions: [
      { id: 'gun', kind: 'attack', tag: 'gun', name: 'Cannon', range: 3, dmg: 2, money: 7 },
      { id: 'depth', kind: 'attack', tag: 'depth', name: 'Depth Charges', range: 2, dmg: 2, area: 3, subsOnly: true, money: 10 },
    ],
  },
  fireship: {
    // rams the target square and blows up: big damage to everything around it (ships, rigs, platforms)
    faction: 'tide', role: 'fireship', name: 'Fireship', cls: 'escort', cost: 200, build: 1, hp: 2, oil: 0.4, move: 4, sight: 2,
    shape: [[0, 0], [1, 0]],
    actions: [{ id: 'ram', kind: 'attack', tag: 'fire', name: 'Ram and Ignite', range: 1, dmg: 4, area: 3, selfDestruct: true }],
  },
  rocketjunk: {
    faction: 'tide', role: 'missile', name: 'Rocket Junk', cls: 'escort', cost: 260, build: 2, hp: 2, oil: 0.4, move: 3, sight: 4,
    shape: [[0, 0], [1, 0], [2, 0]],
    actions: [{ id: 'rockets', kind: 'attack', tag: 'missile', name: 'Rocket Volley', range: 5, dmg: 2, shots: 2, air: true, cooldown: 2, money: 10 }],
  },
  boarder: {
    // captures a burning enemy ship (a third of its HP or less) next to it: the crew go over, the skiff is lost
    faction: 'tide', role: 'boarder', name: 'Boarding Skiff', cls: 'light', cost: 160, build: 1, hp: 1, oil: 0.25, move: 5, sight: 2,
    shape: [[0, 0]],
    actions: [{ id: 'board', kind: 'board', name: 'Board', range: 1, money: 10 }],
  },
  qship: {
    // a working oil barge (same hull, refuels nearby ships) with hidden launchers: its shots give no muzzle flash
    faction: 'tide', role: 'cruiser', name: 'Q-Ship', disguise: 'barge', cls: 'escort', cost: 480, build: 3, hp: 5, oil: 0.6, move: 3, sight: 3,
    shape: [[0, 0], [1, 0], [2, 0], [3, 0]],
    passives: { fuelLine: 2, noFlash: true },
    actions: [{ id: 'missile', kind: 'attack', tag: 'missile', name: 'Hidden Launchers', range: 6, dmg: 2, shots: 2, air: true, money: 12 }],
  },
  mothership: {
    faction: 'tide', role: 'carrier', name: 'Drone Mothership', cls: 'capital', cost: 700, build: 4, hp: 5, oil: 0.8, move: 3, sight: 4,
    shape: [[2, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1]],
    passives: { rigReach: 5 },
    actions: [
      { id: 'recon', kind: 'scan', tag: 'scan', name: 'Drone Sweep', range: 7, size: 3, free: true, money: 5 },
      { id: 'drones', kind: 'attack', tag: 'air', name: 'Drone Swarm', range: 7, dmg: 1, shots: 3, air: true, money: 6 },
    ],
  },
  leviathan: {
    // a floating fortress: the Tide spreads around it wherever it goes
    faction: 'tide', role: 'battleship', name: 'Leviathan', cls: 'capital', cost: 900, build: 5, hp: 9, oil: 1, move: 1, sight: 3,
    shape: [[1, 0], [2, 0], [3, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1]],
    passives: { armor: 1, tideSource: 3 },
    actions: [{ id: 'broadside', kind: 'attack', tag: 'gun', name: 'Broadside', range: 4, dmg: 2, shots: 3, money: 8 }],
  },
  queen: {
    faction: 'tide', role: 'command', name: 'Tide Queen', cls: 'capital', cost: 650, build: 4, hp: 5, oil: 0.6, move: 3, sight: 4,
    shape: [[2, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1]],
    passives: { swarmAura: 3, tideSource: 2, rigReach: 5, limit: 1 },
    actions: [{ id: 'gun', kind: 'attack', tag: 'gun', name: 'Guns', range: 3, dmg: 2, money: 8 }],
  },
  // ============================================================
  // COMMANDER EXCLUSIVES: only for that commander, from level 3 (`needs`: a tech they also need)
  // ============================================================
  battlecruiser: {
    faction: 'navy', commander: 'hale', needs: 'cruiser_program', role: 'battlecruiser', name: 'Battlecruiser', cls: 'capital', cost: 850, build: 4, hp: 7, oil: 0.9, move: 3, sight: 3,
    shape: [[1, 0], [2, 0], [3, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1]],
    actions: [{ id: 'guns', kind: 'attack', tag: 'gun', name: 'Main Guns', range: 5, dmg: 2, shots: 2, money: 8 }],
  },
  escortcarrier: {
    faction: 'navy', commander: 'vance', needs: 'destroyer_program', role: 'escortcarrier', name: 'Escort Carrier', cls: 'escort', cost: 450, build: 3, hp: 4, oil: 0.5, move: 3, sight: 3,
    shape: [[0, 0], [1, 0], [2, 0], [3, 0], [1, 1]],
    passives: { rigReach: 5 },
    actions: [
      { id: 'recon', kind: 'scan', tag: 'scan', name: 'Recon Flight', range: 6, size: 3, free: true, money: 5 },
      { id: 'strike', kind: 'attack', tag: 'air', name: 'Air Wing', range: 6, dmg: 1, shots: 2, air: true, money: 8 },
    ],
  },
  landingcraft: {
    faction: 'navy', commander: 'ortiz', role: 'landingcraft', name: 'Landing Craft', cls: 'light', cost: 220, build: 1, hp: 2, oil: 0.25, move: 5, sight: 2,
    shape: [[0, 0], [1, 0]],
    actions: [{ id: 'land', kind: 'assault', tag: 'assault', name: 'Land Marines', range: 1, small: true, cooldown: 2, money: 20 }],
  },
  broodraft: {
    faction: 'tide', commander: 'ruiz', needs: 'raft_lashing', role: 'broodraft', name: 'Brood Raft', cls: 'support', cost: 520, build: 3, hp: 5, oil: 0.6, move: 2, sight: 3,
    shape: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]],
    passives: { tideSource: 2, raftDock: true },
    actions: [],
  },
  incendiary: {
    faction: 'tide', commander: 'kade', needs: 'fireships', role: 'incendiary', name: 'Incendiary Junk', cls: 'escort', cost: 280, build: 2, hp: 2, oil: 0.4, move: 3, sight: 3,
    shape: [[0, 0], [1, 0], [2, 0]],
    actions: [{ id: 'flame', kind: 'attack', tag: 'flame', name: 'Burning Oil', range: 4, dmg: 1, area: 3, fireSlick: true, cooldown: 2, money: 10 }],
  },
  ghost: {
    faction: 'tide', commander: 'nyx', role: 'ghost', name: 'Ghost Boat', cls: 'light', cost: 240, build: 1, hp: 2, oil: 0.25, move: 5, sight: 3,
    shape: [[0, 0], [1, 0]],
    passives: { submerged: true, ghost: true },
    actions: [{ id: 'siphon', kind: 'siphon', name: 'Siphon Oil', range: 1, steal: 5, cooldown: 1, money: 5 }],
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
  raftDock: () => 'Brood Dock: a moving Raft Dock that launches boats anywhere on its own Tide',
  ghost: () => 'Lies low: seen only by ships right next to it or by sonar, like a submarine',
  supply: v => `Supply: your ships within ${v} squares are in supply (they repair and never run low)`,
  noFlash: () => 'Hidden Launchers: firing gives away no muzzle flash',
  tideSource: v => `Tide Source: the Tide spreads ${v} squares around it`,
  swarmAura: v => `Swarm Queen: your light ships and escorts within ${v} squares deal +1 damage`,
  rigReach: v => `Rig Crews: can found a rig base on a deposit up to ${v} squares away (other ships must be right next to it)`,
};

// ---------- factions and roles ----------
// Does this ship belong in `faction`'s shipyard? (No faction = everyone's, like the Icebreaker.)
export const forFaction = (type, faction) => !!SHIPS[type] && (!SHIPS[type].faction || SHIPS[type].faction === (faction || 'navy'));
// The ship that does `role` for a faction (null if it has none): shipFor('tide', 'line') → 'brig'.
const ROLES = {};
for (const [id, d] of Object.entries(SHIPS)) if (d.role && !d.hidden && !d.commander) {
  for (const f of d.faction ? [d.faction] : ['navy', 'tide']) (ROLES[f] ||= {})[d.role] ||= id;
}
export const shipFor = (faction, role) => ROLES[faction || 'navy']?.[role] || null;
export const isRole = (type, ...roles) => roles.includes(SHIPS[type]?.role);
// Boats in one order (Skiff Packs come in twos), and each boat's share of the price.
export const packOf = type => SHIPS[type]?.pack || 1;
