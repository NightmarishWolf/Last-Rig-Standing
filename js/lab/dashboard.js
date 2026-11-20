// The Balance lab dashboard: what many games (bot simulations and/or real games) say about balance.
//   headline numbers · who wins (by personality, difficulty, seat) · how games end and how long they last
//   ship classes (built, survival, kills, damage and $ traded per $ spent) · economy over time
//   (winners vs everyone else) · research that winners pick more (or less) often
// Charts are plain SVG with hover tooltips. Colours: blue = winners (and single bars), orange = the rest.
import { FACTIONS } from '../data/factions.js';
import { COMMANDERS } from '../data/commanders.js';
import { DIFFICULTY, PERSONALITIES } from '../data/bots.js';
import { TECH } from '../data/research.js';
import { MAP_TYPES } from '../data/maps.js';

const BLUE = '#3987e5', ORANGE = '#d95926', GRID = 'rgba(138,163,184,.18)', INK = '#8aa3b8';
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = v => (v == null ? '–' : Math.round(v * 100) + '%');
const num = (v, d = 1) => (v == null ? '–' : Number(v).toFixed(d).replace(/\.0+$/, ''));
const REASONS = { elimination: '⚔️ Conquest', domination: '🗺️ Domination', postoil: '⚛️ Post-Oil', lastrig: '🛢️ Last Rig', none: 'Nobody' };

let current = null, metric = 'fleet', sortKey = 'built', sortDir = -1;

export function renderDashboard(agg, opts = {}) {
  current = { agg, opts };
  if (!agg.games) return '<p class="muted">No games yet. Run some bot games, or add game data files from real games.</p>';
  const players = opts.players || 2;
  const reasons = Object.entries(agg.reasons).sort((a, b) => b[1] - a[1]);
  return `
    <div class="lab-tiles">
      ${tile('Games', agg.games, Object.entries(agg.sources).map(([k, v]) => `${v} ${k === 'bots' ? 'bot games' : k === 'online' ? 'online games' : 'local games'}`).join(' · '))}
      ${tile('Finished', `${agg.finished}/${agg.games}`, agg.games > agg.finished ? 'the rest hit the round cap' : 'all reached a winner')}
      ${tile('Length', agg.avgRounds == null ? '–' : `${Math.round(agg.avgRounds)} rounds`, agg.medianRounds == null ? '' : `median ${agg.medianRounds}`)}
      ${tile('Most common win', reasons[0] ? REASONS[reasons[0][0]] || reasons[0][0] : '–', reasons[0] ? `${reasons[0][1]} of ${agg.finished} finished games` : '')}
    </div>

    <h3>Who wins</h3>
    <p class="muted small">Win rate in finished games. The dashed line is a fair share (1 in ${players}); with few games, expect noise.</p>
    <div class="lab-grid3">
      ${rateBars('By personality', agg.by.personality, k => `${PERSONALITIES[k]?.icon || ''} ${PERSONALITIES[k]?.name || k}`, 1 / players)}
      ${rateBars('By difficulty', agg.by.difficulty, k => `${DIFFICULTY[k]?.icon || ''} ${DIFFICULTY[k]?.name || k}`, 1 / players)}
      ${Object.keys(agg.by.commander || {}).length > 1 ? rateBars('By commander', agg.by.commander, k => (COMMANDERS[k] ? `${COMMANDERS[k].icon} ${COMMANDERS[k].name}` : '— No commander'), 1 / players) : ''}
      ${Object.keys(agg.by.faction).length > 1 ? rateBars('By faction', agg.by.faction, k => `${FACTIONS[k]?.icon || ''} ${FACTIONS[k]?.name || k}`, 1 / players) : ''}
      ${Object.keys(agg.by.factionVs).some(k => k.split(' vs ')[0] !== k.split(' vs ')[1]) ? rateBars('Faction matchups', agg.by.factionVs, k => k.split(' vs ').map(f => `${FACTIONS[f]?.icon || ''} ${FACTIONS[f]?.short || f}`).join(' vs '), 1 / players) : ''}
      ${rateBars('By seat (who goes first)', agg.by.seat, k => k, 1 / players)}
    </div>

    <div class="lab-grid2">
      <div><h3>How games end</h3>${countBars(reasons.map(([k, v]) => [REASONS[k] || k, v]), agg.finished)}</div>
      <div><h3>Game length</h3>${lengthBars(agg.roundsDone)}</div>
    </div>

    ${Object.keys(agg.maps || {}).length > 1 ? `<h3>By map type</h3>${mapTable(agg.maps)}` : ''}

    <h3>Ship classes</h3>
    <p class="muted small"><b>Built</b> per player per game (<span style="color:${BLUE}">winners</span> / <span style="color:${ORANGE}">the rest</span>) · <b>Survival</b>: share of those fielded (built + starting) not sunk · <b>Kills</b> per ship fielded · <b>Damage</b> to ships and structures per $1,000 spent building them · <b>Trade</b>: value of enemy ships sunk per $1 spent (above 1 = pays for itself). Click a heading to sort.</p>
    <div data-labunits>${unitTable(agg.units)}</div>

    <h3>Economy over time</h3>
    <p class="muted small">Average per round in finished games: the eventual <b style="color:${BLUE}">winner</b> vs <b style="color:${ORANGE}">everyone else</b> (knocked-out players drop out of the average).</p>
    <div class="chart-tabs" data-labtabs>${METRICS.map(m => `<button data-labmetric="${m.id}" class="${m.id === metric ? 'on' : ''}">${m.name}</button>`).join('')}</div>
    <div class="chart-wrap" data-labchart>${lineChart(agg.curves[metric], METRICS.find(m => m.id === metric))}</div>

    <h3>Research</h3>
    <p class="muted small">Share of <b style="color:${BLUE}">winners</b> and of <b style="color:${ORANGE}">everyone else</b> who finished each tech: the biggest differences first (techs winners favour), then the ones losers favour.</p>
    ${techTable(agg.techs)}`;
}
const tile = (label, value, sub) => `<div class="lab-tile"><div class="muted small">${label}</div><div class="lab-big">${value}</div><div class="muted small">${sub || ''}</div></div>`;

