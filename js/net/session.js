// Online games (peer-to-peer for now): the HOST's browser runs the real game and the bots; everyone
// else (CLIENTS) connects to it with an invite code.
//
// The engine is deterministic, so instead of sending the whole game after every click we send moves:
//   - a client plays a move on its own copy and sends it to the host;
//   - the host checks it's that player's turn, plays it, and passes it on to everyone else;
//   - bot moves (run on the host) are passed on the same way;
//   - after every end of turn the host sends a fingerprint of the game, and anyone whose copy has
//     drifted asks for (and gets) a fresh full copy.
// New and returning players get one full copy of the game, then follow the moves.
//
// Everything here goes through transport.js, so a server (Cloudflare) can replace peer-to-peer later.
import { activeProfile, renameProfile } from '../app/profile.js';
import * as E from '../engine/index.js';
import { transport, transportName } from './transport.js';
import { pack, unpack } from '../app/storage.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const newCode = () => Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
export const normCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

// ---------- who am I ----------
// (same-browser mode keeps them per tab, so two tabs are two different players)
const idStore = () => (transportName() === 'local' ? sessionStorage : localStorage);
export function clientId() {
  let id = idStore().getItem('lrs-client-id');
  if (!id) { id = 'p' + Math.random().toString(36).slice(2, 10); idStore().setItem('lrs-client-id', id); }
  return id;
}
// (your name is your active profile's name: see app/profile.js)
export const myName = () => activeProfile().name || '';
export const setMyName = n => { if (String(n || '').trim()) renameProfile(activeProfile().id, n); };

// games this browser joined, for "Rejoin"
export function recentGames() { try { return JSON.parse(localStorage.getItem('lrs-online-recent')) || []; } catch { return []; } }
function remember(code, extra) {
  const list = recentGames().filter(g => g.code !== code);
  list.unshift({ code, at: Date.now(), ...extra });
  localStorage.setItem('lrs-online-recent', JSON.stringify(list.slice(0, 6)));
}
export const forgetGame = code => localStorage.setItem('lrs-online-recent', JSON.stringify(recentGames().filter(g => g.code !== code)));

