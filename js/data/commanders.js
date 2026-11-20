// ============================================================
// COMMANDERS: each faction has three. A commander is picked per seat (or none) and brings perks that
// unlock with their level (1–15, earned in the player's profile by playing them):
//   level 1: the core perk · level 3: an exclusive ship · levels 5–13: upgrades · level 15: a mastery
//   choice (one of two, picked on the Commanders screen).
// Perk effects use the research effect format (see research.js), plus `on` for weapon effects that only
// apply to one ship class or type ({ weapon: 'gun', on: 'capital', stat: 'range', add: 1 }).
// Powers: each commander has two active powers on cooldowns (one from level 1, one from level 8), aimed
// like a strike where they need a target (`target`: 'seen' a square you can see, 'any' any square,
// 'tide' a square on your Tide, 'base' an enemy base, 'struct' an enemy platform or rig).
// ============================================================

export const MAX_LEVEL = 15;
export const EXCLUSIVE_LEVEL = 3;
export const MASTERY_LEVEL = 15;
export const POWER_START = 3; // powers start this many of your turns from ready

export const COMMANDERS = {
  // ---------------- ⚓ COALITION NAVY ----------------
  hale: {
    faction: 'navy', name: 'Admiral Hale', title: 'Battleline', icon: '🛡️', ship: 'battlecruiser',
    text: 'Big guns and heavy hulls: capital ships are cheaper, tougher and hit from further away.',
    perks: [
      { level: 1, name: 'Ship of the Line', text: 'Capital ships cost 10% less.', effects: [{ ship: 'capital', stat: 'cost', mult: 0.9 }] },
      { level: 3, name: 'Battlecruiser', text: 'Exclusive ship: the Battlecruiser, a fast capital ship (needs the Cruiser Program).' },
      { level: 5, name: 'Long Guns', text: "Capital ships' guns get +1 range.", effects: [{ weapon: 'gun', on: 'capital', stat: 'range', add: 1 }] },
      { level: 7, name: 'Heavy Plating', text: 'Capital ships get 15% more HP.', effects: [{ ship: 'capital', stat: 'hp', mult: 1.15 }] },
      { level: 9, name: 'Slipway Crews', text: 'Capital ships build 1 turn faster.', effects: [{ ship: 'capital', stat: 'build', add: -1 }] },
      { level: 11, name: 'Fleet Yards', text: 'Capital ships repair 2 HP a turn in supply.', effects: [{ player: 'capHeal', add: 1 }] },
      { level: 13, name: 'Standing Fleet', text: 'Capital ship upkeep 25% cheaper.', effects: [{ ship: 'capital', stat: 'upkeepMult', mult: 0.75 }] },
    ],
    powers: [
      { id: 'damagecontrol', level: 1, name: 'Damage Control', icon: '🔧', cooldown: 8, text: 'Every ship you have repairs 2 HP right now (capital ships 4).' },
      { id: 'broadside', level: 8, name: 'Full Broadside', icon: '💥', cooldown: 7, text: 'Your capital ships can fire again this turn (shots and reloads reset).' },
    ],
    mastery: [
      { name: 'Ironclads', text: 'Capital ships get +1 armor.', effects: [{ ship: 'capital', stat: 'armor', add: 1 }] },
      { name: 'Full Steam', text: 'Capital ships get +1 move.', effects: [{ ship: 'capital', stat: 'move', add: 1 }] },
    ],
  },
  vance: {
    faction: 'navy', name: 'Commodore Vance', title: 'Carrier Doctrine', icon: '✈️', ship: 'escortcarrier',
    text: 'Air power: aircraft and drones reach further and hit more often, and carriers come cheap.',
    perks: [
      { level: 1, name: 'Long-Range Wings', text: 'Air attacks get +1 range.', effects: [{ weapon: 'air', stat: 'range', add: 1 }] },
      { level: 3, name: 'Escort Carrier', text: 'Exclusive ship: the Escort Carrier, a cheap light carrier (needs the Destroyer Program).' },
      { level: 5, name: 'Flattops', text: 'Carriers and Escort Carriers cost 15% less.', effects: [{ ship: 'carrier', stat: 'cost', mult: 0.85 }, { ship: 'escortcarrier', stat: 'cost', mult: 0.85 }] },
      { level: 7, name: 'Wide Sweeps', text: 'Scans and recon sweeps cover a 1 square bigger area.', effects: [{ weapon: 'scan', stat: 'size', add: 1 }] },
      { level: 9, name: 'Second Sortie', text: 'Air attacks get one extra shot.', effects: [{ weapon: 'air', stat: 'shots', add: 1 }] },
      { level: 11, name: 'Fast Fit-Out', text: 'Carriers and Escort Carriers build 1 turn faster.', effects: [{ ship: 'carrier', stat: 'build', add: -1 }, { ship: 'escortcarrier', stat: 'build', add: -1 }] },
      { level: 13, name: 'Eyes in the Sky', text: 'Carriers and Escort Carriers get +1 sight.', effects: [{ ship: 'carrier', stat: 'sight', add: 1 }, { ship: 'escortcarrier', stat: 'sight', add: 1 }] },
    ],
    powers: [
      { id: 'carrierstrike', level: 1, name: 'Carrier Strike', icon: '✈️', cooldown: 6, target: 'seen', text: 'An air strike on any square you can see: 2 damage to everything in a 3×3 area (AA can shoot it down).', dmg: 2, area: 3 },
      { id: 'reconblanket', level: 8, name: 'Recon Blanket', icon: '📡', cooldown: 7, target: 'any', text: 'Aircraft sweep a 9×9 area anywhere on the map, revealing everything in it.', size: 9 },
    ],
    mastery: [
      { name: 'Heavy Ordnance', text: 'Air attacks deal +1 damage.', effects: [{ weapon: 'air', stat: 'dmg', add: 1 }] },
      { name: 'Wild Weasels', text: 'Air attacks slip past enemy AA half the time.', effects: [{ player: 'airIgnoreAA', add: 0.5 }] },
    ],
  },
  ortiz: {
    faction: 'navy', name: 'Captain Ortiz', title: 'Marines', icon: '🪖', ship: 'landingcraft',
    text: 'Take, don\'t sink: marines capture enemy bases whole, sooner and against more resistance.',
    perks: [
      { level: 1, name: 'First In', text: 'Assault Ships cost 20% less, and marines can land once a central rig is at 60% HP (not 50%).', effects: [{ ship: 'assault', stat: 'cost', mult: 0.8 }, { player: 'assaultHp', add: 0.1 }] },
      { level: 3, name: 'Landing Craft', text: 'Exclusive ship: Landing Craft, fast and cheap. Its marines capture enemy bases with no working platforms, at any HP.' },
      { level: 5, name: 'Seabees', text: 'Captured bases get their central rig repaired to full.', effects: [{ player: 'captureRepair', add: 1 }] },
      { level: 7, name: 'Quick Turnaround', text: 'Assault Ships reload 1 turn faster.', effects: [{ weapon: 'assault', stat: 'cooldown', add: -1 }] },
      { level: 9, name: 'Under Fire', text: 'Marines can land with one defending ship nearby.', effects: [{ player: 'assaultDefenders', add: 1 }] },
      { level: 11, name: 'Spoils of War', text: "Capturing a base pays a bounty of 10% of its platforms' value.", effects: [{ player: 'captureBounty', add: 0.1 }] },
      { level: 13, name: 'Armored Hulls', text: 'Assault Ships get +2 HP and +1 armor.', effects: [{ ship: 'assault', stat: 'hp', add: 2 }, { ship: 'assault', stat: 'armor', add: 1 }] },
    ],
    powers: [
      { id: 'beachlanding', level: 1, name: 'Beach Landing', icon: '🏖️', cooldown: 9, target: 'base', text: 'Marines storm an enemy base with no working platforms (not an Admiralty) within 3 squares of one of your ships, at any HP. Defending ships nearby still hold them off.', range: 3 },
      { id: 'sabotage', level: 8, name: 'Sabotage', icon: '🧨', cooldown: 7, target: 'struct', text: 'Commandos blow up an enemy platform or rig (not a central rig) within 2 squares of one of your ships.', range: 2 },
    ],
    mastery: [
      { name: 'Shock Troops', text: 'Marines land once a central rig is at 75% HP.', effects: [{ player: 'assaultHp', add: 0.15 }] },
      { name: 'Decapitation', text: "Assault Ships can capture an Admiralty once it's down to 25% HP.", effects: [{ player: 'adminCapture', add: 1 }] },
    ],
  },

  // ---------------- 🏴 FREE TIDE ----------------
  ruiz: {
    faction: 'tide', name: '"Mother" Ruiz', title: 'Endless Swarm', icon: '🐝', ship: 'broodraft',
    text: 'More boats, faster: cheap packs, bigger packs and docks that never stop launching.',
    perks: [
      { level: 1, name: 'Cheap Hulls', text: 'Light boats cost 10% less.', effects: [{ ship: 'light', stat: 'cost', mult: 0.9 }] },
      { level: 3, name: 'Brood Raft', text: 'Exclusive ship: the Brood Raft, a slow raft that is a moving Raft Dock and spreads the Tide (needs Lashed Rafts).' },
      { level: 5, name: 'Big Litters', text: 'Skiff Packs launch 1 more boat.', effects: [{ player: 'packBonus', add: 1 }] },
      { level: 7, name: 'Busy Docks', text: 'Raft Docks build 2 ships at once.', effects: [{ player: 'raftSlots', add: 1 }] },
      { level: 9, name: 'Riding the Tide', text: 'Ships on the Tide get +1 more move.', effects: [{ player: 'tideMove', add: 1 }] },
      { level: 11, name: 'Tough Little Boats', text: 'Light boats get +1 HP.', effects: [{ ship: 'light', stat: 'hp', add: 1 }] },
      { level: 13, name: 'Everyone Looks', text: 'Skiffs survey for free.', effects: [{ player: 'freeSkiffSurvey', add: 1 }] },
    ],
    powers: [
      { id: 'swarmcall', level: 1, name: 'Swarm Call', icon: '🐝', cooldown: 8, target: 'tide', text: '3 Skiffs launch, free, around a square on your Tide.', boats: 3 },
      { id: 'tidalsurge', level: 8, name: 'Tidal Surge', icon: '🌊', cooldown: 9, text: 'Your whole Tide reaches 2 squares further for 3 rounds.', extra: 2, rounds: 3 },
    ],
    mastery: [
      { name: 'Stinging Swarm', text: 'Light boats deal +1 damage.', effects: [{ weapon: 'all', on: 'light', stat: 'dmg', add: 1 }] },
      { name: 'Born Ready', text: "Skiff Packs launch the turn you order them (if the dock has a free slot).", effects: [{ player: 'packInstant', add: 1 }] },
    ],
  },
  kade: {
    faction: 'tide', name: 'Kade the Burner', title: 'Arson', icon: '🔥', ship: 'incendiary',
    text: 'Burn it all: cheaper, deadlier fireships, and oil slicks that burn and choke enemy rigs.',
    perks: [
      { level: 1, name: 'Oil and Rags', text: 'Fireships cost 25% less and hit 1 harder.', effects: [{ ship: 'fireship', stat: 'cost', mult: 0.75 }, { weapon: 'fire', stat: 'dmg', add: 1 }] },
      { level: 3, name: 'Incendiary Junk', text: 'Exclusive ship: the Incendiary Junk, whose burning oil leaves a fire slick that hurts enemy ships in it (needs Fireships).' },
      { level: 5, name: 'Scorched Rigs', text: 'Rigs you destroy spill wider and for 4 rounds longer.', effects: [{ player: 'spillBig', add: 1 }] },
      { level: 7, name: 'Slicks Burn', text: 'Enemy ships that start their turn in any oil slick take 1 damage.', effects: [{ player: 'slickBurn', add: 1 }] },
      { level: 9, name: 'Long Fuse', text: 'Fireships can ram from 2 squares away.', effects: [{ weapon: 'fire', stat: 'range', add: 1 }] },
      { level: 11, name: 'Fast Fuse', text: 'Fireships get +2 move.', effects: [{ ship: 'fireship', stat: 'move', add: 2 }] },
      { level: 13, name: 'Choking Smoke', text: 'Enemy rigs inside oil slicks pump 25% less.', effects: [{ player: 'slickChoke', add: 0.25 }] },
    ],
    powers: [
      { id: 'ignite', level: 1, name: 'Ignite', icon: '🔥', cooldown: 8, text: 'Every oil slick on the map catches fire for 2 rounds: enemy ships that start their turn in one take 1 damage.', rounds: 2 },
      { id: 'firestorm', level: 8, name: 'Firestorm', icon: '☄️', cooldown: 8, target: 'seen', text: 'Fire rains on a square you can see: 2 damage in a 3×3 area, and a burning slick is left behind.', dmg: 2, area: 3 },
    ],
    mastery: [
      { name: 'Inferno', text: "Fireships' blast covers 5×5 squares.", effects: [{ weapon: 'fire', stat: 'area', add: 2 }] },
      { name: 'Greek Fire', text: 'The Incendiary Junk gets +2 range.', effects: [{ weapon: 'flame', stat: 'range', add: 2 }] },
    ],
  },
  nyx: {
    faction: 'tide', name: 'Old Salt Nyx', title: 'Smugglers', icon: '🦜', ship: 'ghost',
    text: 'Profit first: richer plunder, better prices, and Ghost Boats that steal oil from enemy rigs.',
    perks: [
      { level: 1, name: 'Fence', text: 'Plunder is worth 25% more, and every sunk ship gives some oil (not just tankers).', effects: [{ player: 'plunderMult', mult: 1.25 }, { player: 'plunderOilAll', add: 1 }] },
      { level: 3, name: 'Ghost Boat', text: 'Exclusive ship: the Ghost Boat, seen only by ships right next to it (or sonar), which siphons oil from enemy rigs.' },
      { level: 5, name: 'Long Arms', text: 'Plunder is collected from 2 squares further.', effects: [{ player: 'plunderRange', add: 2 }] },
      { level: 7, name: 'Fast Runners', text: 'Smuggler Subs cost 20% less and get +1 move.', effects: [{ ship: 'smuggler', stat: 'cost', mult: 0.8 }, { ship: 'smuggler', stat: 'move', add: 1 }] },
      { level: 9, name: 'Black Market Prices', text: 'Oil sells for 10% more.', effects: [{ player: 'sellMult', mult: 1.1 }] },
      { level: 11, name: 'Deep Pockets', text: 'Ghost Boats siphon twice as much.', effects: [{ player: 'siphonMult', mult: 2 }] },
      { level: 13, name: 'Smuggling Runs', text: 'Moves that start off the Tide cost 25% less oil.', effects: [{ player: 'offTideOil', mult: 0.75 }] },
    ],
    powers: [
      { id: 'blackmarket', level: 1, name: 'Black Market Sale', icon: '💰', cooldown: 8, text: 'Sell up to 20 oil at 1.5× the market price, without moving the price.', oil: 20, mult: 1.5 },
      { id: 'smugglerun', level: 8, name: 'Smuggling Run', icon: '🏃', cooldown: 8, text: 'All your ships get +3 moves this turn, and their moves this turn cost no oil.', moves: 3 },
    ],
    mastery: [
      { name: 'Picked Clean', text: 'Destroyed enemy rigs and platforms near your ships leave plunder too.', effects: [{ player: 'plunderStructs', add: 1 }] },
      { name: 'Phantoms', text: 'Ghost Boats stay hidden even right next to the enemy (only sonar finds them).', effects: [{ player: 'ghostHidden', add: 1 }] },
    ],
  },
};
export const COMMANDER_ORDER = { navy: ['hale', 'vance', 'ortiz'], tide: ['ruiz', 'kade', 'nyx'] };

