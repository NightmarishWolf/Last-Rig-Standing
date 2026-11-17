// Online games: ties the network session (net/session.js) to the game screens.
//   - starting a game from the lobby (host) or receiving it (client)
//   - passing moves around: yours go out, everyone else's come in and play out on your board
//   - whose turn it is: yours (chime, notification), a bot's (the host plays it), or someone else's (wait)
//   - the host can skip a missing player's turn or let a bot play for them until they're back
import * as E from '../engine/index.js';
import { PERSONALITY_ORDER } from '../data/bots.js';
import { PLAYER_COLORS } from '../data/maps.js';
import { isBot } from '../ai/index.js';
import { BOT_SPEEDS } from './settings.js';
import { A } from './state.js';
import { newGameId, pack, save } from './storage.js';
import { N, broadcastPresence, clientId, fingerprint, hostBegan, isConnected, joinGame, leave, myName, resyncAll, sendAll, sendHost, sendTo, setHooks, startHosting, unpack } from '../net/session.js';
import { animateStep } from '../ui/board/fx.js';
import { refresh, setState, endTurnNow } from '../ui/index.js';
import { S } from '../ui/state.js';
import { toast } from '../ui/status.js';
import { play } from '../ui/sound.js';
import { showTurnSummary } from '../ui/summary.js';

let app = {}; // { handoff, gameOver, showHome, hideHome, startTimer, stopTimer, playBotTurns, afterSimul }
const afterSimul = (st, round0) => app.afterSimul?.(st, round0);
export const initOnline = a => { app = a; };
export const online = () => !!(N.s && N.s.st && A.state === N.s.st);
export const onlineRole = () => N.s?.role;
export const mySeat = () => N.s?.seat;

// ---------- hosting ----------
export function defaultLobby() {
  return {
    hostName: myName() || 'Host', size: 'small', players: 2, turnTimer: 0, mirror: true,
    victory: { domination: true, postoil: true, lastrig: true },
    seats: [
      { kind: 'host' },
      { kind: 'online', difficulty: 'normal', personality: 'random' },
      { kind: 'ai', difficulty: 'normal', personality: 'random' },
      { kind: 'ai', difficulty: 'normal', personality: 'random' },
    ],
  };
}
export async function hostLobby() {
  askNotify();
  await startHosting(defaultLobby());
}
export const lobbyReady = L => L.seats.slice(0, L.players).every(x => x.kind !== 'online' || x.clientId);

export function startOnlineGame() {
  const L = N.s.lobby;
  const seats = L.seats.slice(0, L.players).map(o => (o.kind === 'ai'
    ? { seat: 'ai', difficulty: o.difficulty, personality: o.personality === 'random' ? PERSONALITY_ORDER[Math.floor(Math.random() * PERSONALITY_ORDER.length)] : o.personality }
    : 'human'));
  const st = E.newGame({ size: L.size, players: L.players, turnTimer: L.turnTimer, mirror: L.mirror !== false, victory: { ...L.victory }, seats, simultaneous: L.turnOrder === 'simul' });
  st.gameId = newGameId();
  st.online = { code: N.s.code, seats: L.seats.slice(0, L.players).map(o => (o.kind === 'online' ? { clientId: o.clientId, name: o.name } : null)), hostId: clientId() };
  st.players[0].name = (myName() || 'Host').slice(0, 20);
  st.online.seats.forEach((o, i) => { if (o) st.players[i].name = o.name; });
  N.s.seat = 0;
  N.s.st = st; // (before begin, so the screen knows this is an online game)
  begin(st);
  hostBegan(st);
  save(st);
}
// Re-open a saved online game: host it again under the same code; players rejoin.
export async function resumeHosting(st) {
  await startHosting({ ...defaultLobby(), players: st.players.length }, st.online.code);
  N.s.seat = st.players.findIndex((_, i) => !st.online.seats[i] && st.players[i].seat !== 'ai');
  if (N.s.seat < 0) N.s.seat = 0;
  N.s.st = st;
  begin(st);
  hostBegan(st);
}

