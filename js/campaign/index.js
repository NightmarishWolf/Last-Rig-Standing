// ============================================================
// THE CAMPAIGN: the missions, in order, per arc. The story is in docs/LORE.md.
// Each mission is a file in ./missions (map, setup, dialogue, steps, triggers, goals).
// ============================================================
import navy01 from './missions/navy01.js';
import navy02 from './missions/navy02.js';
import navy03 from './missions/navy03.js';
import navy04 from './missions/navy04.js';
import navy05 from './missions/navy05.js';
import navy06 from './missions/navy06.js';
import navy07 from './missions/navy07.js';
import navy08 from './missions/navy08.js';
import navy09 from './missions/navy09.js';
import navy10 from './missions/navy10.js';

export const MISSIONS = Object.fromEntries([navy01, navy02, navy03, navy04, navy05, navy06, navy07, navy08, navy09, navy10].map(m => [m.id, m]));

export const ARCS = {
  navy: {
    name: 'Coalition Navy', subtitle: 'Part One: The Allocation',
    blurb: 'The last oil on Earth lies under the sea, and the Coalition Navy keeps it. Serve the Accords, and see what they cost.',
    missions: ['navy-1', 'navy-2', 'navy-3', 'navy-4', 'navy-5', 'navy-6', 'navy-7', 'navy-8', 'navy-9', 'navy-10'],
    planned: 10, // missions in Part One (the rest are on the way)
  },
};

// A mission is open once the one before it in its arc has been won.
export function missionOpen(prog, id) {
  for (const arc of Object.values(ARCS)) {
    const i = arc.missions.indexOf(id);
    if (i === 0) return true;
    if (i > 0) return !!prog?.[arc.missions[i - 1]]?.best;
  }
  return false;
}
