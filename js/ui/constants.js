// UI constants: ship labels, board colours and the board margin.

export const CODES = {
  patrol: 'PB', survey: 'SV', corvette: 'CO', hydrofoil: 'HF', decoy: 'DB', minelayer: 'ML',
  submarine: 'SS', tanker: 'TK', destroyer: 'DD', missileboat: 'MB', frigate: 'FF', jammer: 'JM',
  cruiser: 'CR', salvage: 'SL', repair: 'RP', drillship: 'DS', carrier: 'CV', battleship: 'BB',
  command: 'CM', nuclearsub: 'SN', dreadnought: 'DN', icebreaker: 'IB', supply: 'SU', assault: 'AS',
  // Free Tide
  skiff: 'SK', prospector: 'PS', barge: 'OB', rigraft: 'RR', gunboat: 'GB', lancer: 'LN', minejunk: 'MJ', smuggler: 'SM',
  brig: 'BR', fireship: 'FS', rocketjunk: 'RJ', boarder: 'BD', qship: 'QS', mothership: 'DM', leviathan: 'LV', queen: 'TQ',
};

export const COL = {
  homeMine: '#0f2d4b', middle: '#0b2034', homeEnemy: '#0c2338', grid: 'rgba(255,255,255,0.05)',
  land: '#6f9447', landEdge: '#8d7a4a', mine: '#2bb3a3', mineDark: '#17675e', enemy: '#e25555',
  oil: '#f0a531', wreck: '#5a6571', text: '#e4edf5', muted: '#8aa3b8',
};

export const MARGIN = 20;
