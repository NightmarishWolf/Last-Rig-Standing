// The Balance lab (Main menu → 📊 Balance lab): run bot-vs-bot games in the background and see what
// they say about balance, add "Download game data" files from real games (PvP tests!), and download
// the results to keep or compare later.
import { FACTIONS, FACTION_ORDER } from '../data/factions.js';
import { COMMANDERS } from '../data/commanders.js';
import { DIFFICULTY, DIFFICULTY_ORDER, PERSONALITIES, PERSONALITY_ORDER } from '../data/bots.js';
import { MAP_SIZES, MAP_TYPES, MAP_TYPE_ORDER, PLAYER_COLORS } from '../data/maps.js';
import { aggregate, recordFromGameData } from './stats.js';
import { bindDashboard, renderDashboard } from './dashboard.js';
import { toast } from '../ui/status.js';

export const lab = {
  opts: { games: 10, size: 'small', mapType: 'classic', events: 'off', players: 2, fog: 'on', simul: true, maxRounds: 200, seats: [0, 1, 2, 3].map(() => ({ personality: 'random', difficulty: 'normal', faction: 'navy' })) },
  records: [], running: false, progress: null, errors: 0, worker: null, filter: 'all',
};
let rerender = () => {};

export function labPage() {
  const o = lab.opts, max = MAP_SIZES[o.size].maxPlayers;
  const seg = (label, items) => `<div class="setup-group"><div class="label">${label}</div><div class="seg wrap">${items}</div></div>`;
  const recs = filtered();
  return `<div class="home-card lab-card">
    <h2>📊 Balance lab</h2>
    <p class="muted small">Plays bot-vs-bot games in the background (they swap seats every other game, so going first can't skew things) and shows what they say about balance. You can also add <b>Download game data</b> files from real games (the button on the game-over screen) to see how people play.</p>
    <div class="setup-cols">
      <div>
        ${seg('Games', [4, 10, 20, 50].map(n => `<button data-lgames="${n}" class="${o.games === n ? 'on' : ''}">${n}</button>`).join(''))}
        ${seg('Map size', Object.entries(MAP_SIZES).filter(([, m]) => !m.hidden).map(([k, m]) => `<button data-lsize="${k}" class="${o.size === k ? 'on' : ''}">${m.name}</button>`).join(''))}
        ${seg('Map type', [...MAP_TYPE_ORDER, 'random'].map(k => `<button data-lmap="${k}" class="${o.mapType === k ? 'on' : ''}" title="${k === 'random' ? 'A different map type each game' : MAP_TYPES[k].desc}">${k === 'random' ? '🎲 Random' : MAP_TYPES[k].icon + ' ' + MAP_TYPES[k].name}</button>`).join(''))}
        ${seg('World events', [['off', '⛔ Off'], ['light', '🌤️ Light'], ['chaotic', '🌪️ Chaotic']].map(([k, n]) => `<button data-levents="${k}" class="${o.events === k ? 'on' : ''}">${n}</button>`).join(''))}
        ${seg('Fog of war', [['on', '🌫️ On'], ['reveal', '🗺️ Reveal'], ['off', '👁️ Off']].map(([k, n]) => `<button data-lfog="${k}" class="${o.fog === k ? 'on' : ''}">${n}</button>`).join(''))}
        ${seg('Turn order', `<button data-lsimul="0" class="${!o.simul ? 'on' : ''}">⏯ Take turns</button><button data-lsimul="1" class="${o.simul ? 'on' : ''}">⚡ Simultaneous</button>`)}
        ${seg('Stop after', [100, 150, 200, 300].map(n => `<button data-lcap="${n}" class="${o.maxRounds === n ? 'on' : ''}">${n} rounds</button>`).join(''))}
      </div>
      <div>
        ${seg('Bots', [2, 3, 4].map(n => `<button data-lplayers="${n}" class="${o.players === n ? 'on' : ''}" ${n > max ? 'disabled' : ''}>${n}</button>`).join(''))}
        <div class="seats">${o.seats.slice(0, o.players).map((s, i) => `<div class="seat-row" style="--c:${PLAYER_COLORS[i]}">
          <span class="chip" style="--c:${PLAYER_COLORS[i]}">Bot ${i + 1}</span>
          <select data-lpers="${i}"><option value="random" ${s.personality === 'random' ? 'selected' : ''}>🎲 Mixed personalities</option>${PERSONALITY_ORDER.map(k => `<option value="${k}" ${s.personality === k ? 'selected' : ''}>${PERSONALITIES[k].icon} ${PERSONALITIES[k].name}</option>`).join('')}</select>
          <select data-lcmd="${i}" title="Commander (and level)">
            <option value="auto" ${(s.commander || 'auto') === 'auto' ? 'selected' : ''}>🎲 Commander to suit</option>
            <option value="none" ${s.commander === 'none' ? 'selected' : ''}>— No commander</option>
            ${Object.entries(COMMANDERS).map(([k, c]) => `<option value="${k}" ${s.commander === k ? 'selected' : ''}>${c.icon} ${c.name} (${FACTIONS[c.faction].short})</option>`).join('')}</select>
          <select data-llvl="${i}" title="Commander level"><option value="" ${s.level == null ? 'selected' : ''}>Level by difficulty</option>${[1, 3, 5, 10, 15].map(n => `<option value="${n}" ${s.level === n ? 'selected' : ''}>Level ${n}</option>`).join('')}</select>
          <select data-lfac="${i}">${[...FACTION_ORDER, 'random'].map(k => `<option value="${k}" ${(s.faction || 'navy') === k ? 'selected' : ''}>${k === 'random' ? '🎲 Mixed factions' : FACTIONS[k].icon + ' ' + FACTIONS[k].name}</option>`).join('')}</select>
          <select data-ldiff="${i}">${DIFFICULTY_ORDER.map(k => `<option value="${k}" ${s.difficulty === k ? 'selected' : ''}>${DIFFICULTY[k].icon} ${DIFFICULTY[k].name}</option>`).join('')}</select>
        </div>`).join('')}</div>
        <p class="muted small">Tip: to test one thing, keep everything else the same (e.g. Raider vs Tycoon, both Normal).</p>
      </div>
    </div>
    <div class="row" style="margin-top:12px">
      ${lab.running ? '<button class="big danger" data-lstop>⏹ Stop</button>' : `<button class="primary big" data-lrun>▶ Run ${o.games} games</button>`}
      <span class="muted small" data-lprogress>${progressText()}</span>
    </div>
    <div class="row" style="margin-top:8px">
      <label class="button-like"><input type="file" accept=".json,application/json" multiple data-lfiles hidden>⬆️ Add game data or lab results</label>
      ${lab.records.length ? `<button class="ghost" data-ldownload>⬇️ Download results (${lab.records.length} games)</button><button class="ghost" data-lclear>🗑 Clear</button>` : ''}
      ${new Set(lab.records.map(r => r.source)).size > 1 ? `<select data-lfilter><option value="all">All games</option><option value="bots" ${lab.filter === 'bots' ? 'selected' : ''}>Bot games only</option><option value="real" ${lab.filter === 'real' ? 'selected' : ''}>Real games only</option></select>` : ''}
    </div>
    <div class="lab-dash" data-ldash>${renderDashboard(aggregate(recs), { players: recs[0]?.settings.players || o.players })}</div>
    <div class="row" style="margin-top:18px"><button class="big ghost" data-back>Back</button></div>
  </div>`;
}
const filtered = () => lab.records.filter(r => lab.filter === 'all' || (lab.filter === 'bots' ? r.source === 'bots' : r.source !== 'bots'));
function progressText() {
  const p = lab.progress;
  if (!lab.running) return lab.records.length ? `${lab.records.length} games in the results.${lab.errors ? ` (${lab.errors} games failed: see the console)` : ''}` : '';
  return `Playing game ${(p?.game ?? 0) + 1} of ${lab.opts.games}${p?.round ? `, round ${p.round}` : ''}… (${lab.records.length - (p?.start || 0)} done)`;
}

