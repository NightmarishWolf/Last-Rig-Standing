// ============================================================
// ECONOMY DATA: oil, money, rigs, ports, upkeep and win conditions.
// ============================================================

// (Ship unlocks now come from research: see research.js.)

// Forward port: built on the coast of an island (a land square touching water),
// with one of your ships next to it. New ships can launch within `range` squares of it.
export const PORT = {
  name: 'Forward Port',
  baseCost: 300,
  costPerPort: 100, // each port you already own adds this to the price
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
  small:  { rate: 2, label: 'S', name: 'Small',  home: [16, 26], middle: [40, 70] },
  medium: { rate: 3, label: 'M', name: 'Medium', home: [24, 40], middle: [60, 100] },
  rich:   { rate: 5, label: 'R', name: 'Rich',   home: [40, 60], middle: [100, 160] },
};

export const MARKET = {
  basePrice: 15,   // $ per oil when the market is calm
  minPrice: 4,
  dropPerUnit: 0.25, // every unit sold lowers the price this much
  recoverPerTurn: 1,
};

export const START = { money: 400, oil: 12 };

export const ECONOMY = {
  upkeepRate: 0.05,  // every ship costs this share of its price in money, every turn
  oilCap: 60,        // max oil you can store; anything pumped past this spills
};

// Domination victory (optional, chosen on the new-game screen):
// own rigs on at least `share` of No Man's Sea's deposits for `rounds` rounds in a row.
export const DOMINATION = { share: 0.5, rounds: 5 };
