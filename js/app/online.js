// Online games: ties the network session (net/session.js) to the game screens.
//   - starting a game from the lobby (host) or receiving it (client)
//   - passing moves around: yours go out, everyone else's come in and play out on your board
//   - whose turn it is: yours (chime, notification), a bot's (the host plays it), or someone else's (wait)
//   - the host can skip a missing player's turn or let a bot play for them until they're back
import * as E from '../engine/index.js';
import { PERSONALITY_ORDER } from '../data/bots.js';
import { PLAYER_COLORS } from '../data/maps.js';
import { isBot } from '../ai/index.js';
import { BOT_SPEEDS, profileTable, resolveFromTable, rollFaction, seedOf } from './settings.js';
import { activeProfile } from './profile.js';
import { COMMANDERS } from '../data/commanders.js';
import { A } from './state.js';
import { newGameId, pack, save } from './storage.js';
import { N, broadcastPresence, clientId, fingerprint, hostBegan, isConnected, joinGame, leave, myName, recentGames, recordCheck, resyncAll, sayChat, sendAll, sendDesync, sendHost, sendTo, setHooks, setPaused, startHosting, unpack } from '../net/session.js';
import { addChat, initChat, setChatLines, showChat } from '../ui/chat.js';
import { act as simulAct } from './simul.js';
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
    hostName: myName() || 'Host', size: 'small', players: 2, turnTimer: 0, mirror: true, fog: 'on', turnOrder: 'simul', mapType: 'classic', seed: '', events: { mode: 'off', kinds: ['storm', 'fogbank', 'calm', 'shock', 'field', 'blowout', 'pirates', 'rogue'], pace: 'light' },
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
  const seats = L.seats.slice(0, L.players).map(o => {
    const faction = rollFaction(o.faction);
    if (o.kind === 'ai') return { seat: 'ai', difficulty: o.difficulty, personality: o.personality === 'random' ? PERSONALITY_ORDER[Math.floor(Math.random() * PERSONALITY_ORDER.length)] : o.personality, faction, commander: o.commander === 'none' ? null : COMMANDERS[o.commander]?.faction === faction ? o.commander : 'auto' };
    // (the host's own seat from its profile; online players from the table they sent)
    const table = o.kind === 'host' ? profileTable(activeProfile()) : o.cmds;
    return { seat: 'human', faction, ...resolveFromTable(o.commander, faction, table, !!L.commanderLevel1) };
  });
  const st = E.newGame({ size: L.size, mapType: L.mapType || 'classic', events: L.events?.mode === 'custom' ? { mode: 'custom', kinds: L.events.kinds || [], pace: L.events.pace } : L.events?.mode || L.events || 'off', seed: seedOf(L.seed), players: L.players, turnTimer: L.turnTimer, mirror: L.mirror !== false, fog: L.fog === false ? 'off' : L.fog || 'on', victory: { ...L.victory }, seats, simultaneous: L.turnOrder === 'simul', commanderLevel1: !!L.commanderLevel1 });
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
  turnSeen = null;
  showChat(true);
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
  if (online() && N.s.role === 'host') { recordCheck(st); sendAll({ t: 'check', tc: st.turnCount, fp: fingerprint(st) }); }
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
  recordCheck(st);
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
        if (st.turnCount === it.tc && fingerprint(st) !== it.fp) { sendDesync(st); queue.length = 0; toast('Your game drifted out of sync with the host: getting a fresh copy.'); }
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
    const key = `${st.gameId}|${st.turnCount}`;
    if (turnSeen !== key) { turnSeen = key; play('chime'); notifyTurn(st); showTurnSummary(st, N.s.seat); }
    return true;
  }
  wait(st);
  if (N.s.role === 'host' && (N.s.away || []).includes(st.current)) setTimeout(() => skipAway(st), 700);
  return true;
}
let turnSeen = null; // the turn whose start (chime, summary) we've already shown
function skipAway(st) {
  if (st !== A.state || !online() || st.simul || st.phase !== 'playing' || !(N.s.away || []).includes(st.current) || paused()) return;
  S.botTurn = false;
  endTurnNow(`${st.players[st.current].name} is away: turn skipped.`);
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
  if (N.s.paused) { hideWait(); return; } // the pause bar says it all
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

// ---------- paused games ----------
// The host pauses the game when a player drops (or by hand, ⏸ by the 🌐 badge). Nobody can move while
// it's paused; bots wait and timers stop. When the missing player comes back it carries on by itself;
// the host can also let a bot play for them, or carry on without them (their turns are skipped).
export const paused = () => !!(online() && N.s.paused);
const humanSeat = (st, i) => !!st.online?.seats[i] && !st.players[i].out;
// human players who are offline, and not covered by a bot or "carry on without them"
function missing(st) {
  return st.players.map((_, i) => i).filter(i => humanSeat(st, i) && !isConnected(st.online.seats[i].clientId)
    && !st.players[i].takenOver && !(N.s.away || []).includes(i));
}
function updateDropPause() {
  const s = N.s, st = A.state;
  if (!online() || s.role !== 'host' || st.phase !== 'playing') return;
  if (s.paused?.why === 'host') return;
  const m = missing(st);
  if (m.length) { if (s.paused?.seats?.join() !== m.join()) setPaused({ why: 'drop', seats: m }); }
  else if (s.paused) setPaused(null);
}
function pauseEl() {
  let el = document.getElementById('pausebar');
  if (!el) { el = document.createElement('div'); el.id = 'pausebar'; el.className = 'pausebar hidden'; document.body.appendChild(el); }
  return el;
}
let wasPaused = false;
export function applyPause() {
  const el = pauseEl(), st = A.state, p = online() ? N.s.paused : null;
  badge();
  if (!p) {
    el.classList.add('hidden');
    if (wasPaused && online()) { wasPaused = false; toast('The game carries on.'); app.handoff(st); }
    return;
  }
  wasPaused = true;
  app.stopTimer();
  S.botTurn = true; S.selectedId = null; S.selectedBase = null; S.mode = { kind: 'idle' };
  const host = N.s.role === 'host';
  const name = i => `<b style="color:${PLAYER_COLORS[i]}">${st.players[i]?.name}</b>`;
  if (p.why === 'host') {
    el.innerHTML = `<span class="who">⏸ ${host ? 'You paused the game.' : 'The host paused the game.'}</span>${host ? '<button data-presume>▶ Resume</button>' : ''}`;
  } else {
    const seats = p.seats || [];
    el.innerHTML = `<span class="who">⏸ Paused: ${seats.map(name).join(', ')} lost connection. Waiting for ${seats.length > 1 ? 'them' : 'them'} to come back<span class="dots"></span></span>
      ${host ? `<button data-pbot title="A computer plays their side until they come back">🤖 Let a bot play for them</button>
        <button data-paway title="Their turns are skipped until they come back">⏭ Carry on without them</button>` : '<span class="muted small">The host can let a bot play for them, or carry on without them.</span>'}`;
  }
  el.onclick = e => {
    const b = e.target.closest('button');
    if (!b || N.s?.role !== 'host') return;
    const seats = N.s.paused?.seats || [];
    if (b.dataset.presume !== undefined) { setPaused(null); updateDropPause(); }
    if (b.dataset.pbot !== undefined) { seats.forEach(botTakeOver); updateDropPause(); }
    if (b.dataset.paway !== undefined) { N.s.away = [...new Set([...(N.s.away || []), ...seats])]; sendAll({ t: 'away', away: N.s.away }); updateDropPause(); }
  };
  el.classList.remove('hidden');
  document.getElementById('readybar')?.classList.add('hidden');
  hideWait();
  refresh();
}
export function hostPauseToggle() {
  if (!online() || N.s.role !== 'host') return;
  if (N.s.paused) { setPaused(null); updateDropPause(); } else setPaused({ why: 'host' });
}

// ---------- the host keeps time ----------
// A player who goes quiet (wandered off, tab asleep) can't hold up the game: a little after their timer
// runs out, the host ends their turn (or readies them, in a simultaneous round). Players who are
// "away" are skipped straight away.
const GRACE_MS = 8000;
const clock = { key: null, start: 0, last: 0 };
setInterval(() => {
  const now = Date.now(), dt = now - (clock.last || now);
  clock.last = now;
  if (!online() || N.s.role !== 'host') return;
  const st = A.state;
  if (st.phase !== 'playing') return;
  if (N.s.paused) { clock.start += dt; return; }
  const key = st.simul ? `r${st.round}` : `t${st.turnCount}`;
  if (key !== clock.key) { clock.key = key; clock.start = now; }
  const late = st.turnTimer > 0 && now - clock.start > st.turnTimer * 1000 + GRACE_MS;
  const away = N.s.away || [];
  if (st.simul) {
    for (const p of st.players.map((_, i) => i)) {
      if (!humanSeat(st, p) || p === N.s.seat || st.ready?.[p] || st.players[p].takenOver) continue;
      if (away.includes(p) || late) {
        if (late && !away.includes(p)) toast(`Time's up for ${st.players[p].name}.`);
        simulAct(st, { type: 'ready', by: p, ready: true });
        if (st !== A.state || st.round !== +key.slice(1)) return;
      }
    }
  } else if (late && humanSeat(st, st.current) && st.current !== N.s.seat && !st.players[st.current].takenOver && !isBot(st, st.current)) {
    clock.key = null;
    S.botTurn = false;
    endTurnNow(`Time's up for ${st.players[st.current].name}.`);
  }
}, 500);

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
  if (st.simul) app.botsNow?.(st); else app.handoff(st);
}
// a player came back: give them their seat again
function playerBack(seat) {
  const st = A.state, pl = st?.players[seat];
  if (pl?.takenOver) { pl.seat = 'human'; delete pl.ai; delete pl.takenOver; resyncAll(); }
  if ((N.s.away || []).includes(seat)) { N.s.away = N.s.away.filter(x => x !== seat); sendAll({ t: 'away', away: N.s.away }); }
  toast(`${pl?.name || 'A player'} is back.`);
  updateDropPause();
  if (st.current === seat && !st.simul) showWait(st);
}
function playerLost(seat) {
  const st = A.state;
  badge();
  if (!online() || seat < 0 || st.phase !== 'playing') return;
  toast(`${st.players[seat].name} lost connection.`);
  updateDropPause();
  if (S.botTurn && !st.simul) showWait();
}

