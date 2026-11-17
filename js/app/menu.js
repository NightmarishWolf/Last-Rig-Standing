// The main menu: a full-screen title page (no game showing behind it), with its sub-pages:
//   main    Continue / Resume, New game, Load game, Tutorial, Rules (+ Save and Surrender in a game)
//   setup   the new-game settings
//   load    every save: load, rename, export to a file, delete; import a file
//   over    the game-over screen (see gameover.js)
// The in-game Menu button opens this same page; Resume (or Esc) goes back to the board.
import * as E from '../engine/index.js';
import { gameOver, handoff, startTutorial } from './flow.js';
import { TIMER_OPTIONS, fmt, setup } from './settings.js';
import { A } from './state.js';
import { deleteSave, exportSave, importSave, latest, listSaves, loadSave, manualFull, newGameId, renameSave, save, saveAs } from './storage.js';
import { bindGameOver, downloadGameData, renderGameOver } from './gameover.js';
import { MAP_SIZES, PLAYER_COLORS } from '../data/maps.js';
import { VICTORIES } from '../data/victory.js';
import { DIFFICULTY, DIFFICULTY_ORDER, PERSONALITIES, PERSONALITY_ORDER } from '../data/bots.js';
import { closeOverlay, showConfirm, showOverlay, showRules } from '../ui/dialogs.js';
import { setState } from '../ui/index.js';
import { toast } from '../ui/status.js';
import { dispatch } from '../ui/index.js';
import { S } from '../ui/state.js';
import { N, hostLobby, join, leaveOnline, lobbyReady, mySeat, online, onlineRole, resumeHosting, startOnlineGame } from './online.js';
import { forgetGame, joinLink, myName, normCode, recentGames, setLobby, setMyName } from '../net/session.js';
import { transportName } from '../net/transport.js';
import { muted, play, setMuted, setVolume, soundCheck, volume } from '../ui/sound.js';

const home = () => document.getElementById('home');
export const homeOpen = () => document.body.classList.contains('at-home');
// a game the player can go back to without loading anything
const inGame = () => A.sessionActive && A.state && !A.state.tutorial && A.state.phase === 'playing';

let homeOpts = {};
export function showHome(view = 'main', opts = {}) {
  homeOpts = opts;
  closeOverlay();
  document.body.classList.add('at-home');
  home().classList.remove('hidden');
  home().dataset.view = view;
  const body = { main: mainPage, setup: setupPage, load: loadPage, over: () => renderGameOver(A.state), online: onlinePage, lobby: lobbyPage }[view]();
  home().innerHTML = `
    <div class="home-sea"></div>
    ${RIG_ART}
    <div class="home-inner ${view === 'main' ? '' : 'wide'}">
      <div class="home-brand" ${view === 'main' ? '' : 'data-back title="Back to the main menu"'}>
        <div class="home-title">LAST RIG <span>STANDING</span></div>
        ${view === 'main' ? '<div class="home-sub">A naval war of attrition. Find oil, build rigs, grow your fleet, and outlast everyone else.</div>' : ''}
      </div>
      ${body}
    </div>`;
  bind(view);
}
export function hideHome() {
  document.body.classList.remove('at-home');
  home().classList.add('hidden');
  home().innerHTML = '';
}
export const showMenu = () => showHome('main');
export const showSetup = () => showHome('setup');

// ---------- main page ----------
const ago = t => {
  const s = (Date.now() - t) / 1000;
  return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : new Date(t).toLocaleDateString();
};
const playersLine = e => e.players.map((pl, i) => `<span class="pchip ${pl.out ? 'out' : ''}" style="--c:${PLAYER_COLORS[i]}">${pl.seat === 'ai' ? '🤖 ' : ''}${pl.name}</span>`).join('');

