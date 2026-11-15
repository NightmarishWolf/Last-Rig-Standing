// Tutorial: the hand-built practice map and the unarmed target.
import * as E from '../engine/index.js';
import { SHIPS } from '../data/ships.js';

export const DEP_FOUND = 'd_tut_found';

  // hidden deposit the player surveys
export const TARGET = 'tut_target';

      // unarmed enemy barge
export const TARGET_CELLS = [[8, 5], [9, 5], [10, 5]];

function ship(id, owner, type, x, y) {
  return {
    id, owner, type, x, y, rot: 0, hp: SHIPS[type].hp,
    movesLeft: SHIPS[type].move, acted: false, shotsLeft: 0, activeAction: null,
    cooldowns: {}, freeUsed: {}, screenUsed: false, adUsed: false,
  };
}

export function newTutorialGame() {
  const st = E.newGame({ size: 'tutorial', players: 2, seed: 2026 });
  st.tutorial = true;
  st.victory = {}; // tutorial: only the basic (Conquest) rules
  // a few islands, out of the way
  st.land.fill(0);
  [[14, 1], [14, 2], [15, 2], [13, 11], [14, 11], [15, 11], [15, 10], [11, 8], [12, 8]].forEach(([x, y]) => { st.land[y * st.W + x] = 1; });
  st.deposits = [
    { id: 'd_tut_home', x: 5, y: 2, type: 'medium', reserves: 45, max: 45 },
    { id: DEP_FOUND, x: 5, y: 9, type: 'small', reserves: 30, max: 30 },
    { id: 'd_tut_a', x: 3, y: 12, type: 'small', reserves: 30, max: 30 },
    { id: 'd_tut_b', x: 12, y: 4, type: 'rich', reserves: 70, max: 70 },
    { id: 'd_tut_c', x: 16, y: 8, type: 'medium', reserves: 45, max: 45 },
    { id: 'd_tut_d', x: 20, y: 3, type: 'medium', reserves: 45, max: 45 },
  ];
  st.rigs = []; st.bases = []; st.platforms = []; st.ports = [];
  E.foundBase(st, 0, st.deposits[0], true); // your Admiralty on the home deposit
  st.ships = [
    ship('tut_pb_south', 0, 'patrol', 0, 9),
    ship('tut_pb_north', 0, 'patrol', 0, 3),
    ship(TARGET, 1, 'target', 8, 5),
  ];
  st.mines = []; st.wrecks = [];
  st.blocked = ['5,9']; // ships can't park on the deposit, so the rig always has room
  const [me, foe] = st.players;
  me.name = 'You'; foe.name = 'Enemy';
  me.money = 400; me.oil = 15; me.known = { d_tut_home: true };
  me.log = [{ turn: 1, text: 'Welcome to the tutorial, Admiral.' }];
  foe.money = 0; foe.known = {}; foe.log = [];
  return st;
}
