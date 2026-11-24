// The game-over page (shown on the main-menu screen): who won and how, each admiral's totals, and
// charts over the whole game (oil, money, fleet, bases, research), one measure at a time.
// The charts are plain SVG: one line per player in their colour, a legend, a label at the end of each
// line, and a crosshair with a tooltip on hover.
import { achievementLine } from './achievements.js';
import { MAP_SIZES, MAP_TYPES, PLAYER_COLORS } from '../data/maps.js';
import { SHIPS } from '../data/ships.js';
import { COMMANDERS } from '../data/commanders.js';
import { FACTIONS } from '../data/factions.js';
import { progress } from './profile.js';

const REASONS = {
  elimination: ['⚔️', 'Conquest victory'], domination: ['🗺️', 'Domination victory'],
  postoil: ['⚛️', 'Post-Oil victory'], lastrig: ['🛢️', 'Last Rig Standing victory'],
};
// history rows: [oil, money, ships, bases, techs, fleet value]
const METRICS = [
  { id: 'fleet', name: 'Fleet value', col: 5, fmt: v => '$' + v.toLocaleString() },
  { id: 'ships', name: 'Ships', col: 2, fmt: v => v },
  { id: 'bases', name: 'Bases', col: 3, fmt: v => v },
  { id: 'oil', name: 'Oil stored', col: 0, fmt: v => v },
  { id: 'money', name: 'Money', col: 1, fmt: v => '$' + v.toLocaleString() },
  { id: 'techs', name: 'Research', col: 4, fmt: v => v + ' techs' },
];
let metric = 'fleet';

export function renderGameOver(st, xp = []) {
  const w = st.winner, [icon, title] = REASONS[st.winReason] || REASONS.elimination;
  const name = p => `<b style="color:${PLAYER_COLORS[p]}">${st.players[p].name}</b>`;
  const line = w == null ? 'Every fleet went down.'
    : st.winReason === 'domination' ? `${name(w)} ruled the seas round after round.`
    : st.winReason === 'postoil' ? `${name(w)} brought the Deep-Sea Fusion Plant online. The oil age is over.`
    : st.winReason === 'lastrig' ? `The world's oil ran out, and ${name(w)} held the last of it.`
    : `Every rival Admiralty has fallen. ${name(w)} rules the sea.`;
  return `<div class="home-card over-card">
    <div class="over-head">
      <div class="over-icon">${w == null ? '🌊' : icon}</div>
      <div>
        <h2>${w == null ? 'Nobody wins' : `${name(w)} wins!`}</h2>
        <div class="muted">${w == null ? '' : title + ' · '}${st.round} rounds. ${line}</div>
        ${st.mapType && !st.tutorial ? `<div class="muted small" style="margin-top:4px">Map: ${MAP_TYPES[st.mapType]?.icon || ''} ${MAP_TYPES[st.mapType]?.name || st.mapType} · ${MAP_SIZES[st.size]?.name || st.size} · seed <b class="seed-copy" title="Click to copy. Type it in New game → Map seed (same size, players, type and layout) to play this map again.">${st.seed}</b></div>` : ''}
      </div>
    </div>
    ${xpBlock(st, xp)}
    ${statsTable(st)}
    <div class="chart-box">
      <div class="chart-tabs" role="tablist">${METRICS.map(m => `<button data-metric="${m.id}" class="${m.id === metric ? 'on' : ''}">${m.name}</button>`).join('')}</div>
      <div class="chart-wrap" data-chart>${chart(st)}</div>
    </div>
    <div class="row" style="margin-top:18px">
      <button class="primary big" data-new>New game</button>
      <button class="big" data-viewmap>View the final map</button>
      ${st.gameId && !st.tutorial ? '<button class="big" data-watchreplay title="Watch the whole game again, with or without the fog of war">🎬 Watch replay</button>' : ''}
      <button class="big ghost" data-menu>Main menu</button>
      <button class="big ghost" data-gamedata title="Stats, round-by-round history and every move, for balancing">⬇️ Download game data</button>
    </div>
  </div>`;
}

