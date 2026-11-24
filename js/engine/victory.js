import { SHAPES } from './maptypes.js';
// ============================================================
// VICTORY
//   ⚔️ Conquest: every rival Admiralty wrecked or captured (always on).
//   🗺️ Domination: control a big share of all claimed sea for several rounds.
//   ⚛️ Post-Oil: finish a Deep-Sea Fusion Plant (see bases.js / research Era V).
//   🛢️ Last Rig Standing: when world oil runs low, a countdown starts; most oil left in the ground wins.
// Settings: data/victory.js.
// ============================================================
import { CONQUEST, DOMINATION, LAST_RIG, VICTORIES } from '../data/victory.js';
import { baseRadius, claimAt } from './bases.js';
import { coord, isLand } from './geometry.js';
import { alivePlayers, fail, log, ok, others } from './util.js';

export const victoryOn = (st, k) => !!VICTORIES[k]?.always || !!st.victory?.[k];

const win = (st, p, reason) => { st.phase = 'over'; st.winner = p; st.winReason = reason; };
const tellAll = (st, text, meta = { k: 'world' }) => alivePlayers(st).forEach(o => log(st, o, text, meta));

// ---------- ⚔️ Conquest ----------
export const capitalOf = (st, p) => (st.bases || []).find(b => b.owner === p && b.capital);

// Start of a player's turn: without a working Admiralty, the exile countdown runs.
export function processConquest(st, p) {
  if (st.tutorial || st.campaign) return null; // the tutorial's practice target and mission enemies have no Admiralty
  const me = st.players[p], cap = capitalOf(st, p);
  if (cap && !cap.wrecked) { if (me.exile != null) log(st, p, 'Your Admiralty is back in action.', { k: 'done' }); me.exile = null; return; }
  if (me.exile == null) {
    me.exile = CONQUEST.exileTurns;
    log(st, p, `⚠ You have lost your Admiralty! Rebuild it, or move it to another of your bases, within ${me.exile} turns or you are out.`, { k: 'hit' });
    for (const o of others(st, p)) log(st, o, `${me.name} has lost their Admiralty! They have ${me.exile} turns to recover.`, { k: 'world' });
  } else {
    me.exile--;
    if (me.exile <= 0) return 'eliminate';
    log(st, p, `⚠ Admiralty lost: ${me.exile} turn${me.exile > 1 ? 's' : ''} left to rebuild or move it.`, { k: 'hit' });
  }
  return null;
}

export function moveCapitalProblem(st, p, b) {
  if (!b || b.owner !== p) return 'Pick one of your bases.';
  if (b.wrecked) return 'That base is wrecked.';
  const cap = capitalOf(st, p);
  if (cap && !cap.wrecked) return 'Your Admiralty is fine.';
  if (st.players[p].money < CONQUEST.moveCapitalCost) return 'Not enough money.';
  return null;
}
export function doMoveCapital(st, a) {
  const p = st.current, b = (st.bases || []).find(x => x.id === a.baseId);
  const why = moveCapitalProblem(st, p, b);
  if (why) return fail(why);
  const old = capitalOf(st, p);
  if (old) old.capital = false;
  b.capital = true;
  st.players[p].money -= CONQUEST.moveCapitalCost;
  st.players[p].exile = null;
  tellAll(st, `${st.players[p].name} moved their Admiralty to ${coord(b.x, b.y)}.`, { k: 'world', x: b.x, y: b.y });
  return ok();
}

