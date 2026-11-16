// The research screen: a compact tech tree of icon tiles (in the style of Mindustry's), one column per
// branch and one band per era. No lines: hovering a tile shows what it does and lights up everything it
// needs in green (and its doctrine rival in red). Click an available tech to research it, click a further-away
// tech to queue it with everything it needs. On touch screens the first tap shows the info, the second picks it.
import * as E from '../engine/index.js';
import { BRANCHES, ERA_COST, FUNDING, TECH, TECHS } from '../data/research.js';
import { PLATFORMS, BASE_LEVELS } from '../data/bases.js';
import { SHIPS } from '../data/ships.js';
import { me } from './helpers.js';
import { S } from './state.js';

const ERA_NAMES = { 1: 'Era I', 2: 'Era II', 3: 'Era III', 4: 'Era IV', 5: 'Era V · Post-Oil' };
const STAT_NAMES = { move: 'move', hp: 'HP', sight: 'sight', armor: 'armor', oil: 'oil use', cost: 'cost', build: 'build time', sonar: 'sonar', jam: 'jamming' };
const PLAYER_TEXT = {
  oilCap: v => `+${v} oil storage`, sellMult: v => `oil sells for ${Math.round((v - 1) * 100)}% more`, priceDropMult: v => `selling drops the price ${Math.round((1 - v) * 100)}% slower`,
  upkeepMult: v => `${Math.round((1 - v) * 100)}% less upkeep`, surveyRadius: v => `+${v} survey radius`, rigRate: v => `every rig pumps +${v}`,
  reservesMult: v => `new rigs tap ${Math.round((v - 1) * 100)}% more oil`, portRange: v => `ports launch +${v} squares further`,
  claimRadius: v => `bigger base claims (+${v} radius)`, slots: v => `+${v} platform slot${v > 1 ? 's' : ''} per base`,
  platformCostMult: v => `platforms cost ${Math.round((1 - v) * 100)}% less`, platformHpMult: v => v >= 1 ? `platforms +${Math.round((v - 1) * 100)}% HP` : `platforms ${Math.round((1 - v) * 100)}% less HP`,
  platformUpkeepMult: v => (v === 0 ? 'no platform upkeep' : `platform upkeep −${Math.round((1 - v) * 100)}%`), baseCostMult: v => `new bases cost ${Math.round((1 - v) * 100)}% less`,
  rp: v => `+${v} research per turn`, heal: v => `ships in your claims heal +${v}/turn`, baseSight: v => `bases see +${v} further`,
  stealth: v => `enemies see your ships ${v} square closer`, flashExact: () => 'see exactly where enemy shots come from',
  platformRange: v => `gun platforms +${v} range`, platformRepair: v => `platforms repair ${v} HP/turn`,
  deepLayers: v => `dry rigs drill ${v} layer${v > 1 ? 's' : ''} deeper`, pumpBonus: v => `Pump Stations +${v} oil`,
};

export function techSummary(t) {
  if (t.text) return t.text;
  const parts = [];
  for (const e of t.effects) {
    if (e.ship) {
      const who = { all: 'all ships', light: 'light ships', escort: 'escorts', sub: 'subs', capital: 'capital ships', support: 'support ships' }[e.ship] || SHIPS[e.ship]?.name;
      parts.push(e.add ? `${who} ${e.add > 0 ? '+' : ''}${e.add} ${STAT_NAMES[e.stat]}` : `${who} ${STAT_NAMES[e.stat]} ×${e.mult}`);
    } else if (e.weapon) {
      const who = { all: 'all weapons', gun: 'guns', torpedo: 'torpedoes', missile: 'missiles', air: 'airstrikes', depth: 'depth charges', scan: 'scans' }[e.weapon];
      parts.push(`${who} +${e.add} ${e.stat === 'dmg' ? 'damage' : e.stat}`);
    } else if (e.player) parts.push(PLAYER_TEXT[e.player](e.add ?? e.mult));
  }
  const u = t.unlocks;
  if (u.ships) parts.push('unlocks ' + u.ships.map(s => SHIPS[s].name).join(', '));
  if (u.platforms) parts.push('platforms: ' + u.platforms.map(k => PLATFORMS[k].name).join(', '));
  if (u.port) parts.push('build forward ports');
  if (u.baseLevel) parts.push(`upgrade bases to ${BASE_LEVELS[u.baseLevel].name}`);
  return parts.join('; ');
}

