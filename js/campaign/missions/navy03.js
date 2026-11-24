// ============================================================
// NAVY · MISSION 3 · CONVOY
// The Saltpan Channel, May 2061. Commodore Vance hands Ortiz the Corrigan Point shipyard and one job:
// see the tanker Hesper north to the Allocation Terminal. The Hesper sails herself; you escort her.
// Teaches: the shipyard, research, fleets, the Escort standing order, fighting on the move.
// Introduces Commodore Vance and Kade the Burner.
// Secondary: On the Clock (par), Full Load (Hesper arrives with 3+ HP), No Losses (no ships lost).
// Hidden: Firebreak (sink Kade's fireship before it gets within 2 squares of the Hesper).
// ============================================================
import * as E from '../../engine/index.js';
import { SHIPS } from '../../data/ships.js';
import { fieldAt, fogSpot, moveAlong, moveBest, waterField } from '../ai.js';

const PAR = 15, DEADLINE = 20, SAILS = 3;   // the Hesper casts off at the start of round 3
const DOCK = [15, 1];                        // where she unloads, under the Terminal
const WARSHIP = s => s.owner === 0 && s.id !== 'hesper';

const line = (who, text, mood = 'neutral') => ({ who, mood, text });
const sato = (t, m) => line('sato', t, m), vance = (t, m) => line('vance', t, m), ortiz = (t, m) => line('ortiz', t, m), kade = (t, m) => line('kade', t, m);

const hesper = st => st.ships.find(s => s.id === 'hesper');
const hesperTop = st => { const h = hesper(st); return h ? Math.min(...E.shipCells(h).map(c => c[1])) : 99; };
const near = (st, a, b) => E.dist(E.shipCells(a), E.shipCells(b));
const hostiles = st => st.ships.filter(s => s.owner === 1);

