// ============================================================
// VICTORY CONDITIONS (tune them here)
// Conquest is always on. The others can be switched off on the new-game screen.
// ============================================================

export const VICTORIES = {
  conquest:   { name: 'Conquest', icon: '⚔️', always: true,
    text: 'Wreck or capture every rival Admiralty. A player who loses theirs has a few turns to rebuild it or move it, or they are out.' },
  domination: { name: 'Domination', icon: '🗺️',
    text: 'Control a big share of all the sea claimed by bases, round after round.' },
  postoil:    { name: 'Post-Oil', icon: '⚛️',
    text: 'Research the Era V Post-Oil techs, then build a Deep-Sea Fusion Plant at a Hub base and keep it alive until it finishes.' },
  lastrig:    { name: 'Last Rig Standing', icon: '🛢️',
    text: 'When the world runs low on oil, a final countdown starts. When it ends, whoever controls the most oil still in the ground wins.' },
};

// Conquest: turns you have to rebuild or move your Admiralty after losing it, and the price of moving it.
export const CONQUEST = { exileTurns: 5, moveCapitalCost: 300 };

// Domination: control at least `share` of all claimed sea, and claim at least `minMapShare` of the map's
// open water yourself, for `rounds` rounds in a row.
export const DOMINATION = { share: 0.4, minMapShare: 0.06, rounds: 6 };

// Last Rig Standing: the Final Reserves countdown starts when the world's remaining oil drops below
// `threshold` of what it started with, and lasts `rounds` rounds.
export const LAST_RIG = { threshold: 0.15, rounds: 10 };
