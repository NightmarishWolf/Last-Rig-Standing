// ============================================================
// BOT-VS-BOT SIMULATOR: plays whole games with no screen and reports what happened.
// Needs Node.js 18+. From the project folder:
//
//   node tools/simulate.mjs                       10 games, small map, 2 Normal bots, random personalities
//   node tools/simulate.mjs games=50 size=standard players=4 difficulty=hard
//   node tools/simulate.mjs seats=raider:hard,tycoon:normal rounds=150
//
// Options: games, size, players, difficulty, seats (personality:difficulty per seat), rounds (cap), seed, quiet,
//          mirror=0 (fully random maps instead of mirrored ones)
// ============================================================
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(new URL(import.meta.url).pathname), '..');
const E = await import(pathToFileURL(join(root, 'js/engine/index.js')).href);
const { runBotTurn } = await import(pathToFileURL(join(root, 'js/ai/index.js')).href);
const { PERSONALITY_ORDER } = await import(pathToFileURL(join(root, 'js/data/bots.js')).href);
const { SHIPS } = await import(pathToFileURL(join(root, 'js/data/ships.js')).href);

const args = Object.fromEntries(process.argv.slice(2).map(a => a.split('=')));
const games = +(args.games || 10), size = args.size || 'small', players = +(args.players || 2);
const maxRounds = +(args.rounds || 200), difficulty = args.difficulty || 'normal', quiet = 'quiet' in args;
let seed = +(args.seed || 1000);

const stats = { wins: {}, reasons: {}, rounds: [], errors: 0, slowest: 0, think: [], unfinished: 0, byPers: {}, shots: 0, sunk: 0, fleets: 0, longRange: 0, sold: 0, spentActs: 0, econ: {} };
const origError = console.error;
console.error = (...m) => { stats.errors++; if (!quiet && stats.errors <= 5) origError(...m); };

for (let g = 0; g < games; g++) {
  const seats = Array.from({ length: players }, (_, i) => {
    // with fixed seats, every other game swaps who goes first, so seat order can't skew the results
    const specs = args.seats?.split(',');
    const spec = specs && (g % 2 ? [...specs].reverse() : specs)[i];
    const [pers, diff] = spec ? spec.split(':') : [];
    return { seat: 'ai', personality: pers || PERSONALITY_ORDER[(g + i * 3 + seed) % 4], difficulty: diff || difficulty };
  });
  const st = E.newGame({ size, players, seed: seed + g, seats, turnTimer: 0, mirror: args.mirror !== '0' });
  const act = async a => {
    const before = st.players[st.current].money;
    let lr = false;
    if (a.type === 'act') { const s = st.ships.find(x => x.id === a.shipId); lr = !!s && SHIPS[s.type].actions.find(x => x.id === a.actionId)?.longRange; }
    const r = E.applyAction(st, a);
    if (r.ok && a.type === 'act') { stats.spentActs += Math.max(0, before - st.players[st.current].money); if (lr) stats.longRange++; }
    if (r.ok && a.type === 'sellShip') stats.sold++;
    if (r.ok && a.type === 'act' && a.x != null) stats.shots++; if (r.ok && a.type === 'formFleet') stats.fleets++; if (r.ok && (a.type === 'baseStrike' || a.type === 'satellite')) stats.longRange++; return r; };
  let guard = 0;
  while (st.phase === 'playing' && st.round <= maxRounds && guard++ < maxRounds * players + 10) {
    const p = st.current, t0 = performance.now();
    try { await runBotTurn(st, p, act); } catch (e) { stats.errors++; origError(e); }
    const ms = performance.now() - t0;
    stats.think.push(ms); stats.slowest = Math.max(stats.slowest, ms);
    if (st.phase === 'playing') E.applyAction(st, { type: 'endTurn' });
    // economy snapshot every 20 rounds (first seat's turn)
    if (st.current === 0 && st.round % 20 === 0 && st.phase === 'playing') {
      const e = (stats.econ[st.round] ||= { n: 0, money: 0, oil: 0, ships: 0, upkeep: 0 });
      for (let i = 0; i < players; i++) if (!st.players[i].out) {
        e.n++; e.money += st.players[i].money; e.oil += st.players[i].oil;
        e.ships += st.ships.filter(s => s.owner === i).length; e.upkeep += E.upkeepTotal(st, i);
      }
    }
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
console.log('how games ended:', JSON.stringify(stats.reasons), `| fighting: ${stats.shots} shots, ${stats.sunk} ships sunk, ${stats.fleets} strike fleets, ${stats.longRange} long-range launches (drones, missiles, bombers, satellites)`);
console.log(`spending: $${stats.spentActs.toFixed(0)} on abilities and weapons, ${stats.sold} ships sold`);
console.log('economy per player (average): ' + Object.entries(stats.econ).map(([r, e]) => `round ${r}: $${(e.money / e.n).toFixed(0)}, ${(e.oil / e.n).toFixed(0)} oil, ${(e.ships / e.n).toFixed(1)} ships, upkeep $${(e.upkeep / e.n).toFixed(0)}`).join(' | '));
console.log(`bot thinking: average ${avg(stats.think).toFixed(1)}ms, slowest ${stats.slowest.toFixed(0)}ms per turn | bot errors: ${stats.errors}`);
