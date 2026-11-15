// Map sizes offered on the new-game screen, plus player names and colours.

// w × h: squares. landShare: roughly how much of the map is land.
// extraHome: deposits added to every player's home waters (on top of the base 5).
// classic: the old small arena layout (used only by the tutorial). hidden: not offered on the setup screen.
export const MAP_SIZES = {
  small:    { name: 'Small',    w: 150, h: 100, maxPlayers: 4, landShare: 0.28, extraHome: ['small', 'medium'] },
  standard: { name: 'Standard', w: 200, h: 130, maxPlayers: 4, landShare: 0.30, extraHome: ['small', 'small', 'medium'] },
  large:    { name: 'Large',    w: 260, h: 170, maxPlayers: 4, landShare: 0.30, extraHome: ['small', 'small', 'medium', 'medium'] },
  huge:     { name: 'Huge',     w: 320, h: 210, maxPlayers: 4, landShare: 0.32, extraHome: ['small', 'small', 'small', 'medium', 'medium'] },
  tutorial: { name: 'Tutorial', w: 24,  h: 14,  maxPlayers: 2, classic: true, hidden: true, extraHome: [] },
};

// How big each player's home waters are, as a share of the map's shorter side.
export const HOME_SCALE = 0.3;
// Roughly one No Man's Sea deposit per this many open-water squares.
export const WATER_PER_DEPOSIT = 90;

// Each player's colour (ships, rigs, labels).
export const PLAYER_COLORS = ['#2bb3a3', '#f08a3c', '#a87cf0', '#d9c84a'];

export const PLAYER_NAMES = ['Player 1', 'Player 2', 'Player 3', 'Player 4'];