// ---------- bars ----------
function rateBars(title, map, label, fair) {
  const rows = Object.entries(map).sort((a, b) => b[1].wins / b[1].games - a[1].wins / a[1].games);
  if (!rows.length) return `<div><h4>${title}</h4><p class="muted small">No finished games.</p></div>`;
  return `<div><h4>${title}</h4><div class="lab-bars">${rows.map(([k, v]) => {
    const r = v.wins / v.games;
    return `<div class="lab-bar" title="${esc(label(k))}: won ${v.wins} of ${v.games} (${pct(r)})">
      <span class="lb-label">${label(k)}</span>
      <span class="lb-track"><i style="width:${Math.max(1, r * 100)}%;background:${BLUE}"></i><b class="lb-fair" style="left:${fair * 100}%"></b></span>
      <span class="lb-val">${pct(r)} <span class="muted">${v.wins}/${v.games}</span></span></div>`;
  }).join('')}</div></div>`;
}
function countBars(rows, total) {
  if (!rows.length) return '<p class="muted small">No finished games.</p>';
  const max = Math.max(...rows.map(r => r[1]));
  return `<div class="lab-bars">${rows.map(([k, v]) => `<div class="lab-bar" title="${esc(k)}: ${v} of ${total}">
    <span class="lb-label">${k}</span><span class="lb-track"><i style="width:${(v / max) * 100}%;background:${BLUE}"></i></span>
    <span class="lb-val">${v} <span class="muted">${pct(v / total)}</span></span></div>`).join('')}</div>`;
}
function lengthBars(rounds) {
  if (!rounds.length) return '<p class="muted small">No finished games.</p>';
  const size = 20, buckets = {};
  for (const r of rounds) { const b = Math.floor(r / size) * size; buckets[b] = (buckets[b] || 0) + 1; }
  const keys = Object.keys(buckets).map(Number).sort((a, b) => a - b);
  return countBars(keys.map(k => [`${k}–${k + size - 1} rounds`, buckets[k]]), rounds.length);
}

// ---------- map types ----------
function mapTable(maps) {
  const rows = Object.entries(maps).sort((a, b) => b[1].games - a[1].games);
  return `<div class="lab-table-wrap"><table class="lab-table"><thead><tr><th>Map</th><th>Games</th><th>Finished</th><th>Avg length</th><th>Wins by seat</th></tr></thead><tbody>
    ${rows.map(([k, m]) => `<tr><td>${MAP_TYPES[k]?.icon || ''} ${esc(MAP_TYPES[k]?.name || k)}</td><td>${m.games}</td><td>${pct(m.finished / m.games)}</td><td>${m.finished ? Math.round(m.rounds / m.finished) + ' rounds' : '–'}</td>
      <td>${Object.keys(m.seats).length ? Object.entries(m.seats).sort().map(([s, n]) => `P${+s + 1}: ${n}`).join(' · ') : '–'}</td></tr>`).join('')}
  </tbody></table></div>`;
}

