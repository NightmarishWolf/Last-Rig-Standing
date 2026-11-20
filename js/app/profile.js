// ============================================================
// PROFILES: who's playing, kept in this browser. Each profile has a name (used online too), its
// commanders' XP (levels 1–15), mastery picks, and games/wins per faction. Several people can share a
// computer: each human seat on the New game screen picks a profile (or plays as a guest, earning nothing).
//
// localStorage 'lrs-profiles': { list: { [id]: profile } }; the active profile's id is kept per browser
// ('lrs-profile', per tab in same-browser test mode, like the online player id).
// Profiles can be exported to a file and imported back (browser storage can be wiped).
// ============================================================
import { COMMANDERS, COMMANDER_ORDER, MASTERY_LEVEL, UNLOCK, XP, levelOf, perksAt, xpForLevel } from '../data/commanders.js';

const KEY = 'lrs-profiles', ACTIVE = 'lrs-profile';
const sameBrowser = () => typeof location !== 'undefined' && new URLSearchParams(location.search).get('net') === 'local';
const activeStore = () => (sameBrowser() ? sessionStorage : localStorage);

const blank = (name) => ({
  id: 'u' + Math.random().toString(36).slice(2, 10), name: cleanName(name) || 'Admiral', created: Date.now(),
  commanders: {}, factions: {}, games: 0, wins: 0, history: [],
});
const cleanName = n => String(n || '').replace(/[<>]/g, '').trim().slice(0, 20);

function read() { try { const d = JSON.parse(localStorage.getItem(KEY)); return d && d.list ? d : { list: {} }; } catch { return { list: {} }; } }
function write(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* storage full or blocked */ } }

export const listProfiles = () => Object.values(read().list).sort((a, b) => a.created - b.created);
export const getProfile = id => read().list[id] || null;

// The active profile (made on first use, named after the old online name if there was one).
export function activeProfile() {
  const d = read();
  let id = activeStore().getItem(ACTIVE);
  if (!id || !d.list[id]) {
    // (same-browser test tabs each get a profile of their own)
    id = sameBrowser() ? null : Object.keys(d.list)[0];
    if (!id) { const p = blank(sameBrowser() ? sessionStorage.getItem('lrs-name') : localStorage.getItem('lrs-name')); d.list[p.id] = p; write(d); id = p.id; }
    activeStore().setItem(ACTIVE, id);
  }
  return d.list[id];
}
export function setActive(id) { if (getProfile(id)) activeStore().setItem(ACTIVE, id); }

export function createProfile(name) {
  const d = read(), p = blank(name);
  d.list[p.id] = p; write(d);
  return p;
}
export function renameProfile(id, name) {
  const d = read();
  if (d.list[id] && cleanName(name)) { d.list[id].name = cleanName(name); write(d); }
}
export function deleteProfile(id) {
  const d = read();
  if (Object.keys(d.list).length <= 1) return false; // (always keep one)
  delete d.list[id]; write(d);
  if (activeStore().getItem(ACTIVE) === id) activeStore().removeItem(ACTIVE);
  return true;
}
function update(id, fn) { const d = read(); if (!d.list[id]) return null; fn(d.list[id]); write(d); return d.list[id]; }

// ---------- commanders in a profile ----------
const cmd = (prof, id) => prof?.commanders?.[id] || { xp: 0, games: 0, wins: 0, mastery: 0 };
export const commanderXp = (prof, id) => cmd(prof, id).xp;
export const commanderLevel = (prof, id) => (prof ? levelOf(cmd(prof, id).xp) : 1);
export const commanderMastery = (prof, id) => cmd(prof, id).mastery || 0;
export function setMastery(profId, id, m) {
  update(profId, p => { if (commanderLevel(p, id) >= MASTERY_LEVEL) (p.commanders[id] ||= cmd(p, id)).mastery = m ? 1 : 0; });
}
// Progress toward the next level: { level, xp, into, need } (need 0 at the top).
export function progress(prof, id) {
  const xp = commanderXp(prof, id), level = levelOf(xp);
  return { level, xp, into: xp - xpForLevel(level), need: level >= 15 ? 0 : xpForLevel(level + 1) - xpForLevel(level) };
}