// ---------- messages from the host (client side) ----------
function fromHost(m) {
  const s = N.s;
  if (m.t === 'reject') { toast(m.msg); leave(); app.showHome?.('online'); return; }
  if (m.t === 'lobby') { s.lobby = m.lobby; s.seat = m.you; app.lobbyChanged?.(); return; }
  if (m.t === 'state') {
    const st = unpack(typeof m.state === 'string' ? m.state : JSON.stringify(m.state));
    s.seat = m.seat; s.st = st; s.paused = m.paused || null; s.away = m.away || [];
    queue.length = 0;
    hideWait();
    begin(st);
    return;
  }
  if (m.t === 'chat') { addChat(m.line); return; }
  if (m.t === 'chatlog') { setChatLines(m.list); return; }
  if (m.t === 'pause') { s.paused = m.paused; applyPause(); return; }
  if (m.t === 'away') { s.away = m.away; return; }
  if (m.t === 'act') { enqueue({ kind: 'act', a: m.a, by: m.by }); return; }
  if (m.t === 'check') { enqueue({ kind: 'check', tc: m.tc, fp: m.fp }); return; }
  if (m.t === 'nope') { toast(`Too late: ${m.error || 'that didn\'t work'} (someone else's move got there first)`); afterSimul(A.state, A.state.round); return; }
  if (m.t === 'presence') { s.online = m.online; badge(); return; }
  if (m.t === 'end') { toast('The host closed the game.'); hostLost(true); }
}
// Lost the host: keep trying to get back in (every few seconds at first, then less often), so a wifi
// blip or the host reloading their page doesn't end the game. The host's game reloads from its save.
const reconnect = { code: null, tries: 0, timer: null, busy: false };
function hostLost(closed) {
  if (!N.s) return;
  const code = N.s.code, inGame = !!N.s.st;
  app.stopTimer();
  S.botTurn = true; refresh();
  document.getElementById('readybar')?.classList.add('hidden');
  pauseEl().classList.add('hidden');
  leave();
  if (!inGame) { toast(closed ? 'The host closed the game.' : 'Lost the connection to the host.'); showChat(false); app.showHome?.('online', { code }); return; }
  if (closed) { reconnectBar(code, 'The host closed the game. It stays saved on their side: when they host it again, you can rejoin.'); return; }
  reconnect.code = code; reconnect.tries = 0;
  scheduleReconnect(1500);
}
function scheduleReconnect(ms) {
  clearTimeout(reconnect.timer);
  const left = Math.round(ms / 1000);
  reconnectBar(reconnect.code, `Lost the connection to the host. Reconnecting${reconnect.tries ? ` (try ${reconnect.tries + 1})` : ''}${left > 2 ? ` in ${left}s` : ''}<span class="dots"></span>`, true);
  reconnect.timer = setTimeout(tryReconnect, ms);
}
async function tryReconnect() {
  const code = reconnect.code;
  if (!code || reconnect.busy || N.s) return;
  reconnect.busy = true;
  try { await join(code); stopReconnect(); toast('Reconnected.'); } catch {
    reconnect.tries++;
    if (reconnect.tries > 60) { stopReconnect(); reconnectBar(code, 'Couldn\'t reconnect to the host. Ask them to open the game again, then rejoin.'); return; }
    scheduleReconnect(reconnect.tries < 8 ? 4000 : 15000);
  } finally { reconnect.busy = false; }
}
function stopReconnect() { clearTimeout(reconnect.timer); reconnect.code = null; }
addEventListener('online', () => { if (reconnect.code && !N.s) tryReconnect(); });
function reconnectBar(code, msg, trying = false) {
  const el = waitEl();
  el.innerHTML = `<span class="who">${msg}</span><button data-rejoin>🔄 ${trying ? 'Try now' : `Rejoin ${code}`}</button><button data-menu>Main menu</button>`;
  el.classList.remove('hidden');
  el.onclick = async e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.rejoin !== undefined) {
      if (reconnect.code) { clearTimeout(reconnect.timer); tryReconnect(); return; }
      try { await join(code); hideWait(); } catch (err) { toast(err.message); }
    }
    if (b.dataset.menu !== undefined) { stopReconnect(); leave(); hideWait(); showChat(false); S.botTurn = false; A.sessionActive = false; app.showHome?.('main'); }
  };
}