// A short fingerprint of the game, to spot copies that have drifted apart.
// summary() is the same facts in readable form: when a copy drifts, the player's screen sends its
// summary to the host, which reports what differs (to find the bug).
export function summary(st) {
  return {
    // (whose turn means nothing in simultaneous rounds)
    tc: st.turnCount, current: st.simul ? 0 : st.current, phase: st.phase, price: Math.round(st.market.price * 100),
    players: st.players.map(pl => [Math.round(pl.money * 100), Math.round(pl.oil * 100), pl.out ? 1 : 0]),
    ships: st.ships.map(s => [s.id, s.x, s.y, s.rot, s.hp]),
    rigs: st.rigs.map(r => [r.id, r.hp ?? 0]),
  };
}
export function fingerprint(st) {
  const m = summary(st);
  const parts = [m.tc, m.current, m.phase, m.price, ...m.players.flat(), ...m.ships.flat(), ...m.rigs.flat()];
  const str = parts.join('|');
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

// What differs between two summaries, in words (at most a few items).
export function describeDrift(mine, theirs, names = []) {
  const out = [];
  if (!mine || !theirs) return ['(no copy of that turn to compare with)'];
  if (mine.current !== theirs.current) out.push(`whose turn (${mine.current} vs ${theirs.current})`);
  if (mine.price !== theirs.price) out.push(`oil price ($${mine.price / 100} vs $${theirs.price / 100})`);
  mine.players.forEach((a, i) => {
    const b = theirs.players[i] || [];
    const who = names[i] || `player ${i + 1}`;
    if (a[0] !== b[0]) out.push(`${who}'s money ($${a[0] / 100} vs $${b[0] / 100})`);
    if (a[1] !== b[1]) out.push(`${who}'s oil (${a[1] / 100} vs ${b[1] / 100})`);
    if (a[2] !== b[2]) out.push(`whether ${who} is out`);
  });
  const ships = new Map(theirs.ships.map(x => [x[0], x]));
  for (const a of mine.ships) {
    const b = ships.get(a[0]);
    if (!b) out.push(`ship #${a[0]} missing on their copy`);
    else if (a.join() !== b.join()) out.push(`ship #${a[0]} (${a[1]},${a[2]} rot ${a[3]} hp ${a[4]} vs ${b[1]},${b[2]} rot ${b[3]} hp ${b[4]})`);
    ships.delete(a[0]);
  }
  for (const id of ships.keys()) out.push(`extra ship #${id} on their copy`);
  const rigs = new Map(theirs.rigs.map(x => [x[0], x]));
  for (const a of mine.rigs) { const b = rigs.get(a[0]); if (!b || b[1] !== a[1]) out.push(`rig #${a[0]}`); }
  return out.length ? out.slice(0, 6).concat(out.length > 6 ? [`and ${out.length - 6} more`] : []) : ['nothing in the summary (the difference is elsewhere)'];
}

// ---------- the session ----------
// N = the live session (null when not online). The app (online.js) fills in the hooks.
export const N = { s: null };
const hooks = {};
export const setHooks = h => Object.assign(hooks, h);

// ---- host ----
export async function startHosting(lobby, code = newCode()) {
  const t = transport();
  const server = await t.host(code);
  const s = N.s = {
    role: 'host', code, server, conns: new Map(), // clientId -> conn
    lobby: { ...lobby, code }, st: null, seat: 0,
    seen: new Map(), // clientId -> when we last heard from them
    chat: [], paused: null, desyncs: [], checks: new Map(), // turnCount -> summary (for desync reports)
  };
  server.onConnection(conn => {
    let cid = null;
    conn.onMessage(m => {
      if (m.t === 'hello') { cid = m.clientId; s.seen.set(cid, Date.now()); onHello(conn, m); return; }
      if (!cid) return;
      s.seen.set(cid, Date.now());
      if (m.t === 'act') hooks.remoteAction?.(m.a, seatOfClient(cid), cid);
      if (m.t === 'sync') sendState(cid);
      if (m.t === 'desync') onDesync(cid, m);
      if (m.t === 'chat') hostChat(cid, m);
      if (m.t === 'faction' || m.t === 'seat') hostSeatPick(cid, m);
      if (m.t === 'leave') { conn.close(); dropped(cid, conn); }
    });
    conn.onClose(() => dropped(cid, conn));
  });
  // heartbeat: a connection that has gone quiet (closed laptop, lost wifi) is dropped after a while,
  // even if the browser never noticed it closing
  s.beat = setInterval(() => {
    if (N.s !== s) { clearInterval(s.beat); return; }
    const now = Date.now();
    for (const [cid, c] of s.conns) {
      c.send({ t: 'ping' });
      if (now - (s.seen.get(cid) || now) > QUIET_MS) { try { c.close(); } catch { /* gone */ } dropped(cid, c); }
    }
  }, BEAT_MS);
  remember(code, { host: true });
  return s;
}
const BEAT_MS = 3000, QUIET_MS = 20000;
function dropped(cid, conn) {
  const s = N.s;
  if (!s || !cid || s.conns.get(cid) !== conn) return;
  s.conns.delete(cid);
  onLeave(cid);
}
function onHello(conn, m) {
  const s = N.s;
  const name = String(m.name || 'Admiral').slice(0, 20);
  s.conns.get(m.clientId)?.close?.();
  s.conns.set(m.clientId, conn);
  if (!s.st) {
    // in the lobby: a seat of their own (the same one again if they come back)
    const L = s.lobby;
    let i = L.seats.findIndex(x => x.kind === 'online' && x.clientId === m.clientId);
    if (i < 0) i = L.seats.findIndex((x, k) => k < L.players && x.kind === 'online' && !x.clientId);
    if (i < 0) { conn.send({ t: 'reject', msg: 'This game is full.' }); setTimeout(() => conn.close(), 300); s.conns.delete(m.clientId); return; }
    L.seats[i] = { ...L.seats[i], clientId: m.clientId, name };
    broadcastLobby();
    conn.send({ t: 'chatlog', list: s.chat });
    hooks.lobbyChanged?.();
    return;
  }
  // a game in progress: only its players can come back in
  const seat = (s.st.online?.seats || []).findIndex(x => x?.clientId === m.clientId);
  if (seat < 0) { conn.send({ t: 'reject', msg: 'That game has already started.' }); setTimeout(() => conn.close(), 300); s.conns.delete(m.clientId); return; }
  sendState(m.clientId);
  conn.send({ t: 'chatlog', list: s.chat });
  hooks.playerBack?.(seat, m.clientId);
  broadcastPresence();
}
function onLeave(cid) {
  const s = N.s;
  if (!s) return;
  if (!s.st) {
    const L = s.lobby, i = L.seats.findIndex(x => x.clientId === cid);
    if (i >= 0) L.seats[i] = { ...L.seats[i], clientId: null, name: null };
    broadcastLobby(); hooks.lobbyChanged?.();
  } else { broadcastPresence(); hooks.playerLost?.(seatOfClient(cid), cid); }
}

// ---- out of sync ----
// The host keeps a summary of the last few end-of-turn checks; a player whose copy differs sends
// theirs, and the host says what differs (then sends them a fresh copy).
export function recordCheck(st) {
  const s = N.s, m = summary(st);
  s.checks.set(m.tc, m);
  for (const k of s.checks.keys()) if (k < m.tc - 12) s.checks.delete(k);
  return m;
}
function onDesync(cid, m) {
  const s = N.s, seat = seatOfClient(cid);
  const names = s.st?.players.map(pl => pl.name) || [];
  const diff = describeDrift(s.checks.get(m.tc), m.summary, names);
  const rep = { at: new Date().toISOString(), seat, name: names[seat] || '?', turn: m.tc, round: s.st?.round, diff, theirs: m.summary, mine: s.checks.get(m.tc) || null };
  s.desyncs.push(rep);
  if (s.desyncs.length > 20) s.desyncs.shift();
  hooks.desync?.(rep);
  sendState(cid);
}
export function sendDesync(st) { sendHost({ t: 'desync', tc: st.turnCount, summary: summary(st) }); }

// ---- factions (lobby): each online player picks their own ----
const FACTION_IDS = new Set(['navy', 'tide', 'random']);
// (and their commander: the choice, plus their profile's table of commander levels; see settings.js)
function hostSeatPick(cid, m) {
  const s = N.s;
  if (s.st) return;
  const i = s.lobby.seats.findIndex(x => x.clientId === cid);
  if (i < 0) return;
  const o = { ...s.lobby.seats[i] };
  if (FACTION_IDS.has(m.faction)) o.faction = m.faction;
  if (typeof m.commander === 'string' && /^[a-z]{2,12}$/.test(m.commander)) o.commander = m.commander;
  if (m.cmds && typeof m.cmds === 'object') {
    o.cmds = {};
    for (const [k, v] of Object.entries(m.cmds).slice(0, 24)) if (/^[a-z]{2,16}$/.test(k) && Array.isArray(v)) o.cmds[k] = [Math.max(1, Math.min(15, v[0] | 0)), v[1] ? 1 : 0, v[2] ? 1 : 0];
  }
  s.lobby.seats[i] = o;
  broadcastLobby(); hooks.lobbyChanged?.();
}
export function pickMySeat(patch) {
  const s = N.s;
  if (!s || s.st || s.role === 'host') return;
  sendHost({ t: 'seat', ...patch });
}
export const pickMyFaction = f => pickMySeat({ faction: f, commander: 'auto' });

// ---- chat ----
// Lines go through the host, which stamps who said them and passes them to everyone.
const EMOTES = new Set(['👍', '👋', '😂', '😮', '😡', '🤝', '🎯', '💥', 'gg', 'glhf', 'wait', 'hurry', 'nice', 'oops']);
function chatSeat(cid) {
  const s = N.s;
  if (s.st) return seatOfClient(cid);
  return s.lobby.seats.findIndex(x => x.clientId === cid);
}
function hostChat(cid, m) {
  const s = N.s, seat = chatSeat(cid);
  const name = s.st ? s.st.players[seat]?.name : s.lobby.seats[seat]?.name;
  postChat({ seat, name: name || 'Admiral', text: m.text, emote: m.emote });
}
function postChat({ seat, name, text, emote }) {
  const s = N.s;
  const line = { seat, name: String(name).slice(0, 20), at: Date.now() };
  if (emote && EMOTES.has(emote)) line.emote = emote;
  else { line.text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 200); if (!line.text) return; }
  s.chat.push(line);
  if (s.chat.length > 80) s.chat.shift();
  sendAll({ t: 'chat', line });
  hooks.chat?.(line);
}
export function sayChat(text, emote) {
  const s = N.s;
  if (!s) return;
  if (s.role === 'client') { sendHost({ t: 'chat', text, emote }); return; }
  const name = s.st ? s.st.players[s.seat]?.name : (myName() || 'Host');
  postChat({ seat: s.st ? s.seat : 0, name, text, emote });
}

