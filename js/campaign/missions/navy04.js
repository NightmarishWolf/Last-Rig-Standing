// ============================================================
// NAVY · MISSION 4 · DRIFTWOOD
// The Fenwick Isles, June 2061. Vance traces the convoy raiders to Driftwood, a Tide raft town, and
// orders it burned. Ortiz's marines could take it instead. Teaches: scouting, Navy supply (and the
// Supply Ship), the Tide's raft network, attacking a base's platforms and central rig, commander powers.
// The choice: burn Driftwood (destroy its central rig) or take it (Beach Landing). Both win.
// Secondary: On the Clock (par), Well Supplied (no ship ever low on supplies), No Losses.
// Hidden: Taken, Not Burned (capture Driftwood).
// ============================================================
import * as E from '../../engine/index.js';
import { PLATFORMS } from '../../data/bases.js';
import { SHIPS } from '../../data/ships.js';
import { fogSpot, moveBest, waterField } from '../ai.js';

const PAR = 16, DEADLINE = 24;
const ISLES = { x0: 18, y0: 2, x1: 33, y1: 12 };

const line = (who, text, mood = 'neutral') => ({ who, mood, text });
const sato = (t, m) => line('sato', t, m), vance = (t, m) => line('vance', t, m), ortiz = (t, m) => line('ortiz', t, m), lio = (t, m) => line('lio', t, m);

const dw = st => (st.bases || []).find(b => b.id === st.campaign.flags.dwId);
const dwRig = st => { const b = dw(st); return b && st.rigs.find(r => r.baseId === b.id && r.center); };
const working = st => { const b = dw(st); return b ? (st.platforms || []).filter(o => o.baseId === b.id && !o.buildLeft) : []; };
const burned = st => { const b = dw(st); return !b || (b.owner === 1 && (b.wrecked || !dwRig(st))); };
const taken = st => dw(st)?.owner === 0;
const near = (st, a, b) => E.dist(E.shipCells(a), E.shipCells(b));
const warships = st => st.ships.filter(s => s.owner === 0 && s.type !== 'supply');

