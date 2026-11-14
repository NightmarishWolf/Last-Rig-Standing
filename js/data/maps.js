// Map sizes offered on the new-game screen, plus player names and colours.

// Map sizes offered on the new-game screen.
// extraHome: deposits added to every player's home waters on bigger maps.
export const MAP_SIZES = {
  small:    { name: 'Small',    w: 24, h: 14, maxPlayers: 3, extraHome: [] },
  standard: { name: 'Standard', w: 30, h: 18, maxPlayers: 4, extraHome: [] },
  large:    { name: 'Large',    w: 40, h: 24, maxPlayers: 4, extraHome: ['small', 'medium'] },
  huge:     { name: 'Huge',     w: 52, h: 30, maxPlayers: 4, extraHome: ['small', 'small', 'medium'] },
};

// Each player's colour (ships, rigs, labels).
export const PLAYER_COLORS = ['#2bb3a3', '#f08a3c', '#a87cf0', '#d9c84a'];

export const PLAYER_NAMES = ['Player 1', 'Player 2', 'Player 3', 'Player 4'];