// ---- pause ----
// paused = null, or { seat, why: 'drop' | 'host' }; the host decides and tells everyone.
export function setPaused(paused) {
  const s = N.s;
  if (!s || s.role !== 'host') return;
  s.paused = paused;
  sendAll({ t: 'pause', paused });
  hooks.pauseChanged?.(paused);
}
const seatOfClient = cid => (N.s.st?.online?.seats || []).findIndex(x => x?.clientId === cid);
export function broadcastLobby() {
  const s = N.s;
  for (const [cid, c] of s.conns) c.send({ t: 'lobby', lobby: s.lobby, you: s.lobby.seats.findIndex(x => x.clientId === cid) });
}
export function setLobby(changes) { Object.assign(N.s.lobby, changes); broadcastLobby(); }
function sendState(cid) {
  const s = N.s, c = s.conns.get(cid);
  if (!c || !s.st) return;
  c.send({ t: 'state', state: pack(s.st), seat: seatOfClient(cid), code: s.code, paused: s.paused, away: s.away || [] });
}
export function hostBegan(st) {
  const s = N.s;
  s.st = st;
  for (const cid of s.conns.keys()) sendState(cid);
  broadcastPresence();
}
export function sendAll(msg, exceptCid = null) {
  for (const [cid, c] of N.s.conns) if (cid !== exceptCid) c.send(msg);
}
export function sendTo(cid, msg) { N.s.conns.get(cid)?.send(msg); }
export function resyncAll() { for (const cid of N.s.conns.keys()) sendState(cid); }
export function broadcastPresence() {
  const s = N.s;
  if (!s.st) return;
  const online = (s.st.online?.seats || []).map((x, i) => (i === s.seat ? true : x ? s.conns.has(x.clientId) : null));
  s.online = online;
  sendAll({ t: 'presence', online });
  hooks.presenceChanged?.();
}
export const isConnected = cid => N.s?.conns.has(cid);

