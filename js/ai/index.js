// ============================================================
// COMPUTER PLAYERS: one bot turn, start to finish.
//
// runBotTurn(st, p, act) plays player p's turn by calling act(action) for every move,
// exactly like a person clicking buttons. `act` is async so the screen can animate
// what you're allowed to see. It does NOT end the turn: the caller does that.
//
// The brain, by job:
//   context.js    what the bot knows, its dice, shared helpers (and the fair-play rule)
//   memory.js     enemy sightings and ship jobs, remembered between turns
//   economy.js    selling oil, research, platforms, base upgrades, saving the Admiralty
//   expansion.js  surveying, exploring, founding new bases
//   defense.js    guards at bases, shooting at enemy ships and structures in range
//   military.js   defending bases under threat, the strike fleet and its targets, raiders
//   build.js      what to build at which shipyard
// Difficulty and personality numbers live in js/data/bots.js.
// ============================================================
import { makeContext } from './context.js';
import { buildBases, research, saveAdmiralty, sellOil } from './economy.js';
import { expansion } from './expansion.js';
import { guardBases, openFire } from './defense.js';
import { defend, longRange, raid, spy, strike } from './military.js';
import { shipbuilding } from './build.js';
import { updateMemory } from './memory.js';

// (in the 'war' phase the shipyard gets first call on money, so 'build' moves ahead of 'bases')
const STEPS = [
  ['memory', async ctx => updateMemory(ctx)],
  ['admiralty', saveAdmiralty],
  ['long range', longRange],
  ['fire', openFire],
  ['sell', sellOil],
  ['research', research],
  ['defend', defend],
  ['expansion', expansion],
  ['guards', guardBases],
  ['spy', spy],
  ['strike', strike],
  ['raid', raid],
  ['bases', buildBases],
  ['build', shipbuilding],
  ['fire again', openFire],
];

export const isBot = (st, p) => st.players[p]?.seat === 'ai';

export async function runBotTurn(st, p, act) {
  const ctx = makeContext(st, p, act);
  // the big picture: still expanding, or time to build up and fight?
  const bases = st.bases.filter(b => b.owner === p && !b.wrecked).length;
  ctx.phase = bases >= ctx.pers.bases || st.round > 45 ? 'war' : 'expand';
  const steps = ctx.phase === 'war' ? [...STEPS.filter(([n]) => n !== 'bases'), STEPS.find(([n]) => n === 'bases')] : STEPS;
  for (const [name, step] of steps) {
    if (st.phase !== 'playing' || st.current !== p) return;
    try { await step(ctx); }
    catch (e) { console.error(`Bot ${st.players[p].name}: "${name}" failed`, e); } // a bot bug never freezes the game
  }
}
