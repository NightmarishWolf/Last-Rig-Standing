// ============================================================
// FACTIONS: who you play as. Every faction shares the oil economy (surveying, rigs, bases, the market,
// victories) but has its own warships, military research and signature mechanic. See docs/FACTIONS.md.
//
// Ships and techs say which faction they belong to (`faction`; none = everyone's). A faction's research
// can stand in for another's where shared techs need it (`same` in research.js), so both can still reach
// gun platforms, dry docks and the rest of Rig Engineering.
// ============================================================

export const FACTIONS = {
  navy: {
    name: 'Coalition Navy', short: 'Navy', icon: '⚓',
    text: 'A professional navy: tough, expensive ships that fight best along their supply lines.',
    mechanic: 'Logistics: ships in supply (near your bases, ports, home waters or a Supply Ship) repair 1 HP a turn out of combat. Ships out of supply for 3 rounds or more are low on supplies: −1 damage.',
    weakness: 'Slow and costly; weaker far from supply.',
  },
  tide: {
    name: 'Free Tide', short: 'Tide', icon: '🏴',
    text: 'Insurgents, smugglers and swarms: cheap boats in packs, a raft network that spreads from their bases, and plunder.',
    mechanic: 'The Tide: a raft network spreads from your bases (and Leviathans). On it your ships get +1 move, pay half oil, heal 1 HP a turn, and new boats launch from any base. Small boats come in packs, sunk enemies near your ships leave plunder, and Boarding Skiffs capture burning ships.',
    weakness: 'Fragile hulls, little long range; weak away from the Tide.',
  },
};
export const FACTION_ORDER = ['navy', 'tide'];
export const factionOf = (st, p) => (p < 0 || !st.players[p] ? null : st.players[p].faction || 'navy');

// Navy: Logistics
export const SUPPLY = {
  baseExtra: 3,   // a base supplies ships up to its claim radius + this many squares
  port: 5,        // forward ports supply ships within this many squares
  heal: 1,        // HP repaired a turn in supply, out of combat (no shots fired or taken last round)
  lowAfter: 3,    // rounds out of supply before a ship is low on supplies
  lowDmg: 1,      // damage lost while low on supplies (never below 1)
};

// Free Tide: the raft network, packs and plunder
export const TIDE = {
  start: 2,       // a new base's Tide radius
  growEvery: 3,   // it grows 1 square every this many of your turns...
  max: 5,         // ...up to this (research adds to both)
  move: 1,        // extra moves for ships starting their turn on the Tide
  heal: 1,        // HP healed a turn on the Tide
  oilMult: 0.5,   // oil paid for moves that start on the Tide
  yardFrom: 4,    // a base's Raft Dock opens once its Tide reaches this radius
};
export const PLUNDER = {
  range: 3,       // a Tide ship this close to an enemy ship when it sinks takes plunder
  share: 0.2,     // share of the sunk ship's price taken as money (the wreck is worth that much less)
  oil: 10,        // tankers and barges also give this much oil
};
export const BOARDING = {
  share: 1 / 3,   // a ship can be boarded at this share of its full HP or less ("burning")
};
