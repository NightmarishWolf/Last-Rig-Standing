// Fog of war: what each player can see, and what blocks movement or placement.
import { PORT, RIG } from '../data/economy.js';
import { SHIPS } from '../data/ships.js';
import { dist, inBounds, isLand, shipCells } from './geometry.js';
import { forwardPorts } from './stats.js';
import { passives, rigAt, shipAt } from './util.js';

// ---------- visibility ----------
export function visibility(st, p) {
  const mine = st.ships.filter(s => s.owner === p);
  const myRigs = st.rigs.filter(r => r.owner === p);
  const rev = st.players[p].reveals;
  const myPorts = forwardPorts(st, p);
  const ships = new Set(), rigs = new Set(), ports = new Set();
  const seenBy = cells => {
    for (const s of mine) if (dist(shipCells(s), cells) <= SHIPS[s.type].sight) return true;
    for (const r of myRigs) if (dist([[r.x, r.y]], cells) <= RIG.sight) return true;
    for (const o of myPorts) if (dist([[o.x, o.y]], cells) <= PORT.sight) return true;
    return false;
  };
  for (const e of st.ships) {
    if (e.owner === p) continue;
    const cells = shipCells(e);
    if (rev.ships.includes(e.id)) { ships.add(e.id); continue; }
    if (passives(e).submerged) {
      const near = mine.some(s => dist(shipCells(s), cells) <= 1 ||
        (passives(s).sonar && dist(shipCells(s), cells) <= passives(s).sonar));
      if (near) ships.add(e.id);
    } else if (seenBy(cells)) ships.add(e.id);
  }
  for (const r of st.rigs) {
    if (r.owner === p) continue;
    if (rev.rigs.includes(r.id) || seenBy([[r.x, r.y]])) rigs.add(r.id);
  }
  for (const o of st.ports || []) {
    if (o.owner === p) continue;
    if ((rev.ports || []).includes(o.id) || seenBy([[o.x, o.y]])) ports.add(o.id);
  }
  return { ships, rigs, ports };
}

// Is a footprint legal for `owner`? Hidden enemies are ignored here
// (you can plan a move through fog); they are discovered on contact.
export function placementOk(st, owner, cells, ignoreId, vis) {
  for (const [x, y] of cells) {
    if (!inBounds(st, x, y) || isLand(st, x, y)) return false;
    if (st.blocked && st.blocked.includes(x + ',' + y)) return false;
    const s = shipAt(st, x, y, o => o.id !== ignoreId && (o.owner === owner || vis.ships.has(o.id)));
    if (s) return false;
    const r = rigAt(st, x, y);
    if (r && (r.owner === owner || vis.rigs.has(r.id))) return false;
  }
  return true;
}

export function hiddenBlocker(st, owner, cells, ignoreId) {
  for (const [x, y] of cells) {
    const s = shipAt(st, x, y, o => o.id !== ignoreId && o.owner !== owner);
    if (s) return { kind: 'ship', obj: s };
    const r = rigAt(st, x, y);
    if (r && r.owner !== owner) return { kind: 'rig', obj: r };
  }
  return null;
}

export function revealBlocker(st, p, blk) {
  st.players[p].reveals[blk.kind === 'ship' ? 'ships' : 'rigs'].push(blk.obj.id);
}
