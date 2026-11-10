// ============================================================
// TUTORIAL
// A hand-built small map plus a list of steps. Each step has a
// check() that looks at the game state; when it passes, the coach
// moves on. Markers glow on the board, `highlight` pulses a button.
// ============================================================
import * as E from './engine.js';
import { SHIPS } from './data/ships.js';

const DEP_FOUND = 'd_tut_found';  // hidden deposit the player surveys
const TARGET = 'tut_target';      // unarmed enemy barge
const TARGET_CELLS = [[8, 5], [9, 5], [10, 5]];

function ship(id, owner, type, x, y) {
  return {
    id, owner, type, x, y, rot: 0, hp: SHIPS[type].hp,
    movesLeft: SHIPS[type].move, acted: false, shotsLeft: 0, activeAction: null,
    cooldowns: {}, freeUsed: {}, screenUsed: false, adUsed: false,
  };
}

export function newTutorialGame() {
  const st = E.newGame({ size: 'small', players: 2, seed: 2026 });
  st.tutorial = true;
  // a few islands, out of the way
  st.land.fill(0);
  [[14, 1], [14, 2], [15, 2], [13, 11], [14, 11], [15, 11], [15, 10], [11, 8], [12, 8]].forEach(([x, y]) => { st.land[y * st.W + x] = 1; });
  st.deposits = [
    { id: 'd_tut_home', x: 5, y: 2, type: 'medium', reserves: 45 },
    { id: DEP_FOUND, x: 5, y: 9, type: 'small', reserves: 30 },
    { id: 'd_tut_a', x: 3, y: 12, type: 'small', reserves: 30 },
    { id: 'd_tut_b', x: 12, y: 4, type: 'rich', reserves: 70 },
    { id: 'd_tut_c', x: 16, y: 8, type: 'medium', reserves: 45 },
    { id: 'd_tut_d', x: 20, y: 3, type: 'medium', reserves: 45 },
  ];
  st.rigs = [{ id: 'r_tut_home', owner: 0, x: 5, y: 2, hp: 2, depId: 'd_tut_home' }];
  st.ships = [
    ship('tut_pb_south', 0, 'patrol', 0, 9),
    ship('tut_pb_north', 0, 'patrol', 0, 3),
    ship(TARGET, 1, 'target', 8, 5),
  ];
  st.mines = []; st.wrecks = [];
  st.blocked = ['5,9']; // ships can't park on the deposit, so the rig always has room
  const [me, foe] = st.players;
  me.name = 'You'; foe.name = 'Enemy';
  me.money = 400; me.oil = 15; me.known = { d_tut_home: true };
  me.log = [{ turn: 1, text: 'Welcome to the tutorial, Admiral.' }];
  foe.money = 0; foe.known = {}; foe.log = [];
  return st;
}

const pb = st => st.ships.filter(s => s.owner === 0 && s.type === 'patrol');
const targetAlive = st => st.ships.some(s => s.id === TARGET);
const targetSeen = st => E.visibility(st, 0).ships.has(TARGET);

