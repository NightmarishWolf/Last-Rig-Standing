// Shared UI state: the one object every UI file reads and writes.
// (Game rules live in the engine; this is only what the screen is doing right now.)
export const S = {
  st: null,             // the game state being shown
  hooks: null,          // callbacks from the app (save, handoff, gameOver, showMenu, tutorial hooks)
  mode: { kind: 'idle' }, // idle | move | target | placeShip | placeRig | placePort
  selectedId: null,     // id of the selected ship
  hover: null,          // { x, y } square under the mouse
  cell: 28,             // size of one square in pixels
  canvas: null,
  ctx: null,
  reachCache: null,     // cached movement range of the selected ship
  toastTimer: null,
};