function mainPage() {
  const last = !inGame() && latest();
  const st = A.state;
  return `
    <nav class="home-menu">
      ${inGame() ? `<button class="hm primary" data-resume>▶ Resume <small>${st.players[st.current].name} · round ${st.round}</small></button>` : ''}
      ${last ? `<button class="hm primary" data-continue>▶ Continue <small>round ${last.entry.round} · ${MAP_SIZES[last.entry.size]?.name || ''} map · saved ${ago(last.entry.savedAt)}</small></button>` : ''}
      <button class="hm ${inGame() || last ? '' : 'primary'}" data-new>⚓ New game</button>
      <button class="hm" data-load>📂 Load game</button>
      <button class="hm" data-online>🌐 Online <small>${online() ? `in game ${N.s.code}` : 'play with friends: host or join with a code'}</small></button>
      ${inGame() ? `<button class="hm" data-save>💾 Save game <small>a named copy you can come back to</small></button>` : ''}
      ${A.state && !A.state.tutorial && A.state.phase === 'over' && A.state.history ? '<button class="hm" data-results>🏁 Results of your last game</button>' : ''}
      <button class="hm" data-tutorial>🎓 Tutorial</button>
      <button class="hm" data-rules>📖 Rules</button>
      ${inGame() && (!online() || st.current === mySeat()) ? `<button class="hm danger" data-surrender>🏳 Surrender <small>${st.players[online() ? mySeat() : st.current].name}</small></button>` : ''}
      ${online() ? `<button class="hm danger" data-leaveonline>🚪 Leave online game <small>${onlineRole() === 'host' ? 'it stays saved: load it to host it again' : 'you can rejoin with the code'}</small></button>` : ''}
    </nav>
    ${last ? `<div class="home-card continue-card"><div class="muted small">Your last game</div><div class="cc-players">${playersLine(last.entry)}</div></div>` : ''}
    <div class="home-sound"><label>🔊 Sound <input type="range" min="0" max="1" step="0.05" value="${muted() ? 0 : volume()}" data-volume></label>
      <button class="ghost" data-testsound>Test</button><div class="muted small" data-soundnote></div></div>
    <div class="home-foot muted small">Games save automatically. Press <b>Esc</b> to go back to your game.</div>`;
}

