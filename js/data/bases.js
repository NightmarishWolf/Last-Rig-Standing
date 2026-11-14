// ============================================================
// RIG BASES: levels and platforms.
//
// A rig base is founded by building a rig on an oil deposit. It claims the water
// around it (claim radius 1 = 3×3, up to radius 6 = 13×13) and you build platforms
// on water squares inside that claim.
//
// Claim radius = 1 + research bonuses, but never more than the base level's radiusCap.
// ============================================================

export const BASE_LEVELS = {
  1: { name: 'Outpost', radiusCap: 2, slots: 2, hp: 3 },
  2: { name: 'Station', radiusCap: 3, slots: 4, hp: 5, cost: 300, tech: 'crew_quarters' },
  3: { name: 'Complex', radiusCap: 5, slots: 7, hp: 8, cost: 700, tech: 'base_complex' },
  4: { name: 'Hub', radiusCap: 6, slots: 10, hp: 12, cost: 1500, tech: 'mega_hub' },
};

// Your starting base. It gets these extras on top of a normal base.
export const ADMIRALTY = { name: 'Admiralty', rp: 4, bonusRadius: 1, bonusSlots: 1 };

// Founding a new base (building the central rig) costs this, plus `costPerBase` for each base you already own.
export const BASE_FOUNDING = { baseCost: 100, costPerBase: 25 };

// Upgrading to level 2 or higher also needs a finished Crew Quarters platform in that base.
export const QUARTERS_NEEDED_FROM = 2;

// Platform types. Every platform: one water square inside your claim, takes `turns` to build,
// has `hp`, costs `upkeep` money per turn, and is unlocked by `tech` (none = available from the start).
// Wellheads don't use up platform slots (deposits are limited anyway); everything else does.
export const PLATFORMS = {
  wellhead: { name: 'Wellhead', code: 'W', cost: 80, turns: 2, hp: 2, upkeep: 2, onDeposit: true,
    text: 'Pumps another oil deposit inside the claim.' },
  storage: { name: 'Storage Tank', code: 'S', cost: 100, turns: 2, hp: 2, upkeep: 2, oilCap: 30,
    text: '+30 oil storage.' },
  lab: { name: 'Research Lab', code: 'L', cost: 220, turns: 3, hp: 2, upkeep: 4, rp: 3, tech: 'research_labs',
    text: '+3 research points per turn.' },
  pump: { name: 'Pump Station', code: 'P', cost: 150, turns: 3, hp: 2, upkeep: 3, pump: 1, tech: 'pump_stations',
    text: '+1 oil per turn from every rig in this base.' },
  quarters: { name: 'Crew Quarters', code: 'Q', cost: 150, turns: 2, hp: 2, upkeep: 2, tech: 'crew_quarters',
    text: 'Needed to upgrade the base to a higher level.' },
  gun: { name: 'Gun Platform', code: 'G', cost: 200, turns: 3, hp: 3, upkeep: 4, range: 3, dmg: 2, tech: 'gun_platforms',
    text: 'At the start of your turn, fires at the nearest enemy ship it can see (range 3, 2 dmg).' },
  radar: { name: 'Radar Mast', code: 'R', cost: 150, turns: 2, hp: 2, upkeep: 2, sight: 5, tech: 'radar_masts',
    text: 'Sees 5 squares around it.' },
  drydock: { name: 'Dry Dock', code: 'D', cost: 400, turns: 4, hp: 4, upkeep: 6, launch: 2, repair: 2, tech: 'dry_docks',
    text: 'Launch new ships within 2 squares, and repair your ships next to it (+2 HP per turn).' },
  refinery: { name: 'Refinery', code: 'F', cost: 300, turns: 4, hp: 3, upkeep: 5, sell: 0.1, tech: 'refineries',
    text: 'Oil sells for 10% more (up to +30% from refineries).' },
  aa: { name: 'AA Platform', code: 'A', cost: 220, turns: 3, hp: 3, upkeep: 4, airDefense: 3, tech: 'aa_platforms',
    text: 'Intercepts one missile or airstrike aimed within 3 squares each round.' },
  helipad: { name: 'Helipad', code: 'H', cost: 250, turns: 3, hp: 2, upkeep: 4, sight: 8, tech: 'helipads',
    text: 'Helicopter patrols: sees 8 squares around it.' },
  missile: { name: 'Missile Battery', code: 'M', cost: 380, turns: 4, hp: 3, upkeep: 6, range: 5, dmg: 3, tech: 'missile_batteries',
    text: 'At the start of your turn, fires at the nearest enemy ship it can see (range 5, 3 dmg).' },
};
