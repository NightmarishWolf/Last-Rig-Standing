// Computer turns on screen: runs every bot whose turn it is, animating what the watching human
// could see, then hands back to the next human.
//
//   one human:     their fog of war stays on; bot moves they can see glide and shots fly
//   two or more:   bots play behind a curtain (nobody should see anyone else's side)
//   no humans:     spectator mode, the whole map with no fog
import * as E from '../engine/index.js';
import { isBot, runBotTurn } from '../ai/index.js';
import { DIFFICULTY, PERSONALITIES } from '../data/bots.js';
import { PLAYER_COLORS } from '../data/maps.js';
import { BOT_SPEEDS, view } from './settings.js';
import { A } from './state.js';
import { save } from './storage.js';
import { animateStep } from '../ui/board/fx.js';
import { showOverlay } from '../ui/dialogs.js';
import { refresh } from '../ui/index.js';
import { S } from '../ui/state.js';
import { botAction, mySeat, online, paused as netPaused } from './online.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
// (in a campaign only seat 0 is a person: any other non-AI seats are sides the mission scripts)
export const humans = st => st.players.map((_, i) => i).filter(i => st.players[i].seat !== 'ai' && !st.players[i].out && (!st.campaign || i === 0));
const speedMs = () => (BOT_SPEEDS.find(s => s.id === view.botSpeed) || BOT_SPEEDS[1]).ms;
const overlayOpen = () => !document.getElementById('overlay').classList.contains('hidden') && !document.querySelector('#overlay [data-curtain]');

let runningFor = null; // the game the bot loop is playing (a new game simply starts its own loop)
let skipTurn = false, paused = false;

// Play bot turns until it's a human's turn (or the game ends), then call after(st).
export async function playBotTurns(after) {
  const st = A.state;
  if (runningFor === st) return;
  if (runningFor !== st) paused = false; // a pause belongs to the game it was pressed in
  runningFor = st;
  const hs = humans(st);
  const net = online(); // online: every player watches from their own seat on their own screen
  const curtain = !net && hs.length > 1;
  S.spectate = !net && hs.length === 0;
  S.viewer = net ? mySeat() : hs.length === 1 ? hs[0] : null;
  S.botTurn = true; S.selectedId = null; S.selectedBase = null; S.mode = { kind: 'idle' };
  try {
    while (st === A.state && st.phase === 'playing' && isBot(st, st.current)) {
      const p = st.current;
      skipTurn = false;
      if (curtain) showCurtain(st, p); else showBar(st, p);
      refresh();
      const step = async a => {
        while ((paused || netPaused() || (!net && overlayOpen())) && st === A.state) await sleep(150); // menu open or paused: wait
        if (st !== A.state || st.phase !== 'playing') return { ok: false };
        const ms = curtain || skipTurn ? 0 : speedMs();
        const r = ms ? await animateStep(st, a, ms) : E.applyAction(st, a);
        botAction(a, r); // online: pass the bot's move on to the other players
        return r;
      };
      await runBotTurn(st, p, step);
      if (st !== A.state) break; // the player left for a new game
      await step({ type: 'endTurn' });
      save(st);
      if (!curtain && !skipTurn && speedMs()) { refresh(); await sleep(speedMs()); }
      else await sleep(0); // let the screen breathe between instant turns
    }
  } finally {
    if (runningFor === st) runningFor = null;
    if (st !== A.state) return; // a newer game owns the screen now
    S.botTurn = false; S.tween = null; S.fx = [];
    if (!S.spectate) S.viewer = net ? mySeat() : null;
    hideBar();
  }
  if (st === A.state) after(st);
}

// ---------- the "Admiral X is taking their turn" bar ----------
function barEl() {
  let el = document.getElementById('botbar');
  if (!el) { el = document.createElement('div'); el.id = 'botbar'; el.className = 'botbar hidden'; document.body.appendChild(el); }
  return el;
}
function botLabel(st, p) {
  const ai = st.players[p].ai;
  // the personality stays secret: you find out how a bot plays by playing it
  return `<b style="color:${PLAYER_COLORS[p]}">${st.players[p].name}</b> <span class="muted small">${DIFFICULTY[ai.difficulty].name}</span>`;
}
function showBar(st, p) {
  const el = barEl();
  el.style.setProperty('--c', PLAYER_COLORS[p]);
  const mode = S.spectate ? 'spectate' : 'watch';
  // the buttons are built once and kept (so they stay clickable while turns fly by); only the name changes
  if (el.dataset.mode !== mode) {
    el.dataset.mode = mode;
    el.innerHTML = `<span class="who"></span>
      ${mode === 'spectate' ? `<span class="seg small-seg">${BOT_SPEEDS.map(s => `<button data-speed="${s.id}">${s.name}</button>`).join('')}</span>
        <button data-pause></button>` : '<button data-skip title="Finish this computer turn instantly">Skip ⏩</button>'}`;
    el.onclick = e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.skip !== undefined) skipTurn = true;
      if (b.dataset.speed) view.botSpeed = b.dataset.speed;
      if (b.dataset.pause !== undefined) paused = !paused;
      syncButtons(el);
    };
  }
  el.querySelector('.who').innerHTML = `${botLabel(st, p)} is taking their turn<span class="dots"></span>`;
  syncButtons(el);
  el.classList.remove('hidden');
}
function syncButtons(el) {
  el.querySelectorAll('[data-speed]').forEach(b => b.classList.toggle('on', b.dataset.speed === view.botSpeed));
  const pb = el.querySelector('[data-pause]');
  if (pb) pb.textContent = paused ? '▶ Resume' : '⏸ Pause';
}
function hideBar() { barEl().classList.add('hidden'); }

// Several humans: the bot plays behind a curtain so nobody sees the board.
function showCurtain(st, p) {
  showOverlay(`<div data-curtain>
    <h2>🤖 ${botLabel(st, p)}</h2>
    <p class="muted">is taking their turn<span class="dots"></span></p></div>`, () => {});
}
