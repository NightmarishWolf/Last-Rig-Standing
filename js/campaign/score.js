// Mission ranks: every win is scored out of 100 and given a letter.
//   Speed 40: rounds taken against par (40 at or under par, −5 per round over).
//   Losses 30: 30 × the share of your starting fleet's HP you kept, −10 per ship lost.
//   Secondary goals 30: split evenly between them.
// S+ = a perfect 100 and at least 2 rounds under par. Hidden achievements don't count.
export const RANKS = [
  { rank: 'S+', min: 100, color: '#ffd666' },
  { rank: 'S', min: 90, color: '#ffc14d' },
  { rank: 'A', min: 80, color: '#7fd17a' },
  { rank: 'B', min: 65, color: '#6fc3ff' },
  { rank: 'C', min: 50, color: '#b9a3ff' },
  { rank: 'D', min: 35, color: '#f0a531' },
  { rank: 'F', min: 0, color: '#ff6b6b' },
];
export const RANK_ORDER = ['F', 'D', 'C', 'B', 'A', 'S', 'S+'];
export const rankIndex = r => RANK_ORDER.indexOf(r);
export const rankColor = r => RANKS.find(x => x.rank === r)?.color || '#ccc';

// Rewards by rank: XP every time you set a new best (the difference from your old best), Dabloons likewise.
// A replay that doesn't beat your best still pays a little XP.
export const RANK_XP = { F: 150, D: 200, C: 250, B: 300, A: 400, S: 500, 'S+': 600 };
export const RANK_DABLOONS = { F: 10, D: 20, C: 30, B: 45, A: 60, S: 80, 'S+': 100 };
export const REPLAY_XP_SHARE = 0.1;

// rounds: rounds used; par; keptShare 0..1; shipsLost; secondary: [{ id, name, done }]
export function scoreMission({ rounds, par, keptShare, shipsLost, secondary }) {
  const speed = Math.max(0, 40 - 5 * Math.max(0, rounds - par));
  const losses = Math.max(0, Math.round(30 * keptShare) - 10 * shipsLost);
  const sec = secondary.length ? Math.round((30 * secondary.filter(s => s.done).length) / secondary.length) : 30;
  const score = speed + losses + sec;
  let rank = RANKS.find(r => r.rank !== 'S+' && score >= r.min).rank;
  if (score >= 100 && rounds <= par - 2) rank = 'S+';
  return { score, rank, parts: { speed, losses, secondary: sec } };
}
