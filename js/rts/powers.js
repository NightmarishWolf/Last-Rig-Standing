// ============================================================
// RTS · commander powers. Each commander has two (data/commanders.js): one from level 1, one from level 8,
// on cooldowns (the turn-based cooldown in turns × TURN seconds; every power starts POWER_START turns from
// ready). Powers that need a target are aimed like an ability:
//   seen   a spot you can see          any    anywhere          tide   a spot on your own Tide
//   base   an enemy base (Beach Landing)                         struct an enemy platform (Sabotage)
// ============================================================
import { POWERS, powersAt, POWER_START, COMMANDERS } from '../data/commanders.js';
import { TURN, HP_K, UNITS, ROUND } from './data.js';
import { addUnit, reveal, note, sellOil, onTideOf, enemyOf, platsOf, basesOf, seen } from './sim.js';
import { clrAt } from './map.js';

export { POWERS, COMMANDERS };
export const powersOf = (G, team) => { const c = G.players[team]?.cmd; return c ? powersAt(c.id, c.level) : []; };
const cds = (G, team) => (G.players[team].pcd ||= Object.fromEntries((COMMANDERS[G.players[team].cmd?.id]?.powers || []).map(w => [w.id, POWER_START * TURN])));
export const powerCd = (G, team, id) => cds(G, team)[id] || 0;
export function powersStep(G, dt) {
  for (const P of G.players) if (P.cmd && !P.out) { const c = cds(G, P.id); for (const k in c) c[k] = Math.max(0, c[k] - dt); }
}
const visibleTo = (G, team, x, y) => G.cfg.fog === 'off' || !!G.vis[team][(y | 0) * G.m.W + (x | 0)];

// is (x, y) a good target for this power? → { ok, target } or { ok: false, why }
export function powerTarget(G, team, w, x, y) {
  if (!w.target) return { ok: true };
  if (x < 0 || y < 0 || x >= G.m.W || y >= G.m.H) return { ok: false, why: 'Off the map.' };
  if (w.target === 'seen' && !visibleTo(G, team, x, y)) return { ok: false, why: 'Pick a spot you can see.' };
  if (w.target === 'tide' && (!onTideOf(G, team, x, y) || clrAt(G.m, x, y) < 1)) return { ok: false, why: 'Pick open water on your Tide.' };
  if (w.target === 'base') {
    const b = G.structs.find(s => s.type === 'base' && enemyOf(G, team, s.team) && Math.hypot(s.x - x, s.y - y) < 1.3 && seen(G, team, s));
    if (!b) return { ok: false, why: 'Click an enemy base.' };
    if (b.capital) return { ok: false, why: 'Not an Admiralty.' };
    if (platsOf(G, b).some(p => p.built >= 1)) return { ok: false, why: 'It still has working platforms.' };
    if (!G.units.some(u => u.team === team && Math.hypot(u.x - b.x, u.y - b.y) <= w.range + 0.6)) return { ok: false, why: `One of your ships must be within ${w.range} squares.` };
    if (G.units.some(u => u.team === b.team && UNITS[u.type].weapons.length && Math.hypot(u.x - b.x, u.y - b.y) <= 2.5)) return { ok: false, why: 'Defending ships are holding the marines off.' };
    return { ok: true, target: b };
  }
  if (w.target === 'struct') {
    const p = G.structs.find(s => s.type !== 'base' && enemyOf(G, team, s.team) && Math.hypot(s.x - x, s.y - y) < 0.9 && seen(G, team, s));
    if (!p) return { ok: false, why: 'Click an enemy platform.' };
    if (!G.units.some(u => u.team === team && Math.hypot(u.x - p.x, u.y - p.y) <= w.range + 0.6)) return { ok: false, why: `One of your ships must be within ${w.range} squares.` };
    return { ok: true, target: p };
  }
  return { ok: true };
}