setHooks({
  remoteAction: (a, seat, cid) => { if (N.s?.paused && a.type !== 'ready') { resyncOne(cid); return; } enqueue({ kind: 'act', a, seat, cid }); },
  fromHost,
  hostLost: () => hostLost(false),
  lobbyChanged: () => app.lobbyChanged?.(),
  presenceChanged: () => { badge(); if (online() && S.botTurn && !A.state.simul && !N.s.paused) showWait(); },
  playerBack, playerLost,
  chat: line => addChat(line),
  pauseChanged: () => applyPause(),
  desync: rep => toast(`⚠️ ${rep.name}'s game drifted out of sync (round ${rep.round}): ${rep.diff.slice(0, 2).join('; ')}. Sent them a fresh copy.`),
});
initChat({ say: (text, emote) => sayChat(text, emote), mySeat: () => (N.s?.st ? N.s.seat : N.s?.role === 'host' ? 0 : N.s?.lobby?.seats.findIndex(x => x.clientId === clientId())) });
export const desyncReports = () => N.s?.desyncs || [];

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
  const away = N.s.away || [];
  el.innerHTML = `🌐 <b>${N.s.code}</b> ${st.players.map((pl, i) => (st.online.seats[i] || (pl.seat !== 'ai' && !pl.takenOver) || pl.takenOver
    ? `<i title="${pl.name}${on[i] === false ? ' (offline)' : ''}${pl.takenOver ? ' (a bot is playing for them)' : away.includes(i) ? ' (away: turns skipped)' : ''}" style="background:${on[i] === false ? 'transparent' : PLAYER_COLORS[i]};border-color:${PLAYER_COLORS[i]}"></i>` : '')).join('')}
    ${N.s.role === 'host' && st.phase === 'playing' ? `<button class="ghost" data-hostpause title="${N.s.paused ? 'Resume the game' : 'Pause the game for everyone'}">${N.s.paused ? '▶' : '⏸'}</button>` : ''}`;
  const pb = el.querySelector('[data-hostpause]');
  if (pb) pb.onclick = hostPauseToggle;
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
  stopReconnect();
  showChat(false);
  pauseEl().classList.add('hidden'); wasPaused = false;
  if (!N.s) return;
  leave();
  hideWait();
  badge();
}
// the most recent game this browser joined (not hosted), if it was in the last few hours: for "Rejoin"
export function lastJoined() {
  const g = recentGames().find(x => !x.host);
  return g && Date.now() - g.at < 6 * 3600e3 ? g : null;
}
export { N };
