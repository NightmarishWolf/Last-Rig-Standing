// Small shared helpers: action results, the per-player log, and "what is on this square" lookups.
import { SHIPS } from '../data/ships.js';
import { shipCells } from './geometry.js';

export const alivePlayers = st => st.players.map((_, i) => i).filter(i => !st.players[i].out);

export const others = (st, p) => alivePlayers(st).filter(i => i !== p);

export const passives = s => SHIPS[s.type].passives || {};

export const portAt = (st, x, y) => (st.ports || []).find(o => o.x === x && o.y === y);

export const pname = (st, p) => st.players[p].name;

export const log = (st, p, text) => {
  st.players[p].log.unshift({ turn: st.turnCount, text });
  st.players[p].log.length = Math.min(st.players[p].log.length, 80);
};

export const shipAt = (st, x, y, filter = () => true) =>
  st.ships.find(s => filter(s) && shipCells(s).some(([a, b]) => a === x && b === y));

export const rigAt = (st, x, y) => st.rigs.find(r => r.x === x && r.y === y);

export const depositAt = (st, x, y) => st.deposits.find(d => d.x === x && d.y === y);

// ---------- entry point ----------
export const ok = () => ({ ok: true });

export const fail = error => ({ ok: false, error });
