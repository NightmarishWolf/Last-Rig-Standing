// Replays: every game is recorded as it's played, so it can be watched again afterwards.
//
// The engine is deterministic, so a replay is just the game as it started plus every move made, in
// order (the engine numbers them: st.seq). Watching it plays the moves again on a copy (replayer.js).
// Recordings live in the browser's IndexedDB (they're too big for localStorage), one per game, and
// can be downloaded as a file and imported on another computer.
//
//   record: { lastRigStanding: 'replay', version, gameId, start (packed game), startSeq, actions: [...],
//             seq (moves recorded up to), fp (fingerprint at the end, to check playback), savedAt, meta }
//
// A game loaded from a save carries on its recording (cut back to the save if it's an older one). If
// the recording can't be joined up (e.g. a replay made on another computer), a new one starts there.
import * as E from '../engine/index.js';
import { pack } from './storage.js';
import { fingerprint } from '../net/session.js';

const MAX_REPLAYS = 15;
const INDEX_KEY = 'lrs-replays';
const recs = new WeakMap(); // game -> its recording

// ---------- storage (IndexedDB) ----------
let dbp = null;
function db() {
  return dbp ||= new Promise((ok, fail) => {
    if (!('indexedDB' in globalThis)) { fail(new Error('No IndexedDB')); return; }
    const r = indexedDB.open('last-rig-standing', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('replays', { keyPath: 'gameId' });
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((ok, fail) => {
    const t = d.transaction('replays', mode), req = fn(t.objectStore('replays'));
    t.oncomplete = () => ok(req?.result);
    t.onerror = () => fail(t.error);
  });
}
export const getReplay = id => tx('readonly', s => s.get(id)).catch(() => null);
const putReplay = rec => tx('readwrite', s => s.put(rec));
const delReplay = id => tx('readwrite', s => s.delete(id)).catch(() => {});

// a small list in localStorage, so menus can show which games have a replay without waiting
export function replayList() { try { return JSON.parse(localStorage.getItem(INDEX_KEY)) || []; } catch { return []; } }
export const hasReplay = gameId => !!gameId && replayList().some(e => e.gameId === gameId);
function writeList(list) { try { localStorage.setItem(INDEX_KEY, JSON.stringify(list)); } catch { /* full */ } }
const metaOf = st => ({
  round: st.round, phase: st.phase, size: st.size, winner: st.winner, simul: !!st.simul, online: !!st.online,
  players: st.players.map(pl => ({ name: pl.name, seat: pl.seat })),
});

// ---------- recording ----------
// Start (or carry on) recording a game. Safe to call often: a game already being recorded is left alone.
export function track(st) {
  if (!st || st.tutorial || st.replay || !st.gameId || recs.has(st)) return;
  const seq = st.seq || 0;
  const rec = { lastRigStanding: 'replay', version: 1, gameId: st.gameId, start: pack(st), startSeq: seq, actions: [], seq, joining: true };
  recs.set(st, rec);
  // join it up with what was recorded before (async: moves made meanwhile are kept)
  getReplay(st.gameId).then(old => {
    rec.joining = false;
    if (!old || old.startSeq > seq || old.startSeq + old.actions.length < seq) return; // nothing usable before this point
    rec.start = old.start; rec.startSeq = old.startSeq;
    rec.actions = old.actions.slice(0, seq - old.startSeq).concat(rec.actions);
  }, () => { rec.joining = false; });
}

let writeTimer = null;
const dirty = new Set();
E.onApplied((st, a) => {
  const rec = recs.get(st);
  if (!rec) return;
  if (st.seq !== rec.startSeq + rec.actions.length + 1 && !rec.joining) { recs.delete(st); return; } // lost the thread
  rec.actions.push(a);
  rec.seq = st.seq; rec.fp = fingerprint(st); rec.meta = metaOf(st);
  dirty.add(st);
  if (!writeTimer) writeTimer = setTimeout(() => { writeTimer = null; flush(); }, 1500); // at most every 1.5 s
});
export async function flush() {
  const list = [...dirty];
  dirty.clear();
  for (const st of list) {
    const rec = recs.get(st);
    if (!rec || rec.joining) { if (rec) dirty.add(st); continue; }
    await saveRecord({ ...rec, joining: undefined, savedAt: Date.now() });
  }
}
async function saveRecord(rec) {
  try { await putReplay(rec); } catch { return false; }
  const list = replayList().filter(e => e.gameId !== rec.gameId);
  list.unshift({ gameId: rec.gameId, savedAt: rec.savedAt || Date.now(), moves: rec.actions.length, ...rec.meta });
  for (const old of list.splice(MAX_REPLAYS)) delReplay(old.gameId);
  writeList(list);
  return true;
}
addEventListener('pagehide', () => flush());

// the recording of a game being played right now (with every move so far)
export function liveRecord(st) {
  const rec = recs.get(st);
  return rec && { ...rec, joining: undefined, savedAt: Date.now() };
}
export async function loadReplay(gameId, st) {
  await flush();
  return (st && liveRecord(st)) || getReplay(gameId);
}
export async function deleteReplay(gameId) {
  await delReplay(gameId);
  writeList(replayList().filter(e => e.gameId !== gameId));
}

// ---------- files ----------
export function downloadReplay(rec) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(rec)], { type: 'application/json' }));
  const who = (rec.meta?.players || []).map(p => p.name.replace(/[^\w]+/g, '')).join('-vs-');
  a.download = `last-rig-standing-replay-${who || rec.gameId}-round-${rec.meta?.round ?? ''}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export const isReplayFile = data => data?.lastRigStanding === 'replay' && typeof data.start === 'string' && Array.isArray(data.actions);
export async function importReplay(data) {
  if (!isReplayFile(data)) throw new Error('That isn\'t a Last Rig Standing replay file.');
  const rec = { ...data, gameId: data.gameId || 'imported-' + Date.now().toString(36), imported: true };
  rec.meta ||= {};
  await saveRecord(rec);
  return rec;
}
