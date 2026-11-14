// ============================================================
// ENGINE: the rules of the game, with no graphics.
// The whole game is one plain JSON object (`state`). Every change goes
// through applyAction(state, action); getView(state, player) is what one
// player is allowed to see. That makes online play easy later: send the
// action to Firebase/Supabase and every client runs applyAction() on it.
//
// This file just gathers every engine module into one import:
//   import * as E from './engine/index.js';
// ============================================================
export * from './actions.js';
export * from './setup.js';
export * from './geometry.js';
export * from './visibility.js';
export * from './movement.js';
export * from './abilities.js';
export * from './combat.js';
export * from './economy.js';
export * from './ports.js';
export * from './stats.js';
export * from './turns.js';
export * from './util.js';