// ---- client ----
export async function joinGame(code) {
  const t = transport();
  const conn = await t.join(code);
  const s = N.s = { role: 'client', code, conn, lobby: null, seat: null, st: null, seen: Date.now(), chat: [], paused: null };
  const lost = () => { if (N.s === s) { clearInterval(s.beat); hooks.hostLost?.(); } };
  conn.onMessage(m => {
    s.seen = Date.now();
    if (m.t === 'ping') return;
    hooks.fromHost?.(m);
  });
  conn.onClose(lost);
  s.beat = setInterval(() => {
    if (N.s !== s) { clearInterval(s.beat); return; }
    conn.send({ t: 'ping' });
    if (Date.now() - s.seen > QUIET_MS) { try { conn.close(); } catch { /* gone */ } lost(); }
  }, BEAT_MS);
  conn.send({ t: 'hello', clientId: clientId(), name: myName() || 'Admiral' });
  remember(code, { host: false, name: myName() });
  return s;
}
export function sendHost(msg) { N.s?.conn?.send(msg); }

export function leave() {
  const s = N.s;
  if (!s) return;
  N.s = null;
  clearInterval(s.beat);
  try {
    if (s.role === 'host') { for (const c of s.conns.values()) { c.send({ t: 'end' }); c.close(); } s.server.close(); }
    else { s.conn.send({ t: 'leave' }); s.conn.close(); }
  } catch { /* already gone */ }
}

export const joinLink = code => `${location.origin}${location.pathname}?join=${code}${transportName() === 'local' ? '&net=local' : ''}`;
export { unpack };
