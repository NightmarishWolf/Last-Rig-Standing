// Saving and loading games in the browser (localStorage).
//
// Every game autosaves into its own slot after each action ("auto-<gameId>"); the 3 most recent
// autosaves are kept, so starting a new game never wipes the one you were playing. You can also save
// named copies (up to MAX_MANUAL), load or delete any slot, and export a save to a file / import one.
//
// localStorage layout:
//   lrs-saves          index: [{ id, name, kind: 'auto' | 'manual', savedAt, round, phase, size, players: [{ name, seat }] }]
//   lrs-save:<id>      the game state (land squares run-length encoded to keep saves small)

const INDEX_KEY = 'lrs-saves';
const DATA_KEY = id => 'lrs-save:' + id;
const OLD_KEY = 'last-rig-standing-save-v3'; // the single save of earlier versions
const MAX_AUTO = 3, MAX_MANUAL = 12;

const readIndex = () => { try { return JSON.parse(localStorage.getItem(INDEX_KEY)) || []; } catch { return []; } };
const writeIndex = list => { try { localStorage.setItem(INDEX_KEY, JSON.stringify(list)); } catch { /* blocked */ } };

// ---------- compact encoding ----------
// The land map is a long array of 0s and 1s: store it as runs ("12a5b..." style: counts, alternating 0/1).
export function pack(st) {
  const runs = []; let cur = 0, n = 0;
  for (const v of st.land) { if (v === cur) n++; else { runs.push(n); cur = v; n = 1; } }
  runs.push(n);
  return JSON.stringify({ ...st, land: undefined, landRuns: runs.join('.') });
}
export function unpack(raw) {
  const st = JSON.parse(raw);
  if (st.landRuns != null) {
    const land = []; let v = 0;
    for (const n of st.landRuns.split('.')) { for (let i = 0; i < +n; i++) land.push(v); v = 1 - v; }
    st.land = land; delete st.landRuns;
  }
  return st;
}

export const newGameId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function summaryOf(st, id, name, kind) {
  return {
    id, name, kind, savedAt: Date.now(), round: st.round, phase: st.phase, size: st.size, gameId: st.gameId,
    players: st.players.map(pl => ({ name: pl.name, seat: pl.seat === 'ai' ? 'ai' : 'human', out: !!pl.out })),
  };
}
function put(st, entry) {
  const list = readIndex().filter(e => e.id !== entry.id);
  try { localStorage.setItem(DATA_KEY(entry.id), pack(st)); }
  catch {
    // storage full: drop the oldest autosaves of other games and try once more
    for (const e of list.filter(x => x.kind === 'auto' && x.gameId !== st.gameId).sort((a, b) => a.savedAt - b.savedAt)) {
      localStorage.removeItem(DATA_KEY(e.id)); list.splice(list.indexOf(e), 1);
      try { localStorage.setItem(DATA_KEY(entry.id), pack(st)); break; } catch { /* keep trying */ }
    }
  }
  list.push(entry);
  writeIndex(list);
}

// Autosave (called after every action). The tutorial never saves.
export function save(st) {
  if (st.tutorial) return;
  st.gameId ||= newGameId();
  const id = 'auto-' + st.gameId;
  put(st, summaryOf(st, id, 'Autosave', 'auto'));
  // keep only the newest few autosaves
  const autos = readIndex().filter(e => e.kind === 'auto').sort((a, b) => b.savedAt - a.savedAt);
  if (autos.length > MAX_AUTO) {
    const keep = new Set(autos.slice(0, MAX_AUTO).map(e => e.id));
    for (const e of autos) if (!keep.has(e.id)) localStorage.removeItem(DATA_KEY(e.id));
    writeIndex(readIndex().filter(e => e.kind !== 'auto' || keep.has(e.id)));
  }
}

// A named save of the current game (a copy: the game keeps autosaving into its own slot).
export function saveAs(st, name) {
  if (st.tutorial) return null;
  st.gameId ||= newGameId();
  const manual = readIndex().filter(e => e.kind === 'manual');
  if (manual.length >= MAX_MANUAL) return null;
  const id = 'm-' + newGameId();
  put(st, summaryOf(st, id, name || `Round ${st.round}`, 'manual'));
  return id;
}

export function listSaves() {
  migrate();
  return readIndex().sort((a, b) => b.savedAt - a.savedAt);
}
export function loadSave(id) {
  try { const raw = localStorage.getItem(DATA_KEY(id)); return raw ? unpack(raw) : null; } catch { return null; }
}
export function deleteSave(id) {
  localStorage.removeItem(DATA_KEY(id));
  writeIndex(readIndex().filter(e => e.id !== id));
}
export function renameSave(id, name) {
  writeIndex(readIndex().map(e => (e.id === id ? { ...e, name } : e)));
}
export const manualFull = () => readIndex().filter(e => e.kind === 'manual').length >= MAX_MANUAL;

// The newest game still being played (for "Continue").
export function latest() {
  const e = listSaves().find(x => x.phase === 'playing');
  return e ? { entry: e, st: loadSave(e.id) } : null;
}
// kept for older callers: the newest unfinished game
export const load = () => latest()?.st || null;

// ---------- files ----------
export function exportSave(id) {
  const st = loadSave(id), e = readIndex().find(x => x.id === id);
  if (!st) return;
  const blob = new Blob([JSON.stringify({ lastRigStanding: 1, name: e?.name, state: st })], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `last-rig-standing-${(e?.name || 'save').replace(/[^a-z0-9-]+/gi, '-').toLowerCase()}-round-${st.round}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
// Reads a file picked by the player; resolves to the new slot's id, or rejects with a message.
export function importSave(file) {
  return file.text().then(text => {
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('That file isn\'t a Last Rig Standing save.'); }
    const st = data?.state || data;
    if (!st || !Array.isArray(st.players) || !st.W || !(st.land || st.landRuns)) throw new Error('That file isn\'t a Last Rig Standing save.');
    if (st.landRuns != null) Object.assign(st, unpack(JSON.stringify(st)));
    if (manualFull()) throw new Error(`You already have ${MAX_MANUAL} saves: delete one first.`);
    st.gameId = newGameId(); // a fresh copy, so it never overwrites the game it came from
    return saveAs(st, data?.name ? `${data.name} (imported)` : 'Imported game');
  });
}

// ---------- the single save of earlier versions ----------
let migrated = false;
function migrate() {
  if (migrated) return;
  migrated = true;
  try {
    const raw = localStorage.getItem(OLD_KEY);
    if (!raw) return;
    const st = JSON.parse(raw);
    if (st?.players) save(st);
    localStorage.removeItem(OLD_KEY);
  } catch { /* nothing to move */ }
}
