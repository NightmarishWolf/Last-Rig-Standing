// New-game settings and small formatting helpers.

 // true once a player has revealed their fleet this session
export const setup = {
  size: 'small', players: 2, turnTimer: 90, victory: { domination: true, postoil: true, lastrig: true },
  // one entry per seat: { seat: 'human' | 'ai', difficulty, personality ('random' or a personality id) }
  seats: [
    { seat: 'human', difficulty: 'normal', personality: 'random' },
    { seat: 'ai', difficulty: 'normal', personality: 'random' },
    { seat: 'ai', difficulty: 'normal', personality: 'random' },
    { seat: 'ai', difficulty: 'normal', personality: 'random' },
  ],
};
// how fast bot turns play out on screen (ms per step)
export const BOT_SPEEDS = [{ id: 'slow', name: 'Slow', ms: 650 }, { id: 'normal', name: 'Normal', ms: 380 }, { id: 'fast', name: 'Fast', ms: 160 }, { id: 'instant', name: 'Instant', ms: 0 }];
export const view = { botSpeed: 'normal' };

export const TIMER_OPTIONS = [0, 60, 90, 120, 180];

export const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
