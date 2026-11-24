// ============================================================
// RTS · the research screen (Tab): the turn-based game's tech tree layout (one column per branch, one band
// per era, icon tiles, hover for what a tech does with everything it needs lit up green), with research in
// seconds. Click a bright tech to research it now, a dim one to queue it with everything it needs.
// The game keeps running while it's open (Space still pauses).
// ============================================================
import { BRANCHES, ERA_COST, FUNDING, TECH, TECHS } from '../data/research.js';
import { PLATFORMS, BASE_LEVELS } from '../data/bases.js';
import { SHIPS, forFaction } from '../data/ships.js';
import { status, has, mineOf, techCost, rpIncome, etaOf, setResearch, queueResearch, dequeueResearch, setFunding } from './tech.js';
import { TURN } from './data.js';

const ERA_NAMES = { 1: 'Era I', 2: 'Era II', 3: 'Era III', 4: 'Era IV', 5: 'Era V · Post-Oil' };
const STAT_NAMES = { move: 'speed', hp: 'HP', sight: 'sight', armor: 'armor', oil: 'oil cost', cost: 'cost', build: 'build time', sonar: 'sonar', jam: 'jamming', upkeepMult: 'upkeep' };
// (what each player-wide research effect does in the real-time game; "—" = not in the real-time game yet)
const PLAYER_TEXT = {
  oilCap: v => `+${v * 3} oil storage`, sellMult: v => `oil sells for ${Math.round((v - 1) * 100)}% more`, priceDropMult: v => `selling drops the price ${Math.round((1 - v) * 100)}% slower`,
  upkeepMult: v => `${Math.round((1 - v) * 100)}% less ship upkeep`, surveyRadius: v => `workers see +${v} further`, rigRate: v => `every rig pumps +${(v * 2 / TURN).toFixed(2)}/s`,
  reservesMult: v => `new rigs tap ${Math.round((v - 1) * 100)}% more oil`, portRange: () => '— (no forward ports in real time yet)',
  claimRadius: v => `bigger base claims (+${v} radius)`, slots: v => `+${v} platform slot${v > 1 ? 's' : ''} per base`,
  platformCostMult: v => `platforms cost ${Math.round((1 - v) * 100)}% less`, platformHpMult: v => v >= 1 ? `platforms +${Math.round((v - 1) * 100)}% HP` : `platforms ${Math.round((1 - v) * 100)}% less HP`,
  platformUpkeepMult: v => (v === 0 ? 'no platform upkeep' : `platform upkeep −${Math.round((1 - v) * 100)}%`), baseCostMult: v => `new bases and upgrades cost ${Math.round((1 - v) * 100)}% less`,
  rp: v => `+${v} research a turn`, heal: v => `ships in your claims heal ${v} HP a turn`, baseSight: v => `bases and platforms see +${v} further`,
  stealth: v => `enemies must come ${v} square closer to see your ships`, flashExact: () => '— (no muzzle flashes in real time)',
  platformRange: v => `gun platforms +${v} range`, platformRepair: v => `platforms repair ${v} HP a turn`,
  deepLayers: v => `dry rigs drill ${v} layer${v > 1 ? 's' : ''} deeper`, pumpBonus: v => `Pump Stations pump more (+${v} a turn)`,
  tideRadius: v => `the Tide reaches +${v} further`, tideMax: v => `the Tide grows +${v} bigger`, tideHeal: v => `ships on the Tide heal +${v} a turn`,
  tideMove: v => `ships on the Tide sail faster (+${v})`, tideOilMult: () => '— (ships burn no oil sailing in real time)',
  tideShip: v => `Leviathans spread the Tide +${v}`, packBonus: () => '— (Skiff Packs come later)', plunderMult: () => '— (plunder comes later)',
  plunderRange: () => '— (plunder comes later)', boardShare: () => '— (boarding comes later)',
};
const turnsToSecs = t => t.replace(/(\d+) turns?/g, (m, n) => `${n * TURN}s`);

