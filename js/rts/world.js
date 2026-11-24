// RTS · a new match. The map comes from the game's own generator (sizes, map types, mirrored homes,
// oil deposits: js/engine/setup.js), so every map type works; then each player gets an Admiralty on
// their home deposit, two workers and two warships.
import * as E from '../engine/index.js';
import { clearance } from './map.js';
import { addUnit, addBase, TEAM_COLORS } from './sim.js';
import { START_MONEY, START_OIL, MARKET, RESERVES_K } from './data.js';
import { newResearch } from './tech.js';
import { eventsSetup } from './events.js';

// cfg: { size, mapType, seed, mirror, fog, victory, players: [{ name, seat: 'human'|'ai', faction, difficulty, personality, commander }] }
export function newMatch(cfg) {
  const n = Math.max(2, Math.min(4, cfg.players?.length || 2));
  const seed = Number.isInteger(cfg.seed) ? cfg.seed : Math.floor(Math.random() * 1e9);
  const st = E.newGame({ size: cfg.size || 'small', mapType: cfg.mapType || 'classic', players: n, seed, mirror: cfg.mirror !== false, fog: 'on', turnTimer: 0,
    seats: (cfg.players || []).map(p => ({ seat: p.seat === 'ai' ? 'ai' : 'human', faction: p.faction || 'navy', commander: p.commander, level: p.level, mastery: p.mastery, difficulty: p.difficulty, personality: p.personality })),
    commanderLevel1: !!cfg.commanderLevel1 });
  const m = { W: st.W, H: st.H, land: Uint8Array.from(st.land), seed, mapType: st.mapType || cfg.mapType,
    deposits: st.deposits.map(d => ({ id: d.id, x: d.x + 0.5, y: d.y + 0.5, type: d.type, reserves: d.reserves * RESERVES_K, max: d.max * RESERVES_K })) };
  m.clr = clearance(m);
  const G = {
    cfg: { ...cfg, seed }, m, t: 0, paused: false, speed: 1, nextId: 1, over: false, winner: null,
    market: { price: MARKET.basePrice },
    players: Array.from({ length: n }, (_, i) => {
      const c = cfg.players?.[i] || {}, side = c.faction || 'navy';
      return { id: i, name: c.name || `Player ${i + 1}`, side, color: TEAM_COLORS[i], ai: c.seat === 'ai', human: c.seat !== 'ai', difficulty: c.difficulty || 'normal',
        personality: c.personality || 'balanced', cmd: st.players[i].commander || null, research: newResearch(), money: START_MONEY, oil: START_OIL, home: st.players[i].home, allies: [] };
    }),
    units: [], structs: [], shots: [], fx: [], msgs: [], reveals: [], slicks: [], storms: [], fog: [], fields: [], ev: eventsSetup(cfg.events),
    vis: Array.from({ length: n }, () => new Uint8Array(m.W * m.H)), explored: Array.from({ length: n }, () => new Uint8Array(m.W * m.H)), visT: 0,
  };
  for (const P of G.players) {
    const cap = st.bases.find(b => b.owner === P.id && b.capital), dep = m.deposits.find(d => d.id === cap.depId);
    const hq = addBase(G, P.id, dep, { capital: true });
    // (the rally point and the first ships go out toward the middle of the map)
    const ang = Math.atan2(m.H / 2 - hq.y, m.W / 2 - hq.x), at = (r, da) => [hq.x + Math.cos(ang + da) * r, hq.y + Math.sin(ang + da) * r];
    hq.rally = { x: at(3.5, 0)[0], y: at(3.5, 0)[1] };
    const side = P.side, worker = side === 'navy' ? 'survey' : 'prospector', light = side === 'navy' ? 'patrol' : 'skiff', mid = side === 'navy' ? 'corvette' : 'gunboat';
    for (const [type, r, da] of [[worker, 2.2, -0.6], [worker, 2.2, 0.6], [light, 3.6, -0.4], [mid, 3.6, 0.4]]) {
      const [x, y] = at(r, da), u = addUnit(G, P.id, type, x, y, ang);
      if (m.clr[(y | 0) * m.W + (x | 0)] < 1) { u.x = hq.x + Math.cos(ang) * 1.5; u.y = hq.y + Math.sin(ang) * 1.5; }
    }
  }
  return G;
}