// ---------- joining ----------
export async function join(code) {
  askNotify();
  await joinGame(code);
}

function begin(st) {
  A.state = st; A.sessionActive = false; moveLog.length = 0;
  app.hideHome?.();
  setState(st);
  S.viewer = N.s.seat;
  queue.length = 0;
  app.handoff(st);
}

// ---------- moves ----------
export const moveLog = window.__lrsMoves = []; // every move this game (for the game-data download)
const queue = [];
let working = false;
const replayMs = () => BOT_SPEEDS[1].ms;

// simultaneous, not the host: the move isn't played here, it goes to the host (who decides the order)
export function sendInstead(a) {
  if (!online() || N.s.role !== 'client' || !A.state.simul) return false;
  sendHost({ t: 'act', a });
  return true;
}
// simultaneous, on the host: a move by a bot or the host itself, already applied (simul.js)
export function simulBroadcast(a, r) {
  if (!online() || N.s.role !== 'host' || !r?.ok) return;
  moveLog.push({ by: a.by, a });
  sendAll({ t: 'act', a, by: a.by });
}
export function roundEnded(st) {
  if (online() && N.s.role === 'host') sendAll({ t: 'check', tc: st.turnCount, fp: fingerprint(st) });
}

// a move made on this screen (UI dispatch): send it on
export function localAction(a, r) {
  if (online() && A.state.simul) { if (N.s.role === 'host') simulBroadcast(a, r); return; }
  if (!online() || !r.ok) return;
  moveLog.push({ by: A.state.current, a });
  if (N.s.role === 'client') sendHost({ t: 'act', a });
  else {
    sendAll({ t: 'act', a, by: N.s.seat });
    afterMove(a);
  }
}
// a bot move played on the host: pass it on
export function botAction(a, r) {
  if (!online() || N.s.role !== 'host' || !r?.ok) return;
  moveLog.push({ by: 'bot', a });
  sendAll({ t: 'act', a, by: 'bot' });
  afterMove(a);
}
function afterMove(a) {
  if (a.type !== 'endTurn') return;
  const st = A.state;
  sendAll({ t: 'check', tc: st.turnCount, fp: fingerprint(st) });
  save(st);
}

// moves from other players (host: from a client; client: from the host), played out one at a time
function enqueue(item) { queue.push(item); if (!working) work(); }
async function work() {
  working = true;
  try {
    while (queue.length) {
      const it = queue.shift(), st = A.state;
      if (!st || st !== N.s?.st && N.s?.role === 'host') continue;
      if (it.kind === 'check') {
        if (st.turnCount === it.tc && fingerprint(st) !== it.fp) { sendHost({ t: 'sync' }); queue.length = 0; }
        continue;
      }
      const a = it.a;
      if (st.simul) { await simulRemote(st, it); continue; }
      if (N.s.role === 'host' && (it.seat !== st.current || st.phase !== 'playing')) { resyncOne(it.cid); continue; } // not their turn: put them straight
      const r = await animateStep(st, a, a.type === 'endTurn' ? 0 : replayMs());
      if (!r.ok) {
        if (N.s.role === 'client') { sendHost({ t: 'sync' }); queue.length = 0; } else resyncOne(it.cid);
        continue;
      }
      moveLog.push({ by: it.seat ?? it.by, a });
      if (N.s.role === 'host') { sendAll({ t: 'act', a, by: it.seat }, it.cid); afterMove(a); }
      refresh();
      if (st.phase === 'over') { app.gameOver(st); break; }
      if (a.type === 'endTurn') app.handoff(st);
    }
  } finally { working = false; }
}
// simultaneous rounds: the host plays each move in the order it arrives and passes it to everyone
// (the sender included: their screen only plays it when it comes back); everyone else just replays.
async function simulRemote(st, it) {
  const a = it.a, round0 = st.round;
  if (N.s.role === 'host') {
    if (a.by !== it.seat) { resyncOne(it.cid); return; }
    const r = await animateStep(st, a, replayMs(), res => {
      if (res.ok) { moveLog.push({ by: it.seat, a }); sendAll({ t: 'act', a, by: it.seat }); }
      else sendTo(it.cid, { t: 'nope', error: res.error, a });
    }, true);
    afterSimul(st, round0);
    return r;
  }
  const mine = a.by === N.s.seat;
  const r = await animateStep(st, a, mine ? Math.min(replayMs(), 160) : replayMs(), null, true);
  if (!r.ok) { sendHost({ t: 'sync' }); queue.length = 0; return; }
  moveLog.push({ by: a.by, a });
  afterSimul(st, round0);
}

