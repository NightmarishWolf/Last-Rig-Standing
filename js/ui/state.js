// Shared UI state: the one object every UI file reads and writes.
// (Game rules live in the engine; this is only what the screen is doing right now.)
export const S = {
  st: null,             // the game state being shown
  hooks: null,          // callbacks from the app (save, handoff, gameOver, showMenu, tutorial hooks)
  mode: { kind: 'idle' }, // idle | move | target | placeRig | placePort | placePlatform | fleetPick | patrolPick | escortPick
  selectedId: null,     // id of the selected ship
  selectedBase: null,   // id of the selected rig base
  yard: 'home',         // the shipyard tab open in the panel
  // computer turns (see app/bots.js)
  botTurn: false,       // a bot is playing: the board and panel don't take clicks
  viewer: null,         // the human watching a bot turn (their fog of war is shown)
  spectate: false,      // every seat is a bot: whole map, no fog
  rsHover: null,        // research tech under the pointer (or last tapped)
  tween: null, fx: [],  // animations in progress (board/fx.js)
  planRot: null,        // facing you're planning for the selected ship (R); it only turns when it moves
  plan: [],             // waypoints added with Shift+click, before the final destination
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
