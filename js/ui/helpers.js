// Small UI helpers: player colour/name, board coordinates, current selection.
import * as E from '../engine/index.js';
import { PLAYER_COLORS } from '../data/maps.js';
import { MARGIN } from './constants.js';
import { S } from './state.js';

export const pcol = p => PLAYER_COLORS[p];

// $122.78 / 52.51 (whole numbers without the decimals)
export const usd = v => '$' + E.fmt2(v);
export const oil = v => E.fmt2(v);

export const pname = p => S.st.players[p].name;

export const px = x => MARGIN + (x - S.cam.x) * S.cell;

export const py = y => MARGIN + (y - S.cam.y) * S.cell;

// The player whose eyes the screen shows: normally whoever's turn it is; during computer turns,
// the one human watching (S.viewer).
export const me = () => S.viewer ?? S.st.current;

export const selected = () => S.st.ships.find(s => s.id === S.selectedId);

export const selectedBase = () => (S.st.bases || []).find(b => b.id === S.selectedBase && b.owner === S.st.current);

// The facing being planned for the selected ship (defaults to the way it faces now).
export const planRot = s => (S.planRot ?? s.rot);

// Select a ship (or nothing) and reset any planned facing.
export function select(id) { S.selectedId = id; S.planRot = null; }

export const centerOffset = (type, rot) => {
  const c = E.cellsOf(type, 0, 0, rot);
  return c[Math.floor(c.length / 2)];
};

export function reach() {
  const s = selected();
  if (!s) return null;
  if (!S.reachCache || S.reachCache.id !== s.id) S.reachCache = { id: s.id, map: E.reachable(S.st, s) };
  return S.reachCache.map;
}
