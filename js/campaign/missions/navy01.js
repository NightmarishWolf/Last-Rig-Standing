// ============================================================
// NAVY · MISSION 1 · FIRST WATCH
// Corrigan Shelf, March 2061. Captain Mateo Ortiz's first command: two Picket Boats, sent to find out
// why Rig 7 went silent. Teaches: selecting and moving ships, gunnery, rounds, fog of war,
// contacts vs. visual identification. Secondary: On the Clock (par), Clean Hull (no damage).
// Hidden: No Quarter (sink the fleeing skiff).
// ============================================================
import * as E from '../../engine/index.js';

const RIG7 = [19, 3];
const PAR = 8;
const SKIFF_ROUTE = [[18, 4], [18, 2], [18, 0]]; // where the skiff runs, one leg a turn (it's heavy with stolen oil)

const line = (who, text, mood = 'neutral') => ({ who, mood, text });
const sato = (t, m) => line('sato', t, m), hale = (t, m) => line('hale', t, m), ortiz = (t, m) => line('ortiz', t, m);

export default {
  id: 'navy-1', arc: 'navy', n: 1,
  title: 'First Watch', place: 'Corrigan Shelf', date: 'March 2061',
  faction: 'navy', commander: { id: 'ortiz', level: 1 },
  enemy: { faction: 'tide', name: 'Free Tide' },
  par: PAR,
  // parts of the screen this mission keeps out of the way (they're taught later)
  hide: ['shipyard', 'research', 'market', 'victory', 'world', 'commander', 'build'],
  summary: 'Rig 7 has gone silent. Take two Picket Boats up the Narrows and find out why.',
  teaches: ['Moving ships', 'Gunnery', 'Rounds', 'Fog of war', 'Contacts'],

  map: `
    ....................######
    .....................#####
    .......................###
    ...................R....##
    .....................K....
    ..........................
    ..######.........####.....
    ###########....########...
    #########........#########
    ###...................####
    ........................##
    ....P....................#
    ..A......................#
    ....P....................#
    #........T.....###......##
    ###..#################.###
    ##########################
    ##########################`,
  homes: [
    { home: { x0: 0, y0: 9, x1: 9, y1: 15 }, spawn: { x0: 0, y0: 9, x1: 5, y1: 15 } },
    { home: { x0: 0, y0: 0, x1: 2, y1: 1 }, spawn: { x0: 0, y0: 0, x1: 2, y1: 1 } },
  ],
  // things drawn on the map that aren't pieces: Rig 7, dark and stripped
  props: (st, M) => [{ kind: 'derelictRig', x: RIG7[0], y: RIG7[1], label: 'Rig 7', flag: !!M.wonRound }], // (the flag is only seen up close)

  setup(st, marks, H) {
    const [ax, ay] = marks.A[0];
    const dep = { id: 'd_corrigan', x: ax, y: ay, type: 'small', reserves: 60, max: 60 };
    st.deposits.push(dep);
    E.foundBase(st, 0, dep, true); // Corrigan Point outpost
    st.players[0].known[dep.id] = true;
    st.blocked = [RIG7.join(',')];
    marks.P.forEach(([x, y], i) => H.ship(st, 0, 'patrol', x, y, { id: 'pk' + (i + 1) }));
    const [tx, ty] = marks.T[0];
    H.ship(st, 1, 'target', tx, ty, { id: 'target' });
    const [kx, ky] = marks.K[0];
    H.ship(st, 1, 'skiff', kx, ky, { id: 'skiff' });
    const [me, foe] = st.players;
    me.money = 300; me.oil = 20;
    foe.money = 100; foe.oil = 20;
    me.log = [{ turn: 1, text: 'Corrigan Point. Two Picket Boats, fuelled and crewed.' }]; foe.log = [];
  },

  briefing: [
    hale("Rig 7 on the Corrigan Shelf has been silent for forty hours. No distress call. Nothing on the weather charts."),
    hale("You have two Picket Boats at Corrigan Point. Take them through the Narrows, find the rig, and tell me what you see."),
    ortiz("And if someone's out there, Admiral?", 'worried'),
    hale("Then you do what the Accords require of you, Captain. Hale out.", 'stern'),
  ],

  goals: { main: 'Reach Rig 7', lose: 'Both Picket Boats are sunk' },
  secondary: [
    { id: 'clock', name: 'On the Clock', desc: 'Reach Rig 7 by round {par}', done: (st, M, c) => c.rounds <= c.par, live: (st, M) => (M.wonRound || st.round) <= PAR },
    { id: 'clean', name: 'Clean Hull', desc: 'Finish without losing any HP', done: (st, M, c) => c.keptShare >= 1,
      live: (st, M) => Object.entries(M.ships0).every(([id, hp]) => (st.ships.find(s => s.id === id)?.hp ?? 0) >= hp) },
  ],
  clearAchievement: 'first-watch',

  steps: [
    {
      id: 'select',
      say: [
        sato("Captain on the bridge. Both pickets are fuelled and crewed, sir."),
        sato("Your orders. Pick a boat and we'll get her moving."),
      ],
      do: 'Click one of your <b>Picket Boats</b> to select it.',
      markers: st => st.ships.filter(s => s.owner === 0).map(s => { const c = E.shipCells(s); return { x0: c[0][0], y0: c[0][1], x1: c[c.length - 1][0], y1: c[c.length - 1][1] }; }),
      check: (st, M, H, ui) => !!ui.selectedId && H.get(st, ui.selectedId)?.owner === 0,
    },
    {
      id: 'range',
      say: [
        sato("The lit water is everywhere she can reach this turn. Four squares, on a good engine."),
        sato("Before we go hunting, the gun crews want a live run. The target barge is anchored off the Point."),
      ],
      do: 'Move a Picket Boat to within <b>3 squares</b> of the target barge. Hover a square to preview the move, click to go.',
      markers: [{ x0: 9, y0: 14, x1: 11, y1: 14, label: 'Target barge' }],
      check: (st, M, H) => !H.get(st, 'target') || st.ships.some(s => s.owner === 0 && H.distTo(st, s, H.get(st, 'target')) <= 3),
    },
    {
      id: 'gunnery',
      say: [sato("In range. Light Gun, in the ship panel, then pick your square on the barge.")],
      do: 'With that boat selected, click <b>Light Gun</b>, then click the target barge.',
      spot: '[data-act="gun"]',
      markers: [{ x0: 9, y0: 14, x1: 11, y1: 14, label: 'Fire!' }],
      check: (st, M, H) => !H.get(st, 'target'),
      done: (st, M, H) => H.say(st, [
        sato("Direct hit. She's going down.", 'pleased'),
        sato("Every gun fires once a turn, and every shell costs money. Pick your shots."),
      ]),
    },
    {
      id: 'endturn',
      do: 'When you\'re done this turn, press <b>End turn</b> (or Enter). A round is one turn for every side.',
      spot: '[data-end]',
      check: (st, M) => st.round > M.stepRound,
      done: (st, M, H) => H.say(st, [sato("New round. Each boat gets its moves and its gun back at the start of your turn.")]),
    },
    {
      id: 'narrows',
      say: [
        sato("Rig 7 is north, past the Spit. The only way through is the Narrows."),
        sato("Past there the charts go dark. We see as far as our boats can see, and no further."),
      ],
      do: 'Sail <b>north through the Narrows</b>. The fog lifts wherever your ships can see.',
      markers: [{ x0: 11, y0: 6, x1: 14, y1: 8, label: 'The Narrows' }],
      check: (st) => st.ships.some(s => s.owner === 0 && E.shipCells(s).every(([, y]) => y <= 5)),
      done: (st, M) => { if (H_get(st, 'skiff')) M.track.push('skiff'); },
    },
    {
      id: 'contact',
      say: [
        sato("Radar contact just past the rig. Small. Could be a fishing boat. Could be debris.", 'worried'),
        sato("It's the \"?\" on the map: we know something's there and roughly where, not what it is. We need eyes on it."),
      ],
      do: 'Close in until a ship can <b>see</b> the contact (3 squares) to identify it.',
      markers: (st, M, H) => { const k = H.get(st, 'skiff'); return k ? [{ x0: k.x, y0: k.y, x1: k.x, y1: k.y, label: 'Contact' }] : []; },
      check: (st, M) => !!M.fired.identified || !H_get(st, 'skiff'),
    },
    {
      id: 'rig7',
      do: 'Reach <b>Rig 7</b>: bring a ship right next to it.',
      markers: [{ x0: RIG7[0], y0: RIG7[1], x1: RIG7[0], y1: RIG7[1], label: 'Rig 7' }],
      check: (st, M, H) => H.near(st, 0, RIG7[0], RIG7[1], 1),
      done: (st, M, H) => { M.flags.arrived = true; },
    },
  ],

  triggers: [
    {
      id: 'identified',
      when: (st, M, H) => M.step >= 5 && H.get(st, 'skiff') && H.seen(st, 'skiff'),
      then: (st, M) => { M.flags.flee = true; },
      say: [
        sato("Visual! Free Tide skiff, riding low in the water. She's carrying something heavy.", 'stern'),
        ortiz("Our oil.", 'stern'),
        sato("She's turning north, Captain. Running. Your call.", 'worried'),
      ],
    },
    {
      id: 'sunk',
      when: (st, M, H) => M.step >= 5 && !H.get(st, 'skiff') && !M.flags.escaped,
      then: (st, M, H) => H.achieve(st, 'no-quarter'),
      say: [
        sato("She's gone under. Oil on the water. No one in it.", 'stern'),
        ortiz("Log it, Lieutenant. Then get us to that rig.", 'stern'),
      ],
    },
    {
      id: 'shot',
      when: (st, M) => !!M.flags.wasShot,
      say: [sato("We're hit! Their deck gun reaches two squares. Ours reaches three: keep her at arm's length.", 'worried')],
    },
  ],

  // the skiff: hides until it's seen, then shoots at anything within 2 and runs north
  enemyTurn(st, M, H) {
    const k = H.get(st, 'skiff');
    if (!k || !M.flags.flee) return;
    if (k.y === 0) { // over the edge of the map: gone
      st.ships = st.ships.filter(s => s !== k); M.flags.escaped = true;
      H.say(st, [sato("Contact lost. She's over the horizon.", 'worried'), ortiz("Then we'll see her again.", 'stern')]);
      return;
    }
    // run first (a ship that has fired can't move), then shoot at anything still within 2
    const leg = M.flags.leg || 0;
    const to = SKIFF_ROUTE[Math.min(leg, SKIFF_ROUTE.length - 1)];
    if (E.applyAction(st, { type: 'move', shipId: k.id, x: to[0], y: to[1], rot: k.rot }).ok) M.flags.leg = leg + 1;
    const foes = st.ships.filter(s => s.owner === 0).map(s => ({ s, d: H.distTo(st, k, s) })).filter(o => o.d <= 2).sort((a, b) => a.d - b.d);
    if (foes.length) {
      const [x, y] = E.shipCells(foes[0].s)[0];
      const hpBefore = foes[0].s.hp;
      E.applyAction(st, { type: 'act', shipId: k.id, actionId: 'gun', x, y });
      if (!H.get(st, foes[0].s.id) || foes[0].s.hp < hpBefore) M.flags.wasShot = true;
    }
  },

  won: (st, M) => !!M.flags.arrived,
  onWin: (st, M, H) => H.say(st, [
    sato("Rig 7. Lights out. Every hatch open."),
    sato("The tanks are empty. Someone cut the lines and drained her dry. No crew aboard. No bodies either.", 'worried'),
    ortiz("There's a flag on the derrick. Blue, with a white wave on it.", 'stern'),
    hale("That's not a storm, Captain. That's the Tide.", 'stern'),
    hale("Bring your boats home. We'll talk about what comes next."),
  ]),
  lost: (st, M) => !st.ships.some(s => s.owner === 0),
  onLose: (st, M, H) => H.say(st, [hale("Corrigan Point has lost contact with both pickets. Send the next crew.", 'stern')]),
};

// (steps that run before H is passed in)
const H_get = (st, id) => st.ships.find(s => s.id === id);
