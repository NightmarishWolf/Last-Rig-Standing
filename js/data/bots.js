// ============================================================
// COMPUTER PLAYERS: difficulty levels and personalities.
//
// Bots play by exactly the same rules as people and never see through the fog:
// they only read what their own view shows them. Difficulty changes how well they
// think; only Admiral+ gets an economic head start.
// ============================================================

// skill:      0–1, how often the bot makes the sensible choice instead of a sloppy one
// expanders:  how many ships at once may be off founding new rig bases
// scouts:     how many ships it keeps exploring
// guards:     ships it keeps on guard at each base (the rest join the main fleet)
// funding:    share of spare money it spends buying extra research points
// platforms:  how many platforms it starts per turn
// bonus:      Admiral+ only: extra oil from every rig and free research points each turn
export const DIFFICULTY = {
  easy: { name: 'Easy', icon: '🙂', skill: 0.45, expanders: 1, scouts: 1, guards: 0, funding: 0, platforms: 1,
    text: 'Slow and sloppy: expands late, wastes money, barely defends.' },
  normal: { name: 'Normal', icon: '⚓', skill: 0.75, expanders: 2, scouts: 2, guards: 1, funding: 0.15, platforms: 2,
    text: 'A sensible admiral who still makes the odd mistake.' },
  hard: { name: 'Hard', icon: '🎖️', skill: 0.95, expanders: 3, scouts: 2, guards: 1, funding: 0.3, platforms: 3,
    text: 'Plays tight: fast expansion, efficient spending, steady research.' },
  admiral: { name: 'Admiral+', icon: '👑', skill: 1, expanders: 4, scouts: 3, guards: 2, funding: 0.35, platforms: 4,
    bonus: { oil: 1.25, rp: 2 },
    text: 'Hard, plus a head start: +25% oil from every rig and +2 research a turn. Still never sees through fog.' },
};
export const DIFFICULTY_ORDER = ['easy', 'normal', 'hard', 'admiral'];

// Personalities: what a bot likes to build and research, and how it plays.
//   ships:    how much it likes each ship (higher = picked more often when it builds warships)
//   research: techs it works toward, in order (the queue fills in whatever they need first)
//   fleetShare: share of its spending that goes to warships rather than economy
//   aggression: 0–1, how eagerly it attacks
//   bases:    how many bases it wants before it switches from expanding to building up and fighting
//   platforms: which platforms it builds first
export const PERSONALITIES = {
  admiral: {
    name: 'Admiral', icon: '⚓', text: 'Balanced: a bit of everything.',
    ships: { patrol: 1, corvette: 2, destroyer: 4, submarine: 2, frigate: 2, cruiser: 3, missileboat: 2, battleship: 2, carrier: 1, repair: 1 },
    research: ['research_labs', 'destroyer_program', 'storage_tanks', 'crew_quarters', 'pump_stations', 'forward_bases', 'quality',
      'gun_platforms', 'guided_missiles', 'cruise_missiles', 'dry_docks', 'helipads', 'base_complex', 'refineries', 'battleship_program', 'mega_hub', 'fusion_engineering'],
    fleetShare: 0.45, aggression: 0.5, bases: 6,
    platforms: ['wellhead', 'lab', 'storage', 'quarters', 'pump', 'gun', 'helipad', 'cruise', 'drydock', 'refinery', 'radar', 'aa', 'airbase'],
  },
  tycoon: {
    name: 'Tycoon', icon: '💰', text: 'Builds a rich, well-defended economy and aims for Post-Oil or Last Rig.',
    ships: { patrol: 1, corvette: 2, destroyer: 3, frigate: 3, cruiser: 2, repair: 2, drillship: 1 },
    research: ['research_labs', 'seismic', 'storage_tanks', 'trading', 'pump_stations', 'crew_quarters', 'refining', 'gun_platforms',
      'destroyer_program', 'base_complex', 'refineries', 'deep_water', 'aa_platforms', 'helipads', 'cruise_missiles', 'mega_hub', 'satellites', 'fusion_engineering'],
    fleetShare: 0.3, aggression: 0.2, bases: 9,
    platforms: ['wellhead', 'lab', 'storage', 'pump', 'quarters', 'gun', 'refinery', 'aa', 'helipad', 'cruise', 'radar', 'drydock', 'missile'],
  },
  raider: {
    name: 'Raider', icon: '🦈', text: 'Submarines and fast boats that hunt rigs and supply lines.',
    ships: { patrol: 2, corvette: 2, hydrofoil: 4, submarine: 5, missileboat: 3, minelayer: 1, nuclearsub: 4, destroyer: 1 },
    research: ['torpedoes2', 'ballast', 'research_labs', 'storage_tanks', 'snorkel', 'hydrofoils', 'forward_bases', 'stealth_doc',
      'mine_warfare', 'guided_missiles', 'crew_quarters', 'wake_homing', 'silent_service', 'nuclear_prop', 'ballistic_missiles', 'wolf_packs'],
    fleetShare: 0.55, aggression: 0.75, bases: 5,
    platforms: ['wellhead', 'storage', 'lab', 'quarters', 'gun', 'pump', 'radar', 'drydock'],
  },
  conqueror: {
    name: 'Conqueror', icon: '⚔️', text: 'Big guns and big fleets: goes for Conquest and Domination.',
    ships: { corvette: 1, destroyer: 4, frigate: 2, cruiser: 4, battleship: 5, dreadnought: 5, carrier: 2, command: 1, repair: 1 },
    research: ['destroyer_program', 'artillery', 'research_labs', 'steel_hulls', 'storage_tanks', 'quality', 'big_guns', 'crew_quarters',
      'guided_missiles', 'cruise_missiles', 'dry_docks', 'helipads', 'battleship_program', 'battle_fleets', 'base_complex', 'naval_aviation', 'strategic_bombers', 'dreadnought_program'],
    fleetShare: 0.6, aggression: 0.9, bases: 5,
    platforms: ['wellhead', 'storage', 'lab', 'quarters', 'helipad', 'cruise', 'drydock', 'airbase', 'gun', 'pump', 'radar'],
  },
};
export const PERSONALITY_ORDER = ['admiral', 'tycoon', 'raider', 'conqueror'];

// Bot names shown in the game (replaces "Player 2" etc. for computer seats).
export const BOT_NAMES = ['Adm. Vance', 'Adm. Okafor', 'Adm. Lindqvist', 'Adm. Moreau', 'Adm. Tanaka', 'Adm. Reyes', 'Adm. Kowalski', 'Adm. Haddad'];