export function techSummary(t, side) {
  if (t.text) return turnsToSecs(t.text);
  const parts = [];
  for (const e of t.effects) {
    if (e.ship) {
      const who = { all: 'all ships', light: 'light ships', escort: 'escorts', sub: 'subs', capital: 'capital ships', support: 'support ships' }[e.ship] || SHIPS[e.ship]?.name;
      parts.push(e.add ? `${who} ${e.add > 0 ? '+' : ''}${e.stat === 'build' ? e.add * TURN + 's' : e.add} ${STAT_NAMES[e.stat]}` : `${who} ${STAT_NAMES[e.stat]} ×${e.mult}`);
    } else if (e.weapon) {
      const who = { all: 'all weapons', gun: 'guns', torpedo: 'torpedoes', missile: 'missiles', air: 'airstrikes', depth: 'depth charges', scan: 'scans', fire: 'fireships' }[e.weapon];
      parts.push(`${who} +${e.add} ${e.stat === 'dmg' ? 'damage' : e.stat}`);
    } else if (e.player) parts.push(PLAYER_TEXT[e.player]?.(e.add ?? e.mult) || e.player);
  }
  const u = t.unlocks;
  const ships = (u.ships || []).filter(s => forFaction(s, side));
  if (ships.length) parts.push('unlocks ' + ships.map(s => SHIPS[s].name).join(', '));
  if (u.platforms) parts.push('platforms: ' + u.platforms.map(k => PLATFORMS[k].name).join(', '));
  if (u.port) parts.push('— (forward ports come later)');
  if (u.baseLevel) parts.push(`upgrade bases to ${BASE_LEVELS[u.baseLevel].name}`);
  return parts.join('; ');
}

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
  if (u.ships && t.branch !== 'prop' && t.branch !== 'drill') return SHIPS[u.ships[0]].cls === 'sub' ? '🌊' : SHIPS[u.ships[0]].cls === 'capital' ? '⚓' : '🚢';
  if (u.platforms) return PLATFORM_ICON[u.platforms[0]] || '🏗️';
  if (u.baseLevel) return '🏗️';
  if (u.port) return '⚓';
  const e = t.effects[0];
  if (!e) return BRANCHES[t.branch].icon;
  if (e.ship) return SHIP_STAT_ICON[e.stat] || '🚢';
  if (e.weapon) return e.weapon === 'scan' ? '📡' : WEAPON_STAT_ICON[e.stat] || '💥';
  return PLAYER_ICON[e.player] || BRANCHES[t.branch].icon;
}
const secs = s => (s === Infinity ? 'no research coming in' : s >= 60 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : `${Math.ceil(s)}s`);

// ---------- layout ----------
const branchesFor = side => Object.entries(BRANCHES).filter(([, b]) => !b.faction || b.faction === side);
const layouts = {};
function layout(side) {
  if (layouts[side]) return layouts[side];
  const cells = {};
  for (const [bid] of branchesFor(side)) {
    const pos = {};
    for (const era of [1, 2, 3, 4, 5]) {
      const list = TECHS.filter(t => t.branch === bid && t.era === era && !t.polar);
      if (!list.length) continue;
      const key = t => { const own = t.req.filter(q => pos[q] != null); return own.length ? own.reduce((a, q) => a + pos[q], 0) / own.length : (list.indexOf(t) + 0.5) / list.length; };
      const sorted = [...list].sort((a, b) => key(a) - key(b));
      sorted.forEach((t, i) => { pos[t.id] = (i + 0.5) / sorted.length; });
      cells[bid + ':' + era] = sorted;
    }
  }
  return (layouts[side] = cells);
}

// ---------- the screen ----------
// R = { G, team, say }: the match, whose research, and how to show a message
let R = null, hover = null, sig = '';
const el = () => document.getElementById('research');
export const researchOpen = () => !el().classList.contains('hidden');
export function openResearch(ctx) { R = ctx; el().classList.remove('hidden'); sig = ''; renderResearch(true); }
export function closeResearch() { el().classList.add('hidden'); el().querySelector('.rs-tip')?.classList.add('hidden'); }

