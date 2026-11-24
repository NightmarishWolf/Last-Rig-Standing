// ============================================================
// THE CAMPAIGN, on screen: the campaign page (arcs and missions with your best ranks), the mission
// briefing, starting a mission, the comms box above the board (portrait + dialogue + current orders),
// the Goals card, the enemy's scripted turns, and the mission results (rank, rewards, achievements).
// The missions themselves (and their rules) are in js/campaign.
// ============================================================
import { ARCS, MISSIONS, missionOpen } from '../campaign/index.js';
import * as R from '../campaign/runner.js';
import { CHARACTERS, portraitSVG, preloadPortraits } from '../campaign/portraits.js';
import { rankColor } from '../campaign/score.js';
import { COMMANDERS } from '../data/commanders.js';
import { ACHIEVEMENTS } from '../data/achievements.js';
import { A } from './state.js';
import { hideHome, showHome } from './menu.js';
import { stopTimer } from './timer.js';
import { activeProfile, campaignChoices, campaignProgress, dabloons, grantCosmetics, recordMission } from './profile.js';
import { achievementLine, earn } from './achievements.js';
import { closeOverlay, showOverlay } from '../ui/dialogs.js';
import { refresh, setState } from '../ui/index.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const goalText = (def, t) => t.replace('{par}', def.par);
const rankBadge = (r, big = false) => (r ? `<span class="rank-badge ${big ? 'big' : ''}" style="--rc:${rankColor(r)}">${r}</span>` : '');

// ---------- the campaign page ----------
export function campaignPage() {
  preloadPortraits();
  const prof = activeProfile(), prog = campaignProgress(prof);
  const arcs = Object.entries(ARCS).map(([k, arc]) => {
    const slots = [];
    for (let i = 0; i < arc.planned; i++) {
      const id = arc.missions[i], def = id && MISSIONS[id];
      if (!def) { slots.push(`<div class="mission-card soon"><span class="m-num">${i + 1}</span><div><b>Coming soon</b><div class="small muted">Mission ${i + 1} of Part One</div></div></div>`); continue; }
      const open = missionOpen(prog, id), best = prog[id]?.best;
      slots.push(`<button class="mission-card ${open ? '' : 'locked'}" ${open ? `data-mission="${id}"` : 'disabled'}>
        <span class="m-num">${def.n}</span>
        <div class="m-text"><b>${esc(def.title)}</b><div class="small muted">${esc(def.place)} · ${esc(def.date)}</div><div class="small">${esc(def.summary)}</div></div>
        <div class="m-side">${best ? rankBadge(best) : open ? '<span class="small m-new">New</span>' : '🔒'}</div>
      </button>`);
    }
    return `<div class="arc">
      <div class="arc-head"><div><div class="arc-kicker">${esc(arc.subtitle)}</div><h2>⚓ ${esc(arc.name)}</h2></div>
        <div class="small muted arc-count">${arc.missions.filter(id => prog[id]?.best).length} / ${arc.planned} complete</div></div>
      <p class="muted">${esc(arc.blurb)}</p>
      <div class="mission-list">${slots.join('')}</div>
    </div>`;
  }).join('');
  return `<div class="home-card campaign-page">
    <div class="ach-head"><h2 style="margin:0">🎖 Campaign</h2><span class="dabloons" title="Dabloons: for cosmetics in the shop (coming soon)">🪙 ${dabloons(prof).toLocaleString()}</span></div>
    <p class="muted small">2061. The land fields are dry and the last oil lies under the sea. The campaign introduces the factions and teaches the game as you go; each mission is ranked F to S+.</p>
    ${arcs}
    <div class="arc soon-arc"><h3>🏴 Free Tide</h3><p class="muted small">The other side of the war. After the Navy's Part One.</p></div>
    <div class="row" style="margin-top:14px"><button class="big ghost" data-back>← Back</button></div>
  </div>`;
}

