// The Balance lab's worker: plays bot games in the background (so the page stays responsive) and
// sends back one record per game.   in: { games, seed, ...game options }   out: { type: 'record' | 'done' | 'error' }
import { playBotGame } from './run.js';
import { gameRecord } from './stats.js';

let stop = false;
self.onmessage = async ({ data }) => {
  if (data.type === 'stop') { stop = true; return; }
  if (data.type !== 'run') return;
  stop = false;
  const o = data.opts;
  for (let g = 0; g < o.games && !stop; g++) {
    try {
      // swap the seats every other game, so going first can't skew the results
      const seats = o.seats && g % 2 ? [...o.seats.slice(0, o.players)].reverse() : o.seats;
      let rounds = 0;
      const st = await playBotGame({ ...o, seats, seed: o.seed + g }, { onRound: s => { rounds = s.round; if (rounds % 10 === 0) self.postMessage({ type: 'progress', game: g, round: rounds }); } });
      self.postMessage({ type: 'record', game: g, rec: gameRecord(st, { source: 'bots' }) });
    } catch (e) { self.postMessage({ type: 'error', game: g, error: String(e?.stack || e) }); }
  }
  self.postMessage({ type: 'done' });
};