export function renderResearch(force) {
  if (!R || !researchOpen()) return;
  const { G, team } = R, P = G.players[team], r = P.research, side = P.side, inc = rpIncome(G, team);
  const s = JSON.stringify([r.current, Math.floor((r.progress[r.current] || 0)), r.queue, Object.keys(r.done).length, r.funding, inc.total]);
  if (!force && s === sig) return; sig = s;
  const cur = r.current ? TECH[r.current] : null;
  const queueHtml = r.queue.length ? r.queue.map((id, i) => `<span class="q-item">${techIcon(TECH[id])} ${i + 1}. ${TECH[id].name} <button class="ghost tiny" data-dequeue="${id}" title="Remove">×</button></span>`).join('') : '<span class="muted">empty: click any dim tech to plan ahead</span>';
  const cells = layout(side), branches = branchesFor(side);
  let html = `
    <div class="rs-head">
      <div><h2>🔬 Research</h2>
        <div class="muted small">The game keeps running (Space pauses). Hover a tech to see what it does: everything it needs lights up <b style="color:#7fd17a">green</b>. Click a <b>bright</b> tech to research it, a <b>dim</b> one to queue it with everything it needs. ⚖ = doctrine: picking one closes its rival (red) for good.</div></div>
      <button class="primary" data-close-research>Close (Tab)</button>
    </div>
    <div class="rs-bar">
      <div><b>Now:</b> ${cur ? `${techIcon(cur)} ${cur.name} · ${Math.floor(r.progress[cur.id] || 0)}/${techCost(cur.id)} · ${secs(etaOf(G, team))}` : '<span style="color:#ffd666">nothing: pick a tech!</span>'}</div>
      <div><b>Research:</b> ${(inc.total / TURN * 60).toFixed(0)}/min <span class="muted small">(Admiralty ${inc.admiralty}, labs ${inc.labs}, funding ${inc.funding}${inc.bonus ? `, bonus ${inc.bonus}` : ''} a turn of ${TURN}s)</span></div>
      <div class="fund"><b>Funding:</b> <button data-fund="-2">−</button> ${r.funding || 0} <button data-fund="2">+</button> <span class="muted small">$${((r.funding || 0) * FUNDING.costPerRp / TURN * 60).toFixed(0)}/min</span></div>
    </div>
    <div class="rs-queue"><b>Queue:</b> ${queueHtml}</div>
    <div class="rs-grid" style="grid-template-columns: 74px repeat(${branches.length}, minmax(0, 1fr))">
      <div></div>${branches.map(([, br]) => `<div class="rs-branch"><span class="rs-bicon">${br.icon}</span>${br.name}</div>`).join('')}`;
  for (const era of [1, 2, 3, 4, 5]) {
    html += `<div class="rs-era-label">${ERA_NAMES[era].replace(' · ', '<br>')}<small>${ERA_COST[era]} pts</small></div>`;
    for (const [bid] of branches) html += `<div class="rs-cell ${era % 2 ? 'odd' : ''}">${(cells[bid + ':' + era] || []).map(t => tile(G, team, r, t)).join('')}</div>`;
  }
  html += '</div><div class="rs-tip hidden"></div>';
  el().innerHTML = html;
  if (hover) highlight(hover);
}
function tile(G, team, r, t) {
  const st = status(G, team, t.id), qi = r.queue.indexOf(t.id), pct = st === 'done' ? 100 : Math.round((r.progress[t.id] || 0) / techCost(t.id) * 100);
  return `<button class="node ${st} ${r.current === t.id ? 'current' : ''} ${qi >= 0 ? 'queued' : ''}" data-tech="${t.id}" aria-label="${t.name}">
    <span class="n-icon">${techIcon(t)}</span>${t.doctrine ? '<span class="n-doc">⚖</span>' : ''}${qi >= 0 ? `<span class="n-q">${qi + 1}</span>` : ''}
    ${pct > 0 && st !== 'done' ? `<span class="n-prog" style="width:${pct}%"></span>` : ''}</button>`;
}
function ancestors(id) {
  const out = new Map(), { G, team } = R;
  const walk = (x, direct) => { for (const q0 of TECH[x].req) { const q = mineOf(G, team, q0); if (!out.has(q) || direct) out.set(q, out.get(q) || direct); walk(q, false); } };
  walk(id, true); return out;
}
const STATUS_TEXT = { done: '<span style="color:#7fd17a">✓ Researched</span>', available: '<span style="color:#9fd0ff">Ready: click to research</span>',
  blocked: '<span class="muted">Click to queue it with everything it needs</span>', locked: '<span style="color:#f09595">Closed to you</span>' };
