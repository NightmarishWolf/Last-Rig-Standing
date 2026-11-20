// The Commanders page (main menu → 🎖️ Commanders): your profiles (switch, create, rename, delete,
// export, import), and every commander's level, XP, perks, exclusive ship and mastery choice.
import { COMMANDERS, COMMANDER_ORDER, EXCLUSIVE_LEVEL, MASTERY_LEVEL, MAX_LEVEL } from '../data/commanders.js';
import { FACTIONS, FACTION_ORDER } from '../data/factions.js';
import { PASSIVE_TEXT, SHIPS } from '../data/ships.js';
import { TECH } from '../data/research.js';
import {
  activeProfile, commanderMastery, createProfile, deleteProfile, exportProfiles, importProfiles, listProfiles,
  progress, renameProfile, setActive, setMastery, unlocked, unlockText,
} from './profile.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
let tab = 'navy';

function shipLine(type) {
  const d = SHIPS[type];
  const acts = (d.actions || []).map(a => `${a.name}${a.range ? ` (range ${a.range}${a.dmg ? `, ${a.dmg} dmg${a.shots > 1 ? ` ×${a.shots}` : ''}` : ''})` : ''}`).join(', ');
  const pas = Object.entries(d.passives || {}).map(([k, v]) => PASSIVE_TEXT[k]?.(v)).filter(Boolean).join('; ');
  return `<div class="cmd-ship"><b>${esc(d.name)}</b> · $${d.cost} · ${d.hp} HP · move ${d.move} · build ${d.build} turns${d.needs ? ` · needs ${esc(TECH[d.needs]?.name)}` : ''}
    <div class="muted small">${esc(acts)}${pas ? ` · ${esc(pas)}` : ''}</div></div>`;
}

function card(prof, id) {
  const c = COMMANDERS[id], open = unlocked(prof, id), pr = progress(prof, id);
  const pct = pr.need ? Math.round(pr.into / pr.need * 100) : 100, m = commanderMastery(prof, id);
  const k = prof.commanders?.[id] || {};
  return `<div class="cmd-card ${open ? '' : 'locked'}">
    <div class="cmd-head"><span class="cmd-icon">${c.icon}</span><div><h3>${c.name}</h3><div class="muted">${c.title}</div></div>
      <div class="cmd-lvl">${open ? `Level <b>${pr.level}</b>` : '🔒'}</div></div>
    <p class="small">${c.text}</p>
    ${open ? `<div class="xp-bar" title="${pr.need ? `${pr.into} / ${pr.need} XP to level ${pr.level + 1}` : 'Max level'}"><i style="width:${pct}%"></i><span>${pr.need ? `${pr.into.toLocaleString()} / ${pr.need.toLocaleString()} XP` : `Max level · ${pr.xp.toLocaleString()} XP`}</span></div>
      <div class="muted small" style="margin-top:4px">${k.games || 0} games · ${k.wins || 0} wins</div>`
    : `<div class="cmd-lock small">${unlockText(id)}</div>`}
    <ol class="cmd-perks">${[...c.perks, ...c.powers.map(w => ({ ...w, power: true }))].sort((a, b) => a.level - b.level || (a.power ? -1 : 1)).map(p => `<li class="${open && pr.level >= p.level ? 'got' : ''} ${p.power ? 'pw' : ''}"><span class="lv">${p.level}</span><div>${p.power ? `<span class="pw-tag">⚡ Power</span> ${p.icon} ` : ''}<b>${p.name}</b> <span class="small">${p.text}${p.power ? ` <span class="muted">(recharges in ${p.cooldown} turns)</span>` : ''}</span>
      ${p.level === EXCLUSIVE_LEVEL && !p.power ? shipLine(c.ship) : ''}</div></li>`).join('')}
      <li class="${open && pr.level >= MASTERY_LEVEL ? 'got' : ''}"><span class="lv">${MASTERY_LEVEL}</span><div><b>Mastery</b> <span class="small">pick one${pr.level >= MASTERY_LEVEL ? ' (you can change it between games)' : ''}:</span>
        <div class="cmd-mastery">${c.mastery.map((x, i) => `<button data-mastery="${id}:${i}" class="${m === i && open && pr.level >= MASTERY_LEVEL ? 'on' : ''}" ${open && pr.level >= MASTERY_LEVEL ? '' : 'disabled'}><b>${x.name}</b><small>${x.text}</small></button>`).join('')}</div></div></li>
    </ol>
  </div>`;
}

