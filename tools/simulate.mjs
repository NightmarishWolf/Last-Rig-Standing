// ============================================================
// BOT-VS-BOT SIMULATOR: plays whole games with no screen and reports what happened.
// Needs Node.js 18+. From the project folder:
//
//   node tools/simulate.mjs                       10 games, small map, 2 Normal bots, random personalities
//   node tools/simulate.mjs games=50 size=standard players=4 difficulty=hard
//   node tools/simulate.mjs seats=raider:hard,tycoon:normal rounds=150
//
// Options: games, size, players, difficulty, seats (personality:difficulty per seat), rounds (cap), seed, quiet
// ============================================================
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(new URL(import.meta.url).pathname), '..');
const E = await import(pathToFileURL(join(root, 'js/engine/index.js')).href);
const { runBotTurn } = await import(pathToFileURL(join(root, 'js/ai/index.js')).href);
const { PERSONALITY_ORDER } = await import(pathToFileURL(join(root, 'js/data/bots.js')).href);

const args = Object.fromEntries(process.argv.slice(2).map(a => a.split('=')));
const games = +(args.games || 10), size = args.size || 'small', players = +(args.players || 2);
const maxRounds = +(args.rounds || 200), difficulty = args.difficulty || 'normal', quiet = 'quiet' in args;
let seed = +(args.seed || 1000);

const stats = { wins: {}, reasons: {}, rounds: [], errors: 0, slowest: 0, think: [], unfinished: 0, byPers: {}, shots: 0, sunk: 0, fleets: 0 };
const origError = console.error;
console.error = (...m) => { stats.errors++; if (!quiet && stats.errors <= 5) origError(...m); };

for (let g = 0; g < games; g++) {
  const seats = Array.from({ length: players }, (_, i) => {
    const spec = args.seats?.split(',')[i];
    const [pers, diff] = spec ? spec.split(':') : [];
    return { seat: 'ai', personality: pers || PERSONALITY_ORDER[(g + i * 3 + seed) % 4], difficulty: diff || difficulty };
  });
  const st = E.newGame({ size, players, seed: seed + g, seats, turnTimer: 0 });
  const act = async a => { const r = E.applyAction(st, a); if (r.ok && a.type === 'act' && a.x != null) stats.shots++; if (r.ok && a.type === 'formFleet') stats.fleets++; return r; };
  let guard = 0;
  while (st.phase === 'playing' && st.round <= maxRounds && guard++ < maxRounds * players + 10) {
    const p = st.current, t0 = performance.now();
    try { await runBotTurn(st, p, act); } catch (e) { stats.errors++; origError(e); }
    const ms = performance.now() - t0;
    stats.think.push(ms); stats.slowest = Math.max(stats.slowest, ms);
    if (st.phase === 'playing') E.applyAction(st, { type: 'endTurn' });
  }
  const label = i => `${st.players[i].ai.personality}:${st.players[i].ai.difficulty}`;
  for (let i = 0; i < players; i++) { const k = label(i); stats.byPers[k] ||= { games: 0, wins: 0 }; stats.byPers[k].games++; }
  if (st.phase === 'over' && st.winner != null) {
    stats.byPers[label(st.winner)].wins++;
    stats.reasons[st.winReason] = (stats.reasons[st.winReason] || 0) + 1;
  } else stats.unfinished++;
  stats.rounds.push(st.round);
  stats.sunk += st.wrecks.length;
  if (!quiet) {
    const pl = st.players.map((x, i) => `${label(i)}: ${st.ships.filter(s => s.owner === i).length} ships, ${E.basesOf(st, i).length} bases, $${x.money}, ${Object.keys(x.research.done).length} techs${x.out ? ' (out)' : ''}`);
    console.log(`game ${g + 1}: ${st.phase === 'over' ? `${st.winner == null ? 'nobody' : label(st.winner)} won (${st.winReason}) in round ${st.round}` : `unfinished after ${st.round - 1} rounds`}\n   ${pl.join('\n   ')}`);
  }
}
const avg = a => a.reduce((t, x) => t + x, 0) / Math.max(1, a.length);
console.log('\n==== summary ====');
console.log(`games ${games} | ${size} map | ${players} players | finished ${games - stats.unfinished} | average length ${avg(stats.rounds).toFixed(0)} rounds`);
console.log('wins by personality:difficulty:', Object.entries(stats.byPers).map(([k, v]) => `${k} ${v.wins}/${v.games}`).join(', '));
console.log('how games ended:', JSON.stringify(stats.reasons), `| fighting: ${stats.shots} shots, ${stats.sunk} ships sunk, ${stats.fleets} strike fleets`);
console.log(`bot thinking: average ${avg(stats.think).toFixed(1)}ms, slowest ${stats.slowest.toFixed(0)}ms per turn | bot errors: ${stats.errors}`);
