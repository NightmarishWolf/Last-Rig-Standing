// Seeded random numbers: the same seed always gives the same game (needed for online sync).

 // how deep the spawn strip is

// ---------- random numbers (seeded, so games can be replayed/synced) ----------
export function rand(state) {
  let t = (state.rng += 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const randInt = (s, a, b) => a + Math.floor(rand(s) * (b - a + 1));