// Commander XP earned on this computer: a bar per profile, level-ups, new perks and unlocked commanders.
function xpBlock(st, xp) {
  if (!xp?.length) return '';
  return `<div class="xp-box">${xp.map(r => {
    const c = r.commander && COMMANDERS[r.commander];
    if (!c) return `<div class="xp-row"><b>${esc(r.profile?.name || 'You')}</b> <span class="muted small">played without a commander: no XP (the game still counts toward your ${FACTIONS[st.players[r.p].faction || 'navy'].name} record).</span>${achievementLine(r.achievements)}</div>`;
    const pr = progress(r.profile, r.commander);
    const pct = pr.need ? Math.round(pr.into / pr.need * 100) : 100;
    return `<div class="xp-row">
      <div class="xp-top"><span class="xp-icon">${c.icon}</span><b>${esc(r.profile?.name || 'You')}</b> · ${c.name} <span class="muted small">${c.title}</span>
        <span class="xp-gain">+${r.xp.toLocaleString()} XP</span></div>
      <div class="xp-bar" title="${pr.need ? `${pr.into} / ${pr.need} XP to level ${pr.level + 1}` : 'Max level'}"><i style="width:${pct}%"></i><span>Level ${pr.level}${pr.need ? '' : ' (max)'}</span></div>
      ${r.after > r.before ? `<div class="xp-level">⭐ Level ${r.after}!${r.perks.length ? ' Unlocked: ' + r.perks.map(k => `<b title="${esc(k.text)}">${esc(k.name)}</b>`).join(', ') : ''}</div>` : ''}
      ${achievementLine(r.achievements)}
      ${r.unlocks.length ? `<div class="xp-level">🔓 New commander${r.unlocks.length > 1 ? 's' : ''}: ${r.unlocks.map(id => `<b>${COMMANDERS[id].icon} ${COMMANDERS[id].name}</b>`).join(', ')}</div>` : ''}
    </div>`;
  }).join('')}</div>`;
}
const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

