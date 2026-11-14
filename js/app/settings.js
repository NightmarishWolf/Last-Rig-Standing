// New-game settings and small formatting helpers.

 // true once a player has revealed their fleet this session
export const setup = { size: 'small', players: 2, turnTimer: 90, domination: true };

export const TIMER_OPTIONS = [0, 60, 90, 120, 180];

export const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