// ---------- 🗺️ Domination ----------
// Open water on the map (cached).
// Domination's "enough of the map" bar counts open water (not land, not pack ice), but never more than a
// Classic map of that size has (about 70% water): on Open Ocean, or with pack ice, it would otherwise take
// far more bases to dominate than anywhere else.
function waterCount(st) {
  if (!st.waterCount) {
    let n = 0;
    for (let i = 0; i < st.W * st.H; i++) if (!st.land[i] && !st.ice?.[i]) n++;
    st.waterCount = Math.round(Math.min(n, st.W * st.H * 0.7) * (SHAPES[st.mapType]?.domination ?? 1));
  }
  return st.waterCount;
}
// How much sea each player's live bases claim (overlaps go to the older base).
export function claimedSea(st) {
  const per = st.players.map(() => 0);
  for (const b of st.bases || []) {
    if (b.wrecked) continue;
    const r = baseRadius(st, b);
    for (let y = Math.max(0, b.y - r); y <= Math.min(st.H - 1, b.y + r); y++)
      for (let x = Math.max(0, b.x - r); x <= Math.min(st.W - 1, b.x + r); x++)
        if (!isLand(st, x, y) && claimAt(st, x, y) === b) per[b.owner]++;
  }
  return { per, total: per.reduce((a, b) => a + b, 0), water: waterCount(st) };
}
export function dominationStatus(st, p) {
  const c = claimedSea(st);
  const mine = c.per[p];
  const share = c.total ? mine / c.total : 0, mapShare = mine / c.water;
  return { mine, total: c.total, share, mapShare, needShare: DOMINATION.share, needMap: Math.ceil(c.water * DOMINATION.minMapShare),
    ok: share >= DOMINATION.share && mapShare >= DOMINATION.minMapShare };
}
export function processDomination(st, p) {
  if (!victoryOn(st, 'domination')) return;
  const me = st.players[p], d = dominationStatus(st, p);
  me.domStreak = d.ok ? (me.domStreak || 0) + 1 : 0;
  if (me.domStreak > 0) {
    log(st, p, `You dominate the seas (${Math.round(d.share * 100)}% of all claimed water): domination ${me.domStreak}/${DOMINATION.rounds}.`, { k: 'world' });
    for (const o of others(st, p)) log(st, o, `Warning: ${me.name} dominates the seas! Domination ${me.domStreak}/${DOMINATION.rounds}.`, { k: 'world' });
  }
  if (me.domStreak >= DOMINATION.rounds) win(st, p, 'domination');
}

// ---------- ⚛️ Post-Oil ----------
export const fusionOf = (st, p) => (st.platforms || []).find(o => o.owner === p && o.kind === 'fusion');
export function fusionFinished(st, p, o) {
  if (!victoryOn(st, 'postoil')) return;
  tellAll(st, `${st.players[p].name} has finished the Deep-Sea Fusion Plant at ${coord(o.x, o.y)}. The oil age is over.`);
  win(st, p, 'postoil');
}

// ---------- 🛢️ Last Rig Standing ----------
export const worldOil = st => st.deposits.reduce((t, d) => t + d.reserves, 0);
// Oil still in the ground that a player controls: deposits with their working rigs, plus
// untapped deposits inside their live base claims.
export function controlledOil(st, p) {
  let total = 0;
  for (const d of st.deposits) {
    const rig = st.rigs.find(r => r.depId === d.id);
    const b = rig?.baseId && (st.bases || []).find(x => x.id === rig.baseId);
    if (rig) { if (rig.owner === p && !(b && b.wrecked)) total += d.reserves; }
    else if (claimAt(st, d.x, d.y)?.owner === p) total += d.reserves;
  }
  return total;
}
// Once per round.
export function processLastRig(st) {
  if (!victoryOn(st, 'lastrig') || st.phase !== 'playing') return;
  const left = worldOil(st), start = st.oilTotal || left;
  if (!st.finalReserves) {
    if (left <= start * LAST_RIG.threshold) {
      st.finalReserves = { roundsLeft: LAST_RIG.rounds };
      tellAll(st, `🛢️ FINAL RESERVES: the world is down to ${Math.round(left / start * 100)}% of its oil. In ${LAST_RIG.rounds} rounds, whoever controls the most oil still in the ground wins.`);
    }
    return;
  }
  st.finalReserves.roundsLeft--;
  if (st.finalReserves.roundsLeft > 0) { tellAll(st, `🛢️ Final Reserves: ${st.finalReserves.roundsLeft} round${st.finalReserves.roundsLeft > 1 ? 's' : ''} left.`); return; }
  const ranked = alivePlayers(st).sort((a, b) => controlledOil(st, b) - controlledOil(st, a) || st.players[b].money - st.players[a].money);
  tellAll(st, `🛢️ The last oil has been counted. ${st.players[ranked[0]].name} controls the most.`);
  win(st, ranked[0], 'lastrig');
}

// Shown in the Victory panel.
export function victorySummary(st, p) {
  return {
    capital: capitalOf(st, p),
    exile: st.players[p].exile,
    domination: victoryOn(st, 'domination') ? dominationStatus(st, p) : null,
    fusion: fusionOf(st, p),
    world: { left: worldOil(st), start: st.oilTotal || worldOil(st), final: st.finalReserves || null },
    oil: controlledOil(st, p),
  };
}