// ---------- new game ----------
function seatRow(i) {
  const o = setup.seats[i], ai = o.seat === 'ai';
  return `<div class="seat-row" style="--c:${PLAYER_COLORS[i]}">
    <span class="chip" style="--c:${PLAYER_COLORS[i]}">Player ${i + 1}</span>
    <div class="seg small-seg">
      <button data-seat="${i}:human" class="${ai ? '' : 'on'}">🧑 Human</button>
      <button data-seat="${i}:ai" class="${ai ? 'on' : ''}">🤖 CPU</button>
    </div>
    ${ai ? `<div class="seg small-seg">${DIFFICULTY_ORDER.map(k => `<button data-diff="${i}:${k}" class="${o.difficulty === k ? 'on' : ''}" title="${DIFFICULTY[k].text}">${DIFFICULTY[k].icon} ${DIFFICULTY[k].name}</button>`).join('')}</div>
      <select data-pers="${i}" title="${o.personality === 'random' ? 'A personality is picked at random when the game starts' : PERSONALITIES[o.personality].text}">
        <option value="random" ${o.personality === 'random' ? 'selected' : ''}>🎲 Random personality</option>
        ${PERSONALITY_ORDER.map(k => `<option value="${k}" ${o.personality === k ? 'selected' : ''}>${PERSONALITIES[k].icon} ${PERSONALITIES[k].name}: ${PERSONALITIES[k].text}</option>`).join('')}
      </select>` : ''}
  </div>`;
}
function seatNote() {
  const humans = setup.seats.slice(0, setup.players).filter(o => o.seat !== 'ai').length;
  if (!humans) return '<b>Spectator mode:</b> every seat is a computer. Sit back and watch the admirals fight it out, with the whole map revealed.';
  if (humans === 1) return 'You play against the computer. You\'ll see the bots\' moves play out, but only what your fleet can see.';
  return 'Everyone shares one screen and passes the device between turns. Computer turns play out behind a curtain.';
}
function setupPage() {
  const max = MAP_SIZES[setup.size].maxPlayers;
  if (setup.players > max) setup.players = max;
  return `<div class="home-card">
    <h2>New game</h2>
    <div class="setup-cols">
      <div>
        <div class="setup-group">
          <div class="label">Map size</div>
          <div class="seg">${Object.entries(MAP_SIZES).filter(([, m]) => !m.hidden).map(([k, m]) => `
            <button data-size="${k}" class="${setup.size === k ? 'on' : ''}">${m.name}<small>${m.w}×${m.h}${m.maxPlayers < 4 ? ` · up to ${m.maxPlayers} players` : ''}</small></button>`).join('')}
          </div>
        </div>
        <div class="setup-group">
          <div class="label">Map layout</div>
          <div class="seg">
            <button data-mirror="1" class="${setup.mirror !== false ? 'on' : ''}" title="Every player's side of the map is a mirror image of the others: same islands, same oil, same distances.">⚖️ Mirrored<small>fair: same side for everyone</small></button>
            <button data-mirror="0" class="${setup.mirror === false ? 'on' : ''}" title="Islands and No Man's Sea oil are placed at random. One side may get luckier.">🎲 Random<small>one side may get lucky</small></button>
          </div>
        </div>
        <div class="setup-group">
          <div class="label">Turn timer</div>
          <div class="seg">${TIMER_OPTIONS.map(t => `
            <button data-timer="${t}" class="${setup.turnTimer === t ? 'on' : ''}">${t ? fmt(t) : 'Off'}</button>`).join('')}
          </div>
        </div>
        <div class="setup-group">
          <div class="label">Ways to win</div>
          <div class="seg">${Object.entries(VICTORIES).map(([k, v]) => `
            <button data-vic="${k}" class="${v.always || setup.victory[k] ? 'on' : ''}" ${v.always ? 'disabled' : ''} title="${v.text}">${v.icon} ${v.name}<small>${v.always ? 'always on' : setup.victory[k] ? 'on' : 'off'}</small></button>`).join('')}
          </div>
        </div>
      </div>
      <div>
        <div class="setup-group">
          <div class="label">Players</div>
          <div class="seg">${[2, 3, 4].map(n => `
            <button data-players="${n}" class="${setup.players === n ? 'on' : ''}" ${n > max ? 'disabled' : ''}>${n} players</button>`).join('')}
          </div>
          <div class="seats">${Array.from({ length: setup.players }, (_, i) => seatRow(i)).join('')}</div>
        </div>
        <p class="muted small" style="margin-top:14px">${setup.players === 2 ? 'Homes on the left and right, No Man\'s Sea in the middle.' : 'Homes in the corners' + (setup.players === 3 ? ' and bottom middle' : '') + ', No Man\'s Sea in between.'}
        ${seatNote()}</p>
      </div>
    </div>
    <div class="row" style="margin-top:18px">
      <button class="primary big" data-start>Start game</button>
      <button class="big ghost" data-back>Back</button>
    </div>
  </div>`;
}
function startGame() {
  // random personalities are rolled here, so each bot keeps one for the whole game
  const seats = setup.seats.slice(0, setup.players).map(o => o.seat === 'ai'
    ? { seat: 'ai', difficulty: o.difficulty, personality: o.personality === 'random' ? PERSONALITY_ORDER[Math.floor(Math.random() * PERSONALITY_ORDER.length)] : o.personality }
    : 'human');
  A.state = E.newGame({ size: setup.size, players: setup.players, turnTimer: setup.turnTimer, mirror: setup.mirror !== false, victory: { ...setup.victory }, seats });
  A.state.gameId = newGameId(); // its own save slot: the game you were playing stays saved
  A.sessionActive = false;
  leaveOnline();
  save(A.state); hideHome(); setState(A.state); handoff(A.state);
}