// Unlocks: first of each faction free; second at the first's level 5 or 3 faction wins; third at any level 10.
// (A guest — no profile — has only the first commander of each faction.)
export function unlocked(prof, id) {
  const c = COMMANDERS[id], order = COMMANDER_ORDER[c.faction], i = order.indexOf(id);
  if (i === 0) return true;
  if (!prof) return false;
  if (i === 1) return commanderLevel(prof, order[0]) >= UNLOCK.secondLevel || (prof.factions?.[c.faction]?.wins || 0) >= UNLOCK.secondWins;
  return order.some(o => commanderLevel(prof, o) >= UNLOCK.thirdLevel);
}
export function unlockText(id) {
  const c = COMMANDERS[id], order = COMMANDER_ORDER[c.faction], i = order.indexOf(id);
  if (i === 1) return `Unlocks when ${COMMANDERS[order[0]].name} reaches level ${UNLOCK.secondLevel}, or after ${UNLOCK.secondWins} wins as the ${c.faction === 'navy' ? 'Navy' : 'Free Tide'}.`;
  if (i === 2) return `Unlocks when any ${c.faction === 'navy' ? 'Navy' : 'Free Tide'} commander reaches level ${UNLOCK.thirdLevel}.`;
  return '';
}

// What a seat plays with from a profile: { commander, level, mastery } (level from the profile).
export function seatCommander(prof, id) {
  if (!id || id === 'none' || !COMMANDERS[id]) return { commander: null };
  return { commander: id, level: commanderLevel(prof, id), mastery: commanderMastery(prof, id) };
}

// ---------- XP at the end of a game ----------
// XP for player p: 8 a round (up to 1,200) + 400 for a win, scaled by who they played against.
// No commander, no XP (faction games and wins still count).
export function gameXp(st, p) {
  const pl = st.players[p];
  if (!pl.commander) return 0;
  const foes = st.players.filter((o, i) => i !== p);
  const mult = foes.length ? foes.reduce((t, o) => t + (o.seat === 'ai' && !o.takenOver ? XP.vs[o.ai?.difficulty] ?? 1 : XP.vs.human), 0) / foes.length : 1;
  const base = Math.min(XP.roundCap, XP.perRound * st.round) + (st.winner === p ? XP.win : 0);
  return Math.round(base * mult);
}

// Give a finished game's XP to a profile (once per game and seat). Returns what happened, for the
// game over page: { xp, commander, before, after, perks: [newly unlocked perks], unlocks: [commander ids] }.
export function awardGame(profId, st, p) {
  const key = `${st.gameId || st.seed}:${p}`;
  const prof = getProfile(profId);
  if (!prof || (prof.history || []).some(h => h.key === key)) return null;
  const pl = st.players[p], c = pl.commander?.id || null, faction = pl.faction || 'navy';
  const won = st.winner === p, xp = gameXp(st, p);
  const before = c ? commanderLevel(prof, c) : null;
  const lockedBefore = Object.keys(COMMANDERS).filter(id => !unlocked(prof, id));
  const after = update(profId, q => {
    q.games = (q.games || 0) + 1; if (won) q.wins = (q.wins || 0) + 1;
    const f = ((q.factions ||= {})[faction] ||= { games: 0, wins: 0 }); f.games++; if (won) f.wins++;
    if (c) { const k = ((q.commanders ||= {})[c] ||= { xp: 0, games: 0, wins: 0, mastery: 0 }); k.xp += xp; k.games++; if (won) k.wins++; }
    q.history = [{ key, at: Date.now(), faction, commander: c, won, xp, rounds: st.round }, ...(q.history || [])].slice(0, 30);
  });
  const levelAfter = c ? commanderLevel(after, c) : null;
  const perks = c && levelAfter > before ? perksAt(c, levelAfter, commanderMastery(after, c)).filter(k => k.level > before) : [];
  return { xp, commander: c, before, after: levelAfter, perks, unlocks: lockedBefore.filter(id => unlocked(after, id)) };
}

// ---------- backup ----------
export const exportProfiles = () => JSON.stringify({ kind: 'last-rig-standing-profiles', version: 1, list: read().list }, null, 1);
export function importProfiles(text) {
  const d = JSON.parse(text);
  if (d?.kind !== 'last-rig-standing-profiles' || !d.list) throw new Error("That isn't a profiles file.");
  const cur = read();
  let n = 0;
  for (const [id, p] of Object.entries(d.list)) if (p && typeof p.name === 'string') { cur.list[id] = { ...blank(p.name), ...p, id }; n++; }
  write(cur);
  return n;
}
