// ============================================================
// ECONOMY DATA: oil, money, rigs, ports, upkeep and win conditions.
// ============================================================

// (Ship unlocks now come from research: see research.js.)

// Forward port: built on the coast of an island (a land square touching water),
// with one of your ships next to it. New ships can launch within `range` squares of it.
export const PORT = {
  name: 'Forward Port',
  baseCost: 400,
  costPerPort: 150, // each port you already own adds this to the price
  hp: 4,
  sight: 2,
  range: 2,
};

export const RIG = {
  name: 'Oil Rig',
  hp: 2, // a Wellhead rig; a base's central rig uses the base level's HP (bases.js)
  sight: 1,
};

// rate: oil a rig pumps per turn (the same everywhere).
// home / middle: [min, max] oil a deposit starts with, picked at random each game.
// Home deposits are small and run dry; No Man's Sea deposits last much longer.
// (Every player's home gets the exact same amounts, so it stays fair.)
export const DEPOSITS = {
  small:  { rate: 2, label: 'S', name: 'Small',  home: [64, 104], middle: [80, 140] },
  medium: { rate: 3, label: 'M', name: 'Medium', home: [96, 160], middle: [120, 200] },
  rich:   { rate: 5, label: 'R', name: 'Rich',   home: [160, 240], middle: [200, 320] },
};

// Deeper drilling (Drilling research): when one of your rigs runs dry it can strike deeper layers,
// each holding this share of the deposit's original oil (one layer per Deeper Wells / Ultra-Deep / Abyssal tech).
export const DEEP_LAYERS = [0.4, 0.4, 0.5];

export const MARKET = {
  basePrice: 15,   // $ per oil when the market is calm
  minPrice: 4,
  // The price moves on a curve, not a straight line:
  // every unit sold takes this share of the gap between the price and minPrice, so selling crashes the
  // price fast at first and then more and more slowly as it nears the floor...
  dropShare: 0.02,
  // ...and each round the price climbs back this share of the gap to basePrice, so it recovers quickly
  // after a crash and more and more slowly as it nears normal.
  recoverShare: 0.3,
};

export const START = { money: 400, oil: 40 };

export const ECONOMY = {
  upkeepRate: 0.04,  // every ship costs this share of its price in money, every turn
  oilCap: 60,        // max oil you can store; anything pumped past this spills
};

// Domination victory (optional, chosen on the new-game screen):
// own rigs on at least `share` of No Man's Sea's deposits for `rounds` rounds in a row.
// (Victory settings, including Domination, now live in victory.js.)

// Long-range strikes (Cruise Missile Batteries, Airbases, Sub-Launched Missiles):
// aimed within this many squares of an enemy Jammer Ship, they have this chance to be scrambled.
export const STRIKES = { jamChance: 0.5, satellite: { size: 7, cooldown: 4, money: 40 } };

// Selling ships back: the share of the ship's price you get (scaled by how damaged it is),
// how many rounds it must have been out of combat, and where it can be sold
// (your home waters, or inside one of your rig bases' claims).
export const SHIP_SALE = { share: 0.5, quietRounds: 3 };
