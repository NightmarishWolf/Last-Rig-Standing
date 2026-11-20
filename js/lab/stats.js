// Balance statistics: one compact record per finished (or stopped) game, and the totals over many
// games that the Balance lab dashboard shows. Used by the in-browser lab (worker.js), by
// tools/simulate.mjs (out=report.json), and for real games' "Download game data" files.
import { SHIPS } from '../data/ships.js';
import { PLATFORMS } from '../data/bases.js';

// ---------- one game ----------
export function gameRecord(st, extra = {}) {
  return {
    v: 1, source: extra.source || 'bots', seed: st.seed,
    settings: { size: st.size, mapType: st.mapType || 'classic', events: st.events?.mode || 'off', players: st.players.length, mirror: !!st.mirror, simul: !!st.simul, fog: st.noFog ? 'off' : st.exploreFog ? 'reveal' : 'on' },
    finished: st.phase === 'over', winner: st.winner ?? null, reason: st.winReason || null, rounds: st.round,
    players: st.players.map((pl, i) => ({
      seat: i, kind: pl.seat === 'ai' && !pl.takenOver ? 'bot' : 'human', difficulty: pl.ai?.difficulty || null, personality: pl.ai?.personality || null, faction: pl.faction || 'navy', commander: pl.commander?.id || null, level: pl.commander?.level || null,
      out: !!pl.out, stats: { ...(pl.stats || {}), units: undefined }, units: pl.stats?.units || {},
      techs: Object.keys(pl.research?.done || {}),
    })),
    history: st.history || [], // rows per round: { round, p: [[oil, money, ships, bases, techs, fleetValue], ...] }
  };
}
// A real game's "Download game data" file, turned into the same kind of record.
export function recordFromGameData(d) {
  if (d?.lastRigStanding !== 'game-data') return null;
  return {
    v: 1, source: d.settings?.online ? 'online' : 'local', seed: d.settings?.seed,
    settings: { size: d.settings?.size, mapType: d.settings?.mapType || 'classic', players: d.players.length, mirror: !!d.settings?.mirror, simul: !!d.settings?.simul, fog: d.settings?.fog || 'on' },
    finished: d.result?.winner != null || !!d.result?.reason, winner: d.result?.winner ?? null, reason: d.result?.reason || null, rounds: d.result?.rounds,
    players: d.players.map(p => ({ seat: p.seat, kind: p.kind, difficulty: p.difficulty || null, personality: p.personality || null, faction: p.faction || 'navy', commander: p.commander || null, level: p.level || null, out: p.out, stats: p.stats || {}, units: p.units || p.stats?.units || {}, techs: p.techs || [] })),
    history: d.history?.rounds || [],
  };
}

// ---------- many games ----------
const HIST_COLS = ['oil', 'money', 'ships', 'bases', 'techs', 'fleet'];
export function unitName(u) {
  if (SHIPS[u]) return SHIPS[u].name;
  const [kind, id] = u.split(':');
  if (kind === 'strike' || kind === 'defense') return `${PLATFORMS[id]?.name || id}${kind === 'strike' ? ' (strike)' : ''}`;
  if (u === 'mine') return 'Mines';
  return u;
}
export const isShip = u => !!SHIPS[u];

