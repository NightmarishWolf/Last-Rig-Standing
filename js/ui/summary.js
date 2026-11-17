// "Since your last turn": a short report at the start of each turn of what happened while you were
// away (or during your own end of turn): attacks on you, your hits, oil news, things that finished,
// ships that need orders, and news about rivals. Click an item with a 📍 to jump the map there.
// Enter / Esc / the button closes it. It can be switched off, and reopened with the 📋 button.
import * as E from '../engine/index.js';
import { centerOn } from './camera.js';
import { S } from './state.js';
import { closeOverlay, showOverlay } from './dialogs.js';
import { refresh } from './index.js';

const GROUPS = [
  { k: 'hit', title: '⚠️ Attacks on you', cls: 'bad' },
  { k: 'win', title: '⚔️ Your attacks', cls: 'good' },
  { k: 'oil', title: '🛢️ Oil', cls: '' },
  { k: 'done', title: '✅ Finished', cls: '' },
  { k: 'fleet', title: '🧭 Ships that need you', cls: 'warn' },
  { k: 'world', title: '🌍 News', cls: '' },
];
const PER_GROUP = 8;

const PREF_KEY = 'lrs-prefs';
const prefs = () => { try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch { return {}; } };
const setPref = (k, v) => { try { localStorage.setItem(PREF_KEY, JSON.stringify({ ...prefs(), [k]: v })); } catch { /* blocked */ } };
export const summaryEnabled = () => prefs().turnSummary !== false;

const last = {}; // player -> the items last shown (for the 📋 button)

export function showTurnSummary(st, p, force = false) {
  if (st.tutorial || st.phase !== 'playing') return;
  const items = force && last[p] ? last[p] : E.turnSummary(st, p);
  if (!force) last[p] = items;
  if (!items.length && !force) return;
  if (!force && !summaryEnabled()) return;
  // identical messages (a rig hit three times...) collapse into one line with a count
  const merged = [];
  for (const it of items) {
    const same = merged.find(m => m.k === it.k && m.text === it.text);
    if (same) same.count++; else merged.push({ ...it, count: 1 });
  }
  const groups = GROUPS.map(g => ({ ...g, list: merged.filter(m => m.k === g.k) })).filter(g => g.list.length);
  const prod = st.players[p].log.find(l => !l.k && /^Round \d+: rigs pumped/.test(l.text));
  showOverlay(`
    <div class="summary">
      <h2>Since your last turn <span class="muted small">· round ${st.round}</span></h2>
      ${prod ? `<p class="muted small sum-prod">${prod.text.replace(/^Round \d+: /, '')}</p>` : ''}
      ${groups.length ? groups.map(g => `
        <div class="sum-group ${g.cls}">
          <div class="sum-title">${g.title}</div>
          ${g.list.slice(0, PER_GROUP).map((m, i) => `
            <div class="sum-item ${m.x != null ? 'go' : ''}" ${m.x != null ? `data-go="${m.x},${m.y}" title="Show on the map"` : ''}>
              ${m.x != null ? '<span class="pin">📍</span>' : ''}<span>${m.text}${m.count > 1 ? ` <b class="muted">×${m.count}</b>` : ''}</span>
            </div>`).join('')}
          ${g.list.length > PER_GROUP ? `<div class="muted small">+${g.list.length - PER_GROUP} more</div>` : ''}
        </div>`).join('') : '<p class="muted">A quiet turn: nothing to report.</p>'}
      <div class="row sum-foot">
        <button class="primary big" data-ok>Got it <span class="key-hint">⏎</span></button>
        <label class="small muted"><input type="checkbox" data-pref ${summaryEnabled() ? 'checked' : ''}> Show this at the start of every turn</label>
      </div>
    </div>`,
  (card, close) => {
    const done = () => { close(); document.removeEventListener('keydown', onKey, true); refresh(); };
    const onKey = e => {
      if (e.key !== 'Enter' && e.key !== 'Escape') return;
      if (document.getElementById('overlay').classList.contains('hidden')) { document.removeEventListener('keydown', onKey, true); return; }
      e.preventDefault(); e.stopPropagation(); done();
    };
    document.addEventListener('keydown', onKey, true);
    card.querySelector('[data-ok]').onclick = done;
    card.querySelector('[data-pref]').onchange = e => setPref('turnSummary', e.target.checked);
    card.querySelectorAll('[data-go]').forEach(el => el.onclick = () => {
      const [x, y] = el.dataset.go.split(',').map(Number);
      done();
      centerOn(x, y);
      S.ping = { x, y, until: performance.now() + 1600 }; // a brief ring on the map (board/render.js)
      refresh();
    });
  });
}

// the 📋 button in the top bar: show the last report again
export function reopenSummary() {
  const st = S.st, p = S.viewer ?? st.current;
  showTurnSummary(st, p, true);
}
export const closeSummary = closeOverlay;
