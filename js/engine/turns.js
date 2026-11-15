// Turn flow: start-of-turn production and upkeep, domination, elimination, next player.
import { DEPOSITS, MARKET } from '../data/economy.js';
import { processConquest, processDomination, processLastRig } from './victory.js';
import { SHIPS } from '../data/ships.js';
import { sink } from './combat.js';
import { shipCells } from './geometry.js';
import { commandBonus, upkeepOf } from './stats.js';
import { oilCapOf, platformUpkeep, processBases, rigRate } from './bases.js';
import { shipStat } from './modifiers.js';
import { processResearch } from './research.js';
import { processYards } from './production.js';
import { visibility } from './visibility.js';
import { alivePlayers, log, others, passives, rigAt } from './util.js';

// ---------- turns ----------
export function startTurn(st, p, first = false) {
  const me = st.players[p];
  // Conquest: lost your Admiralty and ran out of time to recover? You're out.
  if (processConquest(st, p) === 'eliminate') {
    eliminate(st, p, 'lost their Admiralty and is out of the war');
    checkWin(st);
    return 'skip';
  }
  // keep only what happened since this player's last turn
  const since = o => o.turn > me.prevTurn;
  me.incoming = me.incoming.filter(since);
  me.flashes = me.flashes.filter(since);
  me.spoofs = me.spoofs.filter(since);
  me.scans = [];
  me.shots = me.shots.filter(o => o.turn >= st.turnCount - 4 * st.players.length);
  me.reveals = { ships: [], rigs: [], ports: [], platforms: [] };
  me.prevTurn = st.turnCount;
  // the market recovers by MARKET.recoverPerTurn each full round
  const gap = MARKET.basePrice - st.market.price;
  st.market.price = Math.min(MARKET.basePrice, st.market.price + Math.max(MARKET.recoverPerTurn * 2 / alivePlayers(st).length, gap * (MARKET.recoverShare || 0)));

  // bases: finish construction, heal, repair, gun platforms fire
  processBases(st, p, visibility(st, p).ships);
  // shipyards: build, and launch finished ships (ready to sail this turn)
  processYards(st, p);
  // oil from rigs (central rigs and Wellheads), plus drillships parked on deposits
  let produced = 0;
  for (const r of st.rigs.filter(r => r.owner === p)) {
    const d = st.deposits.find(d => d.id === r.depId);
    if (!d) continue;
    const amt = rigRate(st, r);
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
  if (me.bonus?.oil && produced) produced = Math.round(produced * me.bonus.oil); // Admiral+ bots: extra oil (not taken from the ground)
  const cap = oilCapOf(st, p);
  const room = Math.max(0, cap - me.oil);
  const spilled = Math.max(0, produced - room);
  me.oil += produced - spilled;
  // research
  processResearch(st, p);
  // upkeep: ships and platforms cost money each turn; ships you can't pay for lose 1 HP
  let paid = 0, unpaid = 0;
  const pu = platformUpkeep(st, p);
  if (me.money >= pu) { me.money -= pu; paid += pu; } else { paid += me.money; me.money = 0; unpaid++; }
  for (const s of st.ships.filter(s => s.owner === p).sort((a, b) => upkeepOf(st, p, a.type) - upkeepOf(st, p, b.type))) {
    const u = upkeepOf(st, p, s.type);
    if (me.money >= u) { me.money -= u; paid += u; }
    else { unpaid++; s.hp -= 1; if (s.hp <= 0) sink(st, s); }
  }
  if (unpaid) log(st, p, `Couldn't pay all upkeep: unpaid ships lost 1 HP each.`);
  for (const s of st.ships.filter(s => s.owner === p)) {
    s.acted = false; s.shotsLeft = 0; s.activeAction = null; s.freeUsed = {};
    s.screenUsed = false; s.adUsed = false;
    for (const k in s.cooldowns) s.cooldowns[k] = Math.max(0, s.cooldowns[k] - 1);
    s.movesLeft = shipStat(st, p, s.type, 'move') + commandBonus(st, s);
    s.maxMoves = s.movesLeft;
  }
  for (const o of (st.platforms || []).filter(o => o.owner === p)) o.adUsed = false;
  const dry = st.rigs.filter(r => r.owner === p && st.deposits.find(d => d.id === r.depId)?.reserves === 0).length;
  if (first) log(st, p, 'Your fleet is ready. Survey for oil, build rigs, and outlast the enemy.');
  else log(st, p, `Round ${st.round}: rigs pumped ${produced} oil${spilled ? ` (${spilled} spilled, storage full at ${cap})` : ''}. Upkeep −$${paid}.${dry ? ` ${dry} rig${dry > 1 ? 's have' : ' has'} run dry.` : ''}`);
  processDomination(st, p);
  if (st.phase !== 'playing') return;
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
  st.platforms = (st.platforms || []).filter(o => o.owner !== p);
  st.bases = (st.bases || []).filter(b => b.owner !== p);
  st.mines = st.mines.filter(m => m.owner !== p);
  st.fleets = (st.fleets || []).filter(f => f.owner !== p);
  pl.builds = [];
  for (const o of alivePlayers(st)) log(st, o, `${pl.name} ${reason}.`);
}

export function checkWin(st) {
  if (st.phase !== 'playing') return;
  for (const p of alivePlayers(st)) {
    // still in the war: a ship, a rig that still pumps oil (dry rigs don't count), or money to rebuild with
    const pumping = st.rigs.some(r => r.owner === p && (st.deposits.find(d => d.id === r.depId)?.reserves || 0) > 0);
    const alive = st.ships.some(s => s.owner === p) || pumping || st.players[p].money >= 60;
    if (!alive) eliminate(st, p, 'has been wiped out');
  }
  const left = alivePlayers(st);
  if (left.length <= 1) { st.phase = 'over'; st.winner = left[0] ?? null; st.winReason = 'elimination'; }
}

export function nextTurn(st) {
  const n = st.players.length;
  let p = st.current;
  const round0 = st.round;
  do {
    p = (p + 1) % n;
    if (p === 0) st.round++;
  } while (st.players[p].out);
  if (st.round !== round0) { processLastRig(st); if (st.phase !== 'playing') return; }
  st.turnCount++;
  st.current = p;
  // a player knocked out at the start of their own turn passes straight on
  if (startTurn(st, p, st.round === 1) === 'skip' && st.phase === 'playing') nextTurn(st);
}
