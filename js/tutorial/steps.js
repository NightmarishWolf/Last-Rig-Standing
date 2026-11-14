// Tutorial: the list of steps. Edit the coach text here.
// Each step has a check() that looks at the game; when it passes, the coach moves on.
import * as E from '../engine/index.js';
import { SHIPS } from '../data/ships.js';
import { DEP_FOUND, TARGET, TARGET_CELLS } from './map.js';

const pb = st => st.ships.filter(s => s.owner === 0 && s.type === 'patrol');

export const targetAlive = st => st.ships.some(s => s.id === TARGET);

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
    text: `<b class="oil">Oil</b> moves your ships (bigger ships burn more). <b class="money">Money</b> buys ships and rigs; you get it by selling oil.<br>
      Your rig (the tower icon) pumps oil every turn until its deposit runs dry. <b>Hover over it</b> to see how much is left.<br>
      Every ship costs a little <b>upkeep</b> money each turn, so idle fleets drain you.`,
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
    text: `Found one! The amber circle marked <b>S</b> is a small deposit (M = medium, R = rich). The <b style="color:#a9d77a">green</b> water is the area you've surveyed.<br>
      Click <b>Build rig</b>, then click the deposit. That founds a new <b>rig base</b>, which needs one of your ships right next to it.`,
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
    text: `New turn: your rigs pumped more oil. Intel says an <b>enemy ship</b> is lurking near the marker, but you can't see it yet. The <b>bright water</b> is what your fleet can see. Everything else is dark fog. A Patrol Boat sees 3 squares around itself.<br>
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