export function aggregate(records) {
  const games = records.length, done = records.filter(r => r.finished);
  const rate = () => ({ games: 0, wins: 0 });
  const by = { personality: {}, difficulty: {}, seat: {}, kind: {}, matchup: {}, faction: {}, factionVs: {}, commander: {} };
  const reasons = {};
  for (const r of done) reasons[r.reason || 'none'] = (reasons[r.reason || 'none'] || 0) + 1;
  // wins: only finished games count (a stopped game has no winner yet)
  for (const r of done) for (const p of r.players) {
    const won = r.winner === p.seat ? 1 : 0;
    const add = (map, k) => { if (k == null) return; (map[k] ||= rate()).games++; map[k].wins += won; };
    add(by.personality, p.personality); add(by.difficulty, p.difficulty);
    add(by.seat, `Player ${p.seat + 1}`); add(by.kind, p.kind);
    add(by.faction, p.faction || 'navy');
    add(by.commander, p.commander || 'none');
    // faction against faction: "tide vs navy" counts the Tide seat's wins in games against the Navy
    const rivals = [...new Set(r.players.filter(o => o.seat !== p.seat).map(o => o.faction || 'navy'))].sort();
    if (rivals.length === 1) add(by.factionVs, `${p.faction || 'navy'} vs ${rivals[0]}`);
  }
  // units: totals, split between winners and everyone else
  const units = {};
  for (const r of records) for (const p of r.players) {
    const side = !r.finished ? null : r.winner === p.seat ? 'w' : 'l';
    for (const [u, s] of Object.entries(p.units || {})) {
      const t = units[u] ||= { unit: u, name: unitName(u), ship: isShip(u), built: 0, start: 0, value: 0, lost: 0, shots: 0, dmg: 0, struct: 0, kills: 0, killValue: 0, players: 0, builtW: 0, builtL: 0 };
      for (const k of ['built', 'start', 'value', 'lost', 'shots', 'dmg', 'struct', 'kills', 'killValue']) t[k] += s[k] || 0;
      if (s.built) t.players++;
      if (side === 'w') t.builtW += s.built || 0; else if (side === 'l') t.builtL += s.built || 0;
    }
  }
  const allSeats = records.reduce((t, r) => t + r.players.length, 0);
  const wGames = done.length, lPlayers = done.reduce((t, r) => t + r.players.length - (r.winner == null ? 0 : 1), 0);
  const unitRows = Object.values(units).map(u => {
    const fielded = u.built + u.start;
    return {
      ...u,
      perGame: allSeats ? u.built / allSeats : 0, // per player
      survival: fielded ? 1 - Math.min(1, u.lost / fielded) : null,
      killsPerShip: fielded ? u.kills / fielded : null,
      dmgPer1k: u.value ? (u.dmg + u.struct) / (u.value / 1000) : null,
      // value of enemy ships sunk for every $ spent building this class
      trade: u.value ? u.killValue / u.value : null,
      winnersPerGame: wGames ? u.builtW / wGames : 0,
      losersPerGame: lPlayers ? u.builtL / lPlayers : 0,
    };
  }).sort((a, b) => (b.ship - a.ship) || (b.built + b.start) - (a.built + a.start) || b.kills - a.kills);
  // economy over time: average per round, winners vs the rest (finished games only)
  const curves = {};
  // (and every player in every game, 'a': shown when no game has finished)
  for (const col of HIST_COLS) curves[col] = { w: [], l: [], a: [] };
  const acc = {};
  const allPlayers = allSeats;
  for (const r of records) for (const h of r.history) {
    const round = h.round ?? h.r;
    if (round == null || !h.p) continue;
    h.p.forEach((row, seat) => {
      if (!row) return;
      const sides = r.finished ? ['a', r.winner === seat ? 'w' : 'l'] : ['a'];
      HIST_COLS.forEach((col, ci) => {
        for (const side of sides) {
          const a = ((acc[col] ||= { w: {}, l: {}, a: {} })[side][round] ||= { sum: 0, n: 0 });
          a.sum += row[ci] || 0; a.n++;
        }
      });
    });
  }
  const pop = { w: wGames, l: lPlayers, a: allPlayers };
  for (const col of HIST_COLS) for (const side of ['w', 'l', 'a']) {
    const m = acc[col]?.[side] || {};
    curves[col][side] = Object.keys(m).map(Number).sort((a, b) => a - b)
      .filter(k => m[k].n >= Math.max(1, Math.ceil(pop[side] * 0.25))) // drop the thin tail
      .map(k => [k, m[k].sum / m[k].n]);
  }
  // research: share of winners vs others who got each tech
  const techs = {};
  let wN = 0, lN = 0;
  for (const r of done) for (const p of r.players) {
    const w = r.winner === p.seat;
    if (w) wN++; else lN++;
    for (const t of p.techs) (techs[t] ||= { w: 0, l: 0 })[w ? 'w' : 'l']++;
  }
  const techRows = Object.entries(techs).map(([id, c]) => ({ id, w: wN ? c.w / wN : 0, l: lN ? c.l / lN : 0 }))
    .map(t => ({ ...t, diff: t.w - t.l })).sort((a, b) => b.diff - a.diff);
  const roundsDone = done.map(r => r.rounds).sort((a, b) => a - b);
  // per map type: how often games finish, how long they take, and whether one seat does better
  const maps = {};
  for (const r of records) {
    const m = maps[r.settings.mapType || 'classic'] ||= { games: 0, finished: 0, rounds: 0, seats: {} };
    m.games++;
    if (!r.finished) continue;
    m.finished++; m.rounds += r.rounds;
    if (r.winner != null) m.seats[r.winner] = (m.seats[r.winner] || 0) + 1;
  }
  return {
    games, finished: done.length, avgRounds: roundsDone.length ? roundsDone.reduce((t, x) => t + x, 0) / roundsDone.length : null,
    medianRounds: roundsDone.length ? roundsDone[Math.floor(roundsDone.length / 2)] : null, roundsDone,
    reasons, by, maps, units: unitRows, curves, techs: techRows,
    sources: records.reduce((m, r) => { m[r.source] = (m[r.source] || 0) + 1; return m; }, {}),
  };
}