export default {
  id: 'navy-4', arc: 'navy', n: 4,
  title: 'Driftwood', place: 'The Fenwick Isles', date: 'June 2061',
  faction: 'navy', commander: { id: 'ortiz', level: 1 },
  enemy: { faction: 'tide', name: 'Driftwood' },
  par: PAR,
  hide: ['victory', 'world'],
  summary: "Vance has found the raiders' home: Driftwood, a raft town in the Fenwick Isles. His orders: burn it.",
  teaches: ['Scouting', 'Supply lines', 'The Tide', 'Attacking bases', 'Commander powers'],

  map: `
    ##................................
    ##................................
    ##...................###########..
    ##...................##.......##..
    ##...................##.......##..
    ##......................##....##..
    ##....###..................D..##..
    ##....###............##.......##..
    ##.....#.............##.......##..
    ##...........##......##.......##..
    ##...........###.....######..###..
    ##...........##........####..#....
    ##................................
    ##..............................##
    ##.......................###......
    ##..S....###.............####.....
    ##....P..####.....................
    ##........#.......................
    ##....C.C.......###...............
    ##..A...C.......####..............
    ####..............................
    ####..............................
    #########.........................
    ##################################`,
  homes: [
    { home: { x0: 2, y0: 14, x1: 10, y1: 21 }, spawn: { x0: 2, y0: 15, x1: 7, y1: 21 } },
    { home: { x0: 24, y0: 4, x1: 28, y1: 8 }, spawn: { x0: 24, y0: 4, x1: 28, y1: 8 } },
  ],
  props: st => { const b = dw(st); return b && !burned(st) ? [{ kind: 'rafttown', x: b.x, y: b.y }] : b ? [{ kind: 'rafttown', x: b.x, y: b.y, burnt: true }] : []; },

  setup(st, marks, H) {
    // your forward outpost
    const [ax, ay] = marks.A[0];
    const home = { id: 'd_fenwick_outpost', x: ax, y: ay, type: 'medium', reserves: 90, max: 90 };
    st.deposits.push(home);
    E.foundBase(st, 0, home, true);
    st.players[0].known[home.id] = true;
    marks.C.forEach(([x, y], i) => H.ship(st, 0, 'corvette', x, y, { id: 'cv' + (i + 1) }));
    H.ship(st, 0, 'patrol', ...marks.P[0], { id: 'pk1' });
    H.ship(st, 0, 'supply', ...marks.S[0], { id: 'supply' });
    // Driftwood: a Tide base (not their Admiralty, so marines can take it) with a grown raft network
    const [dx, dy] = marks.D[0];
    const dep = { id: 'd_driftwood', x: dx, y: dy, type: 'medium', reserves: 120, max: 120 };
    st.deposits.push(dep);
    const b = E.foundBase(st, 1, dep, false);
    b.tideAge = 9; // (its Tide reaches 4 squares: a Raft Dock)
    st.campaign.flags.dwId = b.id;
    const plat = (kind, x, y) => { const o = { id: 'f' + st.nextId++, owner: 1, baseId: b.id, kind, x, y, hp: PLATFORMS[kind].hp, buildLeft: 0 }; st.platforms.push(o); };
    plat('radar', dx - 1, dy);
    plat('storage', dx + 1, dy + 1);
    // its defenders
    H.ship(st, 1, 'skiff', dx - 2, dy + 2, { id: 'sk2' });
    H.ship(st, 1, 'skiff', dx + 1, dy - 2, { id: 'sk1' });
    const [me, foe] = st.players;
    me.money = 500; me.oil = 40;
    foe.money = 400; foe.oil = 60;
    st.campaign.flags.techs0 = 0;
    me.log = [{ turn: 1, text: 'The Fenwick forward outpost. Three Corvettes, a Picket Boat and a Supply Ship.' }]; foe.log = [];
  },

  briefing: c => [
    vance("The convoy raiders have a home. A raft town called Driftwood, anchored somewhere in the Fenwick Isles. Three hundred of them, give or take."),
    vance("Every tanker we've lost this year was hit by boats out of Driftwood. It ends this week."),
    ortiz("Orders, Commodore?"),
    vance("Burn it.", 'stern'),
    ...(c.drilledBracken === false ? [vance("And Captain: Bracken was sentiment. This is a direct order.", 'stern')] : []),
  ],

  goals: {
    main: 'Stop the raids: burn Driftwood, or take it',
    lose: `Every warship lost, or Driftwood still stands after round ${DEADLINE}`,
    deadline: DEADLINE,
    progress: st => { const r = dwRig(st), b = dw(st); return b && !taken(st) && !burned(st) && st.campaign.flags.found ? `rig ${r?.hp ?? 0}/${E.baseMaxHp(st, b)} · ${working(st).length} platform${working(st).length === 1 ? '' : 's'}` : ''; },
  },
  secondary: [
    { id: 'clock', name: 'On the Clock', desc: 'Finish by round {par}', done: (st, M, c) => c.rounds <= c.par, live: (st, M) => (M.wonRound || st.round) <= PAR },
    { id: 'supplied', name: 'Well Supplied', desc: 'No warship ever runs low on supplies', done: (st, M) => !M.flags.wentLow, live: (st, M) => !M.flags.wentLow },
    { id: 'nolosses', name: 'No Losses', desc: 'Lose no ships', done: st => !(st.players[0].stats?.shipsLost > 0), live: st => !(st.players[0].stats?.shipsLost > 0) },
  ],
  clearAchievement: 'driftwood',

  steps: [
    {
      id: 'supply',
      say: [
        sato("The Fenwick Isles are a long way from any base of ours, Captain. That matters."),
        sato("Our ships draw supplies from our bases. Three rounds out of reach and they run low: they hit for one less."),
        sato("The Supply Ship carries the base with her: every ship within four squares of her stays supplied. Keep her with the squadron, and keep her alive."),
      ],
      do: 'Take the squadron and the <b>Supply Ship</b> north-east toward the Fenwick Isles.',
      markers: [{ ...ISLES, label: 'The Fenwick Isles' }],
      check: st => warships(st).some(s => s.x >= 14 || s.y <= 12),
    },
    {
      id: 'find',
      say: [sato("Driftwood's somewhere in the isles. A Radar Ping shows a three-by-three patch of sea from four squares out; or sail in and look.")],
      do: 'Find <b>Driftwood</b> in the Fenwick Isles. A Picket Boat\'s <b>Radar Ping</b> scouts ahead.',
      spot: '[data-act="ping"]',
      markers: [{ ...ISLES, label: 'Driftwood is in here' }],
      check: (st, M) => !!M.flags.found,
    },
    {
      id: 'platforms',
      say: [
        sato("There she is. Driftwood. Look at the size of it.", 'worried'),
        sato("That green-blue around it is the Tide: their raft network. Their boats move faster on it and patch themselves up. It's grown far enough that the town has a Raft Dock: it'll keep launching boats while it stands."),
        sato("She's got a Radar Mast up: it sees five squares out, so her boats will see us coming. Take the platforms down first."),
      ],
      do: 'Destroy Driftwood\'s <b>platforms</b>: fire at them like any target.',
      markers: st => working(st).map(o => ({ x0: o.x, y0: o.y, x1: o.x, y1: o.y, label: PLATFORMS[o.kind].name })),
      check: st => working(st).length === 0 || burned(st) || taken(st),
    },
    {
      id: 'choice',
      say: [
        vance("Ortiz. Report.", 'stern'),
        ortiz("Driftwood's defences are down, Commodore. There are people on those rafts. Families."),
        vance("I know who's on those rafts. Burn it.", 'stern'),
        sato("...Captain. Our marines could take her instead. With her boats driven off, a Beach Landing would put the whole town in custody. Nobody burns.", 'worried'),
        sato("It's on the commander card: Beach Landing. Your call, sir."),
      ],
      do: 'Burn Driftwood (shoot its <b>central rig</b> down), or take it: keep its boats 2+ squares away and use <b>🏖️ Beach Landing</b> on the commander card.',
      spot: '[data-power="beachlanding"]',
      markers: st => { const r = dwRig(st); return r ? [{ x0: r.x, y0: r.y, x1: r.x, y1: r.y, label: 'Driftwood' }] : []; },
      check: st => burned(st) || taken(st),
    },
  ],

  triggers: [
    {
      id: 'found',
      when: (st, M) => {
        const r = dwRig(st), b = dw(st), v = E.visibility(st, 0);
        return !!r && (v.rigs.has(r.id) || (st.platforms || []).some(o => o.baseId === b.id && v.platforms.has(o.id)) || st.ships.some(s => s.owner === 0 && E.dist(E.shipCells(s), [[b.x, b.y]]) <= 4));
      },
      then: (st, M) => { M.flags.found = true; M.track.push(...st.ships.filter(s => s.owner === 1).map(s => s.id)); },
    },
    {
      id: 'low',
      // (only ships with guns: being low on supplies means hitting softer)
      when: st => st.ships.some(s => s.owner === 0 && (s.away || 0) >= 3 && SHIPS[s.type].actions.some(a => a.kind === 'attack')),
      then: (st, M) => { M.flags.wentLow = true; },
      say: [sato("We've got ships running low on supplies: they're hitting softer. Get them back within four squares of the Supply Ship.", 'worried')],
    },
    {
      id: 'supplyHit',
      when: st => { const s = st.ships.find(x => x.id === 'supply'); return !s || s.hp < 4; },
      say: [sato("They're going for the Supply Ship! Without her, we're on our own out here.", 'worried')],
    },
  ],

  // Driftwood's boats guard their town: anything of yours within 5 squares gets chased and shot (from
  // 2 squares); otherwise they sit on their rafts and heal. The Raft Dock launches a skiff every 3 turns.
  enemyTurn(st, M, H) {
    const b = dw(st);
    if (!b || b.owner !== 1 || b.wrecked) return;
    const home = waterField(st, [[b.x, b.y]]);
    const mine = st.ships.filter(s => s.owner === 0);
    for (const k of st.ships.filter(s => s.owner === 1)) {
      if (!st.ships.includes(k)) continue;
      const foe = mine.filter(s => E.dist(E.shipCells(s), [[b.x, b.y]]) <= 5).sort((a, c) => near(st, k, a) - near(st, k, c) || a.hp - c.hp)[0];
      if (foe) {
        const D = waterField(st, E.shipCells(foe));
        if (near(st, k, foe) > 2) moveBest(st, k, (x, y) => { const d = D[y * st.W + x]; return (d <= 2 ? 0 : d) + home[y * st.W + x] * 0.01; });
        const gun = k.type === 'gunboat' || k.type === 'skiff' ? 'gun' : null;
        if (gun) for (const [x, y] of E.shipCells(foe)) if (E.applyAction(st, { type: 'act', shipId: k.id, actionId: gun, x, y }).ok) break;
      } else if (home[k.y * st.W + k.x] > 3) moveBest(st, k, (x, y) => Math.abs(home[y * st.W + x] - 2));
    }
    // the Raft Dock
    const alive = st.ships.filter(s => s.owner === 1).length;
    M.flags.dockClock = (M.flags.dockClock || 0) + 1;
    if (M.flags.found && M.flags.dockClock >= 3 && alive < 3) {
      M.flags.dockClock = 0;
      const at = fogSpot(st, [b.x, b.y], 1, { x0: b.x - 2, y0: b.y - 2, x1: b.x + 2, y1: b.y + 2 })
        || [[b.x, b.y - 1], [b.x, b.y + 1], [b.x + 1, b.y], [b.x - 1, b.y - 1]].find(([x, y]) => !E.isLand(st, x, y) && !st.ships.some(s => E.shipCells(s).some(([a, c]) => a === x && c === y)) && !st.platforms.some(o => o.x === x && o.y === y));
      if (at) {
        const s = H.ship(st, 1, 'skiff', at[0], at[1], { id: 'dock' + st.nextId });
        M.track.push(s.id);
        H.say(st, [sato("The Raft Dock's launched another boat.", 'worried')]);
      }
    }
  },

  won: st => burned(st) || taken(st),
  onWin: (st, M, H) => {
    M.flags.outcome = taken(st) ? 'taken' : 'burned';
    if (M.flags.outcome === 'burned') H.say(st, [
      sato("Driftwood's burning, Captain. The whole town. People are going into the water.", 'worried'),
      ortiz("Get every boat we have in there. Pull out everyone we can reach.", 'stern'),
      vance("Good work, Ortiz. That's one.", 'pleased'),
      sato("...Aye, sir. Boats away.", 'worried'),
    ]);
    else H.say(st, [
      sato("Marines report Driftwood secure. Three hundred and twelve people in custody. Nobody hurt.", 'pleased'),
      vance("I gave you an order, Captain.", 'stern'),
      ortiz("You'll have my report, Commodore. The raids are over. Nobody had to burn for it."),
      vance("Do it again and I'll have your command.", 'stern'),
      lio("You're the one who didn't burn us.", 'stern'),
      lio("Mother Ruiz will hear about that. Whether you want her to or not."),
    ]);
  },
  achievementsOnWin: st => (taken(st) ? ['taken-not-burned'] : []),
  choices: (st, M) => ({ driftwood: taken(st) ? 'taken' : 'burned' }),
  lost: st => warships(st).length === 0 || st.round > DEADLINE,
  onLose: (st, M, H) => H.say(st, [vance(warships(st).length ? "Driftwood is still there and so are the raiders. I'll send someone who can finish a job." : "Your squadron's gone, Captain. Driftwood's still there.", 'stern')]),
};
