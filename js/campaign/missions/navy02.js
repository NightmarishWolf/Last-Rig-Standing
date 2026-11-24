// ============================================================
// NAVY · MISSION 2 · THE QUOTA
// Bracken Bank, April 2061. Losing Rig 7 put Corrigan behind its Allocation quota; Ortiz has to find
// new oil, drill it and sell enough to make the shortfall up. The richest deposit lies under the
// fishing grounds of Bracken Point, an Unallocated village. Teaches: selling oil and the price,
// upkeep and the red, surveying, founding rigs, storage, guarding rigs from siphoning.
// Secondary: On the Clock (par), In the Black (never in the red), Nothing Taken (no oil siphoned).
// Hidden: Good Neighbours (meet the quota without drilling Bracken Point).
// ============================================================
import * as E from '../../engine/index.js';
import { edgeSquares, onEdge, waterField } from '../ai.js';

const PAR = 12, DEADLINE = 18, QUOTA = 900;
const VILLAGE = [25, 18];
const AREAS = {
  a: { x0: 13, y0: 0, x1: 17, y1: 4, dep: 'd_north', label: 'Survey area: North Reach' },
  b: { x0: 18, y0: 6, x1: 22, y1: 10, dep: 'd_middle', label: 'Survey area: Middle Bank' },
  c: { x0: 21, y0: 13, x1: 25, y1: 17, dep: 'd_bracken', label: 'Survey area: Bracken Point' },
};

const line = (who, text, mood = 'neutral') => ({ who, mood, text });
const sato = (t, m) => line('sato', t, m), hale = (t, m) => line('hale', t, m), ortiz = (t, m) => line('ortiz', t, m), maren = (t, m) => line('maren', t, m);

const earned = st => st.players[0].stats?.oilMoney || 0;
const myRigs = st => st.rigs.filter(r => r.owner === 0);
const inArea = (s, a) => E.shipCells(s).some(([x, y]) => x >= a.x0 && x <= a.x1 && y >= a.y0 && y <= a.y1);
const found = (st, a) => !!st.players[0].known[a.dep];