export default {
  id: 'navy-3', arc: 'navy', n: 3,
  title: 'Convoy', place: 'Saltpan Channel', date: 'May 2061',
  faction: 'navy', commander: { id: 'ortiz', level: 1 },
  enemy: { faction: 'tide', name: 'Free Tide' },
  par: PAR,
  hide: ['victory', 'world', 'commander'],
  summary: 'Build a squadron and see the tanker Hesper safely up the Saltpan Channel.',
  teaches: ['Shipyard', 'Research', 'Fleets', 'Escort orders', 'Fighting on the move'],

  map: `
    ############.......###########
    #########......X......########
    ##..........................##
    ##.................###......##
    ##.....###.........####.....##
    ##....####.........###......##
    ##.....###..................##
    ##..................###.....##
    ##......###.......#.###.....##
    ##......###.........###.....##
    ##......###.........###.....##
    ##......###.................##
    ##.................###......##
    ##.....###........####......##
    ##.....####........###......##
    ##...P.###.........###......##
    ##..........................##
    ##..A.......................##
    ##......T...P...............##
    ##......................######
    ######..............##########
    ##############################`,
  homes: [
    { home: { x0: 2, y0: 15, x1: 12, y1: 20 }, spawn: { x0: 2, y0: 15, x1: 8, y1: 19 } },
    { home: { x0: 27, y0: 2, x1: 27, y1: 2 }, spawn: { x0: 27, y0: 2, x1: 27, y1: 2 } },
  ],
  props: () => [{ kind: 'terminal', x: 14, y: 0 }], // (no label: the 'Unload here' marker sits right under it)

  setup(st, marks, H) {
    const [ax, ay] = marks.A[0];
    const dep = { id: 'd_corrigan_point', x: ax, y: ay, type: 'medium', reserves: 90, max: 90 };
    st.deposits.push(dep);
    E.foundBase(st, 0, dep, true);
    st.players[0].known[dep.id] = true;
    marks.P.forEach(([x, y], i) => H.ship(st, 0, 'patrol', x, y, { id: 'pk' + (i + 1) }));
    const h = H.ship(st, 0, 'tanker', ...marks.T[0], { id: 'hesper' });
    h.name = 'Hesper';
    st.campaign.locked.push('hesper');
    const [me, foe] = st.players;
    me.money = 620; me.oil = 30;
    st.campaign.flags.techs0 = Object.keys(me.research?.done || {}).length;
    foe.money = 300; foe.oil = 60;
    me.log = [{ turn: 1, text: 'Corrigan Point. The Hesper is loading; she sails at the start of round 3.' }]; foe.log = [];
  },

  briefing: c => [
    ...(c.drilledBracken === true ? [
      line('vance', "Captain Ortiz. Commodore Vance, escort group. I read your Bracken report. Good. Somebody on this shelf understands what the quota is for.", 'pleased'),
    ] : c.drilledBracken === false ? [
      line('vance', "Captain Ortiz. Commodore Vance, escort group. I read your Bracken report. You left the best well on the bank in the ground for a fishing village.", 'stern'),
      line('vance', "Sentiment is how we lost three tankers this month. Don't make a habit of it."),
    ] : [line('vance', "Captain Ortiz. Commodore Vance, escort group.")]),
    vance("The Tide has hit three of our tankers since April. The Hesper is next: full load, bound for the Allocation Terminal up the Saltpan Channel."),
    vance("You have the Corrigan Point yard and a budget. Build an escort and see her through. She sails at the start of round three, and she won't move without a warship close by."),
    ortiz("And if they come at her in the channel?"),
    vance("They will. Make them regret it.", 'stern'),
  ],

  goals: {
    main: 'See the Hesper to the Allocation Terminal',
    lose: `The Hesper is sunk, or hasn't arrived by the end of round ${DEADLINE}`,
    deadline: DEADLINE,
    progress: st => { const h = hesper(st); return h ? `Hesper ${h.hp}/4 HP` : ''; },
  },
  secondary: [
    { id: 'clock', name: 'On the Clock', desc: 'Arrive by round {par}', done: (st, M, c) => c.rounds <= c.par, live: (st, M) => (M.wonRound || st.round) <= PAR },
    { id: 'full', name: 'Full Load', desc: 'The Hesper arrives with at least 3 of her 4 HP', done: st => (hesper(st)?.hp || 0) >= 3, live: st => (hesper(st)?.hp || 0) >= 3 },
    { id: 'nolosses', name: 'No Losses', desc: 'Lose no ships', done: st => !(st.players[0].stats?.shipsLost > 0), live: st => !(st.players[0].stats?.shipsLost > 0) },
  ],
  clearAchievement: 'convoy',

  steps: [
    {
      id: 'buy',
      say: [
        sato("Commodore Vance has signed the Corrigan yard over to us. First time we've had one, Captain."),
        sato("Corvettes are the escort's backbone: two guns' worth of trouble for a skiff, and they screen the ships beside them."),
      ],
      do: 'In the <b>Shipyard</b> card, buy a <b>Corvette</b>.',
      spot: '[data-buy="corvette"]',
      check: st => st.ships.some(s => s.owner === 0 && s.type === 'corvette') || (st.players[0].builds || []).some(b => b.ship === 'corvette' || b.type === 'corvette'),
      done: (st, M, H) => H.say(st, [sato("Ordered. You pay up front; she'll launch next to the yard at the start of a later turn. Buy another if the budget stretches.")]),
    },
    {
      id: 'research',
      say: [
        sato("While the yard works: the research office wants a priority. Our base earns four research points a turn; an early tech needs twelve."),
        sato("You can buy extra points with money, too. Naval Artillery hits harder, Steel Hulls take more punishment, Diesel Engines are faster. Your choice."),
      ],
      do: 'Open the research tree (<b>🔬 Choose research</b> at the top, or press T) and start a tech.',
      spot: '#btn-research',
      check: (st, M) => !!st.players[0].research?.current || Object.keys(st.players[0].research?.done || {}).length > M.flags.techs0,
    },
    {
      id: 'launch',
      do: 'End your turn: new ships launch at the start of your next one.',
      spot: '[data-end]',
      check: st => st.ships.some(s => s.owner === 0 && s.type === 'corvette'),
      done: (st, M, H) => H.say(st, [sato("Corvette in the water.", 'pleased')]),
    },
    {
      id: 'fleet',
      say: [sato("Escorts work best together. Group the warships into a fleet: they'll sail in formation and take orders as one.")],
      do: 'Select one of your warships, click <b>⚑ Form a fleet…</b>, then click the others and confirm.',
      spot: '[data-fleet-pick]',
      check: st => E.fleetsOf(st, 0).length > 0,
    },
    {
      id: 'escort',
      say: [sato("Now give them a job. An Escort order keeps them on the Hesper and has them fire at anything in range, every time you end your turn.")],
      do: 'With the fleet selected, click <b>🛡️ Escort</b> in Standing orders, then click the <b>Hesper</b>.',
      spot: '[data-standing="escort"]',
      check: st => st.ships.some(s => s.standing?.kind === 'escort' && s.standing.target === 'hesper') || E.fleetsOf(st, 0).some(f => f.standing?.kind === 'escort' && f.standing.target === 'hesper'),
      done: (st, M, H) => H.say(st, [sato("Escort set. You can still take any ship off the leash and give it orders by hand: the order picks up again next turn.")]),
    },
    {
      id: 'convoy',
      do: 'See the <b>Hesper</b> to the Allocation Terminal. She makes two squares a turn, and only with a warship within 3 squares of her.',
      markers: [{ x0: DOCK[0] - 1, y0: DOCK[1], x1: DOCK[0] + 1, y1: DOCK[1], label: 'Unload here' }],
      check: (st, M) => !!M.flags.arrived,
    },
  ],

  triggers: [
    { id: 'casting', when: st => st.round >= SAILS, say: [sato("The Hesper's loaded. She's casting off.")] },
    {
      id: 'wave1', when: st => hesperTop(st) <= 15,
      then: (st, M, H) => spawn(st, M, H, ['w1a', 'w1b'], { x0: 2, y0: 6, x1: 7, y1: 13 }),
      say: [sato("Contacts to the west, coming out from behind the Saltpan islands! Two, small and fast.", 'worried')],
    },
    {
      id: 'wave2', when: st => hesperTop(st) <= 10,
      then: (st, M, H) => spawn(st, M, H, ['w2a', 'w2b'], { x0: 22, y0: 2, x1: 27, y1: 9 }),
      say: [sato("Two more, east side! They're going for the tanker.", 'worried')],
    },
    {
      id: 'kade', when: (st, M) => hesperTop(st) <= 5 && M.fired.wave2 && st.round > M.fired.wave2,
      then: (st, M, H) => {
        const h = hesper(st), at = fogSpot(st, [h.x, h.y], 9, { x0: 2, y0: 2, x1: 27, y1: 8 });
        if (at) { H.ship(st, 1, 'fireship', at[0], at[1], { id: 'fireship' }); M.track.push('fireship'); M.flags.fireClosest = 99; }
      },
      say: [
        kade("Corrigan escort. This is Kade. You'll have heard of me.", 'stern'),
        kade("Navy boats. Navy oil. Navy tanker. You know what all three have in common?"),
        kade("They burn.", 'stern'),
        sato("Fireship! If that thing gets alongside the Hesper it'll take her and everything near her. Sink it before it closes!", 'worried'),
      ],
    },
    {
      id: 'firedown',
      when: (st, M, H) => !!M.fired.kade && !H.get(st, 'fireship') && !M.flags.fireRammed,
      then: (st, M, H) => { if ((M.flags.fireClosest ?? 99) > 2) H.achieve(st, 'firebreak'); },
      say: [sato("Fireship's down! Burning on the water, well clear.", 'pleased'), kade("...You'll keep, Corrigan.", 'stern')],
    },
    {
      id: 'rammed', when: (st, M) => !!M.flags.fireRammed && !!hesper(st),
      say: [sato("She got alongside! The Hesper's burning... damage control's holding. Barely.", 'worried')],
    },
    {
      id: 'hit', when: st => (hesper(st)?.hp ?? 4) < 4,
      say: [sato("The Hesper's taking hits! Keep those boats off her.", 'worried')],
    },
  ],

  // the Hesper sails on as you end your turn, but only with a warship within 3 squares of her
  beforeEndTurn(st, M) {
    const h = hesper(st);
    if (!h || M.flags.arrived || st.round < SAILS) return;
    const escorted = st.ships.some(s => WARSHIP(s) && near(st, s, h) <= 3);
    M.flags.hesperWaiting = escorted ? null : 'escort';
    if (M.flags.hesperWaiting) return;
    h.movesLeft = Math.min(h.movesLeft, 2); // (fully laden: two squares a turn)
    const D = waterField(st, [DOCK], { diag: false }); // (square by square, so every step north counts)
    // (bow first: she prefers to face north, up the channel, once she's turned into it)
    const sail = () => moveBest(st, h, (x, y, rot) => Math.min(...E.shipCells({ ...h, x, y, rot }).map(([a, b]) => D[b * st.W + a])) + (rot === 3 ? 0 : 0.5), { script: true });
    if (!sail() && fieldAt(st, D, h) > 1) {
      // one of your own ships is in her way: it stands aside, and she tries again
      const mine = fieldAt(st, D, h);
      for (const s of st.ships.filter(s => WARSHIP(s) && near(st, s, h) <= 2 && fieldAt(st, D, s) < mine)) {
        const spot = standAside(st, s, h, D, mine);
        if (spot) { s.x = spot.x; s.y = spot.y; s.rot = spot.rot; E.log(st, 0, `Your ${SHIPS[s.type].name} stood aside for the Hesper.`); }
      }
      h.movesLeft = Math.min(Math.max(h.movesLeft, 1), 2);
      sail();
    }
    if (fieldAt(st, D, h) <= 1) M.flags.arrived = true;
  },

  // Tide skiffs close to 2 squares of the Hesper and shoot (at her if they can, else the nearest warship);
  // the fireship runs at her and rams.
  enemyTurn(st, M, H) {
    const h = hesper(st);
    if (!h) return;
    const D = waterField(st, E.shipCells(h));
    for (const k of hostiles(st)) {
      if (!st.ships.includes(k)) continue;
      if (k.type === 'fireship') {
        if (near(st, k, h) > 1) moveAlong(st, k, D);
        M.flags.fireClosest = Math.min(M.flags.fireClosest ?? 99, near(st, k, h));
        if (near(st, k, h) <= 1) {
          const [x, y] = E.shipCells(h)[1] || E.shipCells(h)[0];
          if (E.applyAction(st, { type: 'act', shipId: k.id, actionId: 'ram', x, y }).ok) M.flags.fireRammed = true;
        }
        continue;
      }
      if (near(st, k, h) > 2) moveBest(st, k, (x, y) => { const d = D[y * st.W + x]; return d <= 2 ? (d === 2 ? 0 : 1) : d; });
      const target = near(st, k, h) <= 2 ? h : st.ships.filter(s => s.owner === 0 && near(st, k, s) <= 2).sort((a, b) => a.hp - b.hp)[0];
      if (target) for (const [x, y] of E.shipCells(target)) if (E.applyAction(st, { type: 'act', shipId: k.id, actionId: 'gun', x, y }).ok) break;
    }
  },

  won: (st, M) => !!M.flags.arrived,
  onWin: (st, M, H) => H.say(st, [
    sato("Hesper's alongside the Terminal. Pumps are connected.", 'pleased'),
    vance("Clean work, Captain. Clean enough, anyway.", 'neutral'),
    vance("We've been playing defence on this shelf for a year. Every boat we sink, the rafts send two more. That ends now."),
    vance("The boats come from the rafts. We find the rafts.", 'stern'),
    ortiz("The rafts are where the families are, Commodore.", 'worried'),
    vance("Yes. Vance out."),
  ]),
  lost: (st, M) => !hesper(st) || st.round > DEADLINE,
  onLose: (st, M, H) => H.say(st, [vance(hesper(st) ? "The Hesper is still at sea and the Terminal is closing its books. Bring her home, Captain." : "The Hesper is gone. Full load, full crew. I'll be writing the letters myself.", 'stern')]),
};

