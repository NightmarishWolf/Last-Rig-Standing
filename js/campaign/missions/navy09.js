// ============================================================
// NAVY · MISSION 9 · OPEN WATER
// The Long Reach, March 2062. The Navy's battle line meets Mother Ruiz's armada in open water. Vance holds
// the line with his carriers (they fight on their own); Ortiz's squadron has to break through and sink
// Ruiz's three Brood Rafts, her moving shipyards. Ruiz is the skirmish AI at its strongest so far
// (Hard, Conqueror, Endless Swarm level 7), with her Leviathan.
// Round 10: Nyx calls Ortiz with the truth: Vance has been buying from him for a year, and last week he
// bought the location of Ruiz's home raft. A choice (buttons): tell Vance you know, or keep it to
// yourself (remembered for the finale). Hidden: Line Breaker (every Brood Raft sunk, no capital ship lost).
// Win: sink the three Brood Rafts. Lose: the Indomitable sunk, or round 32.
// ============================================================
import * as E from '../../engine/index.js';
import { SHIPS } from '../../data/ships.js';
import { baseOf, foundAt, lost, nyx, ortiz, plat, ruiz, sato, vance } from '../kit.js';

const PAR = 24, DEADLINE = 32, SWIFT = 20, NYX_AT = 10, BUDGET = 200;
const broods = st => st.ships.filter(s => s.brood);
const capitalLost = (st, M) => Object.keys(M.ships0).some(id => ['carrier', 'cruiser', 'battleship'].includes(M.flags.types?.[id]) && !st.ships.some(s => s.id === id));
const vanceShips = ['indomitable', 'vd1', 'vd2'];

