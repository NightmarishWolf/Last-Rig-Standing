// Map types: each one reshapes the world the terrain generator makes (terrain.js), by mixing its noise
// layers differently and pushing the land up or down in places ("bias"). Everything else stays the same
// for every type: mirrored for fairness, open water around the spawns, lakes filled in, and a warship
// lane guaranteed between every home (setup.js). Names and descriptions: js/data/maps.js MAP_TYPES.
//
//   landShare  roughly how much of the map is land        mix    weights of the big / mid / small noise
//   bias(g)    extra height per square (+ = land)         oil    where the No Man's Sea oil gathers
//   ownHomes   the type shapes the home waters itself (others keep homes mostly open water)
//   deposits   × how many No Man's Sea deposits (they scale with open water; an all-water map needs fewer)
//   domination × Domination's "enough of the map" bar (where islands crowd every base's claim)
import { MAP_TYPES, MAP_TYPE_ORDER } from '../data/maps.js';
import { rand } from './rng.js';

// helpers on a geometry object g = { W, H, C (centre), homes: [{ x, y, rect }], m (shorter side) }
const segDist = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
  return { d: Math.hypot(px - (ax + t * dx), py - (ay + t * dy)), t };
};
const rectDist = (r, x, y) => Math.max(r.x0 - x, 0, x - r.x1, r.y0 - y, 0, y - r.y1);
// distance from (x, y) to the ray from a towards b (Infinity behind a)
const rayDist = (x, y, a, b) => {
  const ux = b.x - a.x, uy = b.y - a.y, L = Math.hypot(ux, uy) || 1;
  const along = ((x - a.x) * ux + (y - a.y) * uy) / L;
  return along < 0 ? Infinity : Math.abs((x - a.x) * uy - (y - a.y) * ux) / L;
};

export const SHAPES = {
  classic: { mix: [0.55, 0.3, 0.15] },

  // many small islands: almost no continents, lots of mid and small noise
  archipelago: { landShare: 0.3, mix: [0.08, 0.37, 0.55], domination: 0.6 },

  // land everywhere except a channel from every home to the centre, narrowest in the middle
  strait: {
    landShare: 0.5, mix: [0.35, 0.4, 0.25], oil: { at: 'centre', share: 0.6, r: 0.16 },
    bias(g, x, y) {
      let best = Infinity;
      for (const h of g.homes) {
        const { d, t } = segDist(x, y, h.x, h.y, g.C.x, g.C.y);
        const w = g.m * (0.13 - 0.07 * t); // half-width: wide at the homes, narrow at the centre
        best = Math.min(best, d - w);
      }
      return best < 0 ? -0.6 : 0.5 + Math.min(0.4, best / 6 * 0.4);
    },
  },

  // a few rocks and nothing else
  ocean: { landShare: 0.05, mix: [0.15, 0.3, 0.55], deposits: 0.65 },

  // a walled sea in the middle, with a gate facing each player
  inland: {
    landShare: 0.3, mix: [0.3, 0.35, 0.35], oil: { at: 'inside', share: 0.7 },
    bias(g, x, y) {
      const rx = g.W * 0.25, ry = g.H * 0.36, ring = 8;
      const r = Math.hypot((x - g.C.x) / rx, (y - g.C.y) / ry);
      if (r < 1) return -0.35; // the inland sea: open, a few islands
      const outRing = Math.hypot((x - g.C.x) / (rx + ring), (y - g.C.y) / (ry + ring));
      if (outRing <= 1) return g.homes.some(h => rayDist(x, y, g.C, h) < 3.5) ? -1 : 0.9; // the wall (gates toward each home)
      return -0.12; // the open ocean outside
    },
    inside(g, x, y) { return Math.hypot((x - g.C.x) / (g.W * 0.25), (y - g.C.y) / (g.H * 0.36)) < 0.9; },
  },

  // a sheltered bay around each home, opening toward the centre; a shared sea in the middle
  twin: {
    landShare: 0.28, mix: [0.3, 0.4, 0.3], ownHomes: true, oil: { at: 'centre', share: 0.5, r: 0.2 },
    bias(g, x, y) {
      let wall = false;
      for (const h of g.homes) {
        const d = rectDist(h.rect, x, y);
        if (d === 0) return -0.3; // inside the bay: open water
        if (d <= 7) { if (rayDist(x, y, h, g.C) < 5) return -1; wall = true; } // the bay's mouth faces the centre
      }
      return wall ? 0.9 : -0.05;
    },
  },

  // coasts along the top and bottom (4 players: a big central landmass) cut by long thin fjords
  fjords: {
    landShare: 0.42, mix: [0.3, 0.3, 0.4], fjords: true,
    bias(g, x, y, n) {
      // land rises toward the map's long edges (away from the line between the homes)
      const v = Math.abs(y - g.C.y) / (g.H / 2), u = Math.abs(x - g.C.x) / (g.W / 2);
      const edge = g.homes.length === 4 ? Math.max(0, 0.75 - Math.max(u, v)) * 1.4 : Math.max(0, v - 0.25);
      let b = edge * 0.9;
      // fjords: thin channels along the stretched noise's middle values
      if (Math.abs(n.fj - 0.5) < 0.09) b -= 1.2;
      return b;
    },
  },
};

// Polar: pack ice over the far waters (2-3 players: along the top and bottom; 4: a sheet in the middle),
// some floes elsewhere, and half the No Man's Sea oil under it.
SHAPES.polar = {
  landShare: 0.18, mix: [0.5, 0.3, 0.2], oil: { at: 'ice', share: 0.5 },
  ice(g, x, y, n) {
    const v = Math.abs(y - g.C.y) / (g.H / 2), u = Math.abs(x - g.C.x) / (g.W / 2);
    const wob = (n.ic - 0.5) * 0.35;
    if (g.homes.length === 4) return Math.max(u * 0.85, v) < 0.55 + wob || n.fl > 0.82;
    return v > 0.55 + wob || n.fl > 0.84;
  },
};

export const depositScale = st => (SHAPES[st.mapType] || SHAPES.classic).deposits ?? 1;

export const resolveMapType = (st, type) => {
  if (type === 'random') return MAP_TYPE_ORDER[Math.floor(rand(st) * MAP_TYPE_ORDER.length)];
  return MAP_TYPES[type] ? type : 'classic';
};

export function geometry(st) {
  const { W, H } = st;
  return {
    W, H, C: { x: (W - 1) / 2, y: (H - 1) / 2 }, m: Math.min(W, H),
    homes: st.players.map(pl => ({ x: (pl.home.x0 + pl.home.x1) / 2, y: (pl.home.y0 + pl.home.y1) / 2, rect: pl.home })),
  };
}

// Where a type wants its No Man's Sea oil: a test for "is this square in the hot spot", and the share
// of the middle deposits that go there (the rest are spread as usual). null = spread evenly.
export function oilFocus(st) {
  const shape = SHAPES[st.mapType] || SHAPES.classic;
  if (!shape.oil) return null;
  const g = geometry(st);
  if (shape.oil.at === 'inside') return { share: shape.oil.share, ok: (x, y) => shape.inside(g, x, y) };
  if (shape.oil.at === 'ice') return { share: shape.oil.share, ok: (x, y) => !!st.ice?.[y * st.W + x] };
  const r = g.m * shape.oil.r;
  return { share: shape.oil.share, ok: (x, y) => Math.hypot(x - g.C.x, y - g.C.y) <= r };
}