function statsTable(st) {
  const hist = st.history || [];
  const peak = (p, col) => Math.max(0, ...hist.map(h => h.p[p]?.[col] ?? 0));
  const s = (p, k) => st.players[p].stats?.[k] || 0;
  const rows = [
    ['Result', p => p === st.winner ? '🏆 Winner' : st.players[p].out ? 'Knocked out' : 'Still afloat'],
    ['Faction', p => { const f = FACTIONS[st.players[p].faction || 'navy'], c = st.players[p].commander; return `${f.icon} ${f.short}${c ? ` · ${COMMANDERS[c.id].icon} ${COMMANDERS[c.id].name} <span class="muted">(level ${c.level})</span>` : ''}`; }],
    ['Oil pumped', p => Math.round(s(p, 'oilPumped')).toLocaleString()],
    ['Oil sold', p => `${Math.round(s(p, 'oilSold')).toLocaleString()} for $${Math.round(s(p, 'oilMoney')).toLocaleString()}`],
    ['Bases founded', p => s(p, 'basesFounded') + ` <span class="muted">(peak ${peak(p, 3)})</span>`],
    ['Ships built', p => s(p, 'shipsBuilt') + ` <span class="muted">(peak fleet ${peak(p, 2)})</span>`],
    ['Enemy ships sunk', p => s(p, 'kills')],
    ['Ships lost', p => s(p, 'shipsLost')],
    ['Enemy structures destroyed', p => s(p, 'destroyed')],
    ...(st.players.some((_, p) => s(p, 'plunder') || s(p, 'captures')) ? [['Plunder / captures', p => `$${Math.round(s(p, 'plunder')).toLocaleString()} / ${s(p, 'captures')}`]] : []),
    ['Research', p => Object.keys(st.players[p].research?.done || {}).length + ' techs'],
  ];
  const ps = st.players.map((_, i) => i);
  return `<div class="over-table-wrap"><table class="over-table">
    <thead><tr><th></th>${ps.map(p => `<th><span class="pdot" style="background:${PLAYER_COLORS[p]}"></span>${st.players[p].name}${st.players[p].seat === 'ai' ? ' 🤖' : ''}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(([label, f]) => `<tr><td>${label}</td>${ps.map(p => `<td>${f(p)}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>`;
}

// ---------- the chart ----------
const W = 760, H = 260, M = { l: 54, r: 96, t: 14, b: 28 };
function chart(st) {
  const hist = st.history || [];
  if (hist.length < 2) return '<p class="muted small">Not enough rounds were played to chart.</p>';
  const m = METRICS.find(x => x.id === metric), col = m.col;
  const ps = st.players.map((_, i) => i);
  const maxV = Math.max(1, ...hist.flatMap(h => h.p.map(r => r?.[col] ?? 0)));
  const nice = niceMax(maxV), r0 = hist[0].r, r1 = hist[hist.length - 1].r;
  const x = r => M.l + (r - r0) / Math.max(1, r1 - r0) * (W - M.l - M.r);
  const y = v => M.t + (1 - v / nice) * (H - M.t - M.b);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(nice * f));
  const grid = ticks.map(t => `<line x1="${M.l}" x2="${W - M.r}" y1="${y(t)}" y2="${y(t)}" class="cg"/><text x="${M.l - 8}" y="${y(t) + 4}" class="ct" text-anchor="end">${m.fmt(t)}</text>`).join('');
  const xt = xTicks(r0, r1).map(r => `<text x="${x(r)}" y="${H - 8}" class="ct" text-anchor="middle">${r}</text>`).join('');
  // one line per player (a player's line stops when they're knocked out)
  const ends = [];
  const lines = ps.map(p => {
    const pts = hist.filter(h => h.p[p]).map(h => [x(h.r), y(h.p[p][col])]);
    if (!pts.length) return '';
    const last = hist.filter(h => h.p[p]).at(-1);
    ends.push({ p, x: pts.at(-1)[0], y: pts.at(-1)[1], v: last.p[p][col] });
    return `<polyline points="${pts.map(q => q.map(n => n.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="${PLAYER_COLORS[p]}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  }).join('');
  // end-of-line labels, nudged apart so they don't overlap
  ends.sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
  const labels = ends.map(e => `<circle cx="${e.x}" cy="${e.y}" r="4" fill="${PLAYER_COLORS[e.p]}" stroke="var(--panel)" stroke-width="2"/>
    <text x="${e.x + 8}" y="${e.y + 4}" class="cl">${st.players[e.p].name}</text>`).join('');
  return `<div class="chart-legend">${ps.map(p => `<span><i style="background:${PLAYER_COLORS[p]}"></i>${st.players[p].name}</span>`).join('')}<span class="muted small">by round</span></div>
    <svg class="over-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${m.name} for each player, round by round">
      ${grid}${xt}${lines}${labels}
      <line class="cx hidden" y1="${M.t}" y2="${H - M.b}"/>
      <rect class="chit" x="${M.l}" y="${M.t}" width="${W - M.l - M.r}" height="${H - M.t - M.b}" fill="transparent"/>
    </svg>
    <div class="chart-tip hidden"></div>`;
}
function niceMax(v) {
  const p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}
function xTicks(r0, r1) {
  const span = r1 - r0, step = [5, 10, 20, 25, 50, 100].find(s => span / s <= 8) || 200;
  const out = [];
  for (let r = Math.ceil(r0 / step) * step; r <= r1; r += step) out.push(r);
  return out;
}