// ---------- the briefing ----------
const talkRow = l => {
  const c = CHARACTERS[l.who];
  return `<div class="brief-line"><div class="brief-portrait">${portraitSVG(l.who, l.mood, 72)}</div>
    <div><div class="brief-name">${esc(c?.name || l.who)}${c?.radio ? ' <span class="muted small">(radio)</span>' : ''}</div><div>${esc(l.text)}</div></div></div>`;
};
export function briefingPage(id) {
  const def = MISSIONS[id], best = campaignProgress(activeProfile())[id];
  if (!def) return campaignPage();
  const cmd = COMMANDERS[def.commander.id];
  return `<div class="home-card briefing">
    <div class="brief-top"><div><div class="arc-kicker">${esc(ARCS[def.arc].name)} · Mission ${def.n}</div><h2>${esc(def.title)}</h2>
      <div class="muted small">${esc(def.place)} · ${esc(def.date)} · You command: <b>${cmd.icon} ${esc(CHARACTERS[def.commander.id]?.name || cmd.name)}</b></div></div>
      ${best?.best ? `<div class="brief-best">Best ${rankBadge(best.best, true)}<div class="small muted">${best.score} pts · round ${best.rounds}</div></div>` : ''}</div>
    <div class="brief-cols">
      <div class="brief-talk">${R.briefingOf(def, campaignChoices(activeProfile())).map(talkRow).join('')}</div>
      <div class="brief-goals">
        <h3>Objective</h3><div class="goal main">◆ ${esc(def.goals.main)}</div>
        <h3>Secondary</h3>${def.secondary.map(g => `<div class="goal">◇ <b>${esc(g.name)}</b>: ${esc(goalText(def, g.desc))}</div>`).join('')}
        <h3>Failure</h3><div class="goal muted">✕ ${esc(def.goals.lose)}</div>
        <div class="small muted" style="margin-top:8px">Par: <b>${def.par} rounds</b>. Ranked F to S+ on speed, losses and secondary goals.</div>
        <div class="teach">${def.teaches.map(t => `<span class="chip-t">${esc(t)}</span>`).join('')}</div>
      </div>
    </div>
    <div class="row" style="margin-top:14px"><button class="primary big" data-startmission="${id}">▶ Start mission</button><button class="big ghost" data-campaign>← Campaign</button></div>
  </div>`;
}

export function bindCampaign(h, view) {
  h.querySelectorAll('[data-mission]').forEach(b => b.onclick = () => showHome('briefing', { id: b.dataset.mission }));
  h.querySelectorAll('[data-startmission]').forEach(b => b.onclick = () => startMission(b.dataset.startmission));
  h.querySelectorAll('[data-campaign]').forEach(b => b.onclick = () => showHome('campaign'));
  if (view === 'achievements' || view === 'campaign') h.querySelectorAll('[data-back]').forEach(b => b.onclick = () => showHome('main'));
}

// ---------- playing a mission ----------
let shownOutcome = null, seenAch = 0;
export function startMission(id) {
  stopTimer();
  closeOverlay();
  shownOutcome = null; seenAch = 0;
  A.state = R.newMissionGame(id, { choices: campaignChoices(activeProfile()) });
  A.sessionActive = true;
  hideHome();
  setState(A.state);
}
export const inMission = () => !!A.state?.campaign;