function resyncOne(cid) { sendTo(cid, { t: 'state', state: pack(A.state), seat: (A.state.online.seats || []).findIndex(x => x?.clientId === cid), code: N.s.code }); }

// ---------- whose turn ----------
// Returns true if this was an online game and its turn change has been handled.
export function onlineHandoff(st) {
  if (!online()) return false;
  app.stopTimer();
  S.viewer = N.s.seat;
  hideWait();
  if (st.phase !== 'playing') return true;
  if (isBot(st, st.current)) {
    if (N.s.role === 'host') app.playBotTurns(s => (s.phase === 'over' ? app.gameOver(s) : app.handoff(s)));
    else wait(st);
    return true;
  }
  if (st.current === N.s.seat) {
    S.botTurn = false;
    A.sessionActive = true;
    refresh(); app.startTimer();
    play('chime'); notifyTurn(st);
    showTurnSummary(st, N.s.seat);
    return true;
  }
  wait(st);
  return true;
}
function wait(st) {
  S.botTurn = true; S.selectedId = null; S.selectedBase = null; S.mode = { kind: 'idle' };
  A.sessionActive = true;
  refresh();
  showWait(st);
}

// ---------- the "waiting for..." bar ----------
function waitEl() {
  let el = document.getElementById('netbar');
  if (!el) { el = document.createElement('div'); el.id = 'netbar'; el.className = 'botbar hidden'; document.body.appendChild(el); }
  return el;
}
export function showWait(st = A.state) {
  if (!online()) return;
  const p = st.current, el = waitEl();
  const seat = st.online.seats[p];
  const away = N.s.role === 'host' && seat && !isConnected(seat.clientId);
  const bot = isBot(st, p);
  el.style.setProperty('--c', PLAYER_COLORS[p]);
  el.innerHTML = `<span class="who"><b style="color:${PLAYER_COLORS[p]}">${st.players[p].name}</b> ${bot ? 'is taking their turn' : away ? 'is <b style="color:#f0a0a0">offline</b>: waiting for them to come back' : 'is taking their turn'}<span class="dots"></span></span>
    ${away ? '<button data-netskip title="End their turn for them">⏭ Skip their turn</button><button data-nettake title="A computer plays their side until they come back">🤖 Let a bot play</button>' : ''}`;
  el.onclick = e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.netskip !== undefined) skipTurn();
    if (b.dataset.nettake !== undefined) botTakeOver(p);
  };
  el.classList.toggle('hidden', bot && N.s.role === 'host'); // the host already shows the bot bar
}
function hideWait() { waitEl().classList.add('hidden'); }

function skipTurn() {
  const st = A.state;
  if (!online() || N.s.role !== 'host' || isBot(st, st.current)) return;
  S.botTurn = false;
  endTurnNow(`${st.players[st.current].name}'s turn was skipped.`);
}
function botTakeOver(p) {
  const st = A.state, pl = st.players[p];
  pl.seat = 'ai'; pl.takenOver = true;
  pl.ai = { difficulty: 'normal', personality: 'admiral', rng: (st.seed * 31 + p * 7919) % 2147483647 || 1, mem: {} };
  resyncAll(); save(st);
  toast(`A bot is playing for ${pl.name} until they come back.`);
  app.handoff(st);
}
// a player came back: give them their seat again
function playerBack(seat) {
  const st = A.state, pl = st?.players[seat];
  if (pl?.takenOver) { pl.seat = 'human'; delete pl.ai; delete pl.takenOver; resyncAll(); }
  toast(`${pl?.name || 'A player'} is back.`);
  if (st.current === seat) showWait(st);
}

