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

// Map types (setup page and online lobby). The shapes themselves are in js/engine/maptypes.js.
// 'random' picks one of the others from the map's seed.
export const MAP_TYPES = {
  classic:     { name: 'Classic',         icon: '🌍', desc: 'Continents, islands and open water: the original mix.' },
  archipelago: { name: 'Archipelago',     icon: '🏝️', desc: 'Dozens of small islands and narrow channels. Easy to ambush and hard to keep a fleet together: subs and fast boats shine, big warships struggle.' },
  strait:      { name: 'The Strait',      icon: '⛵', desc: 'Big landmasses with one channel between the homes, narrowest in the middle, where the richest oil sits. Everyone fights over the same water.' },
  ocean:       { name: 'Open Ocean',      icon: '🌊', desc: 'Almost no land: nowhere to hide and no choke points. Fleet size and range decide fights; bases are exposed.' },
  inland:      { name: 'Inland Sea',      icon: '🫙', desc: 'A rich sea walled in by land in the middle of the map, with a narrow gate facing each player. Hold the gates, hold the oil.' },
  twin:        { name: 'Twin Seas',       icon: '⚓', desc: 'Every player has a sheltered home bay with one mouth, joined by a shared central sea. A calmer start; the middle decides the game.' },
  fjords:      { name: 'Shattered Coast', icon: '🏔️', desc: 'Jagged coasts cut by long, thin fjords: natural fortresses for bases, but a fleet inside one can be bottled up.' },
  polar:       { name: 'Polar',           icon: '🧊', desc: 'Pack ice covers the far waters, with rich oil underneath. Ice blocks every ship except the Icebreaker (research Ice-class Hulls), and the lanes it cuts slowly freeze over again. The ice shifts every few rounds.' },
};
export const MAP_TYPE_ORDER = ['classic', 'archipelago', 'strait', 'ocean', 'inland', 'twin', 'fjords', 'polar'];

// How big each player's home waters are, as a share of the map's shorter side.
export const HOME_SCALE = 0.3;
// Roughly one No Man's Sea deposit per this many open-water squares.
export const WATER_PER_DEPOSIT = 90;

// Each player's colour (ships, rigs, labels).
export const PLAYER_COLORS = ['#2bb3a3', '#f08a3c', '#a87cf0', '#d9c84a'];

export const PLAYER_NAMES = ['Player 1', 'Player 2', 'Player 3', 'Player 4'];