export function usePower(G, team, id, x, y) {
  const P = G.players[team], w = powersOf(G, team).find(w => w.id === id);
  if (!w) return { ok: false, why: 'Your commander has no such power.' };
  if (powerCd(G, team, id) > 0) return { ok: false, why: `${w.name}: ready in ${Math.ceil(powerCd(G, team, id))}s.` };
  const t = powerTarget(G, team, w, x, y); if (!t.ok) return t;
  const mine = G.units.filter(u => u.team === team);
  switch (id) {
    case 'damagecontrol': for (const u of mine) u.hp = Math.min(u.max, u.hp + (UNITS[u.type].cls === 'capital' ? 4 : 2) * HP_K); break;
    case 'broadside': {
      const caps = mine.filter(u => UNITS[u.type].cls === 'capital');
      if (!caps.length) return { ok: false, why: 'You have no capital ships.' };
      for (const u of caps) { u.cds = {}; u.rapidUntil = G.t + TURN; }
      break;
    }
    case 'carrierstrike': case 'firestorm': {
      const hq = basesOf(G, team).find(b => b.capital) || mine[0] || { x, y };
      G.shots.push({ x: hq.x, y: hq.y, tx: x, ty: y, speed: 14, dmg: w.dmg * HP_K, area: w.area / 2, team, air: id === 'carrierstrike', big: true });
      if (id === 'firestorm') G.slicks.push({ x, y, r: 1.2, until: G.t + 3 * ROUND, burnUntil: G.t + 3 * ROUND, burnTeam: team });
      break;
    }
    case 'reconblanket': reveal(G, team, x, y, w.size / 2 + 0.6, 2 * TURN); break;
    case 'beachlanding': {
      const b = t.target, old = b.team;
      for (const p of platsOf(G, b)) p.hp = 0; // (half-built platforms are wrecked in the fighting)
      b.team = team; b.queue = []; b.upgrading = null; b.hp = Math.max(b.hp, b.max * 0.5);
      note(G, old, 'Enemy marines captured one of your bases!'); note(G, team, 'The marines took the base: it\'s yours.');
      break;
    }
    case 'sabotage': t.target.hp = 0; note(G, t.target.team, 'Commandos blew up one of your platforms!'); break;
    case 'swarmcall': for (let i = 0; i < w.boats; i++) { const a = i / w.boats * Math.PI * 2, u = addUnit(G, team, 'skiff', x + Math.cos(a) * 0.8, y + Math.sin(a) * 0.8, a); if (clrAt(G.m, u.x, u.y) < 1) { u.x = x; u.y = y; } } break;
    case 'tidalsurge': P.surgeUntil = G.t + w.rounds * ROUND; G.tideT = 0; break;
    case 'ignite':
      if (!G.slicks.length) return { ok: false, why: 'There are no oil slicks to light.' };
      for (const k of G.slicks) { k.burnUntil = G.t + w.rounds * ROUND; k.burnTeam = team; k.until = Math.max(k.until, k.burnUntil); }
      break;
    case 'blackmarket': { if (P.oil < 1) return { ok: false, why: 'No oil to sell.' }; const got = sellOil(G, team, w.oil, { mult: w.mult, fixed: true }); note(G, team, `Black market: sold for $${Math.round(got)}.`); break; }
    case 'smugglerun': P.runUntil = G.t + 2 * TURN; break;
    default: return { ok: false, why: 'Not in the real-time game yet.' };
  }
  cds(G, team)[id] = w.cooldown * TURN;
  G.msgs.push({ team: -2, text: `${COMMANDERS[P.cmd.id].name}: ${w.name}!`, t: G.t, from: team });
  return { ok: true };
}

// a computer player's use of its powers: each one, when there's something worth using it on
export function aiPowers(G, team) {
  const P = G.players[team];
  for (const w of powersOf(G, team)) {
    if (powerCd(G, team, w.id) > 0) continue;
    const mine = G.units.filter(u => u.team === team), foes = G.units.filter(u => enemyOf(G, team, u.team) && seen(G, team, u));
    let at = null;
    switch (w.id) {
      case 'damagecontrol': if (mine.filter(u => u.hp < u.max * 0.6).length >= 3) at = {}; break;
      case 'broadside': if (mine.some(u => UNITS[u.type].cls === 'capital' && u.near && u.near.hp > 0)) at = {}; break;
      case 'carrierstrike': case 'firestorm': {
        // (the spot with the most enemies round it)
        let best = 0;
        for (const f of foes) { const n = foes.filter(o => Math.hypot(o.x - f.x, o.y - f.y) <= 1.6).length; if (n > best) { best = n; at = { x: f.x, y: f.y }; } }
        if (best < 2) at = null;
        break;
      }
      case 'reconblanket': { const b = G.structs.filter(s => s.type === 'base' && enemyOf(G, team, s.team))[Math.floor(Math.random() * 3)]; if (b && !G.vis[team][(b.y | 0) * G.m.W + (b.x | 0)]) at = { x: b.x, y: b.y }; break; }
      case 'beachlanding': case 'sabotage':
        for (const s of G.structs) if (enemyOf(G, team, s.team) && powerTarget(G, team, w, s.x, s.y).ok) { at = { x: s.x, y: s.y }; break; }
        break;
      case 'swarmcall': { const t = (G.tide?.[team] || [])[0]; if (t && mine.length > 3) at = { x: t.x + 1.5, y: t.y + 1.5 }; break; }
      case 'tidalsurge': if (G.t > 240) at = {}; break;
      case 'ignite': if (G.slicks.some(k => foes.some(f => Math.hypot(f.x - k.x, f.y - k.y) <= k.r))) at = {}; break;
      case 'blackmarket': if (P.oil >= 20) at = {}; break;
      case 'smugglerun': if (mine.filter(u => u.order.type === 'amove').length >= 5) at = {}; break;
    }
    if (at) usePower(G, team, w.id, at.x ?? 0, at.y ?? 0);
  }
}
