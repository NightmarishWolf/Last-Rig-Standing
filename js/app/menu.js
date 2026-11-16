// Main menu and the new-game setup screen.
import * as E from '../engine/index.js';
import { gameOver, handoff, startTutorial } from './flow.js';
import { TIMER_OPTIONS, fmt, setup } from './settings.js';
import { A } from './state.js';
import { load, save } from './storage.js';
import { MAP_SIZES, PLAYER_COLORS } from '../data/maps.js';
import { VICTORIES } from '../data/victory.js';
import { DIFFICULTY, DIFFICULTY_ORDER, PERSONALITIES, PERSONALITY_ORDER } from '../data/bots.js';

// One seat on the setup screen: Human or CPU, and for a CPU its difficulty and personality.
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
import { showConfirm, showOverlay, showRules } from '../ui/dialogs.js';
import { setState } from '../ui/index.js';

export function showMenu() {
  const saved = load();
  const canContinue = saved && saved.phase === 'playing';
  const inGame = A.sessionActive && A.state && !A.state.tutorial && A.state.phase === 'playing' && canContinue;
  showOverlay(`
    <h1>LAST RIG <span style="color:var(--oil)">STANDING</span></h1>
    <p class="muted">A naval war of attrition. Find oil, build rigs, grow your fleet, and outlast everyone else.</p>
    <div class="row" style="margin-top:16px">
      ${inGame ? '<button class="primary big" data-resume>Resume</button>' : ''}
      ${canContinue && !inGame ? `<button class="primary big" data-continue>Continue (${saved.players.length} players, round ${saved.round})</button>` : ''}
      <button class="${canContinue ? '' : 'primary'} big" data-new>New game</button>
      <button class="big" data-tutorial>Tutorial</button>
      <button class="big ghost" data-rules>Rules</button>
      ${inGame ? `<button class="big danger" data-surrender>Surrender (${A.state.players[A.state.current].name})</button>` : ''}
    </div>`, (card, close) => {
    card.querySelector('[data-new]').onclick = () => showSetup(canContinue);
    card.querySelector('[data-rules]').onclick = () => showRules();
    card.querySelector('[data-tutorial]').onclick = () => { close(); startTutorial(); };
    const res = card.querySelector('[data-resume]');
    if (res) res.onclick = () => close(); // timer picks up where it left off
    const c = card.querySelector('[data-continue]');
    if (c) c.onclick = () => { close(); A.state = saved; setState(A.state); handoff(A.state); };
    const sur = card.querySelector('[data-surrender]');
    if (sur) sur.onclick = () => showConfirm('Surrender?',
      `${A.state.players[A.state.current].name} will be knocked out and their whole fleet will sink.`, 'Surrender', () => {
        E.applyAction(A.state, { type: 'surrender' });
        save(A.state); setState(A.state);
        if (A.state.phase === 'over') gameOver(A.state); else handoff(A.state);
      }, showMenu);
  });
}

export function showSetup(overwriting) {
  const max = MAP_SIZES[setup.size].maxPlayers;
  if (setup.players > max) setup.players = max;
  showOverlay(`
    <h2>New game</h2>
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
    <div class="setup-group">
      <div class="label">Players</div>
      <div class="seg">${[2, 3, 4].map(n => `
        <button data-players="${n}" class="${setup.players === n ? 'on' : ''}" ${n > max ? 'disabled' : ''}>${n} players</button>`).join('')}
      </div>
      <div class="seats">${Array.from({ length: setup.players }, (_, i) => seatRow(i)).join('')}</div>
    </div>
    <p class="muted small" style="margin-top:14px">${setup.players === 2 ? 'Homes on the left and right, No Man\'s Sea in the middle.' : 'Homes in the corners' + (setup.players === 3 ? ' and bottom middle' : '') + ', No Man\'s Sea in between.'}
    ${seatNote()}</p>
    <div class="row" style="margin-top:16px">
      <button class="primary big" data-start>Start game</button>
      <button class="big ghost" data-back>Back</button>
    </div>`, (card, close) => {
    card.querySelectorAll('[data-size]').forEach(b => b.onclick = () => { setup.size = b.dataset.size; showSetup(overwriting); });
    card.querySelectorAll('[data-vic]').forEach(b => b.onclick = () => { setup.victory[b.dataset.vic] = !setup.victory[b.dataset.vic]; showSetup(overwriting); });
    card.querySelectorAll('[data-mirror]').forEach(b => b.onclick = () => { setup.mirror = b.dataset.mirror === '1'; showSetup(overwriting); });
    card.querySelectorAll('[data-timer]').forEach(b => b.onclick = () => { setup.turnTimer = Number(b.dataset.timer); showSetup(overwriting); });
    card.querySelectorAll('[data-players]').forEach(b => b.onclick = () => { setup.players = Number(b.dataset.players); showSetup(overwriting); });
    card.querySelectorAll('[data-seat]').forEach(b => b.onclick = () => { const [i, v] = b.dataset.seat.split(':'); setup.seats[i].seat = v; showSetup(overwriting); });
    card.querySelectorAll('[data-diff]').forEach(b => b.onclick = () => { const [i, v] = b.dataset.diff.split(':'); setup.seats[i].difficulty = v; showSetup(overwriting); });
    card.querySelectorAll('[data-pers]').forEach(sel => sel.onchange = () => { setup.seats[sel.dataset.pers].personality = sel.value; showSetup(overwriting); });
    card.querySelector('[data-back]').onclick = showMenu;
    card.querySelector('[data-start]').onclick = () => {
      const start = () => {
        close();
        // random personalities are rolled here, so each bot keeps one for the whole game
        const seats = setup.seats.slice(0, setup.players).map(o => o.seat === 'ai'
          ? { seat: 'ai', difficulty: o.difficulty, personality: o.personality === 'random' ? PERSONALITY_ORDER[Math.floor(Math.random() * PERSONALITY_ORDER.length)] : o.personality }
          : 'human');
        A.state = E.newGame({ size: setup.size, players: setup.players, turnTimer: setup.turnTimer, mirror: setup.mirror !== false, victory: { ...setup.victory }, seats });
        save(A.state); setState(A.state); handoff(A.state);
      };
      if (overwriting) showConfirm('Start a new game?', 'Your saved game will be lost.', 'Start new game', start, () => showSetup(overwriting));
      else start();
    };
  });
}
