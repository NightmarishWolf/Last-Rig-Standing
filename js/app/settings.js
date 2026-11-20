import { FACTIONS, FACTION_ORDER } from '../data/factions.js';
import { COMMANDERS, COMMANDER_ORDER, MAX_LEVEL } from '../data/commanders.js';
import { activeProfile, commanderLevel, getProfile, listProfiles, seatCommander, unlocked, unlockText } from './profile.js';
// New-game settings and small formatting helpers.

 // true once a player has revealed their fleet this session
export const setup = {
  // fog: fog of war, 'on', 'off' or 'reveal' (what you've seen stays visible)
  // turnOrder: 'simul' (everyone at once: the default, nobody gets to go first) or 'turns' (one player at a time)
  size: 'small', mapType: 'classic', seed: '', events: { mode: 'off', kinds: ['storm', 'fogbank', 'calm', 'shock', 'field', 'blowout', 'pirates', 'rogue'], pace: 'light' }, players: 2, turnTimer: 90, mirror: true, fog: 'on', turnOrder: 'simul', victory: { domination: true, postoil: true, lastrig: true },
  // one entry per seat: { seat: 'human' | 'ai', difficulty, personality ('random' or a personality id), faction ('navy', 'tide' or 'random') }
  seats: [
    { seat: 'human', difficulty: 'normal', personality: 'random', faction: 'navy' },
    { seat: 'ai', difficulty: 'normal', personality: 'random', faction: 'navy' },
    { seat: 'ai', difficulty: 'normal', personality: 'random', faction: 'navy' },
    { seat: 'ai', difficulty: 'normal', personality: 'random', faction: 'navy' },
  ],
};
// how fast bot turns play out on screen (ms per step)
export const BOT_SPEEDS = [{ id: 'slow', name: 'Slow', ms: 650 }, { id: 'normal', name: 'Normal', ms: 380 }, { id: 'fast', name: 'Fast', ms: 160 }, { id: 'instant', name: 'Instant', ms: 0 }];
export const view = { botSpeed: 'normal' };

export const TIMER_OPTIONS = [0, 60, 90, 120, 180];

export const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// The map seed box: blank = a new map; a number (or any text) = that exact map again (same size,
// players, type and layout).
export function seedOf(text) {
  const t = String(text ?? '').trim();
  if (!t) return undefined;
  if (/^\d{1,9}$/.test(t)) return +t;
  let h = 7;
  for (const c of t) h = (h * 31 + c.charCodeAt(0)) % 1e9;
  return h;
}

// A seat's faction: 'random' is rolled when the game starts.
export const rollFaction = f => (f === 'random' ? FACTION_ORDER[Math.floor(Math.random() * FACTION_ORDER.length)] : FACTIONS[f] ? f : 'navy');
// The faction buttons for a seat row (data-<attr>="seat:faction").
export const factionButtons = (attr, i, cur, disabled = '') => `<div class="seg small-seg faction-seg">${[...FACTION_ORDER, 'random'].map(k =>
  `<button data-${attr}="${i}:${k}" class="${(cur || 'navy') === k ? 'on' : ''}" ${disabled} title="${k === 'random' ? 'A faction picked at random when the game starts' : `${FACTIONS[k].name}: ${FACTIONS[k].text}\n\n${FACTIONS[k].mechanic}\n\nWeakness: ${FACTIONS[k].weakness}`}">${k === 'random' ? '🎲' : `${FACTIONS[k].icon} ${FACTIONS[k].short}`}</button>`).join('')}</div>`;

// ---------- commanders on a seat ----------
// A seat's commander choice: 'auto' (humans: the first one; bots: one that suits their personality),
// 'none', or a commander id. Humans also pick a profile ('guest' plays without one).
export const seatProfile = o => (o.profile && o.profile !== 'guest' ? getProfile(o.profile) : null);
export function commanderSelect(attr, i, o, faction, bot) {
  const facs = faction === 'random' || !FACTIONS[faction] ? FACTION_ORDER : [faction];
  const prof = bot ? null : seatProfile(o);
  const cur = o.commander || 'auto';
  const opt = (v, label, extra = '') => `<option value="${v}" ${cur === v ? 'selected' : ''} ${extra}>${label}</option>`;
  const list = facs.flatMap(f => COMMANDER_ORDER[f]).map(id => {
    const c = COMMANDERS[id], open = bot || unlocked(prof, id);
    const lvl = bot ? '' : ` · level ${prof ? commanderLevel(prof, id) : 1}`;
    return opt(id, `${c.icon} ${c.name}: ${c.title}${open ? lvl : ' 🔒'}`, open ? `title="${c.text}"` : `disabled title="${unlockText(id)}"`);
  }).join('');
  return `<select data-${attr}="${i}" class="cmd-select" title="Commander: perks that grow with their level (see 🎖️ Commanders on the main menu)">
    ${opt('auto', bot ? '🎲 Commander to suit' : '⭐ First commander')}${list}${opt('none', '— No commander')}</select>`;
}
export function profileSelect(attr, i, o) {
  return `<select data-${attr}="${i}" class="prof-select" title="Whose profile earns the commander XP for this seat">
    ${listProfiles().map(p => `<option value="${p.id}" ${o.profile === p.id ? 'selected' : ''}>👤 ${escName(p.name)}</option>`).join('')}
    <option value="guest" ${o.profile === 'guest' ? 'selected' : ''}>👥 Guest (no XP)</option></select>`;
}
const escName = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
// What the engine gets for a seat's commander once the faction is rolled: { commander, level, mastery }.
export function resolveCommander(o, faction, bot, level1) {
  let id = o.commander || 'auto';
  if (id === 'none') return { commander: null };
  if (id !== 'auto' && COMMANDERS[id]?.faction !== faction) id = 'auto'; // (faction rolled to another one)
  if (bot) return { commander: id };
  const prof = seatProfile(o);
  if (id === 'auto' || !unlocked(prof, id)) id = COMMANDER_ORDER[faction][0];
  const c = seatCommander(prof, id);
  return level1 ? { ...c, level: 1 } : { ...c, level: Math.min(MAX_LEVEL, c.level) };
}
export const myProfileId = () => activeProfile().id;

// Online: each player sends a table of their commanders, { id: [level, mastery, unlocked 1/0] }, and the
// host resolves their choice with it when the game starts (the faction may still be a random roll then).
export function profileTable(prof) {
  return Object.fromEntries(Object.keys(COMMANDERS).map(id => [id, [prof ? commanderLevel(prof, id) : 1, seatCommander(prof, id).mastery || 0, unlocked(prof, id) ? 1 : 0]]));
}
export function resolveFromTable(choice, faction, table, level1) {
  let id = choice || 'auto';
  if (id === 'none') return { commander: null };
  const row = k => (Array.isArray(table?.[k]) ? table[k] : [1, 0, COMMANDER_ORDER[faction]?.[0] === k ? 1 : 0]);
  if (id === 'auto' || COMMANDERS[id]?.faction !== faction || !row(id)[2]) id = COMMANDER_ORDER[faction][0];
  const [lv, ms] = row(id);
  return { commander: id, level: level1 ? 1 : Math.max(1, Math.min(MAX_LEVEL, lv | 0)), mastery: ms ? 1 : 0 };
}
export const commanderTag = (choice, table) => {
  if (choice === 'none') return '— No commander';
  const c = COMMANDERS[choice];
  return c ? `${c.icon} ${c.name} · level ${table?.[choice]?.[0] || 1}` : '⭐ First commander';
};