// The comms box above the board: whoever is talking, or your current orders.
function renderComms(st) {
  const el = document.getElementById('coach');
  const def = R.missionOf(st), M = st.campaign;
  el.classList.remove('hidden'); el.classList.add('comms');
  const line = R.currentLine(st), step = R.currentStep(st);
  const who = line ? line.who : 'sato', c = CHARACTERS[who];
  const left = M.queue.length - M.qi;
  const head = `<div class="comms-head"><span>${esc(ARCS[def.arc].name)} · Mission ${def.n}: ${esc(def.title)} · Round ${st.round}</span>
    <span><button class="ghost small-btn" data-cbrief title="The briefing again">Briefing</button></span></div>`;
  let body;
  if (line) {
    body = `<div class="comms-name">${esc(c?.name || who)}${c?.radio ? ' <span class="muted small">· radio</span>' : ''}</div>
      <div class="comms-text">${esc(line.text)}</div>
      ${line.choice ? `<div class="comms-actions comms-choice">${line.choice.options.map(o => `<button class="primary small-btn" data-cpick="${esc(o.id)}">${esc(o.label)}</button>`).join('')}</div>` : `<div class="comms-actions"><button class="primary small-btn" data-cnext>${left > 1 ? 'Next ▸' : 'Continue ▸'} <span class="key-hint">Space</span></button>${left > 2 ? `<button class="ghost small-btn" data-cskip>Skip</button>` : ''}</div>`}`;
  } else if (step?.do && !M.outcome) {
    body = `<div class="comms-name">Orders</div><div class="comms-text orders">▶ ${typeof step.do === 'function' ? step.do(st, M) : step.do}</div>`;
  } else {
    body = `<div class="comms-name">Orders</div><div class="comms-text orders">${esc(R.goalsNow(st).main)}.</div>`;
  }
  el.innerHTML = `<div class="comms-portrait ${line ? 'talking' : 'quiet'}">${portraitSVG(who, line?.mood || 'neutral', 120)}</div><div class="comms-body">${head}${body}</div>`;
  el.querySelector('[data-cnext]')?.addEventListener('click', () => { R.readLine(st); refresh(); });
  el.querySelector('[data-cskip]')?.addEventListener('click', () => { R.skipTalk(st); refresh(); });
  el.querySelectorAll('[data-cpick]').forEach(b => b.addEventListener('click', () => { R.choose(st, b.dataset.cpick); refresh(); }));
  el.querySelector('[data-cbrief]')?.addEventListener('click', () => showBriefingOverlay(def));
}

function showBriefingOverlay(def) {
  showOverlay(`<h2>${esc(def.title)}</h2><div class="brief-talk">${R.briefingOf(def, A.state?.campaign?.choices).map(talkRow).join('')}</div>
    <div class="row" style="margin-top:12px"><button class="primary" data-ok>Back to the mission</button></div>`,
  (card, close) => { card.querySelector('[data-ok]').onclick = close; });
}

// Called after every redraw (like the old tutorial coach): run the mission, show it. True = redraw again.
export function afterRender(st, ui) {
  const el = document.getElementById('coach');
  if (!st.campaign) { el.classList.remove('comms'); return false; }
  const changed = R.update(st, ui);
  // achievements earned during the mission (e.g. a hidden one) pop up right away
  const M = st.campaign;
  if (M.ach.length > seenAch) {
    const prof = activeProfile();
    earn(prof.id, M.ach.slice(seenAch), R.missionOf(st).commander.id);
    seenAch = M.ach.length;
  }
  renderComms(st);
  const step = R.currentStep(st);
  if (step?.spot && !R.currentLine(st)) document.querySelectorAll(step.spot).forEach(b => b.classList.add('pulse'));
  if (M.outcome && shownOutcome !== M.outcome) { shownOutcome = M.outcome; setTimeout(() => showResult(st), 350); }
  return changed;
}

// Space reads the next line of dialogue (Enter still ends your turn)
document.addEventListener('keydown', e => {
  if (e.key !== ' ' || !A.state?.campaign || document.body.classList.contains('at-home')) return;
  if (!document.getElementById('overlay').classList.contains('hidden')) return;
  if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
  if (!R.currentLine(A.state)) return;
  e.preventDefault(); e.stopPropagation();
  R.readLine(A.state); refresh();
}, true);

// The enemy's go: scripted, then straight back to you.
export function campaignHandoff(st) {
  R.enemyTurn(st);
  A.sessionActive = true;
  refresh();
}