// ---------- load ----------
function loadPage() {
  const saves = listSaves();
  const row = e => `<div class="save-row">
      <div class="sv-main">
        <div class="sv-name">${e.kind === 'auto' ? '🔄 ' : '💾 '}${escapeHtml(e.name)} <span class="muted small">· round ${e.round} · ${MAP_SIZES[e.size]?.name || e.size} map · ${e.phase === 'over' ? 'finished' : 'in progress'} · ${ago(e.savedAt)}</span></div>
        <div class="cc-players">${playersLine(e)}</div>
      </div>
      <div class="sv-actions">
        <button class="primary" data-loadid="${e.id}">Load</button>
        ${e.kind === 'manual' ? `<button class="ghost" data-rename="${e.id}" title="Rename">✏️</button>` : ''}
        <button class="ghost" data-export="${e.id}" title="Download as a file">⬇️</button>
        <button class="ghost" data-del="${e.id}" title="Delete">🗑</button>
      </div>
    </div>`;
  return `<div class="home-card">
    <h2>Load game</h2>
    <p class="muted small">🔄 Autosaves keep your last 3 games, updated as you play. 💾 Saved games are named copies you made with <b>Save game</b>. ⬇️ downloads a save as a file, to keep or move to another device.</p>
    <div class="save-list">${saves.length ? saves.map(row).join('') : '<p class="muted">No saved games yet.</p>'}</div>
    <div class="row" style="margin-top:16px">
      <label class="button-like"><input type="file" accept=".json,application/json" data-import hidden>⬆️ Import a save file</label>
      <button class="big ghost" data-back>Back</button>
    </div>
  </div>`;
}
const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function openGame(st) {
  leaveOnline();
  if (st.online && st.phase === 'playing') { // a saved online game: host it again under its code
    resumeHosting(st).then(() => toast(`Hosting ${st.online.code} again: players can rejoin with that code.`), err => toast(err.message));
    return;
  }
  A.state = st;
  A.state.gameId ||= newGameId();
  A.sessionActive = false;
  hideHome(); setState(A.state);
  if (st.phase === 'over') { gameOver(st); return; }
  handoff(A.state);
}

// a little box asking for a save name
function askName(title, value, onOk, onCancel) {
  showOverlay(`<h2>${title}</h2>
    <input class="text-in" data-name maxlength="40" value="${escapeHtml(value)}">
    <div class="row" style="margin-top:16px"><button class="primary big" data-ok>Save</button><button class="big ghost" data-no>Cancel</button></div>`,
  (card, close) => {
    const inp = card.querySelector('[data-name]');
    inp.focus(); inp.select();
    const ok = () => { close(); onOk(inp.value.trim() || value); };
    card.querySelector('[data-ok]').onclick = ok;
    inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); ok(); } };
    card.querySelector('[data-no]').onclick = () => { close(); onCancel?.(); };
  });
}