// ---------- messages from the host (client side) ----------
function fromHost(m) {
  const s = N.s;
  if (m.t === 'reject') { toast(m.msg); leave(); app.showHome?.('online'); return; }
  if (m.t === 'lobby') { s.lobby = m.lobby; s.seat = m.you; app.lobbyChanged?.(); return; }
  if (m.t === 'state') {
    const st = unpack(typeof m.state === 'string' ? m.state : JSON.stringify(m.state));
    s.seat = m.seat; s.st = st;
    queue.length = 0;
    begin(st);
    return;
  }
  if (m.t === 'act') { enqueue({ kind: 'act', a: m.a, by: m.by }); return; }
  if (m.t === 'check') { enqueue({ kind: 'check', tc: m.tc, fp: m.fp }); return; }
  if (m.t === 'nope') { toast(`Too late: ${m.error || 'that didn\'t work'} (someone else's move got there first)`); afterSimul(A.state, A.state.round); return; }
  if (m.t === 'presence') { s.online = m.online; badge(); return; }
  if (m.t === 'end') { toast('The host closed the game.'); hostLost(true); }
}
function hostLost(closed) {
  if (!N.s) return;
  const code = N.s.code;
  app.stopTimer();
  S.botTurn = true; refresh();
  const el = waitEl();
  el.innerHTML = `<span class="who">${closed ? 'The host closed the game.' : 'Lost the connection to the host.'}</span><button data-rejoin>🔄 Rejoin ${code}</button><button data-menu>Main menu</button>`;
  el.classList.remove('hidden');
  el.onclick = async e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.rejoin !== undefined) { try { leave(); await join(code); hideWait(); } catch (err) { toast(err.message); } }
    if (b.dataset.menu !== undefined) { leave(); hideWait(); S.botTurn = false; app.showHome?.('main'); }
  };
}

setHooks({
  remoteAction: (a, seat, cid) => enqueue({ kind: 'act', a, seat, cid }),
  fromHost,
  hostLost: () => hostLost(false),
  lobbyChanged: () => app.lobbyChanged?.(),
  presenceChanged: () => { badge(); if (online() && S.botTurn) showWait(); },
  playerBack,
});

// ---------- the 🌐 badge in the top bar ----------
export function badge() {
  let el = document.getElementById('net-badge');
  if (!el) {
    el = document.createElement('span'); el.id = 'net-badge'; el.className = 'net-badge';
    document.getElementById('turn-info')?.after(el);
  }
  if (!online()) { el.classList.add('hidden'); return; }
  const st = A.state, on = N.s.online || [];
  el.classList.remove('hidden');
  el.innerHTML = `🌐 <b>${N.s.code}</b> ${st.players.map((pl, i) => (st.online.seats[i] || (pl.seat !== 'ai' && !pl.takenOver) || pl.takenOver
    ? `<i title="${pl.name}${on[i] === false ? ' (offline)' : ''}" style="background:${on[i] === false ? 'transparent' : PLAYER_COLORS[i]};border-color:${PLAYER_COLORS[i]}"></i>` : '')).join('')}`;
}

// ---------- notifications ----------
function askNotify() {
  try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch { /* unsupported */ }
}
const baseTitle = document.title;
export function notifyTurn(st) {
  if (!document.hidden) return;
  document.title = '▶ Your turn · ' + baseTitle;
  try { if (Notification.permission === 'granted') new Notification('Last Rig Standing', { body: `Your turn (round ${st.round})`, icon: 'favicon-32.png', tag: 'lrs-turn' }); } catch { /* unsupported */ }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) document.title = baseTitle; });

export function leaveOnline() {
  if (!N.s) return;
  leave();
  hideWait();
  badge();
}
export { N };
