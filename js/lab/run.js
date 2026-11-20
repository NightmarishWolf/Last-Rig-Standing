// Plays one whole bot-vs-bot game with no screen (for the Balance lab and tools/simulate.mjs).
import { COMMANDERS } from '../data/commanders.js';
import * as E from '../engine/index.js';
import { runBotTurn } from '../ai/index.js';
import { PERSONALITY_ORDER } from '../data/bots.js';

// opts: { size, players, seed, maxRounds, fog, simul, mirror, seats: [{ personality ('random'|id), difficulty, faction }] }
// act(st, a) can be passed to watch every move (default: just play it).
export async function playBotGame(opts, { act = (st, a) => E.applyAction(st, a), onRound } = {}) {
  const players = opts.players || 2;
  const seats = Array.from({ length: players }, (_, i) => {
    const o = opts.seats?.[i] || {};
    const pers = !o.personality || o.personality === 'random' ? PERSONALITY_ORDER[(opts.seed + i * 7) % PERSONALITY_ORDER.length] : o.personality;
    // faction: 'navy' | 'tide' | 'random' (picked from the seed, so it changes from game to game)
    const faction = o.faction === 'random' ? ((opts.seed + i) % 2 ? 'tide' : 'navy') : o.faction || 'navy';
    // commander: 'auto' (to suit the personality, the default), 'none', or an id (another faction's → auto);
    // level: a number, or by difficulty when unset
    const cmd = !o.commander || o.commander === 'auto' ? 'auto' : o.commander === 'none' ? null : COMMANDERS[o.commander]?.faction === faction ? o.commander : 'auto';
    return { seat: 'ai', personality: pers, difficulty: o.difficulty || 'normal', faction, commander: cmd, ...(Number.isInteger(o.level) ? { level: o.level } : {}) };
  });
  const st = E.newGame({ size: opts.size || 'small', players, seed: opts.seed, seats, turnTimer: 0, mirror: opts.mirror !== false, mapType: opts.mapType || 'classic', events: opts.events || 'off', fog: opts.fog || 'on', simultaneous: !!opts.simul });
  st.gameId = 'lab-' + opts.seed;
  const max = opts.maxRounds || 200;
  let guard = 0, lastRound = st.round;
  while (st.phase === 'playing' && st.round <= max && guard++ < max * players * 2 + 20) {
    if (st.simul) {
      // bots take turns going first each round (whoever acts first in a round has an edge)
      for (let k = 0; k < players && st.phase === 'playing'; k++) {
        const p = (k + st.round) % players;
        if (st.players[p].out || st.ready[p]) continue;
        const r0 = st.round;
        await runBotTurn(st, p, a => act(st, { ...a, by: p }));
        if (st.phase === 'playing' && st.round === r0) act(st, { type: 'ready', by: p, ready: true });
      }
    } else {
      await runBotTurn(st, st.current, a => act(st, a));
      if (st.phase === 'playing') act(st, { type: 'endTurn' });
    }
    if (st.round !== lastRound) { lastRound = st.round; await onRound?.(st); }
  }
  return st;
}