export function bindLab(h, redraw) {
  rerender = redraw;
  const on = (sel, fn) => h.querySelectorAll(sel).forEach(b => b.addEventListener('click', e => fn(b, e)));
  const o = lab.opts;
  on('[data-lgames]', b => { o.games = +b.dataset.lgames; redraw(); });
  on('[data-lsize]', b => { o.size = b.dataset.lsize; o.players = Math.min(o.players, MAP_SIZES[o.size].maxPlayers); redraw(); });
  on('[data-levents]', b => { o.events = b.dataset.levents; redraw(); });
  on('[data-lmap]', b => { o.mapType = b.dataset.lmap; redraw(); });
  on('[data-lfog]', b => { o.fog = b.dataset.lfog; redraw(); });
  on('[data-lsimul]', b => { o.simul = b.dataset.lsimul === '1'; redraw(); });
  on('[data-lcap]', b => { o.maxRounds = +b.dataset.lcap; redraw(); });
  on('[data-lplayers]', b => { o.players = +b.dataset.lplayers; redraw(); });
  h.querySelectorAll('[data-lpers]').forEach(s => s.onchange = () => { o.seats[s.dataset.lpers].personality = s.value; });
  h.querySelectorAll('[data-ldiff]').forEach(s => s.onchange = () => { o.seats[s.dataset.ldiff].difficulty = s.value; });
  h.querySelectorAll('[data-lfac]').forEach(s => s.onchange = () => { o.seats[s.dataset.lfac].faction = s.value; });
  h.querySelectorAll('[data-lcmd]').forEach(s => s.onchange = () => { const seat = o.seats[s.dataset.lcmd]; seat.commander = s.value; if (COMMANDERS[s.value]) seat.faction = COMMANDERS[s.value].faction; rerender?.(); });
  h.querySelectorAll('[data-llvl]').forEach(s => s.onchange = () => { o.seats[s.dataset.llvl].level = s.value ? +s.value : null; });
  on('[data-lrun]', () => run());
  on('[data-lstop]', () => stop());
  on('[data-lclear]', () => { lab.records = []; lab.errors = 0; redraw(); });
  on('[data-ldownload]', () => download());
  const f = h.querySelector('[data-lfilter]');
  if (f) f.onchange = () => { lab.filter = f.value; redraw(); };
  const inp = h.querySelector('[data-lfiles]');
  if (inp) inp.onchange = async () => {
    let added = 0, bad = 0;
    for (const file of inp.files) {
      try {
        const d = JSON.parse(await file.text());
        if (d?.lastRigStanding === 'lab-results' && Array.isArray(d.records)) { lab.records.push(...d.records); added += d.records.length; continue; }
        const r = recordFromGameData(d);
        if (r) { lab.records.push(r); added++; } else bad++;
      } catch { bad++; }
    }
    redraw();
    toast(`Added ${added} game${added === 1 ? '' : 's'}.${bad ? ` ${bad} file${bad === 1 ? ' wasn\'t' : 's weren\'t'} game data.` : ''}`);
  };
  const dash = h.querySelector('[data-ldash]');
  if (dash) bindDashboard(dash, () => { dash.innerHTML = renderDashboard(aggregate(filtered()), { players: filtered()[0]?.settings.players || o.players }); bindDashboard(dash, rerender); });
}