// a free spot near ship s that's off the Hesper's way ahead (not closer to the dock than she is)
function standAside(st, s, h, D, hesperD) {
  let best = null;
  for (let r = 1; r <= 3 && !best; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) for (const rot of [s.rot, (s.rot + 1) % 4]) {
    if (!dx && !dy) continue;
    const c = { ...s, x: s.x + dx, y: s.y + dy, rot };
    const cells = E.shipCells(c);
    if (cells.some(([x, y]) => x < 0 || y < 0 || x >= st.W || y >= st.H || E.isLand(st, x, y) || D[y * st.W + x] < hesperD)) continue;
    if (st.ships.some(o => o !== s && E.shipCells(o).some(([a, b]) => cells.some(([x, y]) => x === a && y === b)))) continue;
    if (!best || Math.abs(dx) + Math.abs(dy) < best.d) best = { x: c.x, y: c.y, rot, d: Math.abs(dx) + Math.abs(dy) };
  }
  return best;
}

// Tide skiffs slip out of the fog in a box, about 9 squares from the Hesper (a turn away)
function spawn(st, M, H, ids, box) {
  const h = hesper(st);
  if (!h) return;
  for (const id of ids) {
    const at = fogSpot(st, [h.x, h.y], 9, box);
    if (!at) continue;
    H.ship(st, 1, 'skiff', at[0], at[1], { id });
    M.track.push(id);
  }
}
