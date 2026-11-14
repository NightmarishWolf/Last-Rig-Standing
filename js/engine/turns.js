// Turn flow: start-of-turn production and upkeep, domination, elimination, next player.
import { DEPOSITS, DOMINATION, ECONOMY, MARKET } from '../data/economy.js';
import { SHIPS } from '../data/ships.js';
import { sink } from './combat.js';
import { shipCells } from './geometry.js';
import { commandBonus, dominationNeed, middleRigs, upkeepOf } from './stats.js';
import { alivePlayers, log, others, passives, rigAt } from './util.js';

// ---------- turns ----------
export function startTurn(st, p, first = false) {
  const me = st.players[p];
  // keep only what happened since this player's last turn
  const since = o => o.turn > me.prevTurn;
  me.incoming = me.incoming.filter(since);
  me.flashes = me.flashes.filter(since);
  me.spoofs = me.spoofs.filter(since);
  me.scans = [];
  me.shots = me.shots.filter(o => o.turn >= st.turnCount - 4 * st.players.length);
  me.reveals = { ships: [], rigs: [], ports: [] };
  me.prevTurn = st.turnCount;
  // the market recovers by MARKET.recoverPerTurn each full round
  st.market.price = Math.min(MARKET.basePrice, st.market.price + MARKET.recoverPerTurn * 2 / alivePlayers(st).length);

  let produced = 0;
  for (const r of st.rigs.filter(r => r.owner === p)) {
    const d = st.deposits.find(d => d.id === r.depId);
    const amt = Math.min(DEPOSITS[d.type].rate, d.reserves);
    d.reserves -= amt; produced += amt;
  }
  for (const s of st.ships.filter(s => s.owner === p && passives(s).mobileRig)) {
    const d = st.deposits.find(d => shipCells(s).some(([x, y]) => x === d.x && y === d.y) && !rigAt(st, d.x, d.y));
    if (d && d.reserves > 0) {
      const amt = Math.min(Math.max(1, DEPOSITS[d.type].rate - 1), d.reserves);
      d.reserves -= amt; produced += amt;
      me.known[d.id] = true;
    }
  }
  const room = Math.max(0, ECONOMY.oilCap - me.oil);
  const spilled = Math.max(0, produced - room);
  me.oil += produced - spilled;
  // upkeep: every ship costs money each turn; ships you can't pay for lose 1 HP
  let paid = 0, unpaid = 0;
  for (const s of st.ships.filter(s => s.owner === p).sort((a, b) => upkeepOf(a.type) - upkeepOf(b.type))) {
    const u = upkeepOf(s.type);
    if (me.money >= u) { me.money -= u; paid += u; }
    else { unpaid++; s.hp -= 1; if (s.hp <= 0) sink(st, s); }
  }
  if (unpaid) log(st, p, `Couldn't pay upkeep for ${unpaid} ship${unpaid > 1 ? 's' : ''}: each lost 1 HP.`);
  for (const s of st.ships.filter(s => s.owner === p)) {
    s.acted = false; s.shotsLeft = 0; s.activeAction = null; s.freeUsed = {};
    s.screenUsed = false; s.adUsed = false;
    for (const k in s.cooldowns) s.cooldowns[k] = Math.max(0, s.cooldowns[k] - 1);
    s.movesLeft = SHIPS[s.type].move + commandBonus(st, s);
  }
  const dry = st.rigs.filter(r => r.owner === p && st.deposits.find(d => d.id === r.depId).reserves === 0).length;
  if (!first) log(st, p, `Round ${st.round}: rigs pumped ${produced} oil${spilled ? ` (${spilled} spilled, storage full at ${ECONOMY.oilCap})` : ''}. Upkeep −$${paid}.${dry ? ` ${dry} rig${dry > 1 ? 's have' : ' has'} run dry.` : ''}`);
  // domination: hold at least half of No Man's Sea's deposits, round after round
  if (st.domination) {
    const have = middleRigs(st, p), need = dominationNeed(st);
    me.domStreak = have >= need ? (me.domStreak || 0) + 1 : 0;
    if (me.domStreak > 0) {
      log(st, p, `You control No Man's Sea (${have}/${need} rigs): domination ${me.domStreak}/${DOMINATION.rounds}.`);
      for (const o of others(st, p)) log(st, o, `Warning: ${me.name} controls No Man's Sea! Domination ${me.domStreak}/${DOMINATION.rounds}.`);
    }
    if (me.domStreak >= DOMINATION.rounds) { st.phase = 'over'; st.winner = p; st.winReason = 'domination'; return; }
  }
  else log(st, p, 'Your fleet is ready. Survey for oil, build rigs, and outlast the enemy.');
  checkWin(st);
}

export function eliminate(st, p, reason) {
  const pl = st.players[p];
  if (pl.out) return;
  pl.out = true;
  // whatever is left sinks and becomes salvage for everyone else
  for (const s of st.ships.filter(s => s.owner === p)) {
    st.ships = st.ships.filter(o => o !== s);
    st.wrecks.push({ id: 'w' + st.nextId++, cells: shipCells(s), type: s.type, value: SHIPS[s.type].cost });
  }
  st.rigs = st.rigs.filter(r => r.owner !== p);
  st.ports = (st.ports || []).filter(o => o.owner !== p);
  st.mines = st.mines.filter(m => m.owner !== p);
  for (const o of alivePlayers(st)) log(st, o, `${pl.name} ${reason}.`);
}

export function checkWin(st) {
  if (st.phase !== 'playing') return;
  for (const p of alivePlayers(st)) {
    const alive = st.ships.some(s => s.owner === p) || st.rigs.some(r => r.owner === p) || st.players[p].money >= 60;
    if (!alive) eliminate(st, p, 'has been wiped out');
  }
  const left = alivePlayers(st);
  if (left.length <= 1) { st.phase = 'over'; st.winner = left[0] ?? null; st.winReason = 'elimination'; }
}

export function nextTurn(st) {
  const n = st.players.length;
  let p = st.current;
  do {
    p = (p + 1) % n;
    if (p === 0) st.round++;
  } while (st.players[p].out);
  st.turnCount++;
  st.current = p;
  startTurn(st, p, st.round === 1);
}
