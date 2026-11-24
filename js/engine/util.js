// Small shared helpers: action results, the per-player log, and "what is on this square" lookups.
import { SHIPS } from '../data/ships.js';
import { shipCells } from './geometry.js';

export const alivePlayers = st => st.players.map((_, i) => i).filter(i => !st.players[i].out);

export const others = (st, p) => alivePlayers(st).filter(i => i !== p);

export const passives = s => SHIPS[s.type].passives || {};

export const portAt = (st, x, y) => (st.ports || []).find(o => o.x === x && o.y === y);

// (p = -1 is the neutral side: pirates or a rogue submarine)
export const pname = (st, p) => (p < 0 ? (st.neutralKind === 'rogue' ? 'a rogue submarine' : 'the pirates') : st.players[p].name);

// meta (optional) marks a message for the turn summary: k = kind ('hit' something of yours was attacked,
// 'win' you hit them, 'oil', 'done' something finished, 'fleet' ships needing attention, 'world' news about
// rivals), and x, y = where on the map it happened.
// Every message gets a running number (n), so "since your last turn" is easy to find.
export const log = (st, p, text, meta) => {
  if (!st.players[p]) return; // (the neutral side keeps no log)
  const n = st.logSeq = (st.logSeq || 0) + 1;
  st.players[p].log.unshift(meta ? { turn: st.turnCount, n, text, ...meta } : { turn: st.turnCount, n, text });
  st.players[p].log.length = Math.min(st.players[p].log.length, 120);
};

// Running totals for the game-over screen (oil pumped, ships built, ships sunk...).
export const tally = (st, p, key, n = 1) => {
  const pl = st.players[p];
  if (!pl) return;
  (pl.stats ||= {})[key] = Math.round(((pl.stats[key] || 0) + n) * 100) / 100;
};

// The same per unit (a ship class, or 'strike:<kind>', 'defense:<kind>', 'mine'), for balancing:
// pl.stats.units[unit] = { built, value (spent building them), lost, shots, dmg (to ships), struct (to rigs,
// ports, platforms), kills, killValue (what the ships they sank cost) }.
export const tallyUnit = (st, p, unit, key, n = 1) => {
  const pl = st.players[p];
  if (!pl || !unit || !n) return;
  const u = ((pl.stats ||= {}).units ||= {})[unit] ||= {};
  u[key] = Math.round(((u[key] || 0) + n) * 100) / 100;
};

export const shipAt = (st, x, y, filter = () => true) =>
  st.ships.find(s => filter(s) && shipCells(s).some(([a, b]) => a === x && b === y));

export const rigAt = (st, x, y) => st.rigs.find(r => r.x === x && r.y === y);

export const depositAt = (st, x, y) => st.deposits.find(d => d.x === x && d.y === y);

// ---------- entry point ----------
// Money and oil are kept to two decimals ($122.78, 52.51 oil).
export const r2 = v => Math.round(v * 100) / 100;
export const fmt2 = v => { const x = r2(v); return Number.isInteger(x) ? String(x) : x.toFixed(2); };

export const ok = () => ({ ok: true });

export const fail = error => ({ ok: false, error });

// Automatic fire (gun platforms, standing orders) in a mission that says "identify first"
// (st.campaign.identifyFirst): only at ships in plain sight, never at a contact, and never at a non-combatant.
// Everywhere else it's any enemy ship you can see.
// (and a mission's non-combatants, like a refugee boat or a hijacked tanker with her crew aboard, never
// draw automatic fire anywhere)
export const autoTargetOk = (st, p, s, ident) => !s.noncombatant && !allied(st, p, s.owner) && (!(st.campaign?.identifyFirst && p === 0) || !!ident?.has(s.id));

// Truces (campaign): st.truce = [[a, b], ...] pairs of players who won't fire on each other, don't count as
// enemies in each other's view, and share what they see.
export const allied = (st, a, b) => a !== b && a >= 0 && b >= 0 && !!st.truce?.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
export const alliesOf = (st, p) => (st.truce || []).flatMap(([x, y]) => (x === p ? [y] : y === p ? [x] : []));
