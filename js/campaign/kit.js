// ============================================================
// Shared pieces for the bigger missions (6 onward): dialogue lines, founding bases and platforms in
// setup, free spots out of your sight, raft-town bookkeeping, and the "fired on it" tracker.
// ============================================================
import * as E from '../engine/index.js';
import { PLATFORMS } from '../data/bases.js';

export const line = (who, text, mood = 'neutral') => ({ who, mood, text });
export const say = who => (t, m) => line(who, t, m);
export const ortiz = say('ortiz'), sato = say('sato'), vance = say('vance'), hale = say('hale'), kade = say('kade');
export const ruiz = say('ruiz'), nyx = say('nyx'), maren = say('maren'), lio = say('lio'), council = say('council');

// setup: a base on a new deposit (its id kept in M.flags.bases[key])
export function foundAt(st, key, [x, y], owner, { capital = false, level = 1, tideAge = 0, type = 'medium', reserves = 140 } = {}) {
  const dep = { id: 'd_' + st.campaign.id + '_' + key, x, y, type, reserves, max: reserves };
  st.deposits.push(dep);
  const b = E.foundBase(st, owner, dep, capital);
  b.level = level; b.tideAge = tideAge;
  rigOf(st, b).hp = E.baseMaxHp(st, b);
  st.players[owner].known[dep.id] = true;
  (st.campaign.flags.bases ||= {})[key] = b.id;
  return b;
}
export const plat = (st, b, kind, dx, dy) => { const o = { id: 'f' + st.nextId++, owner: b.owner, baseId: b.id, kind, x: b.x + dx, y: b.y + dy, hp: PLATFORMS[kind].hp, buildLeft: 0 }; st.platforms.push(o); return o; };
export const baseOf = (st, key) => (st.bases || []).find(b => b.id === st.campaign.flags.bases?.[key]);
export const rigOf = (st, b) => b && st.rigs.find(r => r.baseId === b.id && r.center);
export const lost = (st, key, owner) => { const b = baseOf(st, key); return !b || b.wrecked || b.owner !== owner; };
export const freeDeposit = (st, key, [x, y], type = 'medium', reserves = 120) => { const d = { id: 'd_' + st.campaign.id + '_' + key, x, y, type, reserves, max: reserves }; st.deposits.push(d); return d; };

// a free spot for a ship (rot 0 or 1) in a box, optionally out of your sight
export function freeSpot(st, type, box, { rot = 0, hidden = false } = {}) {
  for (let y = box.y0; y <= box.y1; y++) for (let x = box.x0; x <= box.x1; x++) {
    const cells = E.shipCells({ type, x, y, rot });
    if (cells.some(([a, b]) => a < 0 || b < 0 || a >= st.W || b >= st.H || E.isLand(st, a, b) || (hidden && E.seesSquare(st, 0, a, b)))) continue;
    if (st.deposits.some(d => cells.some(([a, b]) => a === d.x && b === d.y))) continue;
    if ((st.platforms || []).some(o => cells.some(([a, b]) => a === o.x && b === o.y))) continue;
    if (st.ships.some(s => E.shipCells(s).some(([p, q]) => cells.some(([a, b]) => a === p && b === q)))) continue;
    return [x, y];
  }
  return null;
}
// spawn a group of ships in a box (out of sight), kept on your radar as contacts
export function spawn(st, H, owner, types, box, { track = true, hidden = true } = {}) {
  const out = [];
  for (const type of types) {
    let rot = 0, at = freeSpot(st, type, box, { hidden });
    if (!at) { rot = 1; at = freeSpot(st, type, box, { rot, hidden }); }
    if (!at) continue;
    const s = H.ship(st, owner, type, at[0], at[1], { rot, id: type.slice(0, 3) + (st.campaign.flags.n = (st.campaign.flags.n || 0) + 1) });
    if (track && owner !== 0) st.campaign.track.push(s.id);
    out.push(s);
  }
  return out;
}

// "Did you fire on it?": snapshot something's HP at the end of the enemy's turn (keep), and any drop on
// your turn is yours (check). Works for a rig or a ship (by id).
export function hpNow(st, id) { const s = st.ships.find(x => x.id === id) || st.rigs.find(r => r.id === id); return s ? s.hp : 0; }
export const keepHp = (M, key, ids, st) => { (M.flags.hpWas ||= {})[key] = Object.fromEntries(ids.map(id => [id, hpNow(st, id)])); };
export const hpDropped = (M, key, st) => st.current === 0 && Object.entries(M.flags.hpWas?.[key] || {}).some(([id, hp]) => hpNow(st, id) < hp);