export default {
  id: 'navy-2', arc: 'navy', n: 2,
  title: 'The Quota', place: 'Bracken Bank', date: 'April 2061',
  faction: 'navy', commander: { id: 'ortiz', level: 1 },
  enemy: { faction: 'tide', name: 'Free Tide' },
  par: PAR,
  hide: ['shipyard', 'research', 'victory', 'world', 'commander'],
  summary: 'Corrigan is behind on its quota. Find new oil on Bracken Bank, drill it, and deliver.',
  teaches: ['Selling oil', 'Upkeep and debt', 'Surveying', 'Building rigs', 'Storage', 'Siphoning'],

  map: `
    #####.......................
    ###.........................
    ##........#....a....###.....
    ##.......###.......#####....
    ##........###.......#####...
    #....P....#..........####...
    #......................#....
    #...A.......................
    #...................b.......
    ##....S.....................
    ##..............#...........
    ###............###..........
    #####...........###.........
    #######.........##..........
    ##########.......#..........
    ###########............c....
    ###########...............##
    ############............####
    #############........#######
    ############################`,
  homes: [
    { home: { x0: 1, y0: 4, x1: 8, y1: 10 }, spawn: { x0: 1, y0: 4, x1: 6, y1: 10 } },
    { home: { x0: 26, y0: 3, x1: 27, y1: 4 }, spawn: { x0: 26, y0: 3, x1: 27, y1: 4 } },
  ],
  props: (st, M) => [
    { kind: 'village', x: VILLAGE[0], y: VILLAGE[1], label: 'Bracken Point' },
    ...(M.flags.leftVillage ? [] : [{ kind: 'boats', x: 24, y: 17 }]), // the village's fishing boats, drawn up on the shore
  ],

  setup(st, marks, H) {
    const [ax, ay] = marks.A[0];
    const home = { id: 'd_bracken_outpost', x: ax, y: ay, type: 'medium', reserves: 80, max: 80 };
    st.deposits.push(home);
    E.foundBase(st, 0, home, true);
    st.players[0].known[home.id] = true;
    const dep = (id, [x, y], type, reserves) => st.deposits.push({ id, x, y, type, reserves, max: reserves });
    dep('d_north', marks.a[0], 'medium', 60);
    dep('d_middle', marks.b[0], 'medium', 70);
    dep('d_bracken', marks.c[0], 'rich', 110);
    H.ship(st, 0, 'patrol', ...marks.P[0], { id: 'pk1' });
    H.ship(st, 0, 'survey', ...marks.S[0], { id: 'sv1' });
    const [me, foe] = st.players;
    me.money = 150; me.oil = 20;
    foe.money = 100; foe.oil = 40; // (its boats burn oil to move)
    me.log = [{ turn: 1, text: 'Bracken Bank outpost. One rig pumping, a Picket Boat and a Survey Ship.' }]; foe.log = [];
  },

  briefing: [
    hale("Losing Rig 7 put Corrigan behind on its Allocation quota. The Council has noticed. They want the shortfall made up this quarter."),
    hale(`Bracken Bank has never been properly surveyed. You have a Survey Ship and the outpost rig. Find oil, drill it, sell it: $${QUOTA} by the end of round ${DEADLINE}.`),
    ortiz("There's a village on Bracken Point, Admiral. Unallocated. They fish the bank.", 'worried'),
    hale("The Accords hold every shelf in common, Captain. That includes the one under their boats. Deliver the quota.", 'stern'),
  ],

  goals: {
    main: `Deliver the quota: $${QUOTA} from oil sales`,
    lose: `The quota isn't met by the end of round ${DEADLINE}, or you lose every ship`,
    deadline: DEADLINE,
    progress: st => `$${Math.floor(earned(st))} / $${QUOTA}`,
  },
  secondary: [
    { id: 'clock', name: 'On the Clock', desc: 'Deliver the quota by round {par}', done: (st, M, c) => c.rounds <= c.par, live: (st, M) => (M.wonRound || st.round) <= PAR },
    { id: 'black', name: 'In the Black', desc: 'Never go into the red', done: (st, M) => !M.flags.wentRed, live: (st, M) => !M.flags.wentRed },
    { id: 'untouched', name: 'Nothing Taken', desc: 'Lose no oil to the Tide', done: (st, M) => !M.flags.siphoned, live: (st, M) => !M.flags.siphoned },
  ],
  clearAchievement: 'the-quota',

  steps: [
    {
      id: 'sell',
      say: [
        sato("Bracken Bank, Captain. The outpost rig pumps three barrels a turn into our tanks."),
        sato("Oil in the tanks is worth nothing to the Council. They count what we sell."),
      ],
      do: 'Sell some oil: use the <b>Sell</b> buttons in the Resources card.',
      spot: '[data-sell]',
      check: st => earned(st) > 0,
      done: (st, M, H) => H.say(st, [
        sato("Sold. Did you see the price drop? Every barrel we sell knocks it down. It climbs back a little each round, so sell in batches, not all at once."),
        sato("Mind the money, too. Every ship costs upkeep each turn. If we can't pay, we go into the red, and three turns in the red the bank starts taking ships back. Most expensive first."),
      ]),
    },
    {
      id: 'survey-go',
      say: [sato("Nobody's charted the oil out here. The Survey Ship can find it. Three areas look promising.")],
      do: 'Sail the <b>Survey Ship</b> into one of the marked survey areas.',
      markers: st => Object.values(AREAS).filter(a => !found(st, a)).map(a => ({ ...a, label: a.label })),
      check: st => st.ships.some(s => s.type === 'survey' && s.owner === 0 && Object.values(AREAS).some(a => inArea(s, a))),
    },
    {
      id: 'survey',
      do: 'Select the Survey Ship and use <b>Deep Survey</b>: it searches 2 squares around the ship.',
      spot: '[data-act="deep"]',
      markers: st => Object.values(AREAS).filter(a => !found(st, a)).map(a => ({ ...a, label: a.label })),
      check: st => Object.values(AREAS).some(a => found(st, a)),
      done: (st, M, H) => H.say(st, [sato("Oil! The amber circle: S, M or R for small, medium or rich. A rich one pumps five barrels a turn.", 'pleased')]),
    },
    {
      id: 'rig',
      say: [sato("Founding a new rig base costs money, and needs a ship right next to the deposit. Survey Ships carry rig crews: they can do it from five squares out.")],
      do: st => `Click <b>Build rig</b>, then click the deposit you found. ${st.players[0].money < E.baseFoundCost(st, 0) ? `<span class="muted">You need $${E.baseFoundCost(st, 0)}: sell more oil first.</span>` : ''}`,
      spot: '[data-rig]',
      markers: st => st.deposits.filter(d => st.players[0].known[d.id] && !st.rigs.some(r => r.depId === d.id)).map(d => ({ x0: d.x, y0: d.y, x1: d.x, y1: d.y, label: 'Build here' })),
      check: st => myRigs(st).length >= 2,
      done: (st, M, H) => H.say(st, [
        sato("New rig online. More rigs, more oil. More to guard, too."),
        sato(`Keep pumping and selling until we've delivered the quota. There's more oil out there if you want it faster.`),
      ]),
    },
    {
      id: 'quota',
      do: st => `Deliver the quota: <b>$${QUOTA}</b> from oil sales ($${Math.floor(earned(st))} so far). Survey the other areas for more oil.`,
      markers: st => Object.values(AREAS).filter(a => !found(st, a)).map(a => ({ ...a, label: a.label })),
      check: st => earned(st) >= QUOTA,
      done: (st, M) => { M.flags.delivered = true; },
    },
  ],

  triggers: [
    {
      id: 'maren',
      when: st => st.ships.some(s => s.owner === 0 && (E.dist(E.shipCells(s), [VILLAGE]) <= 4 || E.dist(E.shipCells(s), [[23, 15]]) <= 2)),
      say: [
        maren("That's our water you're sounding, Captain. My grandmother fished this bank before anyone drew quota lines on it.", 'stern'),
        ortiz("The Accords hold all the shelves in common, ma'am.", 'worried'),
        maren("In common. Just not with us.", 'stern'),
      ],
    },
    {
      id: 'bracken',
      when: st => st.rigs.some(r => r.owner === 0 && r.depId === 'd_bracken'),
      then: (st, M) => { M.flags.drilledBracken = true; },
      say: [
        sato("Bracken rig is online. Five barrels a turn: the richest well on the bank.", 'pleased'),
        sato("The village boats haven't gone out since the derrick went up.", 'worried'),
      ],
    },
    {
      id: 'tanks',
      when: st => st.players[0].oil >= 50,
      say: [sato("Tanks at fifty of sixty. Anything we pump past sixty spills into the sea. Sell, or lose it.", 'worried')],
    },
    {
      id: 'red',
      when: st => st.players[0].money < 0,
      then: (st, M) => { M.flags.wentRed = true; },
      say: [sato("We're in the red, Captain. Three turns to get back above zero, or the bank starts repossessing. Sell oil.", 'worried')],
    },
    {
      // the raid: a Tide siphon skiff makes for whichever rig is furthest from your ships
      id: 'raid',
      when: st => (st.round >= 7 && myRigs(st).length >= 2) || st.round >= 9,
      then: (st, M, H) => {
        const far = r => Math.min(...st.ships.filter(s => s.owner === 0).map(s => E.dist(E.shipCells(s), [[r.x, r.y]])), 99);
        const target = [...myRigs(st)].sort((a, b) => far(b) - far(a))[0];
        if (!target) return;
        M.flags.raidTarget = target.id;
        // slipping in out of the fog: open water you can't see, about 6 squares (by sea) from its target
        const D = waterField(st, [[target.x, target.y]]);
        const free = ([x, y]) => !st.ships.some(s => E.shipCells(s).some(([a, b]) => a === x && b === y)) && !st.deposits.some(d => d.x === x && d.y === y);
        const spots = [];
        for (let y = 0; y < st.H; y++) for (let x = 0; x < st.W; x++) if (!E.isLand(st, x, y) && D[y * st.W + x] < 1e9 && !E.seesSquare(st, 0, x, y) && free([x, y])) spots.push([x, y]);
        const [sx, sy] = spots.sort((a, b) => Math.abs(D[a[1] * st.W + a[0]] - 6) - Math.abs(D[b[1] * st.W + b[0]] - 6) || a[0] - b[0] || a[1] - b[1])[0] || [27, 5];
        H.ship(st, 1, 'skiff', sx, sy, { id: 'raider' });
        M.track.push('raider');
      },
      say: [
        sato("Radar contact: small and fast, coming in from the east. It's making for one of our rigs.", 'worried'),
        sato("If it's what I think it is, it'll tie up alongside and siphon the rig. A rig with none of our ships near it is an open tap. Get a boat within three squares and she'll run."),
      ],
    },
    {
      id: 'siphoned',
      when: (st, M) => (M.flags.siphoned || 0) > 0,
      say: [ortiz("They're draining us. Get a boat over there.", 'stern')],
    },
    {
      id: 'raidRun',
      when: (st, M) => !!M.flags.raidFlee && !!M.fired.raid,
      say: [sato("She's cutting her lines and running east.")],
    },
    {
      id: 'raidSunk',
      when: (st, M, H) => !!M.fired.raid && !H.get(st, 'raider') && !M.flags.raidGone,
      say: [sato("Siphon boat's down. That'll be one less family on the rafts eating tonight.", 'stern'), ortiz("...Back to work, Lieutenant.", 'worried')],
    },
  ],

  // the siphon skiff: runs from anything within 3 squares; otherwise ties up next to its rig and drains it
  enemyTurn(st, M, H) {
    const k = H.get(st, 'raider');
    if (!k) return;
    const mine = st.ships.filter(s => s.owner === 0);
    const threat = mine.some(s => H.distTo(st, s, k) <= 3);
    const moveBest = score => {
      let best = null, bs = score(k.x, k.y);
      for (const [key] of E.reachable(st, k)) { const [x, y, rot] = key.split(',').map(Number); const v = score(x, y); if (v < bs) { bs = v; best = { x, y, rot }; } }
      if (best) E.applyAction(st, { type: 'move', shipId: k.id, ...best });
    };
    if (threat || M.flags.raidFlee || (M.flags.siphons || 0) >= 3) {
      M.flags.raidFlee = true;
      if (onEdge(st, k)) { st.ships = st.ships.filter(s => s !== k); M.flags.raidGone = true; H.say(st, [sato("Contact gone over the horizon.")]); return; }
      const out = waterField(st, edgeSquares(st));
      moveBest((x, y) => out[y * st.W + x]);
      return;
    }
    let rig = st.rigs.find(r => r.id === M.flags.raidTarget && r.owner === 0) || myRigs(st)[0];
    if (!rig) return;
    M.flags.raidTarget = rig.id;
    if (E.dist(E.shipCells(k), [[rig.x, rig.y]]) > 1) { const D = waterField(st, [[rig.x, rig.y]]); moveBest((x, y) => D[y * st.W + x] <= 1 ? 0 : D[y * st.W + x]); }
    if (E.dist(E.shipCells(k), [[rig.x, rig.y]]) <= 1) {
      // 5 oil a turn: out of your tanks if there's any there, the rest straight from the wellhead
      const me = st.players[0], dep = st.deposits.find(d => d.id === rig.depId);
      const fromTanks = Math.min(5, Math.max(0, Math.floor(me.oil))), fromWell = Math.min(5 - fromTanks, Math.max(0, Math.floor(dep?.reserves || 0)));
      me.oil = Math.round((me.oil - fromTanks) * 100) / 100;
      if (dep) dep.reserves -= fromWell;
      const got = fromTanks + fromWell;
      if (got > 0) {
        M.flags.siphoned = (M.flags.siphoned || 0) + got;
        E.log(st, 0, `A Tide skiff is siphoning your rig at ${E.coord(rig.x, rig.y)}: ${got} oil gone${fromWell ? ' (straight from the well)' : ''}.`, { k: 'hit', x: rig.x, y: rig.y });
      }
      M.flags.siphons = (M.flags.siphons || 0) + 1;
    }
  },

  won: (st, M) => !!M.flags.delivered,
  onWin: (st, M, H) => { if (M.flags.drilledBracken) M.flags.leftVillage = true; H.say(st, M.flags.drilledBracken ? [
    hale("Corrigan is back on quota. Good work, Captain. The Council will hear your name.", 'pleased'),
    ortiz("Admiral, the Bracken boats are loading up. Nets, families, all of it. They're heading out to the rafts.", 'worried'),
    hale("Then they've chosen their side. Hale out.", 'stern'),
  ] : [
    hale("Corrigan is back on quota. Good work, Captain."),
    hale("Though I notice the richest well on the bank is still in the ground. The Council won't thank you for your conscience.", 'stern'),
    ortiz("Understood, Admiral.", 'worried'),
    maren("Captain. We saw what you didn't do. We won't forget it.", 'neutral'),
  ]); },
  lost: (st, M) => st.round > DEADLINE || !st.ships.some(s => s.owner === 0),
  onLose: (st, M, H) => H.say(st, [hale("The quarter's closed and Corrigan is short. The Council will want a name for that, Captain. It'll be yours.", 'stern')]),
  choices: (st, M) => ({ drilledBracken: !!M.flags.drilledBracken }),
  achievementsOnWin: (st, M) => (M.flags.drilledBracken ? [] : ['good-neighbours']),
};
