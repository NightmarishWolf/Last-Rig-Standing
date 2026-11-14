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
  // camera (see camera.js)
  cam: { x: 0, y: 0 },  // top-left of the view, in squares
  view: { w: 0, h: 0 }, // size of the map area on screen, in pixels
  fit: true,            // small maps are shown whole, with no scrolling
  cams: {},             // each player's saved camera
  camOwner: null, camGame: null,
  drawQueued: false,
  drag: null,           // mouse drag in progress
  pathCache: null,      // last voyage preview route
  terrainCache: null, fogCanvas: null,
};