export function commandersPage() {
  const prof = activeProfile();
  const others = listProfiles();
  return `<div class="home-card">
    <div class="cmd-top">
      <div><h2>🎖️ Commanders</h2><div class="muted small">Pick a commander for your seat when you set up a game. They level up as you play them (up to ${MAX_LEVEL}): XP for every round, more for winning, more against tougher opponents. Each also has two powers you fire from the game screen.</div></div>
      <div class="prof-box">
        <div class="label">Profile</div>
        <select data-profsel>${others.map(p => `<option value="${p.id}" ${p.id === prof.id ? 'selected' : ''}>👤 ${esc(p.name)}</option>`).join('')}</select>
        <div class="row small-row">
          <button class="ghost" data-profnew>➕ New</button><button class="ghost" data-profren>✏️ Rename</button>
          ${others.length > 1 ? '<button class="ghost danger" data-profdel>🗑 Delete</button>' : ''}
          <button class="ghost" data-profexp title="Save every profile to a file (browser storage can be wiped)">⬇️ Export</button>
          <label class="ghost btn-like" title="Load profiles from an exported file">⬆️ Import<input type="file" accept=".json,application/json" data-profimp hidden></label>
        </div>
        <div class="muted small">${prof.games || 0} games · ${prof.wins || 0} wins${FACTION_ORDER.map(f => prof.factions?.[f] ? ` · ${FACTIONS[f].icon} ${prof.factions[f].wins}/${prof.factions[f].games}` : '').join('')}</div>
      </div>
    </div>
    <div class="seg cmd-tabs">${FACTION_ORDER.map(f => `<button data-cmdtab="${f}" class="${tab === f ? 'on' : ''}">${FACTIONS[f].icon} ${FACTIONS[f].name}</button>`).join('')}</div>
    <div class="muted small" style="margin:6px 0 10px">${FACTIONS[tab].mechanic}</div>
    <div class="cmd-grid">${COMMANDER_ORDER[tab].map(id => card(prof, id)).join('')}</div>
    <div class="row" style="margin-top:16px"><button class="big ghost" data-back>Back</button></div>
  </div>`;
}

export function bindCommanders(h, re, toast) {
  const on = (sel, fn) => h.querySelectorAll(sel).forEach(b => { b.onclick = () => fn(b); });
  on('[data-cmdtab]', b => { tab = b.dataset.cmdtab; re(); });
  on('[data-mastery]', b => { const [id, i] = b.dataset.mastery.split(':'); setMastery(activeProfile().id, id, +i); re(); });
  const sel = h.querySelector('[data-profsel]');
  if (sel) sel.onchange = () => { setActive(sel.value); re(); };
  on('[data-profnew]', () => { const n = prompt('Name for the new profile:', ''); if (n && n.trim()) { setActive(createProfile(n).id); re(); } });
  on('[data-profren]', () => { const p = activeProfile(), n = prompt('Rename this profile:', p.name); if (n && n.trim()) { renameProfile(p.id, n); re(); } });
  on('[data-profdel]', () => { const p = activeProfile(); if (confirm(`Delete the profile "${p.name}" and all its commander progress? This can't be undone (unless you exported it).`)) { deleteProfile(p.id); re(); } });
  on('[data-profexp]', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([exportProfiles()], { type: 'application/json' }));
    a.download = 'last-rig-standing-profiles.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  const imp = h.querySelector('[data-profimp]');
  if (imp) imp.onchange = async () => {
    try { const n = importProfiles(await imp.files[0].text()); toast?.(`Imported ${n} profile${n === 1 ? '' : 's'}.`); re(); }
    catch (e) { toast?.(e.message || 'Could not read that file.'); }
  };
}