// ---------- running ----------
function run() {
  if (lab.running) return;
  const o = lab.opts;
  let w;
  try { w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }); } catch (e) {
    toast('This browser can\'t run the lab in the background.'); return;
  }
  lab.worker = w; lab.running = true;
  lab.progress = { game: 0, round: 0, start: lab.records.length };
  const seed = Math.floor(Math.random() * 1e6);
  w.onmessage = ({ data: m }) => {
    if (m.type === 'progress') { lab.progress.game = m.game; lab.progress.round = m.round; updateProgress(); }
    if (m.type === 'record') { lab.records.push(m.rec); lab.progress.game = m.game + 1; lab.progress.round = 0; refreshDash(); }
    if (m.type === 'error') { lab.errors++; console.error('Balance lab game failed:', m.error); }
    if (m.type === 'done') { lab.running = false; w.terminate(); lab.worker = null; rerender(); }
  };
  w.onerror = e => { console.error(e); lab.running = false; lab.worker = null; rerender(); };
  w.postMessage({ type: 'run', opts: { ...o, seats: o.seats.slice(0, o.players), seed } });
  rerender();
}
function stop() {
  lab.worker?.terminate();
  lab.worker = null; lab.running = false;
  rerender();
}
function updateProgress() {
  const el = document.querySelector('[data-lprogress]');
  if (el) el.textContent = progressText();
}
let dashTimer = null;
function refreshDash() {
  updateProgress();
  clearTimeout(dashTimer);
  dashTimer = setTimeout(() => {
    const dash = document.querySelector('[data-ldash]');
    if (!dash) return;
    dash.innerHTML = renderDashboard(aggregate(filtered()), { players: filtered()[0]?.settings.players || lab.opts.players });
    bindDashboard(dash, () => refreshDash());
  }, 200);
}
function download() {
  const data = { lastRigStanding: 'lab-results', version: 1, savedAt: new Date().toISOString(), records: lab.records };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  a.download = `last-rig-standing-balance-${new Date().toISOString().slice(0, 10)}-${lab.records.length}-games.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