// ---------- online ----------
function onlinePage() {
  const recent = recentGames();
  return `<div class="home-card online-card">
    <h2>🌐 Online</h2>
    <p class="muted small">Play with friends over the internet: one player hosts and shares a short code, the others join with it. Computer players can fill any seat.${transportName() === 'local' ? ' <b>Same-browser mode</b> (?net=local): games connect between tabs of this browser only.' : ''}</p>
    <div class="setup-group"><div class="label">Your name</div>
      <input class="text-in" data-myname maxlength="20" placeholder="Admiral" value="${escapeHtml(myName())}"></div>
    <div class="online-cols">
      <div class="home-card inner">
        <h3>Host a game</h3>
        <p class="muted small">You pick the map and seats, get a code to share, and start when everyone's in. Your browser runs the game, so keep it open while you play.</p>
        <button class="primary big" data-host>Host a game</button>
      </div>
      <div class="home-card inner">
        <h3>Join a game</h3>
        <input class="text-in code-in" data-code maxlength="6" placeholder="CODE" value="${escapeHtml(normCode(homeOpts.code || ''))}">
        <button class="primary big" data-join style="margin-top:8px">Join</button>
      </div>
    </div>
    ${recent.length ? `<div class="setup-group"><div class="label">Your recent online games</div>
      ${recent.map(g => `<div class="save-row"><div class="sv-main"><div class="sv-name">${g.code} <span class="muted small">· ${g.host ? 'you hosted' : 'you joined'} · ${ago(g.at)}</span></div></div>
        <div class="sv-actions">${g.host ? '<span class="muted small">load it from Load game to host again</span>' : `<button class="primary" data-rejoin="${g.code}">Rejoin</button>`}<button class="ghost" data-forget="${g.code}" title="Remove from this list">✕</button></div></div>`).join('')}</div>` : ''}
    <div class="row" style="margin-top:16px"><button class="big ghost" data-back>Back</button></div>
  </div>`;
}

function lobbyPage() {
  const s = N.s;
  if (!s) return onlinePage();
  const host = s.role === 'host', L = s.lobby;
  if (!L) return `<div class="home-card"><h2>Joining ${s.code}…</h2><p class="muted">Waiting for the host.</p><div class="row"><button class="big ghost" data-leavelobby>Cancel</button></div></div>`;
  const max = MAP_SIZES[L.size].maxPlayers;
  const seatRowOnline = i => {
    const o = L.seats[i];
    const tag = o.kind === 'host' ? `<span class="seat-tag">⭐ ${escapeHtml(host ? (myName() || 'You') + ' (you, host)' : (L.hostName || 'Host') + ' (host)')}</span>`
      : o.kind === 'online' ? `<span class="seat-tag ${o.clientId ? '' : 'muted'}">${o.clientId ? '🧑 ' + escapeHtml(o.name || 'Admiral') + (!host && i === s.seat ? ' (you)' : '') : '⏳ waiting for a player…'}</span>`
      : `<span class="seat-tag">🤖 ${DIFFICULTY[o.difficulty].name}${o.personality !== 'random' ? ' · ' + PERSONALITIES[o.personality].name : ''}</span>`;
    const ctrls = host && o.kind !== 'host' ? `<div class="seg small-seg">
        <button data-oseat="${i}:online" class="${o.kind === 'online' ? 'on' : ''}">🌐 Online player</button>
        <button data-oseat="${i}:ai" class="${o.kind === 'ai' ? 'on' : ''}">🤖 CPU</button></div>
      ${o.kind === 'ai' ? `<div class="seg small-seg">${DIFFICULTY_ORDER.map(k => `<button data-odiff="${i}:${k}" class="${o.difficulty === k ? 'on' : ''}">${DIFFICULTY[k].icon} ${DIFFICULTY[k].name}</button>`).join('')}</div>
        <select data-opers="${i}"><option value="random" ${o.personality === 'random' ? 'selected' : ''}>🎲 Random personality</option>${PERSONALITY_ORDER.map(k => `<option value="${k}" ${o.personality === k ? 'selected' : ''}>${PERSONALITIES[k].icon} ${PERSONALITIES[k].name}</option>`).join('')}</select>` : ''}` : '';
    return `<div class="seat-row" style="--c:${PLAYER_COLORS[i]}"><span class="chip" style="--c:${PLAYER_COLORS[i]}">Player ${i + 1}</span>${tag}${ctrls}</div>`;
  };
  const seg = (label, items) => `<div class="setup-group"><div class="label">${label}</div><div class="seg">${items}</div></div>`;
  const ro = !host ? 'disabled' : '';
  return `<div class="home-card">
    <div class="lobby-head">
      <div><h2>Game ${s.code}</h2><div class="muted small">${host ? 'Share the code or the link. Players appear here as they join.' : 'The host is setting up the game. It starts when they press Start.'}</div></div>
      <div class="code-box"><div class="code-big">${s.code}</div>${host ? `<button class="ghost" data-copylink>📋 Copy invite link</button>` : ''}</div>
    </div>
    <div class="setup-cols">
      <div>
        ${seg('Map size', Object.entries(MAP_SIZES).filter(([, m]) => !m.hidden).map(([k, m]) => `<button data-osize="${k}" class="${L.size === k ? 'on' : ''}" ${ro}>${m.name}<small>${m.w}×${m.h}</small></button>`).join(''))}
        ${seg('Map layout', `<button data-omirror="1" class="${L.mirror !== false ? 'on' : ''}" ${ro}>⚖️ Mirrored</button><button data-omirror="0" class="${L.mirror === false ? 'on' : ''}" ${ro}>🎲 Random</button>`)}
        ${seg('Turn timer', TIMER_OPTIONS.map(t => `<button data-otimer="${t}" class="${L.turnTimer === t ? 'on' : ''}" ${ro}>${t ? fmt(t) : 'Off'}</button>`).join(''))}
        ${seg('Ways to win', Object.entries(VICTORIES).map(([k, v]) => `<button data-ovic="${k}" class="${v.always || L.victory[k] ? 'on' : ''}" ${v.always || !host ? 'disabled' : ''}>${v.icon} ${v.name}</button>`).join(''))}
      </div>
      <div>
        ${seg('Players', [2, 3, 4].map(n => `<button data-oplayers="${n}" class="${L.players === n ? 'on' : ''}" ${n > max || !host ? 'disabled' : ''}>${n} players</button>`).join(''))}
        <div class="seats">${Array.from({ length: L.players }, (_, i) => seatRowOnline(i)).join('')}</div>
      </div>
    </div>
    <div class="row" style="margin-top:18px">
      ${host ? `<button class="primary big" data-ostart ${lobbyReady(L) ? '' : 'disabled'}>Start game</button>${lobbyReady(L) ? '' : '<span class="muted small">Waiting for every online seat to fill (or make it a CPU).</span>'}` : ''}
      <button class="big ghost" data-leavelobby>${host ? 'Close the game' : 'Leave'}</button>
    </div>
  </div>`;
}