// Each step: title, text (HTML), optional markers [{x0,y0,x1,y1,label}],
// highlight (CSS selector of a panel button), next: true for read-only steps.
export const STEPS = [
  {
    title: 'Welcome, Admiral',
    text: `This is the sea. <b>Your home waters</b> are on the left, inside the teal dashed border. The enemy's are on the right. The open water in between is <b>No Man's Sea</b>, where the richest oil is.<br><br>
      Your goal in a real game: find oil, build rigs, grow your fleet, and be the <b>last rig standing</b>.`,
    next: true,
  },
  {
    title: 'Oil and money',
    text: `Look at <b>Resources</b> in the panel on the right.<br>
      <b class="oil">Oil</b> moves your ships: every square costs oil, and bigger ships burn more.<br>
      <b class="money">Money</b> buys ships and rigs. You earn money by selling oil.<br>
      Your rig (the tower icon) produces oil at the start of every turn.`,
    markers: [{ x0: 5, y0: 2, x1: 5, y1: 2, label: 'Your oil rig' }],
    next: true,
  },
  {
    title: 'Select a ship',
    text: 'Click your <b>Patrol Boat</b> (the teal "PB") near the bottom of your waters.',
    markers: [{ x0: 0, y0: 9, x1: 1, y1: 9, label: 'Click me' }],
    check: (st, ui) => ui.selectedId && st.ships.find(s => s.id === ui.selectedId)?.owner === 0,
  },
  {
    title: 'Move',
    text: `The light teal area shows everywhere this ship can reach. Our scouts report <b>oil signs</b> near the glowing marker.<br>
      Move your Patrol Boat so it's <b>right next to the marker</b> (you can't sail onto it). Hover to preview the cost, click to move.`,
    markers: [{ x0: 5, y0: 9, x1: 5, y1: 9, label: 'Oil signs?' }],
    check: st => pb(st).some(s => E.dist(E.shipCells(s), [[5, 9]]) <= 1),
  },
  {
    title: 'Survey for oil',
    text: `Oil deposits are hidden until you find them. With your Patrol Boat selected, click <b>Survey</b> in the panel. It checks the squares around the ship.<br>
      <span class="muted small">(If the ship got deselected, click it again first.)</span>`,
    highlight: '[data-act="survey"]',
    markers: [{ x0: 5, y0: 9, x1: 5, y1: 9 }],
    check: st => !!st.players[0].known[DEP_FOUND],
  },
  {
    title: 'Build an oil rig',
    text: `Found one! The amber circle marked <b>S</b> is a small deposit (M = medium, R = rich).<br>
      Click <b>Build rig</b>, then click the deposit. A rig needs one of your ships right next to it.`,
    highlight: '[data-rig]',
    markers: [{ x0: 5, y0: 9, x1: 5, y1: 9, label: 'Build here' }],
    check: st => st.rigs.some(r => r.owner === 0 && r.depId === DEP_FOUND),
  },
  {
    title: 'Sell oil',
    text: `Money is tight after that rig. Click <b>Sell 5</b> in Resources.<br>
      Selling lowers the oil price a little, and it recovers each turn, so don't dump everything at once.`,
    highlight: '[data-sell="5"]',
    check: st => st.players[0].log.some(l => l.text.startsWith('Sold')),
  },
  {
    title: 'Buy a ship',
    text: `In the <b>Shipyard</b> (scroll down the panel), click <b>$100</b> next to <b>Patrol Boat</b>.<br>
      Then click inside your <b>spawn zone</b>, the lighter strip along your left edge. Press <b>R</b> to turn it while placing.`,
    highlight: '[data-buy="patrol"]',
    markers: [{ x0: 0, y0: 0, x1: 2, y1: 13, label: 'Spawn zone' }],
    check: st => st.ships.filter(s => s.owner === 0).length >= 3,
  },
  {
    title: 'End your turn',
    text: `New ships are ready next turn. Click <b>End turn</b>.<br>
      In a real game you'd pass the device to the next player now. Here the enemy just sits still.`,
    highlight: '[data-end]',
    check: st => st.round >= 2 && st.current === 0,
  },
  {
    title: 'Scout ahead',
    text: `New turn: your rigs pumped more oil. Intel says an <b>enemy ship</b> is lurking near the marker, but you can't see it yet. Ships only see 2 squares around them.<br>
      Select your <b>other Patrol Boat</b> (top left) and move it a few squares toward the marker.`,
    markers: [{ x0: 8, y0: 4, x1: 10, y1: 6, label: 'Enemy reported' }],
    check: st => pb(st).some(s => s.movesLeft < SHIPS.patrol.move && E.dist(E.shipCells(s), TARGET_CELLS) <= 5) || targetSeen(st),
  },
  {
    title: 'Radar ping',
    text: `With that Patrol Boat selected, click <b>Radar Ping</b>, then click the <b>middle of the marker</b>. It reveals enemies in a 3×3 area.`,
    highlight: '[data-act="ping"]',
    markers: [{ x0: 8, y0: 4, x1: 10, y1: 6, label: 'Ping here' }],
    check: st => targetSeen(st),
    forgiving: true,
  },
  {
    title: 'Attack!',
    text: `Contact! Enemy ships show as <b>"?"</b> with a red outline. This one is an unarmed barge, so it can't shoot back.<br>
      Select your <b>other Patrol Boat</b> (the one by your new rig), move it within 3 squares, click <b>Light Gun</b>, then click the contact.
      <span class="muted small">Red X = hit, white dot = miss.</span>`,
    highlight: '[data-act="gun"]',
    markers: [{ x0: 8, y0: 5, x1: 10, y1: 5, label: 'Target' }],
    check: st => !targetAlive(st),
    forgiving: true,
  },
];

export function createTutorial(hooks) {
  let step = 0, flash = '';
  const el = document.getElementById('coach');

  function render() {
    const s = STEPS[step];
    if (!s) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.innerHTML = `
      <div class="coach-head"><span>Tutorial · step ${step + 1} of ${STEPS.length}</span>
        <span>${s.next ? '<button class="primary small-btn" data-tut="next">Next →</button> ' : ''}<button class="ghost small-btn" data-tut="restart">Restart</button> <button class="ghost small-btn" data-tut="exit">Exit</button></span></div>
      <div class="coach-title">${s.title}</div>
      <div class="coach-text">${s.text}</div>
      ${flash ? `<div class="coach-flash">${flash}</div>` : ''}
`;
    el.querySelectorAll('[data-tut]').forEach(b => b.onclick = () => {
      const k = b.dataset.tut;
      if (k === 'next') { step++; flash = ''; hooks.refresh(); }
      if (k === 'restart') hooks.restart();
      if (k === 'exit') hooks.exit();
    });
  }

  // called after every redraw of the panel
  function afterRender(st, ui) {
    if (!st.tutorial) { el.classList.add('hidden'); return false; }
    let changed = false;
    // keep advancing while steps are already satisfied
    let guard = 0;
    while (STEPS[step] && STEPS[step].check && STEPS[step].check(st, ui) && guard++ < 20) { step++; flash = ''; }
    const s = STEPS[step];
    // be forgiving while learning to scout and shoot: missed shots and pings can be retried
    if (s && s.forgiving && targetAlive(st)) {
      for (const sh of st.ships.filter(x => x.owner === 0)) {
        if (sh.cooldowns.ping > 0 || (sh.acted && ['gun', 'ping'].includes(sh.activeAction))) {
          const missed = sh.activeAction === 'gun' && !s.check(st, ui);
          sh.cooldowns.ping = 0; sh.acted = false; sh.activeAction = null; sh.shotsLeft = 0;
          changed = true;
          if (missed) flash = 'Missed! In the tutorial you can try again. (In a real game that ship would be done for the turn.)';
          else if (step === STEPS.findIndex(x => x.title === 'Radar ping')) flash = 'Nothing there. Ping again, aiming at the middle of the marker.';
        }
      }
    }
    render();
    if (s?.highlight) document.querySelectorAll(s.highlight).forEach(b => b.classList.add('pulse'));
    return changed;
  }

  return {
    afterRender,
    markers: () => (STEPS[step]?.markers || []),
    reset: () => { step = 0; flash = ''; },
    hide: () => el.classList.add('hidden'),
  };
}