export function openResearch() {
  const el = document.getElementById('research');
  el.classList.remove('hidden');
  renderResearch();
}
export function closeResearch() { document.getElementById('research').classList.add('hidden'); hideTip(); }
export const researchOpen = () => !document.getElementById('research').classList.contains('hidden');

// ---------- icons ----------
const PLATFORM_ICON = { lab: '🔬', pump: '⛽', gun: '🔫', radar: '📡', drydock: '🛠️', refinery: '🏭', helipad: '🚁', aa: '🎯', cruise: '🚀',
  airbase: '🛩️', missile: '🚀', fusion: '⚛️', quarters: '🏠', wellhead: '🛢️', storage: '🛢️' };
const SHIP_STAT_ICON = { move: '⚡', hp: '❤️', armor: '🛡️', sight: '👁️', oil: '⛽', cost: '💲', build: '⏱️', sonar: '🔊', jam: '📻' };
const WEAPON_STAT_ICON = { dmg: '💥', range: '🎯', shots: '🔁' };
const PLAYER_ICON = { oilCap: '🛢️', sellMult: '💰', priceDropMult: '📈', upkeepMult: '💵', surveyRadius: '🔍', rigRate: '⛽', reservesMult: '🛢️',
  portRange: '⚓', claimRadius: '📐', slots: '🧩', platformCostMult: '💲', platformHpMult: '🧱', platformUpkeepMult: '💵', baseCostMult: '🏗️',
  rp: '🧪', heal: '➕', baseSight: '👁️', stealth: '🌫️', flashExact: '🔦', platformRange: '🎯', platformRepair: '🔧', deepLayers: '⛏️', pumpBonus: '⛽' };
export function techIcon(t) {
  const u = t.unlocks;
  if (t.branch === 'future') return '⚛️';
  if (u.ships) return SHIPS[u.ships[0]].cls === 'sub' ? '🌊' : SHIPS[u.ships[0]].cls === 'capital' ? '⚓' : '🚢';
  if (u.platforms) return PLATFORM_ICON[u.platforms[0]] || '🏗️';
  if (u.baseLevel) return '🏗️';
  if (u.port) return '⚓';
  const e = t.effects[0];
  if (!e) return BRANCHES[t.branch].icon;
  if (e.ship) return SHIP_STAT_ICON[e.stat] || '🚢';
  if (e.weapon) return e.weapon === 'scan' ? '📡' : WEAPON_STAT_ICON[e.stat] || '💥';
  return PLAYER_ICON[e.player] || BRANCHES[t.branch].icon;
}

// ---------- layout ----------
// Tiles sit in a grid cell per branch × era. Inside a cell they're ordered so a tech sits under the
// techs it needs from the same branch (like a tree), without drawing any lines.
let layoutCache = null;
function layout() {
  if (layoutCache) return layoutCache;
  const cells = {};
  for (const bid of Object.keys(BRANCHES)) {
    const pos = {}; // tech id -> 0..1 position across its cell
    for (const era of [1, 2, 3, 4, 5]) {
      const list = TECHS.filter(t => t.branch === bid && t.era === era);
      if (!list.length) continue;
      const key = t => { const own = t.req.filter(q => pos[q] != null); return own.length ? own.reduce((a, q) => a + pos[q], 0) / own.length : (list.indexOf(t) + 0.5) / list.length; };
      const sorted = [...list].sort((a, b) => key(a) - key(b));
      sorted.forEach((t, i) => { pos[t.id] = (i + 0.5) / sorted.length; });
      cells[bid + ':' + era] = sorted;
    }
  }
  return (layoutCache = cells);
}
// every tech a tech needs, all the way down (direct ones flagged)
function ancestors(id) {
  const out = new Map();
  const walk = (x, direct) => { for (const q of TECH[x].req) { if (!out.has(q) || direct) out.set(q, out.get(q) || direct); walk(q, false); } };
  walk(id, true);
  return out;
}

