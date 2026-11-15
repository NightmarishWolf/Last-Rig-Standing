// Fog of war: what each player can see, and what blocks movement or placement.
import { PLATFORMS } from '../data/bases.js';
import { PORT, RIG } from '../data/economy.js';
import { baseById, baseRadius } from './bases.js';
import { dist, inBounds, isLand, shipCells } from './geometry.js';
import { pstat, shipStat } from './modifiers.js';
import { forwardPorts } from './stats.js';
import { passives, rigAt, shipAt } from './util.js';

const platformAt = (st, x, y) => (st.platforms || []).find(o => o.x === x && o.y === y);

// Every way player p can see: [cells, radius] pairs (ships, rigs, base centres, platforms, ports).
export function sightSources(st, p) {
  const src = [];
  for (const s of st.ships) if (s.owner === p) src.push([shipCells(s), shipStat(st, p, s.type, 'sight')]);
  const baseSight = pstat(st, p, 'baseSight');
  for (const r of st.rigs) if (r.owner === p) {
    const b = r.center && baseById(st, r.baseId);
    src.push([[[r.x, r.y]], b && !b.wrecked ? baseRadius(st, b) + baseSight : RIG.sight]);
  }
  for (const o of st.platforms || []) if (o.owner === p && !o.buildLeft) src.push([[[o.x, o.y]], PLATFORMS[o.kind].sight || 1]);
  for (const o of forwardPorts(st, p)) src.push([[[o.x, o.y]], PORT.sight]);
  return src;
}

// ---------- visibility ----------
export function visibility(st, p) {
  const mine = st.ships.filter(s => s.owner === p);
  const rev = st.players[p].reveals;
  const src = sightSources(st, p);
  const ships = new Set(), rigs = new Set(), ports = new Set(), platforms = new Set();
  // stealth research on the *target's* side shortens how far it can be seen from
  const seenBy = (cells, owner) => {
    const minus = owner === undefined ? 0 : pstat(st, owner, 'stealth');
    for (const [c, r] of src) if (dist(c, cells) <= r - minus) return true;
    return false;
  };
  for (const e of st.ships) {
    if (e.owner === p) continue;
    const cells = shipCells(e);
    if (rev.ships.includes(e.id)) { ships.add(e.id); continue; }
    if (passives(e).submerged) {
      const near = mine.some(s => {
        const d = dist(shipCells(s), cells), sonar = shipStat(st, p, s.type, 'sonar');
        return d <= 1 || (sonar && d <= sonar);
      });
      if (near) ships.add(e.id);
    } else if (seenBy(cells, e.owner)) ships.add(e.id);
  }
  for (const r of st.rigs) {
    if (r.owner === p) continue;
    if (rev.rigs.includes(r.id) || seenBy([[r.x, r.y]])) rigs.add(r.id);
  }
  for (const o of st.ports || []) {
    if (o.owner === p) continue;
    if ((rev.ports || []).includes(o.id) || seenBy([[o.x, o.y]])) ports.add(o.id);
  }
  for (const o of st.platforms || []) {
    if (o.owner === p) continue;
    if (PLATFORMS[o.kind].public || (rev.platforms || []).includes(o.id) || seenBy([[o.x, o.y]])) platforms.add(o.id);
  }
  return { ships, rigs, ports, platforms };
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
    const f = platformAt(st, x, y);
    if (f && (f.owner === owner || vis.platforms?.has(f.id))) return false;
  }
  return true;
}

export function hiddenBlocker(st, owner, cells, ignoreId) {
  for (const [x, y] of cells) {
    const s = shipAt(st, x, y, o => o.id !== ignoreId && o.owner !== owner);
    if (s) return { kind: 'ship', obj: s };
    const r = rigAt(st, x, y);
    if (r && r.owner !== owner) return { kind: 'rig', obj: r };
    const f = platformAt(st, x, y);
    if (f && f.owner !== owner) return { kind: 'platform', obj: f };
  }
  return null;
}

export function revealBlocker(st, p, blk) {
  const key = { ship: 'ships', rig: 'rigs', platform: 'platforms' }[blk.kind];
  (st.players[p].reveals[key] ||= []).push(blk.obj.id);
}
