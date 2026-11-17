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
export const myName = () => idStore().getItem('lrs-name') || '';
export const setMyName = n => idStore().setItem('lrs-name', String(n || '').slice(0, 20));

// games this browser joined, for "Rejoin"
export function recentGames() { try { return JSON.parse(localStorage.getItem('lrs-online-recent')) || []; } catch { return []; } }
function remember(code, extra) {
  const list = recentGames().filter(g => g.code !== code);
  list.unshift({ code, at: Date.now(), ...extra });
  localStorage.setItem('lrs-online-recent', JSON.stringify(list.slice(0, 6)));
}
export const forgetGame = code => localStorage.setItem('lrs-online-recent', JSON.stringify(recentGames().filter(g => g.code !== code)));

// A short fingerprint of the game, to spot copies that have drifted apart.
export function fingerprint(st) {
  const parts = [st.turnCount, st.current, st.phase, Math.round(st.market.price * 100)];
  for (const pl of st.players) parts.push(Math.round(pl.money * 100), Math.round(pl.oil * 100), pl.out ? 1 : 0);
  for (const s of st.ships) parts.push(s.id, s.x, s.y, s.rot, s.hp);
  for (const r of st.rigs) parts.push(r.id, r.hp ?? 0);
  const str = parts.join('|');
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
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
  };
  server.onConnection(conn => {
    let cid = null;
    conn.onMessage(m => {
      if (m.t === 'hello') { cid = m.clientId; onHello(conn, m); return; }
      if (!cid) return;
      if (m.t === 'act') hooks.remoteAction?.(m.a, seatOfClient(cid), cid);
      if (m.t === 'sync') sendState(cid);
      if (m.t === 'leave') conn.close();
    });
    conn.onClose(() => { if (cid && s.conns.get(cid) === conn) { s.conns.delete(cid); onLeave(cid); } });
  });
  remember(code, { host: true });
  return s;
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
    hooks.lobbyChanged?.();
    return;
  }
  // a game in progress: only its players can come back in
  const seat = (s.st.online?.seats || []).findIndex(x => x?.clientId === m.clientId);
  if (seat < 0) { conn.send({ t: 'reject', msg: 'That game has already started.' }); setTimeout(() => conn.close(), 300); s.conns.delete(m.clientId); return; }
  hooks.playerBack?.(seat, m.clientId);
  sendState(m.clientId);
  broadcastPresence();
}
function onLeave(cid) {
  const s = N.s;
  if (!s) return;
  if (!s.st) {
    const L = s.lobby, i = L.seats.findIndex(x => x.clientId === cid);
    if (i >= 0) L.seats[i] = { ...L.seats[i], clientId: null, name: null };
    broadcastLobby(); hooks.lobbyChanged?.();
  } else { broadcastPresence(); hooks.presenceChanged?.(); }
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
  c.send({ t: 'state', state: pack(s.st), seat: seatOfClient(cid), code: s.code });
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
  const s = N.s = { role: 'client', code, conn, lobby: null, seat: null, st: null };
  conn.onMessage(m => hooks.fromHost?.(m));
  conn.onClose(() => { if (N.s === s) hooks.hostLost?.(); });
  conn.send({ t: 'hello', clientId: clientId(), name: myName() || 'Admiral' });
  remember(code, { host: false, name: myName() });
  return s;
}
export function sendHost(msg) { N.s?.conn?.send(msg); }

export function leave() {
  const s = N.s;
  if (!s) return;
  N.s = null;
  try {
    if (s.role === 'host') { for (const c of s.conns.values()) { c.send({ t: 'end' }); c.close(); } s.server.close(); }
    else { s.conn.send({ t: 'leave' }); s.conn.close(); }
  } catch { /* already gone */ }
}

export const joinLink = code => `${location.origin}${location.pathname}?join=${code}${transportName() === 'local' ? '&net=local' : ''}`;
export { unpack };
