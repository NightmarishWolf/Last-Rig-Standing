// World events (optional, picked when a game is set up: Off, Light, Chaotic or Custom) and oil spills.
// Each event is announced to everyone a round before it starts. The rules live in js/engine/world.js.

export const EVENTS = {
  storm:   { name: 'Storm front',      icon: '🌩️', cat: 'Weather', desc: 'A storm drifts across the map for 4 rounds. Ships that start their turn inside it move at half speed, and no aircraft fly in or out of it (carrier strikes, bombers, recon drones).' },
  fogbank: { name: 'Fog bank',         icon: '🌫️', cat: 'Weather', desc: 'A thick fog settles on part of the map for 3 rounds: inside it, nothing sees further than 1 square. In games without fog of war, the fog comes back in that patch.' },
  calm:    { name: 'Calm seas',        icon: '🌤️', cat: 'Weather', desc: 'Flat calm for one round: every ship gets +1 move.' },
  shock:   { name: 'Oil shock',        icon: '📈', cat: 'Economy', desc: 'Sudden news jolts the oil market: the price jumps (or crashes), then drifts back to normal over the next few rounds. Good timing for whoever stockpiled, or sold early.' },
  field:   { name: 'Super-rich field', icon: '💎', cat: 'Economy', desc: 'Geologists report a super-rich oil field somewhere inside a marked area of No Man\'s Sea. Everyone sees the area, but the exact spot must be surveyed. It holds about three times the oil of a rich deposit, and pumps faster.' },
  blowout: { name: 'Well blowout',     icon: '🔥', cat: 'Economy', desc: 'One rig blows out and stops pumping for 2 rounds, unless its owner pays to fix it. The biggest producers are the most likely to be hit.' },
  pirates: { name: 'Pirates',          icon: '🏴‍☠️', cat: 'Threats', desc: 'A pirate flotilla appears near the richest player\'s rigs and raids whatever looks weak: unguarded rigs and lone ships. They leave after 12 rounds. Sinking a pirate ship pays a bounty.' },
  rogue:   { name: 'Rogue submarine',  icon: '🦈', cat: 'Threats', desc: 'A rogue submarine hunts one region of No Man\'s Sea for 15 rounds, torpedoing any ship it finds. It is hard to spot (sonar helps) and carries a big bounty.' },
};
export const EVENT_ORDER = ['storm', 'fogbank', 'calm', 'shock', 'field', 'blowout', 'pirates', 'rogue'];

// How often events happen: rounds between one event and the next (random within the range).
export const EVENT_MODES = {
  off:     { name: 'Off',     icon: '⛔', desc: 'No world events.' },
  light:   { name: 'Light',   icon: '🌤️', desc: 'An event every 10 to 15 rounds.', gap: [10, 15] },
  chaotic: { name: 'Chaotic', icon: '🌪️', desc: 'An event every 5 to 8 rounds.', gap: [5, 8] },
  custom:  { name: 'Custom',  icon: '🎛️', desc: 'Pick which events can happen, and how often.' },
};
export const FIRST_EVENT_ROUND = 8;

export const EVENT_TUNING = {
  storm:   { r: 7, rounds: 4, step: 4 },
  fogbank: { r: 8, rounds: 3 },
  shock:   { up: 1.7, down: 0.55 },
  field:   { r: 7, reserves: [700, 900], rate: 8 }, // a 'super' deposit (DEPOSITS.super)
  blowout: { rounds: 2, fixCost: 60 },
  pirates: { rounds: 12, ships: ['hydrofoil', 'hydrofoil', 'corvette'], bounty: 140 },
  rogue:   { rounds: 15, r: 14, hp: 6, bounty: 450 },
};

// Oil spills: when a rig is destroyed or a Tanker sinks. Nobody can build a rig on a deposit inside a
// slick; sailing through one costs double oil. Slicks fade by themselves, or cleanup ships speed it up.
export const SPILLS = {
  rig: { r: 2, rounds: 12 },
  tanker: { r: 1, rounds: 8 },
  fire: { r: 1, rounds: 3 },   // burning oil from an Incendiary Junk: hurts enemy ships starting a turn in it
  scorched: { r: 1, rounds: 4 }, // extra size for rigs Kade the Burner destroys
  clean: { money: 30, rounds: 4, range: 2 }, // the Clean Up action (Drillship, Repair Ship): rounds taken off
};
