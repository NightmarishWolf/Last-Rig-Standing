// ============================================================
// Achievements: which a finished skirmish game earns, the Achievements page, and the pop-up when you
// unlock one. The list itself is in js/data/achievements.js; campaign ones are given by the missions.
// ============================================================
import { ACHIEVEMENTS, ACHIEVEMENT_GROUPS } from '../data/achievements.js';
import { COMMANDERS } from '../data/commanders.js';
import { activeProfile, commanderLevel, dabloons, grantAchievements } from './profile.js';
import { play } from '../ui/sound.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

// What player p earned in a finished (non-campaign) game.
export function skirmishAchievements(st, p, prof) {
  const pl = st.players[p], won = st.winner === p, s = pl.stats || {};
  const foes = st.players.filter((o, i) => i !== p);
  const bots = foes.filter(o => o.seat === 'ai');
  const ids = [];
  if (won) ids.push('first-win', pl.faction === 'tide' ? 'win-tide' : 'win-navy');
  if (won && bots.some(o => ['hard', 'admiral'].includes(o.ai?.difficulty))) ids.push('beat-hard');
  if (won && bots.length && st.round <= 30) ids.push('quick-war');
  if (won && st.winReason === 'lastrig') ids.push('last-drop');
  if (won && (s.shipsRepossessed || 0) > 0) ids.push('back-in-black');
  if ((s.captures || 0) > 0) ids.push('prize-crew');
  if (Object.keys(COMMANDERS).some(id => commanderLevel(prof, id) >= 15)) ids.push('living-legend');
  return ids;
}

// Grant and announce: returns what was newly earned.
export function earn(profId, ids, commander) {
  const got = grantAchievements(profId, ids, commander);
  if (got.length) achievementPopup(got);
  return got;
}

// A pop-up in the corner, one per achievement.
export function achievementPopup(list) {
  let box = document.getElementById('ach-pop');
  if (!box) { box = document.createElement('div'); box.id = 'ach-pop'; document.body.appendChild(box); }
  list.forEach((a, i) => setTimeout(() => {
    const el = document.createElement('div');
    el.className = 'ach-toast';
    el.innerHTML = `<span class="ach-icon">${a.icon}</span><div><div class="ach-kicker">${a.hidden ? 'Hidden achievement unlocked!' : 'Achievement unlocked'}</div>
      <b>${esc(a.name)}</b><div class="small">${esc(a.desc)}</div>
      <div class="ach-reward">${a.xp ? `+${a.xp} XP · ` : ''}+${a.dabloons} 🪙</div></div>`;
    box.appendChild(el);
    try { play('chime'); } catch { /* sound off */ }
    setTimeout(() => el.classList.add('gone'), 5200);
    setTimeout(() => el.remove(), 6000);
  }, i * 900));
}

// A short line for the game over page and the mission results.
export const achievementLine = got => (got?.length ? `<div class="ach-earned">${got.map(a => `<span class="ach-chip" title="${esc(a.desc)}">${a.icon} <b>${esc(a.name)}</b> <span class="muted small">${a.xp ? `+${a.xp} XP · ` : ''}+${a.dabloons} 🪙</span></span>`).join('')}</div>` : '');

// ---------- the Achievements page ----------
export function achievementsPage() {
  const prof = activeProfile(), have = prof.achievements || {};
  const all = Object.entries(ACHIEVEMENTS);
  const n = all.filter(([id]) => have[id]).length;
  const groups = Object.entries(ACHIEVEMENT_GROUPS).map(([g, gname]) => {
    const rows = all.filter(([, a]) => a.group === g).map(([id, a]) => {
      const got = have[id], secret = a.hidden && !got;
      return `<div class="ach-row ${got ? 'got' : ''} ${secret ? 'secret' : ''}">
        <span class="ach-icon">${secret ? '❔' : a.icon}</span>
        <div class="ach-text"><b>${secret ? '???' : esc(a.name)}</b><div class="small muted">${secret ? 'Hidden achievement. Keep playing to find it.' : esc(a.desc)}</div></div>
        <div class="ach-side">${got ? `<span class="ach-date">✓ ${new Date(got).toLocaleDateString()}</span>` : ''}<span class="small muted">${a.xp ? `${a.xp} XP · ` : ''}${a.dabloons} 🪙</span></div>
      </div>`;
    }).join('');
    return `<h3 class="ach-group">${gname}</h3><div class="ach-list">${rows}</div>`;
  }).join('');
  return `<div class="home-card ach-page">
    <div class="ach-head"><h2>🏅 Achievements</h2>
      <div class="ach-totals"><span>${n} / ${all.length} earned</span><span class="dabloons" title="Dabloons: spend them on cosmetics in the shop (coming soon)">🪙 ${dabloons(prof).toLocaleString()} Dabloons</span></div></div>
    <p class="muted small">${esc(prof.name)}'s profile. Achievement XP goes to the commander you were playing when you earned it.</p>
    ${groups}
    <div class="row" style="margin-top:14px"><button class="big ghost" data-back>← Back</button></div>
  </div>`;
}