// tabs + hover crosshair (called after the page is drawn)
export function bindGameOver(root, st) {
  root.querySelectorAll('[data-metric]').forEach(b => b.onclick = () => {
    metric = b.dataset.metric;
    root.querySelectorAll('[data-metric]').forEach(x => x.classList.toggle('on', x === b));
    root.querySelector('[data-chart]').innerHTML = chart(st);
    hover(root, st);
  });
  hover(root, st);
}
function hover(root, st) {
  const svg = root.querySelector('.over-chart'), tip = root.querySelector('.chart-tip'), cx = root.querySelector('.over-chart .cx');
  if (!svg) return;
  const hist = st.history, m = METRICS.find(x => x.id === metric);
  const r0 = hist[0].r, r1 = hist.at(-1).r;
  svg.addEventListener('mousemove', e => {
    const b = svg.getBoundingClientRect(), sx = (e.clientX - b.left) / b.width * W;
    const r = Math.round(r0 + (sx - M.l) / (W - M.l - M.r) * (r1 - r0));
    const h = hist.find(q => q.r === Math.max(r0, Math.min(r1, r)));
    if (!h) return;
    const px = M.l + (h.r - r0) / Math.max(1, r1 - r0) * (W - M.l - M.r);
    cx.setAttribute('x1', px); cx.setAttribute('x2', px); cx.classList.remove('hidden');
    const rows = st.players.map((pl, p) => h.p[p] ? { p, v: h.p[p][m.col] } : null).filter(Boolean).sort((a, c) => c.v - a.v);
    tip.innerHTML = `<b>Round ${h.r}</b>${rows.map(o => `<div><i style="background:${PLAYER_COLORS[o.p]}"></i>${st.players[o.p].name}<span>${m.fmt(o.v)}</span></div>`).join('')}`;
    tip.classList.remove('hidden');
    const wrap = svg.parentElement.getBoundingClientRect();
    const left = e.clientX - wrap.left + 14;
    tip.style.left = Math.min(left, wrap.width - tip.offsetWidth - 4) + 'px';
    tip.style.top = Math.max(0, e.clientY - wrap.top - 20) + 'px';
  });
  svg.addEventListener('mouseleave', () => { tip.classList.add('hidden'); cx.classList.add('hidden'); });
}
export const fleetValue = (st, p) => st.ships.filter(s => s.owner === p).reduce((t, s) => t + SHIPS[s.type].cost, 0);

// Everything about a finished game in one file, for balancing: settings, every player's totals,
// the round-by-round history, and (for online games) every move in order.
export function downloadGameData(st, moves = [], desyncs = []) {
  const data = {
    lastRigStanding: 'game-data', version: 1, savedAt: new Date().toISOString(),
    settings: { size: st.size, mapType: st.mapType, events: st.events?.mode || 'off', players: st.players.length, mirror: st.mirror, victory: st.victory, seed: st.seed, online: !!st.online, simul: !!st.simul, fog: st.noFog ? 'off' : st.exploreFog ? 'reveal' : 'on' },
    result: { winner: st.winner, reason: st.winReason, rounds: st.round },
    players: st.players.map((pl, i) => ({
      seat: i, name: pl.name, kind: pl.seat === 'ai' ? 'bot' : 'human', difficulty: pl.ai?.difficulty, personality: pl.ai?.personality, faction: pl.faction || 'navy', commander: pl.commander?.id || null, level: pl.commander?.level || null,
      out: !!pl.out, stats: { ...(pl.stats || {}), units: undefined }, units: pl.stats?.units || {}, techs: Object.keys(pl.research?.done || {}),
    })),
    history: { columns: ['oil', 'money', 'ships', 'bases', 'techs', 'fleetValue'], rounds: st.history || [] },
    moves: moves.length ? moves : (window.__lrsMoves || []),
    desyncs, // online: reports of players' games drifting out of sync (for finding bugs)
  };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  a.download = `last-rig-standing-game-${new Date().toISOString().slice(0, 10)}-round-${st.round}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