function bindOnline(view, h, on) {
  if (view === 'online') {
    const nameIn = h.querySelector('[data-myname]'), codeIn = h.querySelector('[data-code]');
    nameIn.oninput = () => setMyName(nameIn.value.trim());
    codeIn.oninput = () => { codeIn.value = normCode(codeIn.value); };
    codeIn.onkeydown = e => { if (e.key === 'Enter') h.querySelector('[data-join]').click(); };
    const go = async (fn, b) => {
      if (!myName()) setMyName(nameIn.value.trim() || 'Admiral');
      b.disabled = true; b.textContent = 'Connecting…';
      try { await fn(); showHome('lobby'); } catch (err) { toast(err.message); showHome('online', { code: codeIn.value }); }
    };
    on('[data-host]', b => go(() => hostLobby(), b));
    on('[data-join]', b => { const c = normCode(codeIn.value); if (c.length < 4) { toast('Type the 4-letter code first.'); return; } go(() => join(c), b); });
    on('[data-rejoin]', b => go(() => join(b.dataset.rejoin), b));
    on('[data-forget]', b => { forgetGame(b.dataset.forget); showHome('online'); });
  }
  if (view === 'lobby') {
    on('[data-leavelobby]', () => { leaveOnline(); showHome('online'); });
    on('[data-copylink]', () => { navigator.clipboard?.writeText(joinLink(N.s.code)).then(() => toast('Invite link copied.'), () => toast(joinLink(N.s.code))); });
    if (N.s?.role !== 'host') return;
    const L = N.s.lobby, re = changes => { setLobby(changes); showHome('lobby'); };
    on('[data-osize]', b => { const m = MAP_SIZES[b.dataset.osize]; re({ size: b.dataset.osize, players: Math.min(L.players, m.maxPlayers) }); });
    on('[data-omirror]', b => re({ mirror: b.dataset.omirror === '1' }));
    on('[data-otimer]', b => re({ turnTimer: Number(b.dataset.otimer) }));
    on('[data-ovic]', b => re({ victory: { ...L.victory, [b.dataset.ovic]: !L.victory[b.dataset.ovic] } }));
    on('[data-oplayers]', b => re({ players: Number(b.dataset.oplayers) }));
    on('[data-oseat]', b => { const [i, k] = b.dataset.oseat.split(':'); const seats = [...L.seats]; seats[i] = { ...seats[i], kind: k, ...(k === 'ai' ? { clientId: null, name: null } : {}) }; re({ seats }); });
    on('[data-odiff]', b => { const [i, k] = b.dataset.odiff.split(':'); const seats = [...L.seats]; seats[i] = { ...seats[i], difficulty: k }; re({ seats }); });
    h.querySelectorAll('[data-opers]').forEach(sel => sel.onchange = () => { const seats = [...L.seats]; seats[sel.dataset.opers] = { ...seats[sel.dataset.opers], personality: sel.value }; re({ seats }); });
    on('[data-ostart]', () => { if (lobbyReady(L)) startOnlineGame(); });
  }
}

