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
  2: { name: 'Station', radiusCap: 3, slots: 4, hp: 5, cost: 400, tech: 'crew_quarters' },
  3: { name: 'Complex', radiusCap: 5, slots: 7, hp: 8, cost: 900, tech: 'base_complex' },
  4: { name: 'Hub', radiusCap: 6, slots: 10, hp: 12, cost: 2000, tech: 'mega_hub' },
};

// Your starting base. It gets these extras on top of a normal base.
export const ADMIRALTY = { name: 'Admiralty', rp: 4, bonusRadius: 1, bonusSlots: 1 };

// Founding a new base (building the central rig) costs this, plus `costPerBase` for each base you already own.
export const BASE_FOUNDING = { baseCost: 150, costPerBase: 40 };

// Upgrading to level 2 or higher also needs a finished Crew Quarters platform in that base.
export const QUARTERS_NEEDED_FROM = 2;

// Platform types. Every platform: one water square inside your claim, takes `turns` to build,
// has `hp`, costs `upkeep` money per turn, and is unlocked by `tech` (none = available from the start).
// Wellheads don't use up platform slots (deposits are limited anyway); everything else does.
export const PLATFORMS = {
  wellhead: { name: 'Wellhead', code: 'W', cost: 100, turns: 2, hp: 2, upkeep: 2, onDeposit: true,
    text: 'Pumps another oil deposit inside the claim.' },
  storage: { name: 'Storage Tank', code: 'S', cost: 130, turns: 2, hp: 2, upkeep: 2, oilCap: 30,
    text: '+30 oil storage.' },
  lab: { name: 'Research Lab', code: 'L', cost: 290, turns: 3, hp: 2, upkeep: 4, rp: 3, tech: 'research_labs',
    text: '+3 research points per turn.' },
  pump: { name: 'Pump Station', code: 'P', cost: 200, turns: 3, hp: 2, upkeep: 3, pump: 1, tech: 'pump_stations',
    text: '+1 oil per turn from every rig in this base.' },
  quarters: { name: 'Crew Quarters', code: 'Q', cost: 200, turns: 2, hp: 2, upkeep: 2, tech: 'crew_quarters',
    text: 'Needed to upgrade the base to a higher level.' },
  gun: { name: 'Gun Platform', code: 'G', cost: 260, turns: 3, hp: 3, upkeep: 4, range: 3, dmg: 2, tech: 'gun_platforms',
    text: 'At the start of your turn, fires at the nearest enemy ship it can see (range 3, 2 dmg).' },
  radar: { name: 'Radar Mast', code: 'R', cost: 200, turns: 2, hp: 2, upkeep: 2, sight: 5, tech: 'radar_masts',
    text: 'Sees 5 squares around it.' },
  drydock: { name: 'Dry Dock', code: 'D', cost: 520, turns: 4, hp: 4, upkeep: 6, launch: 2, repair: 2, tech: 'dry_docks',
    text: 'A shipyard: builds 2 ships at once, each 1 turn faster, and repairs your ships next to it (+2 HP per turn).' },
  refinery: { name: 'Refinery', code: 'F', cost: 390, turns: 4, hp: 3, upkeep: 5, sell: 0.1, tech: 'refineries',
    text: 'Oil sells for 10% more (up to +30% from refineries).' },
  aa: { name: 'AA Platform', code: 'A', cost: 290, turns: 3, hp: 3, upkeep: 4, airDefense: 3, tech: 'aa_platforms',
    text: 'Intercepts one missile or airstrike aimed within 3 squares each round.' },
  helipad: { name: 'Helipad', code: 'H', cost: 320, turns: 3, hp: 2, upkeep: 4, sight: 8, tech: 'helipads',
    recon: { range: 15, size: 5, cooldown: 2, money: 15 },
    text: 'Helicopter patrols: sees 8 squares around it. Launches a recon drone ($15): reveals a 5×5 area up to 15 squares away (every 2 turns).' },
  // Strike platforms: you aim them yourself from the base card. Base weapons never reach further than 10
// squares; ships with cruise missiles (range 14) outrange them all, so a turtle has to sail out and fight. They need a target you can see
  // (your own vision, a scan or a recon drone this turn), cost oil (and money) per shot, and can be
  // intercepted by AA Platforms and Frigates or scrambled by Jammer Ships.
  cruise: { name: 'Cruise Missile Battery', code: 'C', cost: 580, turns: 4, hp: 3, upkeep: 7, tech: 'cruise_missiles',
    strike: { name: 'Cruise Missile', range: 6, dmg: 3, area: 1, oil: 4, money: 35, cooldown: 2 },
    text: 'Coastal defence: fires a cruise missile at anything you can see up to 6 squares away: 3 damage, 4 oil and $35 per launch, reloads in 2 turns. (Ships with cruise missiles outrange it.)' },
  airbase: { name: 'Airbase', code: 'B', cost: 1170, turns: 6, hp: 5, upkeep: 12, tech: 'strategic_bombers', needsLevel: 3,
    strike: { name: 'Bomber Sortie', range: 10, dmg: 3, area: 3, oil: 10, money: 120, cooldown: 3 },
    text: 'Strategic bombers: hit a 3×3 area you can see up to 10 squares away for 3 damage. 10 oil and $120 per sortie, every 3 turns. Needs a Complex (level 3) base.' },
  // The Post-Oil megaproject: finishing it wins the game. Everyone can see it the moment it's started.
  fusion: { name: 'Deep-Sea Fusion Plant', code: '⚛', cost: 3250, turns: 10, hp: 14, upkeep: 20, tech: 'fusion_engineering',
    megaproject: true, needsLevel: 4, public: true,
    text: 'Post-Oil victory: finish it (10 turns) at a Hub base and you win. Every rival is warned when you start.' },
  missile: { name: 'Missile Battery', code: 'M', cost: 490, turns: 4, hp: 3, upkeep: 6, range: 5, dmg: 3, tech: 'missile_batteries',
    text: 'At the start of your turn, fires at the nearest enemy ship it can see (range 5, 3 dmg).' },
};
