// ============================================================
// RESEARCH TREE
//
// Each tech: { id, name, branch, era, req: [tech ids], effects: [...], unlocks: {...}, doctrine }
//   era:      1–4 (sets the cost, see ERA_COST)
//   req:      every listed tech must be researched first (they can be in other branches)
//   doctrine: techs sharing a doctrine id are a choice: researching one locks the others for good
//   unlocks:  { ships: [...], platforms: [...], port: true, baseLevel: n }
//
// Effects (all add up; "mult" multiplies):
//   { ship: 'light'|'escort'|'sub'|'capital'|'support'|'all'|<ship id>, stat: 'move'|'hp'|'sight'|'armor'|'oil'|'cost'|'sonar'|'jam', add | mult }
//   { weapon: 'gun'|'torpedo'|'missile'|'air'|'depth'|'scan'|'all', stat: 'range'|'dmg'|'shots', add }
//   { player: <key>, add | mult } with keys:
//     oilCap, sellMult, priceDropMult, upkeepMult, surveyRadius, rigRate, reservesMult, portRange,
//     claimRadius, slots, platformCostMult, platformHpMult, platformUpkeepMult, baseCostMult,
//     rp, heal, baseSight, stealth, flashExact, platformRange, platformRepair,
//     deepLayers (dry rigs drill deeper: see DEEP_LAYERS in economy.js), pumpBonus (oil per Pump Station)
// ============================================================

export const ERA_COST = { 1: 12, 2: 25, 3: 50, 4: 90, 5: 150 }; // research points per tech (Era V: Post-Oil)
export const FUNDING = { costPerRp: 15, maxRp: 20 };   // buy extra research with money each turn

export const BRANCHES = {
  prop:   { name: 'Propulsion', icon: '⚙️' },
  econ:   { name: 'Economy', icon: '💰' },
  drill:  { name: 'Drilling', icon: '🛢️' },
  sens:   { name: 'Sensors & Intel', icon: '📡' },
  weap:   { name: 'Weapons', icon: '💥' },
  armor:  { name: 'Armor & Survival', icon: '🛡️' },
  ships:  { name: 'Shipbuilding', icon: '⚓' },
  rigs:   { name: 'Rig Engineering', icon: '🏗️' },
  future: { name: 'Post-Oil', icon: '⚛️' },
};

// Everyone starts with these.
export const STARTING_TECHS = ['platform_construction'];

const T = (id, name, branch, era, req, effects = [], unlocks = {}, doctrine = null, text = '') =>
  ({ id, name, branch, era, req, effects, unlocks, doctrine, text });

