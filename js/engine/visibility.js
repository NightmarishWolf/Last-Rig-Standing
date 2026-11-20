// Fog of war: what each player can see, and what blocks movement or placement.
import { PLATFORMS } from '../data/bases.js';
import { SHIPS } from '../data/ships.js';
import { inFogBank } from './world.js';
import { PORT, RIG } from '../data/economy.js';
import { baseById, baseRadius } from './bases.js';
import { dist, inBounds, isLand, shipCells } from './geometry.js';
import { pstat, shipStat } from './modifiers.js';
import { forwardPorts } from './stats.js';
import { passives, rigAt, shipAt } from './util.js';
import { tideSources } from './factions.js';

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
  // the Free Tide sees across its rafts
  for (const o of tideSources(st, p)) src.push([[[o.x, o.y]], o.r]);
  // a fog bank: nothing inside sees further than 1 square
  if (st.events?.active?.some(e => e.kind === 'fogbank')) for (const s of src) if (s[0].some(([x, y]) => inFogBank(st, x, y))) s[1] = Math.min(s[1], 1);
  return src;
}

// ---------- reveal fog (st.exploreFog) ----------
// Squares a player has ever seen stay visible for good (live, not a memory), kept as bits:
// pl.revealed[i >> 5] has bit (i & 31) set for square i = y * W + x.
export function isExplored(st, p, x, y) {
  const e = st.players[p].revealed, i = y * st.W + x;
  return !!e && ((e[i >> 5] >>> (i & 31)) & 1) === 1;
}
export function exploreAll(st) {
  if (!st.exploreFog) return;
  const { W, H } = st, words = Math.ceil(W * H / 32);
  st.players.forEach((pl, p) => {
    if (pl.out) return;
    const e = pl.revealed ||= new Array(words).fill(0);
    for (const [cells, r] of sightSources(st, p))
      for (const [cx, cy] of cells)
        for (let y = Math.max(0, cy - r); y <= Math.min(H - 1, cy + r); y++)
          for (let x = Math.max(0, cx - r); x <= Math.min(W - 1, cx + r); x++) { const i = y * W + x; e[i >> 5] |= 1 << (i & 31); }
  });
}

// ---------- visibility ----------
export function visibility(st, p) {
  const mine = st.ships.filter(s => s.owner === p);
  const rev = st.players[p].reveals;
  const src = sightSources(st, p);
  // ident: enemy ships seen with your own eyes (in sight, or a sub right next to you), so you can tell
  // what they are; the rest of `ships` are contacts from scans, sonar, muzzle flashes or bumping into them
  const ships = new Set(), ident = new Set(), rigs = new Set(), ports = new Set(), platforms = new Set();
  // stealth research on the *target's* side shortens how far it can be seen from
  const fogBank = st.events?.active?.some(e => e.kind === 'fogbank');
  const seenBy = (cells, owner) => {
    // inside a fog bank only things right next to you are seen (even with fog of war off)
    const fogged = fogBank && cells.some(([x, y]) => inFogBank(st, x, y));
    if (fogged) return src.some(([c]) => dist(c, cells) <= 1);
    if (st.noFog) return true;
    if (st.exploreFog && cells.some(([x, y]) => isExplored(st, p, x, y))) return true;
    const minus = owner === undefined || owner < 0 ? 0 : pstat(st, owner, 'stealth');
    for (const [c, r] of src) if (dist(c, cells) <= r - minus) return true;
    return false;
  };
  for (const e of st.ships) {
    if (e.owner === p) continue;
    const cells = shipCells(e);
    if (rev.ships.includes(e.id)) ships.add(e.id);
    if (passives(e).submerged) {
      // (Nyx's Phantoms: Ghost Boats aren't seen even right next to you, only by sonar)
      const phantom = passives(e).ghost && e.owner >= 0 && pstat(st, e.owner, 'ghostHidden') > 0;
      let eyes = false, heard = false;
      for (const s of mine) {
        const d = dist(shipCells(s), cells), sonar = shipStat(st, p, s.type, 'sonar');
        if (d <= 1 && !phantom) eyes = true; else if (sonar && d <= sonar) heard = true;
      }
      if (eyes) { ships.add(e.id); ident.add(e.id); } else if (heard) ships.add(e.id);
    } else if (seenBy(cells, e.owner)) { ships.add(e.id); ident.add(e.id); }
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
  return { ships, ident, rigs, ports, platforms };
}

// Is a footprint legal for `owner`? Hidden enemies are ignored here
// (you can plan a move through fog); they are discovered on contact.
export function placementOk(st, owner, cells, ignoreId, vis) {
  for (const [x, y] of cells) {
    if (!inBounds(st, x, y) || isLand(st, x, y)) return false;
    if (st.ice?.[y * st.W + x] && !SHIPS[st.ships.find(s => s.id === ignoreId)?.type]?.passives?.iceBreaker) return false; // pack ice
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