// ---------- levels and XP ----------
// Level n → n+1 costs 600 + 150 × (n − 1) XP: level 5 after ~3–4 games, 10 after ~10, 15 after ~20–25.
export const xpToNext = level => 600 + 150 * (level - 1);
export const xpForLevel = level => { let t = 0; for (let l = 1; l < level; l++) t += xpToNext(l); return t; };
export function levelOf(xp) {
  let l = 1;
  while (l < MAX_LEVEL && xp >= xpForLevel(l + 1)) l++;
  return l;
}
export const XP = {
  perRound: 8, roundCap: 1200, win: 400,
  // by opponent: the average over everyone you played against
  vs: { easy: 0.5, normal: 1, hard: 1.25, admiral: 1.5, human: 1.25 },
};
// Unlocks: the first commander of a faction is free; the second at the first's level 5 (or 3 wins with
// the faction); the third once any of that faction's commanders reaches level 10.
export const UNLOCK = { secondLevel: 5, secondWins: 3, thirdLevel: 10 };

// ---------- bots ----------
export const BOT_LEVEL = { easy: 1, normal: 5, hard: 10, admiral: 15 };
export const BOT_COMMANDER = {
  navy: { admiral: 'hale', conqueror: 'ortiz', tycoon: 'vance', raider: 'vance' },
  tide: { admiral: 'ruiz', conqueror: 'kade', raider: 'nyx', tycoon: 'nyx' },
};

// The perks a commander has at a level (and mastery pick 0/1 at level 15).
export function perksAt(id, level, mastery = 0) {
  const c = COMMANDERS[id];
  if (!c) return [];
  const out = c.perks.filter(k => k.level <= level);
  if (level >= MASTERY_LEVEL) out.push({ level: MASTERY_LEVEL, mastery: true, ...c.mastery[mastery ? 1 : 0] });
  return out;
}
// The powers a commander has at a level.
export const powersAt = (id, level) => (COMMANDERS[id]?.powers || []).filter(w => w.level <= level);
export const POWERS = Object.fromEntries(Object.values(COMMANDERS).flatMap(c => c.powers.map(w => [w.id, w])));