export default {
  id: 'navy-9', arc: 'navy', n: 9,
  title: 'Open Water', place: 'The Long Reach', date: 'March 2062',
  faction: 'navy', commander: { id: 'ortiz', level: 5 },
  enemy: { faction: 'tide', name: '"Mother" Ruiz', ai: { difficulty: 'hard', personality: 'conqueror', commander: 'ruiz', level: 7 } },
  par: PAR,
  hide: ['victory'],
  summary: "The battle line meets Ruiz's armada in open water. Break it.",
  teaches: ['Fleet battles', 'Fighting beside a scripted ally', 'Choosing what you know'],

  map: `
    ................................................
    ................................................
    ................................................
    ................................................
    ............................................T...
    ................................................
    ............c.....................B.............
    ................................................
    ................................................
    .........C......................................
    ....v...........................................
    ................................................
    ............D...................................
    ...V............................................
    ..........................................M.....
    ........L.............................B.........
    ................................................
    ................................................
    ....v...........................................
    .........D......................................
    ................................................
    ................................................
    ............c...................................
    ................................................
    ..................................B.............
    ................................................
    ............................................T...
    ................................................
    ................................................
    ................................................`,
  homes: [
    { home: { x0: 0, y0: 8, x1: 8, y1: 21 }, spawn: { x0: 1, y0: 8, x1: 8, y1: 21 } },
    { home: { x0: 39, y0: 9, x1: 47, y1: 20 }, spawn: { x0: 39, y0: 9, x1: 47, y1: 20 } },
  ],

  setup(st, marks, H) {
    const me = st.players[0], foe = st.players[1], F = st.campaign.flags;
    foundAt(st, 'A', [2, 4], 0, { capital: true, level: 2, type: 'rich', reserves: 240 });
    const R = foundAt(st, 'R', marks.T[0], 1, { capital: true, level: 3, tideAge: 12, type: 'rich', reserves: 240 }); plat(st, R, 'gun', -1, 1);
    foundAt(st, 'R2', marks.T[1], 1, { level: 2, tideAge: 9 });
    // Vance's line: the Indomitable and two destroyers. They fight on their own: you can't command them.
    const cv = H.ship(st, 0, 'carrier', ...marks.V[0], { id: 'indomitable' }); cv.name = 'Indomitable'; cv.onLoan = true;
    marks.v.forEach(([x, y], i) => { const d = H.ship(st, 0, 'destroyer', x, y, { id: 'vd' + (i + 1) }); d.onLoan = true; d.name = "Vance's destroyer"; });
    st.campaign.locked.push(...vanceShips);
    // Ortiz's squadron
    H.ship(st, 0, 'cruiser', ...marks.C[0], { id: 'resolute' }).name = 'Resolute';
    marks.D.forEach(([x, y], i) => H.ship(st, 0, 'destroyer', x, y, { id: 'dd' + (i + 1) }));
    marks.c.forEach(([x, y], i) => H.ship(st, 0, 'corvette', x, y, { id: 'cv' + (i + 1) }));
    H.ship(st, 0, 'landingcraft', ...marks.L[0], { id: 'lc1' });
    H.ship(st, 0, 'cruiser', 9, 25, { id: 'ca2' }).name = 'Steadfast';
    H.ship(st, 0, 'destroyer', 12, 16, { id: 'dd3' });
    for (const t of ['destroyer_program', 'guided_missiles']) me.research.done[t] = true;
    me.money = 1400; me.oil = 60;
    F.types = Object.fromEntries(st.ships.filter(s => s.owner === 0).map(s => [s.id, s.type]));
    // Ruiz's armada: three Brood Rafts, her Leviathan, and boats
    marks.B.forEach(([x, y], i) => { const b = H.ship(st, 1, 'broodraft', x, y, { id: 'brood' + (i + 1) }); b.brood = true; b.name = ['the Nest', 'the Cradle', 'the Hive'][i]; });
    const L = H.ship(st, 1, 'leviathan', 42, 13, { id: 'mother' }); L.name = "Mother's Leviathan"; // (slow: she guards the home raft-town's waters)
    for (const [type, x, y] of [['gunboat', 32, 8], ['gunboat', 32, 22], ['skiff', 36, 4], ['skiff', 36, 26], ['fireship', 33, 12], ['fireship', 33, 18]]) H.ship(st, 1, type, x, y);
    foe.money = 1000; foe.oil = 100;
    me.log = [{ turn: 1, text: "The Long Reach. Ruiz's armada is on the horizon." }]; foe.log = [];
  },

  briefing: c => [
    vance("There she is, Captain. Every raft-town that answers to Ruiz, in one place. We will not get a better chance.", 'stern'),
    vance("My carriers hold the line here. Your squadron goes through it. Her Brood Rafts are her shipyards: sink all three and the armada can't replace a single boat.", 'stern'),
    sato("Three Brood Rafts, sir. Slow, but she'll keep everything she has between us and them.", 'worried'),
    sato(`The Admiralty's war chest is open, sir: $${BUDGET} a turn for reinforcements. Build what we need.`),
    ...(c.hesper === 'saved' ? [vance("You got forty-one sailors back last time by disobeying me in spirit, Captain. Today, obey me in letter.", 'stern')] : []),
    ortiz("Understood, Commodore.", 'stern'),
  ],

  goals: {
    main: "Sink Ruiz's three Brood Rafts",
    lose: `The Indomitable is sunk, or the armada still stands after round ${DEADLINE}`,
    deadline: DEADLINE,
    progress: st => `Brood Rafts left: ${broods(st).length}/3`,
  },
  secondary: [
    { id: 'swift', name: 'Swift', desc: `Sink the Brood Rafts by round ${SWIFT}`, done: (st, M) => (M.wonRound || st.round) <= SWIFT, live: st => st.round <= SWIFT },
    { id: 'leviathan', name: 'The Leviathan', desc: "Sink Ruiz's Leviathan", done: (st, M) => !!M.flags.leviathanSunk, live: () => true },
    { id: 'carrier', name: 'Hold the Line', desc: 'The Indomitable never falls below half HP', done: (st, M) => !M.flags.carrierHurt, live: (st, M) => !M.flags.carrierHurt },
  ],
  clearAchievement: 'open-water',

  steps: [
    {
      id: 'break',
      say: [sato("Vance's carriers will fight on their own from the line, sir. They'll hit whatever comes into range. The rest is up to us.")],
      do: st => `Break the line and sink Ruiz's <b>Brood Rafts</b> (${broods(st).length} left). Vance's carrier group holds the west on its own.`,
      markers: st => broods(st).map(b => ({ x0: b.x, y0: b.y, x1: b.x + 2, y1: b.y + 1, label: b.name.replace('the ', '') })),
      check: () => false,
    },
  ],

  triggers: [
    { id: 'brood1', when: st => broods(st).length <= 2, say: [sato("One Brood Raft down!", 'pleased'), ruiz("You're sinking homes, Ortiz. There were families living on that raft.", 'stern')] },
    { id: 'brood2', when: st => broods(st).length <= 1, say: [sato("Two down, one to go!", 'pleased')] },
    { id: 'lev', when: (st, M) => !st.ships.some(s => s.id === 'mother'), then: (st, M) => { M.flags.leviathanSunk = st.round; }, say: [sato("The Leviathan's going down!", 'pleased'), ruiz("...You'll pay for every one of them.", 'stern')] },
    { id: 'cvHurt', when: st => { const c = st.ships.find(s => s.id === 'indomitable'); return !!c && c.hp <= 3; }, then: (st, M) => { M.flags.carrierHurt = true; }, say: [vance("I'm taking hits here, Captain. Hurry.", 'stern')] },
  ],

  // as your turn ends, Vance's line fights on its own: aircraft at what's in reach, destroyers at what's close
  beforeEndTurn(st, M, H) {
    st.players[0].money += BUDGET; // (the fleet's war chest: reinforcements are yours to buy)
    const v = E.visibility(st, 0);
    const foes = st.ships.filter(s => s.owner === 1 && v.ships.has(s.id)).sort((a, b) => a.hp - b.hp);
    for (const id of vanceShips) {
      const s = H.get(st, id);
      if (!s) continue;
      for (const act of SHIPS[s.type].actions.filter(a => a.kind === 'attack' && !a.subsOnly)) for (let k = 0; k < (act.shots || 1); k++) {
        const t = foes.find(f => st.ships.includes(f) && E.dist(E.shipCells(s), E.shipCells(f)) <= act.range);
        if (!t || !E.shipCells(t).some(([x, y]) => E.applyAction(st, { type: 'act', shipId: s.id, actionId: act.id, x, y, script: true }).ok)) break;
      }
      if (s.type === 'carrier' && foes[0]) E.applyAction(st, { type: 'act', shipId: s.id, actionId: 'recon', x: foes[0].x, y: foes[0].y, script: true });
    }
  },
  // (Ruiz's turn is the computer's; the mission adds Nyx's call)
  enemyTurn(st, M, H) {
    if (st.round === NYX_AT - 1 && !M.flags.nyx) {
      M.flags.nyx = true;
      H.say(st, [
        nyx("Captain Ortiz. Private line. Your Commodore doesn't know I'm calling, and I'd like to keep it that way.", 'neutral'),
        nyx("He's been buying from me for a year. Positions, charts, who's sheltering where. Where do you think the Saltpan raids came from?", 'neutral'),
        ...(M.choices.nyxCharts ? [nyx("And you bought my charts too, Captain. Funny how Kade always found you after that. I sell to everyone.", 'pleased')] : []),
        nyx("Last week he bought one more thing: where Mother Ruiz's home raft anchors. Four thousand people on it. Thought you should know what you're clearing the way for.", 'stern'),
        ortiz("Why tell me?", 'worried'),
        nyx("Because a sea with no Tide on it has no black market on it either. Good luck, Captain.", 'neutral'),
        { ...ortiz("...", 'worried'), choice: { id: 'nyx', options: [{ id: 'confront', label: 'Tell Vance you know' }, { id: 'silent', label: 'Keep it to yourself' }] } },
      ]);
    }
  },

  onChoice(st, M, H, id, opt) {
    if (id !== 'nyx') return;
    H.say(st, opt === 'confront'
      ? [ortiz("Commodore. Nyx just called me. I know about the home raft.", 'stern'), vance("Then you know more than a captain needs to, Ortiz. Win this battle. We'll talk about the next one after.", 'stern')]
      : [sato("Sir? Who was that?", 'worried'), ortiz("Nobody, Sato. Eyes on the Brood Rafts.", 'stern')]);
  },

  won: st => broods(st).length === 0,
  onWin: (st, M, H) => H.say(st, [
    sato("That's the last Brood Raft, sir! The armada's breaking up, running east!", 'pleased'),
    ruiz("Go home, Ortiz. While you still have one to go to.", 'stern'),
    vance("Well fought, Captain. The Tide can't replace a single hull now. One more push and this war is over.", 'pleased'),
    ortiz("One more push. Where, Commodore?", 'stern'),
    vance("You'll have your orders tomorrow.", 'neutral'),
  ]),
  achievementsOnWin: (st, M) => (capitalLost(st, M) ? [] : ['line-breaker']),
  choices: (st, M) => ({ nyxTold: M.picked?.nyx === 'confront' ? 'confronted' : M.picked?.nyx === 'silent' ? 'silent' : null }),
  lost: st => !st.ships.some(s => s.id === 'indomitable') || st.round > DEADLINE,
  onLose: (st, M, H) => H.say(st, [vance("Pull back, Captain. All ships, pull back. We've lost the Reach.", 'stern')]),
};