// ---------- rendering ----------
export function renderResearch() {
  const el = document.getElementById('research');
  if (el.classList.contains('hidden')) return;
  const st = S.st, p = me(), r = st.players[p].research, inc = E.rpIncome(st, p);
  const cur = r.current ? TECH[r.current] : null;
  const left = E.turnsLeft(st, p);
  const queueHtml = r.queue.length ? r.queue.map((id, i) => `<span class="q-item">${techIcon(TECH[id])} ${i + 1}. ${TECH[id].name} <button class="ghost tiny" data-dequeue="${id}" title="Remove">×</button></span>`).join('') : '<span class="muted">empty: click any dim tech to plan ahead</span>';
  const cells = layout();
  const branches = Object.entries(BRANCHES);
  let html = `
    <div class="rs-head">
      <div>
        <h2>🔬 Research</h2>
        <div class="muted small">Hover a tech to see what it does: everything it needs lights up <b style="color:#7fd17a">green</b>. Click a <b>bright</b> tech to research it, a <b>dim</b> one to queue it with everything it needs. ⚖ = doctrine: picking one closes its rival (shown in red) for good.</div>
      </div>
      <button class="primary" data-close-research>Close (Esc)</button>
    </div>
    <div class="rs-bar">
      <div><b>Now:</b> ${cur ? `${techIcon(cur)} ${cur.name} · ${r.progress[cur.id] || 0}/${E.techCost(cur.id)} RP · ${left === Infinity ? 'no research income' : `${left} turn${left === 1 ? '' : 's'}`}` : '<span style="color:#ffd666">nothing: pick a tech!</span>'}${r.bank ? ` · ${r.bank} RP banked` : ''}</div>
      <div><b>Income:</b> ${inc.total} RP/turn <span class="muted small">(Admiralty ${inc.admiralty}, labs ${inc.labs}, funding ${inc.funding}${inc.bonus ? `, bonus ${inc.bonus}` : ''})</span></div>
      <div class="fund"><b>Funding:</b> <button data-fund="-1">−</button> ${r.funding || 0} RP <button data-fund="1">+</button> <span class="muted small">$${(r.funding || 0) * FUNDING.costPerRp}/turn ($${FUNDING.costPerRp} per RP)</span></div>
    </div>
    <div class="rs-queue"><b>Queue:</b> ${queueHtml}</div>
    <div class="rs-grid" style="grid-template-columns: 74px repeat(${branches.length}, minmax(0, 1fr))">
      <div></div>${branches.map(([, br]) => `<div class="rs-branch"><span class="rs-bicon">${br.icon}</span>${br.name}</div>`).join('')}`;
  for (const era of [1, 2, 3, 4, 5]) {
    html += `<div class="rs-era-label">${ERA_NAMES[era].replace(' · ', '<br>')}<small>${ERA_COST[era]} RP</small></div>`;
    for (const [bid] of branches) {
      const list = cells[bid + ':' + era] || [];
      html += `<div class="rs-cell ${era % 2 ? 'odd' : ''}">${list.map(t => tile(st, p, r, t)).join('')}</div>`;
    }
  }
  html += `</div><div class="rs-tip hidden"></div>`;
  el.innerHTML = html;
  if (S.rsHover && TECH[S.rsHover]) highlight(S.rsHover, false);
}

function tile(st, p, r, t) {
  const status = E.techStatus(st, p, t.id);
  const qi = r.queue.indexOf(t.id);
  const prog = r.progress[t.id] || 0;
  const pct = status === 'done' ? 100 : Math.round(prog / E.techCost(t.id) * 100);
  return `<button class="node ${status} ${r.current === t.id ? 'current' : ''} ${qi >= 0 ? 'queued' : ''}" data-tech="${t.id}" aria-label="${t.name}">
    <span class="n-icon">${techIcon(t)}</span>
    ${t.doctrine ? '<span class="n-doc">⚖</span>' : ''}
    ${qi >= 0 ? `<span class="n-q">${qi + 1}</span>` : ''}
    ${pct > 0 && status !== 'done' ? `<span class="n-prog" style="width:${pct}%"></span>` : ''}
  </button>`;
}

