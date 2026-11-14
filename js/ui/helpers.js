// Small UI helpers: player colour/name, board coordinates, current selection.
import * as E from '../engine/index.js';
import { PLAYER_COLORS } from '../data/maps.js';
import { MARGIN } from './constants.js';
import { S } from './state.js';

export const pcol = p => PLAYER_COLORS[p];

export const pname = p => S.st.players[p].name;

export const px = x => MARGIN + x * S.cell;

export const py = y => MARGIN + y * S.cell;

export const me = () => S.st.current;

export const selected = () => S.st.ships.find(s => s.id === S.selectedId);

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