// ---------- wiring ----------
function bind(view) {
  const h = home(), on = (sel, fn) => h.querySelectorAll(sel).forEach(b => b.addEventListener('click', e => fn(b, e)));
  on('[data-back]', () => showHome('main'));
  bindOnline(view, h, on);
  if (view === 'main') {
    on('[data-resume]', () => hideHome());
    const vol = h.querySelector('[data-volume]');
    if (vol) { vol.oninput = () => { setMuted(+vol.value === 0); if (+vol.value > 0) setVolume(+vol.value); }; vol.onchange = () => play('gun'); }
    on('[data-testsound]', () => {
      if (muted()) { setMuted(false); if (vol && +vol.value === 0) { vol.value = 0.6; setVolume(0.6); } }
      play('heavy'); play('boom', 0.5);
      setTimeout(() => {
        const c = soundCheck(), note = h.querySelector('[data-soundnote]');
        if (note) note.textContent = c.state === 'running' ? 'If you heard nothing, check your device volume (and the silent switch on a phone).'
          : c.state === 'none' ? 'This browser doesn\'t support web audio.' : `Your browser is holding the sound back (${c.state}): click anywhere on the page, then Test again.`;
      }, 900);
    });
    on('[data-continue]', () => { const l = latest(); if (l?.st) openGame(l.st); });
    on('[data-new]', () => showHome('setup'));
    on('[data-load]', () => showHome('load'));
    on('[data-results]', () => showHome('over'));
    on('[data-online]', () => showHome(online() || N.s ? 'lobby' : 'online'));
    on('[data-leaveonline]', () => showConfirm('Leave the online game?', onlineRole() === 'host' ? 'Everyone else will be disconnected. The game stays saved: load it from Load game to host it again with the same code.' : 'You can rejoin later with the code.', 'Leave', () => { leaveOnline(); A.sessionActive = false; showHome('main'); }, () => showHome('main')));
    on('[data-tutorial]', () => { leaveOnline(); hideHome(); startTutorial(); });
    on('[data-rules]', () => showRules());
    on('[data-save]', () => {
      if (manualFull()) { toast('You have 12 saved games: delete one on the Load game page first.'); return; }
      askName('Save game', `${A.state.players[A.state.current].name} · round ${A.state.round}`, name => { saveAs(A.state, name); toast(`Saved "${name}".`); });
    });
    on('[data-surrender]', () => showConfirm('Surrender?',
      `${A.state.players[A.state.current].name} will be knocked out and their whole fleet will sink.`, 'Surrender', () => {
        hideHome();
        if (online()) { S.botTurn = false; dispatch({ type: 'surrender' }); } // sent on to the others
        else { E.applyAction(A.state, { type: 'surrender' }); save(A.state); }
        setState(A.state);
        if (A.state.phase === 'over') gameOver(A.state); else handoff(A.state);
      }));
  }
  if (view === 'setup') {
    const re = () => showHome('setup');
    on('[data-size]', b => { setup.size = b.dataset.size; re(); });
    on('[data-vic]', b => { setup.victory[b.dataset.vic] = !setup.victory[b.dataset.vic]; re(); });
    on('[data-mirror]', b => { setup.mirror = b.dataset.mirror === '1'; re(); });
    on('[data-timer]', b => { setup.turnTimer = Number(b.dataset.timer); re(); });
    on('[data-players]', b => { setup.players = Number(b.dataset.players); re(); });
    on('[data-seat]', b => { const [i, v] = b.dataset.seat.split(':'); setup.seats[i].seat = v; re(); });
    on('[data-diff]', b => { const [i, v] = b.dataset.diff.split(':'); setup.seats[i].difficulty = v; re(); });
    h.querySelectorAll('[data-pers]').forEach(sel => sel.onchange = () => { setup.seats[sel.dataset.pers].personality = sel.value; re(); });
    on('[data-start]', () => startGame());
  }
  if (view === 'load') {
    on('[data-loadid]', b => { const st = loadSave(b.dataset.loadid); if (st) openGame(st); else toast('That save couldn\'t be read.'); });
    on('[data-export]', b => exportSave(b.dataset.export));
    on('[data-rename]', b => {
      const e = listSaves().find(x => x.id === b.dataset.rename);
      askName('Rename save', e?.name || '', name => { renameSave(b.dataset.rename, name); showHome('load'); }, () => showHome('load'));
    });
    on('[data-del]', b => {
      const e = listSaves().find(x => x.id === b.dataset.del);
      showConfirm('Delete this save?', `${escapeHtml(e?.name || 'This save')} (round ${e?.round}) will be gone for good.`, 'Delete', () => { deleteSave(b.dataset.del); showHome('load'); }, () => showHome('load'));
    });
    const inp = h.querySelector('[data-import]');
    if (inp) inp.onchange = () => {
      const f = inp.files[0];
      if (f) importSave(f).then(() => { toast('Save imported.'); showHome('load'); }, err => toast(err.message));
    };
  }
  if (view === 'over') {
    on('[data-new]', () => showHome('setup'));
    on('[data-menu]', () => { A.sessionActive = false; showHome('main'); });
    on('[data-viewmap]', () => hideHome());
    bindGameOver(h, A.state);
    on('[data-gamedata]', () => downloadGameData(A.state));
  }
}

// Esc on the menu goes back to the game (or up a page)
document.addEventListener('keydown', e => {
  if (!homeOpen() || !document.getElementById('overlay').classList.contains('hidden')) return;
  if (e.key !== 'Escape') return;
  const view = home().dataset.view;
  if (view === 'setup' || view === 'load' || view === 'online') showHome('main');
  else if (view === 'main' && inGame()) hideHome();
});

// the background art: the rig from the favicon, big and faint, with a flare
const RIG_ART = `<svg class="home-rig" viewBox="0 0 64 64" aria-hidden="true">
  <path d="M32 6 L22 40 H42 Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M27.5 22 H36.5 M25 31 H39 M28.5 22 L39 31 M35.5 22 L25 31" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
  <rect x="14" y="39" width="36" height="5" rx="1.5" fill="currentColor"/>
  <path d="M18 44 V58 M46 44 V58 M32 44 V58" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  <path d="M32 6 V1.5 L38 3.5 L32 5.5" fill="currentColor"/>
</svg>`;
