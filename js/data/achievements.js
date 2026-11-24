// ============================================================
// ACHIEVEMENTS: one-off feats saved in your profile. Each pays XP (to the commander you were playing)
// and Dabloons (a currency for cosmetics in the shop, coming later).
// hidden: shown as "??? Hidden achievement" until you earn it.
// Checks for skirmish games live in js/app/achievements.js; campaign ones are given by the missions.
// ============================================================

export const ACHIEVEMENTS = {
  // ---------- campaign ----------
  'first-watch':  { icon: '⚓', name: 'First Watch', desc: 'Complete Navy Mission 1: First Watch.', xp: 150, dabloons: 25, group: 'campaign' },
  'no-quarter':   { icon: '☠️', name: 'No Quarter', desc: 'In First Watch, sink the fleeing Tide skiff before it escapes.', xp: 200, dabloons: 40, group: 'campaign', hidden: true },
  'the-quota':    { icon: '🛢️', name: 'The Quota', desc: 'Complete Navy Mission 2: The Quota.', xp: 150, dabloons: 25, group: 'campaign' },
  'good-neighbours': { icon: '🎣', name: 'Good Neighbours', desc: 'In The Quota, deliver the quota without drilling Bracken Point.', xp: 250, dabloons: 50, group: 'campaign', hidden: true },
  'convoy':       { icon: '🚢', name: 'Convoy', desc: 'Complete Navy Mission 3: Convoy.', xp: 150, dabloons: 25, group: 'campaign' },
  'firebreak':    { icon: '🔥', name: 'Firebreak', desc: 'In Convoy, sink Kade\'s fireship before it gets within 2 squares of the Hesper.', xp: 250, dabloons: 50, group: 'campaign', hidden: true },
  'driftwood':    { icon: '🔥', name: 'Driftwood', desc: 'Complete Navy Mission 4: Driftwood.', xp: 150, dabloons: 25, group: 'campaign' },
  'taken-not-burned': { icon: '⚓', name: 'Taken, Not Burned', desc: 'In Driftwood, take the raft town with your marines instead of burning it.', xp: 250, dabloons: 50, group: 'campaign', hidden: true },
  'reprisal':     { icon: '🛡️', name: 'Reprisal', desc: 'Complete Navy Mission 5: Reprisal.', xp: 150, dabloons: 25, group: 'campaign' },
  'eyes-before-guns': { icon: '👁️', name: 'Eyes Before Guns', desc: 'In Reprisal, never fire on a refugee boat.', xp: 250, dabloons: 50, group: 'campaign', hidden: true },
  'clean-sweep':  { icon: '🧹', name: 'Clean Sweep', desc: 'Complete Navy Mission 6: Clean Sweep.', xp: 175, dabloons: 30, group: 'campaign' },
  'mercy':        { icon: '✚', name: 'Mercy', desc: 'In Clean Sweep, never fire on the hospital raft.', xp: 300, dabloons: 60, group: 'campaign', hidden: true },
  'bracken':      { icon: '🛢️', name: 'Bracken', desc: 'Complete Navy Mission 7: Bracken.', xp: 200, dabloons: 30, group: 'campaign' },
  'four-generations': { icon: '🎣', name: 'Four Generations', desc: "In Bracken, give the village time, and get every one of its boats out.", xp: 300, dabloons: 60, group: 'campaign', hidden: true },
  'the-terminal': { icon: '🏭', name: 'The Terminal', desc: 'Complete Navy Mission 8: The Terminal.', xp: 200, dabloons: 35, group: 'campaign' },
  'not-that-navy': { icon: '🛟', name: 'Not That Navy', desc: 'In The Terminal, let Ortiz go after the tanker crew, and get them back.', xp: 300, dabloons: 60, group: 'campaign', hidden: true },
  'open-water':   { icon: '🌊', name: 'Open Water', desc: 'Complete Navy Mission 9: Open Water.', xp: 225, dabloons: 40, group: 'campaign' },
  'line-breaker': { icon: '⚔️', name: 'Line Breaker', desc: 'In Open Water, sink every Brood Raft without losing a capital ship.', xp: 300, dabloons: 60, group: 'campaign', hidden: true },
  'the-allocation': { icon: '⚓', name: 'The Allocation', desc: 'Complete Navy Mission 10 and Part One of the Navy campaign.', xp: 400, dabloons: 75, group: 'campaign' },
  'allocation-holds': { icon: '🎗️', name: 'The Allocation Holds', desc: 'Finish Navy Part One by obeying the order at Haven.', xp: 150, dabloons: 25, group: 'campaign' },
  'mutiny':       { icon: '🏳️', name: 'Mutiny', desc: 'Finish Navy Part One by refusing the order at Haven.', xp: 150, dabloons: 25, group: 'campaign' },
  'lifeboats':    { icon: '🛶', name: 'Let Them Go', desc: 'In The Allocation, obey the order, but never fire on a lifeboat.', xp: 300, dabloons: 60, group: 'campaign', hidden: true },
  'clean-hands':  { icon: '🤲', name: 'Clean Hands', desc: 'Across Navy Part One: never fire on refugees, spare Mercy, give Bracken time, save the Hesper\'s crew, and refuse at Haven.', xp: 600, dabloons: 120, group: 'campaign', hidden: true },
  'by-the-book':  { icon: '🎖️', name: 'By the Book', desc: 'Earn an S+ rank on any campaign mission.', xp: 250, dabloons: 50, group: 'campaign' },

  // ---------- skirmish ----------
  'first-win':    { icon: '🏆', name: 'Last Rig Standing', desc: 'Win a game.', xp: 200, dabloons: 30, group: 'skirmish' },
  'win-navy':     { icon: '⚓', name: 'For the Accords', desc: 'Win a game as the Coalition Navy.', xp: 150, dabloons: 25, group: 'skirmish' },
  'win-tide':     { icon: '🏴', name: 'The Tide Rises', desc: 'Win a game as the Free Tide.', xp: 150, dabloons: 25, group: 'skirmish' },
  'beat-hard':    { icon: '🤖', name: 'Hard Lessons', desc: 'Beat a Hard (or Admiral) bot.', xp: 300, dabloons: 50, group: 'skirmish' },
  'prize-crew':   { icon: '🪝', name: 'Prize Crew', desc: 'Capture an enemy ship by boarding it.', xp: 150, dabloons: 25, group: 'skirmish' },
  'back-in-black':{ icon: '🏦', name: 'Back in the Black', desc: 'Win a game after the bank repossessed one of your ships.', xp: 250, dabloons: 50, group: 'skirmish', hidden: true },
  'last-drop':    { icon: '🛢️', name: 'The Last Drop', desc: 'Win by Last Rig Standing: own the last oil in the world.', xp: 250, dabloons: 40, group: 'skirmish' },
  'quick-war':    { icon: '⏱️', name: 'Short War', desc: 'Win a game against a bot in 30 rounds or fewer.', xp: 250, dabloons: 40, group: 'skirmish' },
  'living-legend':{ icon: '🌟', name: 'Living Legend', desc: 'Raise any commander to level 15.', xp: 0, dabloons: 150, group: 'skirmish' },
};

export const ACHIEVEMENT_GROUPS = { campaign: 'Campaign', skirmish: 'Skirmish' };