// ---------- hover: info + highlighting ----------
const STATUS_TEXT = {
  done: '<span style="color:#7fd17a">✓ Researched</span>', available: '<span style="color:#9fd0ff">Ready: click to research</span>',
  blocked: '<span class="muted">Click to queue it with everything it needs</span>', locked: '<span style="color:#f09595">Closed by your doctrine choice</span>',
};
function highlight(id, showTip = true) {
  const el = document.getElementById('research');
  el.querySelectorAll('.node.req, .node.req-direct, .node.rival, .node.hover').forEach(n => n.classList.remove('req', 'req-direct', 'rival', 'hover'));
  if (!id) return;
  const t = TECH[id], st = S.st, p = me();
  const anc = ancestors(id);
  for (const [q, direct] of anc) el.querySelector(`[data-tech="${q}"]`)?.classList.add('req', ...(direct ? ['req-direct'] : []));
  if (t.doctrine) for (const o of TECHS) if (o.doctrine === t.doctrine && o.id !== id) el.querySelector(`[data-tech="${o.id}"]`)?.classList.add('rival');
  const node = el.querySelector(`[data-tech="${id}"]`);
  node?.classList.add('hover');
  if (!showTip || !node) return;
  const status = E.techStatus(st, p, id);
  const missing = [...anc.keys()].filter(q => E.techStatus(st, p, q) !== 'done');
  const rivals = t.doctrine ? TECHS.filter(o => o.doctrine === t.doctrine && o.id !== id) : [];
  const tip = el.querySelector('.rs-tip');
  tip.innerHTML = `
    <div class="tip-title">${techIcon(t)} ${t.name}</div>
    <div class="muted small">${BRANCHES[t.branch].icon} ${BRANCHES[t.branch].name} · ${ERA_NAMES[t.era]} · ${E.techCost(id)} RP</div>
    <div class="tip-text">${techSummary(t)}</div>
    ${t.req.length ? `<div class="tip-needs"><b>Needs:</b> ${t.req.map(q => `<span class="${E.techStatus(st, p, q) === 'done' ? 'ok' : 'no'}">${E.techStatus(st, p, q) === 'done' ? '✓' : '✗'} ${TECH[q].name}</span>`).join(' ')}</div>` : ''}
    ${missing.length > t.req.filter(q => E.techStatus(st, p, q) !== 'done').length ? `<div class="muted small">${missing.length} techs to research first in all</div>` : ''}
    ${rivals.length ? `<div class="small" style="color:#f0b48a">⚖ Doctrine: researching this closes ${rivals.map(o => o.name).join(', ')} for good.</div>` : ''}
    <div class="small" style="margin-top:4px">${STATUS_TEXT[status] || ''}</div>`;
  tip.classList.remove('hidden');
  // next to the tile, flipped to stay on screen
  const b = node.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
  let x = b.right + 10, y = b.top;
  if (x + tw > innerWidth - 8) x = b.left - tw - 10;
  if (x < 8) x = Math.max(8, Math.min(innerWidth - tw - 8, b.left));
  if (y + th > innerHeight - 8) y = innerHeight - th - 8;
  tip.style.left = x + 'px'; tip.style.top = Math.max(8, y) + 'px';
}
function hideTip() { document.querySelector('#research .rs-tip')?.classList.add('hidden'); }

// touch screens: the first tap on a tech only shows its info
let lastPointer = 'mouse';
export const researchTapIsPreview = id => { if (lastPointer !== 'touch' || S.rsHover === id) return false; S.rsHover = id; highlight(id); return true; };

const rsEl = document.getElementById('research');
rsEl?.addEventListener('pointerdown', e => { lastPointer = e.pointerType; });
rsEl?.addEventListener('mouseover', e => {
  const n = e.target.closest('[data-tech]');
  const id = n?.dataset.tech || null;
  if (id === S.rsHover && id) return;
  if (lastPointer === 'touch') return;
  S.rsHover = id;
  if (id) highlight(id); else { highlight(null); hideTip(); }
});
rsEl?.addEventListener('mouseleave', () => { if (lastPointer !== 'touch') { S.rsHover = null; highlight(null); hideTip(); } });
rsEl?.addEventListener('scroll', hideTip);
