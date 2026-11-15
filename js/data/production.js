// ============================================================
// PRODUCTION, FLEETS AND STANDING ORDERS: the numbers.
// ============================================================

// Shipyards. Ships are paid for up front, take `build` turns (see ships.js),
// and appear next to the yard when they're done.
//   slots:  how many ships the yard builds at the same time (the rest wait in line)
//   faster: turns taken off every ship built there (never below 1)
export const YARDS = {
  home: { name: 'Home Yard', slots: 2, faster: 0 },     // your spawn strip
  port: { name: 'Port Yard', slots: 1, faster: 0 },     // forward ports (ships appear within port range)
  drydock: { name: 'Dry Dock', slots: 2, faster: 1 },   // dry dock platforms (ships appear within 2 squares)
};
export const QUEUE = {
  max: 8,            // ships waiting in one yard's line
  refundStarted: 0.5 // cancelling a ship that's already being built refunds this share (unstarted: full refund)
};

// Fleets: ships that sail together in formation, at the speed of the slowest ship.
export const FLEET = {
  maxShips: 12,
  joinRange: 8,      // ships must be this close to the flagship to join
  names: ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliet', 'Kilo', 'Lima'],
};

// Standing orders: run automatically at the end of your turn, with whatever movement is left.
export const STANDING = {
  patrol: { name: 'Patrol', icon: '🔁', text: 'Sails a loop between points, firing at enemies that come in range.' },
  escort: { name: 'Escort', icon: '🛡️', text: 'Stays within 2 squares of another of your ships and fires at enemies in range.' },
  guard: { name: 'Guard', icon: '⚓', text: 'Holds a position (returns if moved away) and fires at enemies in range.' },
  explore: { name: 'Explore', icon: '🧭', text: 'Heads for the nearest unexplored waters. Ships that can survey do it as they go.' },
};
export const ESCORT_RANGE = 2;
export const EXPLORE_CHUNK = 10; // the map is split into chunks this size for exploring