function highlight(id) {
  const root = el();
  root.querySelectorAll('.node.req, .node.req-direct, .node.rival, .node.hover').forEach(n => n.classList.remove('req', 'req-direct', 'rival', 'hover'));
  const tip = root.querySelector('.rs-tip');
  if (!id) { tip?.classList.add('hidden'); return; }
  const { G, team } = R, t = TECH[id], anc = ancestors(id);
  for (const [q, direct] of anc) root.querySelector(`[data-tech="${q}"]`)?.classList.add('req', ...(direct ? ['req-direct'] : []));
  if (t.doctrine) for (const o of TECHS) if (o.doctrine === t.doctrine && o.id !== id) root.querySelector(`[data-tech="${o.id}"]`)?.classList.add('rival');
  const node = root.querySelector(`[data-tech="${id}"]`); node?.classList.add('hover');
  if (!node || !tip) return;
  const st = status(G, team, id), rivals = t.doctrine ? TECHS.filter(o => o.doctrine === t.doctrine && o.id !== id) : [];
  const rate = rpIncome(G, team).total / TURN;
  tip.innerHTML = `<div class="tip-title">${techIcon(t)} ${t.name}</div>
    <div class="muted small">${BRANCHES[t.branch].icon} ${BRANCHES[t.branch].name} · ${ERA_NAMES[t.era]} · ${techCost(id)} pts${rate > 0 && st !== 'done' ? ` · about ${secs((techCost(id) - (R.G.players[team].research.progress[id] || 0)) / rate)} on its own` : ''}</div>
    <div class="tip-text">${techSummary(t, G.players[team].side)}</div>
    ${t.req.length ? `<div class="tip-needs"><b>Needs:</b> ${t.req.map(q0 => mineOf(G, team, q0)).map(q => `<span class="${has(G, team, q) ? 'ok' : 'no'}">${has(G, team, q) ? '✓' : '✗'} ${TECH[q].name}</span>`).join(' ')}</div>` : ''}
    ${rivals.length ? `<div class="small" style="color:#f0b48a">⚖ Doctrine: researching this closes ${rivals.map(o => o.name).join(', ')} for good.</div>` : ''}
    <div class="small" style="margin-top:4px">${STATUS_TEXT[st] || ''}</div>`;
  tip.classList.remove('hidden');
  const b = node.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
  let x = b.right + 10, y = b.top;
  if (x + tw > innerWidth - 8) x = b.left - tw - 10;
  if (y + th > innerHeight - 8) y = innerHeight - th - 8;
  tip.style.left = Math.max(8, x) + 'px'; tip.style.top = Math.max(8, y) + 'px';
}

const root = el();
root?.addEventListener('pointerdown', e => {
  if (!R) return;
  const { G, team, say } = R, b = e.target.closest('button'); if (!b) return;
  if (b.dataset.closeResearch !== undefined) return closeResearch();
  if (b.dataset.fund) { setFunding(G, team, (G.players[team].research.funding || 0) + +b.dataset.fund); return renderResearch(true); }
  if (b.dataset.dequeue) { dequeueResearch(G, team, b.dataset.dequeue); return renderResearch(true); }
  const id = b.dataset.tech; if (!id) return;
  const st = status(G, team, id);
  const r = st === 'available' ? setResearch(G, team, id) : st === 'blocked' ? queueResearch(G, team, id) : { ok: false, why: st === 'done' ? 'Already researched.' : 'Closed to you.' };
  if (!r.ok) say(r.why, 'bad');
  renderResearch(true);
});
root?.addEventListener('mouseover', e => { const id = e.target.closest('[data-tech]')?.dataset.tech || null; if (id !== hover) { hover = id; highlight(id); } });
root?.addEventListener('mouseleave', () => { hover = null; highlight(null); });
root?.addEventListener('scroll', () => root.querySelector('.rs-tip')?.classList.add('hidden'));