export const TECHS = [
  // ---------------- ⚙️ PROPULSION ----------------
  T('diesel', 'Diesel Engines', 'prop', 1, [], [{ ship: 'light', stat: 'move', add: 1 }]),
  T('ballast', 'Ballast Tanks', 'prop', 1, [], [{ ship: 'sub', stat: 'move', add: 1 }]),
  T('turbines', 'Steam Turbines', 'prop', 2, ['diesel'], [{ ship: 'escort', stat: 'move', add: 1 }]),
  T('fuel_eff', 'Fuel Efficiency', 'prop', 2, ['diesel'], [{ ship: 'all', stat: 'oil', mult: 0.75 }]),
  T('speed_doc', 'Speed Doctrine', 'prop', 2, ['turbines'], [{ ship: 'light', stat: 'move', add: 1 }, { ship: 'escort', stat: 'move', add: 1 }], {}, 'prop2',
    'Fast fleets: +1 move for light ships and escorts.'),
  T('endurance_doc', 'Endurance Doctrine', 'prop', 2, ['fuel_eff'], [{ ship: 'all', stat: 'oil', mult: 0.7 }, { player: 'upkeepMult', mult: 0.9 }], {}, 'prop2',
    'Long voyages: ships burn 30% less oil and cost 10% less upkeep.'),
  T('hydrofoils', 'Hydrofoils', 'prop', 3, ['turbines'], [{ ship: 'light', stat: 'move', add: 1 }], { ships: ['hydrofoil'] }),
  T('gas_turbines', 'Gas Turbines', 'prop', 3, ['turbines', 'fuel_eff'], [{ ship: 'capital', stat: 'move', add: 1 }]),
  T('snorkel', 'Snorkels', 'prop', 3, ['ballast'], [{ ship: 'sub', stat: 'move', add: 1 }, { ship: 'sub', stat: 'sight', add: 1 }]),
  T('nuclear_prop', 'Nuclear Propulsion', 'prop', 4, ['snorkel', 'gas_turbines'], [{ ship: 'sub', stat: 'move', add: 1 }], { ships: ['nuclearsub'] }),
  T('advanced_hulls', 'Advanced Hull Design', 'prop', 4, ['gas_turbines'], [{ ship: 'all', stat: 'move', add: 1 }]),
  T('surface_power', 'Surface Power', 'prop', 4, ['advanced_hulls'], [{ ship: 'capital', stat: 'move', add: 1 }, { ship: 'capital', stat: 'oil', mult: 0.8 }], {}, 'prop4',
    'Big-ship navy: capital ships +1 move and 20% cheaper to move.'),
  T('silent_service', 'Silent Service', 'prop', 4, ['nuclear_prop'], [{ ship: 'sub', stat: 'hp', mult: 1.25 }, { ship: 'sub', stat: 'sight', add: 1 }], {}, 'prop4',
    'Submarine navy: subs get 25% more HP and +1 sight.'),

  // ---------------- 💰 ECONOMY (money, markets and storage) ----------------
  T('trading', 'Commodity Trading', 'econ', 1, [], [{ player: 'sellMult', mult: 1.1 }]),
  T('storage_tanks', 'Storage Tanks', 'econ', 2, [], [{ player: 'oilCap', add: 40 }]),
  T('refining', 'Refining', 'econ', 2, ['trading'], [{ player: 'sellMult', mult: 1.1 }]),
  T('free_market', 'Free Market', 'econ', 2, ['refining'], [{ player: 'sellMult', mult: 1.15 }, { player: 'priceDropMult', mult: 0.7 }], {}, 'econ2',
    'Sell high: oil sells for 15% more and the price drops more slowly when you sell.'),
  T('strategic_reserve', 'Strategic Reserve', 'econ', 2, ['storage_tanks'], [{ player: 'oilCap', add: 60 }, { player: 'reservesMult', mult: 1.15 }], {}, 'econ2',
    'Hoard: +60 oil storage, and new rigs tap 15% more oil.'),
  T('corporate_finance', 'Corporate Finance', 'econ', 3, ['refining'], [{ player: 'upkeepMult', mult: 0.9 }, { player: 'baseCostMult', mult: 0.85 }]),
  T('futures', 'Futures Markets', 'econ', 4, ['corporate_finance'], [{ player: 'priceDropMult', mult: 0.5 }]),
  T('expansion', 'Expansion', 'econ', 4, ['corporate_finance'], [{ player: 'baseCostMult', mult: 0.6 }, { player: 'platformCostMult', mult: 0.85 }], {}, 'econ4',
    'Many bases: founding bases costs 40% less and platforms 15% less.'),

  // ---------------- ⛏️ DRILLING (oil production: finding it, pumping it, and making it last) ----------------
  T('seismic', 'Seismic Surveys', 'drill', 1, [], [{ player: 'surveyRadius', add: 1 }]),
  T('pump_stations', 'Pump Stations', 'drill', 2, ['platform_construction'], [], { platforms: ['pump'] }),
  T('deep_drilling', 'Deeper Wells', 'drill', 2, ['seismic'], [{ player: 'deepLayers', add: 1 }], {}, null,
    'When one of your rigs runs dry, it drills deeper and strikes a second layer with 40% of the deposit\'s original oil.'),
  T('deep_water', 'Deep-Water Drilling', 'drill', 3, ['seismic'], [{ player: 'rigRate', add: 1 }]),
  T('mobile_drilling', 'Mobile Drilling', 'drill', 3, ['deep_water'], [], { ships: ['drillship'] }),
  T('improved_pumps', 'Improved Pumps', 'drill', 3, ['pump_stations'], [{ player: 'pumpBonus', add: 1 }], {}, null,
    'Pump Stations pump +1 more oil each (every rig in the base).'),
  T('ultra_deep', 'Ultra-Deep Drilling', 'drill', 3, ['deep_drilling', 'deep_water'], [{ player: 'deepLayers', add: 1 }], {}, null,
    'Dry rigs can drill down a third layer (another 40% of the original oil).'),
  T('enhanced_recovery', 'Enhanced Recovery', 'drill', 4, ['deep_water'], [{ player: 'reservesMult', mult: 1.25 }]),
  T('automated_drilling', 'Automated Drilling', 'drill', 4, ['improved_pumps'], [{ player: 'rigRate', add: 1 }]),
  T('consolidation', 'Consolidation', 'drill', 4, ['enhanced_recovery'], [{ player: 'rigRate', add: 1 }, { player: 'slots', add: 2 }], {}, 'econ4',
    'Few big bases: every rig pumps +1 and every base gets 2 more platform slots.'),
  T('abyssal_drilling', 'Abyssal Drilling', 'drill', 4, ['ultra_deep', 'enhanced_recovery'], [{ player: 'deepLayers', add: 1 }], {}, null,
    'Dry rigs can drill a fourth layer, the deepest (50% of the original oil).'),

  // ---------------- 📡 SENSORS & INTEL ----------------
  T('radar', 'Improved Radar', 'sens', 1, [], [{ ship: 'all', stat: 'sight', add: 1 }]),
  T('hydrophones', 'Hydrophones', 'sens', 1, [], [{ ship: 'sub', stat: 'sight', add: 1 }, { ship: 'destroyer', stat: 'sonar', add: 1 }]),
  T('active_sonar', 'Active Sonar', 'sens', 2, ['hydrophones'], [{ ship: 'destroyer', stat: 'sonar', add: 1 }, { ship: 'frigate', stat: 'sonar', add: 2 }]),
  T('coastal_watch', 'Coastal Watch', 'sens', 2, ['radar'], [{ player: 'baseSight', add: 2 }]),
  T('detection', 'Detection Doctrine', 'sens', 2, ['radar'], [{ ship: 'all', stat: 'sight', add: 1 }, { player: 'baseSight', add: 1 }], {}, 'sens2',
    'See further: +1 sight for every ship and base.'),
  T('stealth_doc', 'Stealth Doctrine', 'sens', 2, ['hydrophones'], [{ player: 'stealth', add: 1 }], {}, 'sens2',
    'Hard to spot: enemies must come 1 square closer to see your ships.'),
  T('electronic_warfare', 'Electronic Warfare', 'sens', 3, ['coastal_watch'], [], { ships: ['jammer'] }),
  T('sigint', 'Signals Intelligence', 'sens', 3, ['electronic_warfare'], [{ player: 'flashExact', add: 1 }],
    {}, null, 'When an enemy fires, you see exactly where the shot came from.'),
  T('long_range_radar', 'Long-Range Radar', 'sens', 3, ['coastal_watch'], [{ ship: 'capital', stat: 'sight', add: 2 }, { player: 'baseSight', add: 2 }]),
  T('satellites', 'Satellite Reconnaissance', 'sens', 4, ['long_range_radar', 'sigint'], [{ player: 'baseSight', add: 4 }, { weapon: 'scan', stat: 'range', add: 2 }], {}, null,
    'Bases see 4 further, scans reach 2 further, and a satellite pass reveals a 7×7 area anywhere on the map every 4 turns (from your Admiralty).'),
  T('signals_war', 'Signals War', 'sens', 4, ['sigint'], [{ ship: 'jammer', stat: 'jam', add: 1 }, { ship: 'jammer', stat: 'cost', mult: 0.7 }], {}, 'sens4',
    'Jam everything: jammers cover 1 more square and cost 30% less.'),
  T('satellite_network', 'Satellite Network', 'sens', 4, ['satellites'], [{ player: 'baseSight', add: 4 }, { ship: 'all', stat: 'sight', add: 1 }], {}, 'sens4',
    'Eyes everywhere: +4 sight for bases and +1 for every ship.'),

  // ---------------- 💥 WEAPONS ----------------
  T('artillery', 'Naval Artillery', 'weap', 1, [], [{ weapon: 'gun', stat: 'dmg', add: 1 }]),
  T('torpedoes2', 'Improved Torpedoes', 'weap', 1, [], [{ weapon: 'torpedo', stat: 'range', add: 1 }]),
  T('mine_warfare', 'Mine Warfare', 'weap', 2, ['torpedoes2'], [], { ships: ['minelayer'] }),
  T('fire_control', 'Fire Control', 'weap', 2, ['artillery'], [{ weapon: 'gun', stat: 'range', add: 1 }]),
  T('big_guns', 'Big Guns', 'weap', 2, ['fire_control'], [{ weapon: 'gun', stat: 'dmg', add: 1 }, { weapon: 'gun', stat: 'range', add: 1 }], {}, 'weap2',
    'Gun navy: +1 damage and +1 range for all guns.'),
  T('missile_doc', 'Missile Doctrine', 'weap', 2, ['fire_control'], [{ weapon: 'missile', stat: 'dmg', add: 1 }, { weapon: 'missile', stat: 'range', add: 1 }, { weapon: 'air', stat: 'range', add: 1 }], {}, 'weap2',
    'Missile navy: +1 damage and +1 range for missiles, +1 range for airstrikes.'),
  T('guided_missiles', 'Guided Missiles', 'weap', 3, ['fire_control'], [{ weapon: 'missile', stat: 'range', add: 1 }], { ships: ['missileboat', 'cruiser'] }),
  T('air_defense', 'Air Defense', 'weap', 3, ['fire_control'], [], { ships: ['frigate'] }),
  T('wake_homing', 'Wake-Homing Torpedoes', 'weap', 3, ['mine_warfare'], [{ weapon: 'torpedo', stat: 'dmg', add: 1 }]),
  T('cruise_missiles', 'Cruise Missiles', 'weap', 3, ['guided_missiles'], [], { platforms: ['cruise'] }, null,
    'Missile Boats and Cruisers get Cruise Missiles (range 14, outranging any base), and bases can build Cruise Missile Batteries for coastal defence (range 6).'),
  T('strategic_bombers', 'Strategic Bombers', 'weap', 4, ['naval_aviation'], [], { platforms: ['airbase'] }, null,
    'Airbases: bomber sorties hit a 3×3 area up to 10 squares from the base.'),
  T('ballistic_missiles', 'Sub-Launched Missiles', 'weap', 4, ['nuclear_prop', 'guided_missiles'], [], {}, null,
    'Nuclear Submarines can fire a missile at anything you can see up to 12 squares away.'),
  T('naval_aviation', 'Naval Aviation', 'weap', 4, ['air_defense', 'guided_missiles'], [], { ships: ['carrier'] }),
  T('asw', 'Anti-Submarine Warfare', 'weap', 4, ['wake_homing'], [{ weapon: 'depth', stat: 'dmg', add: 1 }, { weapon: 'depth', stat: 'range', add: 1 }]),
  T('saturation', 'Saturation Fire', 'weap', 4, ['guided_missiles'], [{ weapon: 'all', stat: 'shots', add: 1 }], {}, 'weap4',
    'More shots: every weapon fires one extra shot per turn.'),
  T('precision', 'Precision Strike', 'weap', 4, ['guided_missiles'], [{ weapon: 'all', stat: 'range', add: 1 }, { weapon: 'all', stat: 'dmg', add: 1 }], {}, 'weap4',
    'Fewer, better shots: +1 range and +1 damage for every weapon.'),

  // ---------------- 🛡️ ARMOR & SURVIVAL ----------------
  T('steel_hulls', 'Steel Hulls', 'armor', 1, [], [{ ship: 'light', stat: 'hp', add: 1 }]),
  T('bulkheads', 'Watertight Bulkheads', 'armor', 1, [], [{ ship: 'escort', stat: 'hp', add: 1 }]),
  T('damage_control', 'Damage Control', 'armor', 2, ['steel_hulls'], [{ player: 'heal', add: 1 }],
    {}, null, 'Ships inside your base claims heal 1 HP at the start of your turn.'),
  T('armor_plating', 'Armor Plating', 'armor', 2, ['bulkheads'], [{ ship: 'capital', stat: 'armor', add: 1 }]),
  T('heavy_armor', 'Heavy Armor', 'armor', 2, ['armor_plating'], [{ ship: 'capital', stat: 'armor', add: 1 }, { ship: 'escort', stat: 'armor', add: 1 }], {}, 'armor2',
    'Shrug it off: +1 armor for capital ships and escorts.'),
  T('field_repairs', 'Field Repairs', 'armor', 2, ['damage_control'], [{ player: 'heal', add: 2 }], {}, 'armor2',
    'Patch it up: ships in your claims heal 2 more HP per turn.'),
  T('repair_tenders', 'Repair Tenders', 'armor', 3, ['damage_control'], [], { ships: ['repair'] }),
  T('compartments', 'Compartmentalization', 'armor', 3, ['armor_plating'], [{ ship: 'all', stat: 'hp', mult: 1.2 }]),
  T('platform_armor', 'Reinforced Platforms', 'armor', 3, ['bulkheads'], [{ player: 'platformHpMult', mult: 1.5 }]),
  T('composite_armor', 'Composite Armor', 'armor', 4, ['compartments'], [{ ship: 'capital', stat: 'hp', add: 2 }]),
  T('emergency_repairs', 'Emergency Repairs', 'armor', 4, ['repair_tenders'], [{ player: 'heal', add: 1 }, { player: 'platformRepair', add: 1 }]),
  T('hardened_hulls', 'Hardened Hulls', 'armor', 4, ['composite_armor'], [{ ship: 'all', stat: 'hp', mult: 1.15 }, { ship: 'light', stat: 'armor', add: 1 }], {}, 'armor4',
    'Tough everywhere: 15% more HP for every ship and +1 armor for light ships.'),
  T('rapid_repair', 'Rapid Repair', 'armor', 4, ['emergency_repairs'], [{ player: 'heal', add: 2 }, { player: 'platformRepair', add: 1 }], {}, 'armor4',
    'Fix everything: ships heal 2 more per turn in your claims, platforms repair themselves.'),

  // ---------------- ⚓ SHIPBUILDING ----------------
  T('destroyer_program', 'Destroyer Program', 'ships', 1, [], [], { ships: ['destroyer'] }),
  T('forward_bases', 'Forward Bases', 'ships', 1, [], [], { port: true }, null, 'Build forward ports on island coasts.'),
  T('fleet_logistics', 'Fleet Logistics', 'ships', 2, ['forward_bases'], [{ player: 'upkeepMult', mult: 0.85 }]),
  T('salvage_ops', 'Salvage Operations', 'ships', 2, ['forward_bases'], [], { ships: ['salvage'] }),
  T('quantity', 'Quantity', 'ships', 2, ['destroyer_program'], [{ ship: 'all', stat: 'cost', mult: 0.85 }, { ship: 'all', stat: 'build', add: -1 }], {}, 'ships2',
    'Mass production: every ship costs 15% less and builds 1 turn faster.'),
  T('quality', 'Quality', 'ships', 2, ['destroyer_program'], [{ ship: 'all', stat: 'hp', add: 1 }], {}, 'ships2',
    'Built to last: every ship gets +1 HP.'),
  T('cruiser_program', 'Cruiser Program', 'ships', 3, ['destroyer_program', 'fleet_logistics'], [{ ship: 'cruiser', stat: 'cost', mult: 0.9 }],
    {}, null, 'Cheaper cruisers (10% off). Cruisers themselves come with Guided Missiles.'),
  T('port_expansion', 'Port Expansion', 'ships', 3, ['forward_bases'], [{ player: 'portRange', add: 2 }]),
  T('command_control', 'Command & Control', 'ships', 3, ['cruiser_program'], [], { ships: ['command'] }),
  T('battleship_program', 'Battleship Program', 'ships', 4, ['cruiser_program'], [], { ships: ['battleship'] }),
  T('dreadnought_program', 'Dreadnought Program', 'ships', 4, ['battleship_program'], [], { ships: ['dreadnought'] }),
  T('battle_fleets', 'Battle Fleets', 'ships', 4, ['battleship_program'], [{ ship: 'capital', stat: 'cost', mult: 0.85 }, { ship: 'capital', stat: 'hp', add: 1 }, { ship: 'capital', stat: 'build', add: -1 }], {}, 'ships4',
    'Big ships: capital ships cost 15% less, get +1 HP and build 1 turn faster.'),
  T('wolf_packs', 'Wolf Packs', 'ships', 4, ['command_control'], [{ ship: 'sub', stat: 'cost', mult: 0.8 }, { ship: 'light', stat: 'cost', mult: 0.8 }], {}, 'ships4',
    'Swarms: submarines and light ships cost 20% less.'),

  // ---------------- 🏗️ RIG ENGINEERING ----------------
  T('platform_construction', 'Platform Construction', 'rigs', 1, [], [], { platforms: ['wellhead', 'storage'] },
    null, 'Rig bases claim 3×3. Build Wellheads and Storage Tanks.'),
  T('pipelines', 'Pipelines', 'rigs', 1, ['platform_construction'], [{ player: 'claimRadius', add: 1 }], {}, null, 'Bases claim 5×5 (needs base level to allow it).'),
  T('modular_platforms', 'Modular Platforms', 'rigs', 1, ['platform_construction'], [{ player: 'slots', add: 1 }]),
  T('research_labs', 'Research Labs', 'rigs', 1, ['platform_construction'], [], { platforms: ['lab'] }),
  T('subsea_manifolds', 'Subsea Manifolds', 'rigs', 2, ['pipelines'], [{ player: 'claimRadius', add: 1 }], {}, null, 'Bases claim 7×7.'),
  T('gun_platforms', 'Gun Platforms', 'rigs', 2, ['platform_construction', 'artillery'], [], { platforms: ['gun'] }),
  T('radar_masts', 'Radar Masts', 'rigs', 2, ['platform_construction', 'radar'], [], { platforms: ['radar'] }),
  T('crew_quarters', 'Crew Quarters', 'rigs', 2, ['modular_platforms'], [], { platforms: ['quarters'], baseLevel: 2 }, null, 'Upgrade bases to Station (level 2).'),
  T('fortified_bases', 'Fortified Bases', 'rigs', 2, ['crew_quarters'], [{ player: 'platformHpMult', mult: 1.5 }, { player: 'platformRange', add: 1 }], {}, 'rigs2',
    'Fortresses: platforms get 50% more HP and gun platforms +1 range.'),
  T('sprawling_fields', 'Sprawling Fields', 'rigs', 2, ['subsea_manifolds'], [{ player: 'claimRadius', add: 1 }, { player: 'platformCostMult', mult: 0.8 }, { player: 'platformHpMult', mult: 0.8 }], {}, 'rigs2',
    'Spread out: +1 claim radius and platforms cost 20% less, but have 20% less HP.'),
  T('long_pipelines', 'Long-Distance Pipelines', 'rigs', 3, ['subsea_manifolds'], [{ player: 'claimRadius', add: 1 }], {}, null, 'Bases claim 9×9.'),
  T('dry_docks', 'Offshore Dry Docks', 'rigs', 3, ['crew_quarters', 'destroyer_program'], [], { platforms: ['drydock'] }),
  T('refineries', 'Refineries', 'rigs', 3, ['crew_quarters', 'refining'], [], { platforms: ['refinery'] }),
  T('helipads', 'Helipads', 'rigs', 3, ['radar_masts', 'crew_quarters'], [], { platforms: ['helipad'] }),
  T('aa_platforms', 'AA Platforms', 'rigs', 3, ['gun_platforms', 'air_defense'], [], { platforms: ['aa'] }),
  T('base_complex', 'Base Complexes', 'rigs', 3, ['crew_quarters'], [], { baseLevel: 3 }, null, 'Upgrade bases to Complex (level 3).'),
  T('trunk_lines', 'Trunk Lines', 'rigs', 4, ['long_pipelines'], [{ player: 'claimRadius', add: 1 }], {}, null, 'Bases claim 11×11.'),
  T('mega_hub', 'Mega-Platform Hubs', 'rigs', 4, ['trunk_lines', 'base_complex'], [{ player: 'claimRadius', add: 1 }], { baseLevel: 4 }, null, 'Upgrade bases to Hub (level 4) and claim 13×13.'),
  T('missile_batteries', 'Missile Batteries', 'rigs', 4, ['gun_platforms', 'guided_missiles'], [], { platforms: ['missile'] }),
  T('self_sufficient', 'Self-Sufficient Bases', 'rigs', 4, ['automated_drilling'], [{ player: 'platformUpkeepMult', mult: 0 }, { player: 'platformRepair', add: 1 }], {}, 'rigs4',
    'No platform upkeep, and platforms slowly repair themselves.'),
  T('pipeline_network', 'Pipeline Network', 'rigs', 4, ['trunk_lines'], [{ player: 'oilCap', add: 100 }, { player: 'rigRate', add: 1 }], {}, 'rigs4',
    'Connected fields: +100 oil storage and every rig pumps +1.'),

  // ---------------- ⚛️ POST-OIL (Era V: the road to the Post-Oil victory) ----------------
  T('ocean_thermal', 'Ocean Thermal Energy', 'future', 5, ['deep_water', 'base_complex'], [{ player: 'rp', add: 4 }],
    {}, null, 'Power from the deep: +4 research per turn.'),
  T('superconductors', 'Superconductors', 'future', 5, ['satellites', 'ocean_thermal'], [{ player: 'upkeepMult', mult: 0.9 }],
    {}, null, 'Cheaper to run everything: 10% less upkeep.'),
  T('fusion_theory', 'Fusion Theory', 'future', 5, ['ocean_thermal', 'enhanced_recovery'], [{ player: 'rp', add: 4 }],
    {}, null, 'The end of the oil age is in sight: +4 research per turn.'),
  T('fusion_engineering', 'Fusion Engineering', 'future', 5, ['fusion_theory', 'superconductors', 'mega_hub'], [], { platforms: ['fusion'] },
    null, 'Build the Deep-Sea Fusion Plant at a Hub base. Finish it to win a Post-Oil victory.'),
];

export const TECH = Object.fromEntries(TECHS.map(t => [t.id, t]));