// ---------- ship classes ----------
const COLS = [
  { id: 'name', name: 'Class', fmt: (u) => esc(u.name), sort: u => u.name },
  { id: 'built', name: 'Built / player', fmt: u => `${num(u.perGame)} <span class="muted small">(<span style="color:${BLUE}">${num(u.winnersPerGame)}</span> / <span style="color:${ORANGE}">${num(u.losersPerGame)}</span>)</span>`, sort: u => u.perGame },
  { id: 'survival', name: 'Survival', fmt: u => pct(u.survival), sort: u => u.survival ?? -1 },
  { id: 'kills', name: 'Kills / ship', fmt: u => num(u.killsPerShip, 2), sort: u => u.killsPerShip ?? -1 },
  { id: 'dmg', name: 'Damage / $1k', fmt: u => num(u.dmgPer1k), sort: u => u.dmgPer1k ?? -1 },
  { id: 'trade', name: 'Trade', fmt: u => (u.trade == null ? '–' : `<span class="lab-trade"><i style="width:${Math.min(100, u.trade * 50)}%;background:${u.trade >= 1 ? BLUE : ORANGE}"></i></span> ${num(u.trade, 2)}`), sort: u => u.trade ?? -1 },
  { id: 'shots', name: 'Shots', fmt: u => Math.round(u.shots), sort: u => u.shots },
];
function unitTable(units) {
  const rows = [...units].sort((a, b) => {
    const c = COLS.find(x => x.id === sortKey), va = c.sort(a), vb = c.sort(b);
    return (va > vb ? 1 : va < vb ? -1 : 0) * sortDir;
  });
  return `<div class="lab-table-wrap"><table class="lab-table">
    <thead><tr>${COLS.map(c => `<th data-labsort="${c.id}" class="${c.id === sortKey ? 'on' : ''}">${c.name}${c.id === sortKey ? (sortDir < 0 ? ' ▾' : ' ▴') : ''}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(u => `<tr class="${u.ship ? '' : 'muted'}">${COLS.map(c => `<td>${c.fmt(u)}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>`;
}

// ---------- economy line chart ----------
const METRICS = [
  { id: 'fleet', name: 'Fleet value', fmt: v => '$' + Math.round(v).toLocaleString() },
  { id: 'money', name: 'Money', fmt: v => '$' + Math.round(v).toLocaleString() },
  { id: 'oil', name: 'Oil stored', fmt: v => Math.round(v) },
  { id: 'ships', name: 'Ships', fmt: v => num(v) },
  { id: 'bases', name: 'Bases', fmt: v => num(v) },
  { id: 'techs', name: 'Research', fmt: v => num(v) + ' techs' },
];
const W = 760, H = 260, PAD = { l: 56, r: 74, t: 14, b: 30 };
function lineChart(curve, m) {
  let series = [{ id: 'w', name: 'Winner', color: BLUE, pts: curve.w }, { id: 'l', name: 'Everyone else', color: ORANGE, pts: curve.l }].filter(s => s.pts.length);
  if (!series.length && curve.a?.length) series = [{ id: 'a', name: 'All players (no game finished)', color: BLUE, pts: curve.a }];
  if (!series.length) return '<p class="muted small">No games with history yet.</p>';
  const xs = series.flatMap(s => s.pts.map(p => p[0])), ys = series.flatMap(s => s.pts.map(p => p[1]));
  const x0 = Math.min(...xs), x1 = Math.max(...xs, x0 + 1), y1 = niceMax(Math.max(...ys, 1));
  const X = x => PAD.l + (x - x0) / (x1 - x0) * (W - PAD.l - PAD.r), Y = y => H - PAD.b - y / y1 * (H - PAD.t - PAD.b);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => f * y1);
  const xt = []; for (let r = Math.ceil(x0 / 20) * 20; r <= x1; r += 20) xt.push(r);
  const path = pts => pts.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('');
  current.chart = { series, X, Y, x0, x1, m };
  return `<div class="chart-legend">${series.map(s => `<span><i style="background:${s.color}"></i>${s.name}</span>`).join('')}</div>
    <svg viewBox="0 0 ${W} ${H}" class="lab-svg" data-labsvg>
      ${ticks.map(t => `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${Y(t)}" y2="${Y(t)}" stroke="${GRID}"/><text x="${PAD.l - 6}" y="${Y(t) + 4}" text-anchor="end" fill="${INK}" font-size="11">${m.fmt(t)}</text>`).join('')}
      ${xt.map(r => `<text x="${X(r)}" y="${H - 10}" text-anchor="middle" fill="${INK}" font-size="11">${r}</text>`).join('')}
      <text x="${W - PAD.r}" y="${H - 10}" text-anchor="start" fill="${INK}" font-size="11" dx="6">round</text>
      ${series.map(s => `<path d="${path(s.pts)}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round"/>
        <text x="${X(s.pts.at(-1)[0]) + 6}" y="${Y(s.pts.at(-1)[1]) + 4}" fill="${s.color}" font-size="11" font-weight="600">${s.id === 'w' ? 'Winner' : s.id === 'l' ? 'Others' : 'Average'}</text>`).join('')}
      <line data-labx y1="${PAD.t}" y2="${H - PAD.b}" stroke="${INK}" stroke-dasharray="3 3" visibility="hidden"/>
      ${series.map(s => `<circle data-labdot="${s.id}" r="4" fill="${s.color}" stroke="#0d1e2e" stroke-width="2" visibility="hidden"/>`).join('')}
      <rect x="${PAD.l}" y="${PAD.t}" width="${W - PAD.l - PAD.r}" height="${H - PAD.t - PAD.b}" fill="transparent" data-labhit/>
    </svg>
    <div class="chart-tip hidden" data-labtip></div>`;
}
function niceMax(v) {
  const p = 10 ** Math.floor(Math.log10(v)), f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

// ---------- research ----------
function techTable(techs) {
  if (!techs.length) return '<p class="muted small">No finished games.</p>';
  const top = techs.slice(0, 8), bottom = techs.length > 12 ? techs.slice(-4).reverse() : [];
  const row = t => `<div class="lab-tech" title="${esc(TECH[t.id]?.name || t.id)}: ${pct(t.w)} of winners, ${pct(t.l)} of the rest">
    <span class="lb-label">${esc(TECH[t.id]?.name || t.id)}</span>
    <span class="lt-pair"><span class="lb-track"><i style="width:${t.w * 100}%;background:${BLUE}"></i></span><span class="lb-track"><i style="width:${t.l * 100}%;background:${ORANGE}"></i></span></span>
    <span class="lb-val">${pct(t.w)} <span class="muted">vs ${pct(t.l)}</span></span></div>`;
  return `<div class="lab-grid2"><div><h4>Winners favour</h4>${top.map(row).join('')}</div>${bottom.length ? `<div><h4>Losers favour</h4>${bottom.map(row).join('')}</div>` : ''}</div>`;
}

// ---------- interaction ----------
export function bindDashboard(root, rerender) {
  root.querySelectorAll('[data-labmetric]').forEach(b => b.onclick = () => { metric = b.dataset.labmetric; rerender(); });
  root.querySelectorAll('[data-labsort]').forEach(th => th.onclick = () => {
    const k = th.dataset.labsort;
    if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = k === 'name' ? 1 : -1; }
    root.querySelector('[data-labunits]').innerHTML = unitTable(current.agg.units);
    bindDashboard(root, rerender);
  });
  const svg = root.querySelector('[data-labsvg]'), tip = root.querySelector('[data-labtip]'), c = current.chart;
  if (!svg || !c) return;
  const hit = svg.querySelector('[data-labhit]'), xl = svg.querySelector('[data-labx]');
  hit.onmousemove = e => {
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const loc = pt.matrixTransform(svg.getScreenCTM().inverse());
    const round = Math.round(c.x0 + (loc.x - PAD.l) / (W - PAD.l - PAD.r) * (c.x1 - c.x0));
    xl.setAttribute('x1', c.X(round)); xl.setAttribute('x2', c.X(round)); xl.setAttribute('visibility', 'visible');
    const lines = [];
    for (const s of c.series) {
      const p = s.pts.find(q => q[0] === round), dot = svg.querySelector(`[data-labdot="${s.id}"]`);
      if (!p) { dot.setAttribute('visibility', 'hidden'); continue; }
      dot.setAttribute('cx', c.X(p[0])); dot.setAttribute('cy', c.Y(p[1])); dot.setAttribute('visibility', 'visible');
      lines.push(`<div><i style="background:${s.color}"></i>${s.name}<span>${c.m.fmt(p[1])}</span></div>`);
    }
    tip.innerHTML = `<b>Round ${round}</b>${lines.join('')}`;
    tip.classList.remove('hidden');
    const box = svg.getBoundingClientRect(), wrap = svg.parentElement.getBoundingClientRect();
    const left = e.clientX - wrap.left + 14;
    tip.style.left = Math.min(left, box.width - 170) + 'px'; tip.style.top = (e.clientY - wrap.top - 10) + 'px';
  };
  hit.onmouseleave = () => { tip.classList.add('hidden'); xl.setAttribute('visibility', 'hidden'); svg.querySelectorAll('[data-labdot]').forEach(d => d.setAttribute('visibility', 'hidden')); };
}
