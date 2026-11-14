// The research screen: the whole tech tree, one column per branch, rows by era.
// Click an available tech to research it, click a further-away tech to queue it
// (with everything it needs). Doctrine pairs are marked ⚖: picking one closes the other.
import * as E from '../engine/index.js';
import { BRANCHES, ERA_COST, FUNDING, TECH, TECHS } from '../data/research.js';
import { PLATFORMS, BASE_LEVELS } from '../data/bases.js';
import { SHIPS } from '../data/ships.js';
import { me } from './helpers.js';
import { S } from './state.js';

const ERA_NAMES = { 1: 'Era I', 2: 'Era II', 3: 'Era III', 4: 'Era IV' };
const STAT_NAMES = { move: 'move', hp: 'HP', sight: 'sight', armor: 'armor', oil: 'oil use', cost: 'cost', sonar: 'sonar', jam: 'jamming' };
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
export function closeResearch() { document.getElementById('research').classList.add('hidden'); }
export const researchOpen = () => !document.getElementById('research').classList.contains('hidden');

export function renderResearch() {
  const el = document.getElementById('research');
  if (el.classList.contains('hidden')) return;
  const st = S.st, p = me(), r = st.players[p].research, inc = E.rpIncome(st, p);
  const cur = r.current ? TECH[r.current] : null;
  const left = E.turnsLeft(st, p);
  const queueHtml = r.queue.length ? r.queue.map((id, i) => `<span class="q-item">${i + 1}. ${TECH[id].name} <button class="ghost tiny" data-dequeue="${id}" title="Remove">×</button></span>`).join('') : '<span class="muted">empty: click any tech further down the tree to plan ahead</span>';
  let html = `
    <div class="rs-head">
      <div>
        <h2>🔬 Research</h2>
        <div class="muted small">Click a <b>bright</b> tech to research it now. Click a <b>dim</b> one to queue it, along with everything it needs. ⚖ = doctrine: pick one of the pair, the other closes for good.</div>
      </div>
      <button class="primary" data-close-research>Close (Esc)</button>
    </div>
    <div class="rs-bar">
      <div><b>Now:</b> ${cur ? `${cur.name} · ${r.progress[cur.id] || 0}/${E.techCost(cur.id)} RP · ${left === Infinity ? 'no research income' : `${left} turn${left === 1 ? '' : 's'}`}` : '<span style="color:#ffd666">nothing: pick a tech!</span>'}${r.bank ? ` · ${r.bank} RP banked` : ''}</div>
      <div><b>Income:</b> ${inc.total} RP/turn <span class="muted small">(Admiralty ${inc.admiralty}, labs ${inc.labs}, funding ${inc.funding}${inc.bonus ? `, bonus ${inc.bonus}` : ''})</span></div>
      <div class="fund"><b>Funding:</b> <button data-fund="-1">−</button> ${r.funding || 0} RP <button data-fund="1">+</button> <span class="muted small">$${(r.funding || 0) * FUNDING.costPerRp}/turn ($${FUNDING.costPerRp} per RP)</span></div>
    </div>
    <div class="rs-queue"><b>Queue:</b> ${queueHtml}</div>
    <div class="rs-tree"><svg class="rs-lines"></svg>`;
  for (const [bid, br] of Object.entries(BRANCHES)) {
    html += `<div class="rs-col"><div class="rs-branch">${br.icon} ${br.name}</div>`;
    for (const era of [1, 2, 3, 4]) {
      html += `<div class="rs-era"><div class="rs-era-label">${ERA_NAMES[era]} · ${ERA_COST[era]} RP</div>`;
      for (const t of TECHS.filter(x => x.branch === bid && x.era === era)) {
        const status = E.techStatus(st, p, t.id);
        const qi = r.queue.indexOf(t.id);
        const prog = r.progress[t.id] || 0;
        html += `<div class="tech ${status} ${r.current === t.id ? 'current' : ''} ${qi >= 0 ? 'queued' : ''} ${t.doctrine ? 'doctrine' : ''}" data-tech="${t.id}" title="${t.name}: ${techSummary(t).replace(/"/g, '&quot;')}${t.req.length ? '\nNeeds: ' + t.req.map(q => TECH[q].name).join(', ') : ''}">
          <div class="t-name">${t.doctrine ? '⚖ ' : ''}${t.name}${qi >= 0 ? ` <span class="q-num">${qi + 1}</span>` : ''}</div>
          <div class="t-text">${techSummary(t)}</div>
          ${prog && status !== 'done' ? `<div class="t-prog"><span style="width:${Math.round(prog / E.techCost(t.id) * 100)}%"></span></div>` : ''}
          ${status === 'locked' ? '<div class="t-text" style="color:#f09595">Closed by your doctrine choice</div>' : ''}
        </div>`;
      }
      html += '</div>';
    }
    html += '</div>';
  }
  html += '</div>';
  el.innerHTML = html;
  requestAnimationFrame(drawLines);
}

// Prerequisite lines between tech cards (drawn after layout).
function drawLines() {
  const el = document.getElementById('research');
  const tree = el.querySelector('.rs-tree'), svg = el.querySelector('.rs-lines');
  if (!tree || !svg) return;
  const tb = tree.getBoundingClientRect();
  svg.setAttribute('width', tree.scrollWidth); svg.setAttribute('height', tree.scrollHeight);
  const pos = id => {
    const n = tree.querySelector(`[data-tech="${id}"]`);
    if (!n) return null;
    const r = n.getBoundingClientRect();
    return { x: r.left - tb.left + tree.scrollLeft, y: r.top - tb.top + tree.scrollTop, w: r.width, h: r.height };
  };
  const st = S.st, p = me();
  let out = '';
  for (const t of TECHS) for (const q of t.req) {
    const a = pos(q), b = pos(t.id);
    if (!a || !b) continue;
    const x1 = a.x + a.w / 2, y1 = a.y + a.h, x2 = b.x + b.w / 2, y2 = b.y;
    const done = E.techStatus(st, p, q) === 'done';
    const cross = TECH[q].branch !== t.branch;
    out += `<path d="M${x1},${y1} C${x1},${y1 + 18} ${x2},${y2 - 18} ${x2},${y2}" fill="none" stroke="${done ? 'rgba(127,209,122,.65)' : cross ? 'rgba(159,208,255,.35)' : 'rgba(255,255,255,.22)'}" stroke-width="${done ? 2 : 1.3}" ${cross ? 'stroke-dasharray="4 4"' : ''}/>`;
  }
  svg.innerHTML = out;
}