// ---------- the result ----------
function showResult(st) {
  const def = R.missionOf(st), M = st.campaign, prof = activeProfile();
  if (M.outcome === 'lost') {
    showOverlay(`<div class="result fail"><div class="arc-kicker">Mission ${def.n}: ${esc(def.title)}</div><h2>Mission failed</h2>
      <p class="muted">${esc(R.goalsNow(st).lose)}.</p>
      <div class="row" style="margin-top:16px"><button class="primary big" data-retry>↻ Retry</button><button class="big ghost" data-camp>Campaign</button></div></div>`,
    (card, close) => bindResult(card, close, def));
    return;
  }
  const res = R.missionResult(st);
  if (!M.awarded) {
    M.awarded = { reward: recordMission(prof.id, def.id, res, def.commander.id) };
    const ids = [def.clearAchievement, ...(res.rank === 'S+' ? ['by-the-book'] : [])].filter(Boolean);
    M.awarded.ach = earn(prof.id, ids, def.commander.id);
    M.awarded.cos = grantCosmetics(prof.id, typeof def.cosmetics === 'function' ? def.cosmetics(st, M) : def.cosmetics);
  }
  const { reward, ach, cos } = M.awarded;
  const cmd = COMMANDERS[def.commander.id];
  const part = (name, v, max, note) => `<div class="score-row"><span>${name}</span><span class="muted small">${note}</span><b>${v} / ${max}</b></div>`;
  showOverlay(`<div class="result">
    <div class="arc-kicker">Mission ${def.n}: ${esc(def.title)} · complete</div>
    <div class="result-top">${rankBadge(res.rank, true)}<div><h2 style="margin:0">${res.score} points</h2>
      <div class="muted small">${reward.newBest ? (reward.prevBest ? `New best! (was ${reward.prevBest})` : 'First clear!') : `Best so far: ${campaignProgress(activeProfile())[def.id].best}`}</div>${res.rankNote ? `<div class="small" style="color:#ffd666">${esc(res.rankNote)}</div>` : ''}</div></div>
    <div class="score-box">
      ${part('Speed', res.parts.speed, 40, `${res.rounds} round${res.rounds === 1 ? '' : 's'} (par ${res.par})`)}
      ${part('Losses', res.parts.losses, 30, `${Math.round(res.keptShare * 100)}% of hull kept${res.shipsLost ? `, ${res.shipsLost} ship${res.shipsLost > 1 ? 's' : ''} lost` : ''}`)}
      ${part('Secondary goals', res.parts.secondary, 30, res.secondary.map(g => `${g.done ? '✓' : '✗'} ${esc(g.name)}`).join(' · '))}
    </div>
    <div class="reward-row">${cmd.icon} ${esc(CHARACTERS[def.commander.id]?.short || cmd.name)} <b>+${reward.xp} XP</b>${reward.level && reward.level.after > reward.level.before ? ` · ⭐ level ${reward.level.after}!` : ''}
      · <b>+${reward.dabloons} 🪙</b> <span class="muted small">(${dabloons(activeProfile()).toLocaleString()} total)</span></div>
    ${(cos || []).map(c => `<div class="reward-row cosmetic">${c.icon} Unlocked: <b>${esc(c.name)}</b> <span class="muted small">${esc(c.desc)} (It'll be in your Locker when the shop opens.)</span></div>`).join('')}
    ${achievementLine([...(ach || []), ...M.ach.filter(id => !(ach || []).some(a => a.id === id)).map(id => ({ id, ...ACHIEVEMENTS[id] }))])}
    <p class="muted small">Rank: S+ 100 and 2 rounds under par · S 90 · A 80 · B 65 · C 50 · D 35 · F below. Rewards pay out when you beat your best rank.</p>
    <div class="row" style="margin-top:12px">${nextId(def) ? `<button class="primary big" data-next="${nextId(def)}">Next: ${esc(MISSIONS[nextId(def)].title)} ▸</button>` : `<button class="primary big" disabled title="Mission ${def.n + 1} is on the way">Next mission (coming soon)</button>`}
      <button class="big" data-retry>↻ Replay</button><button class="big ghost" data-camp>Campaign</button><button class="big ghost" data-stay>View map</button></div>
  </div>`, (card, close) => bindResult(card, close, def));
}
const nextId = def => { const l = ARCS[def.arc].missions; return l[l.indexOf(def.id) + 1] || null; };
function bindResult(card, close, def) {
  card.querySelector('[data-next]')?.addEventListener('click', e => { close(); showHome('briefing', { id: e.currentTarget.dataset.next }); });
  card.querySelector('[data-retry]').onclick = () => { close(); startMission(def.id); };
  card.querySelector('[data-camp]').onclick = () => { close(); showHome('campaign'); };
  card.querySelector('[data-stay]')?.addEventListener('click', close);
}
export const reopenResult = () => { if (A.state?.campaign?.outcome) showResult(A.state); };
