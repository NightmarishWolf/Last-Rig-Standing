// ============================================================
// NAVY · MISSION 8 · THE TERMINAL
// The Allocation Terminal, January 2062. Kade throws everything he has at the Terminal, where every barrel
// on the northern shelves is loaded. You command Commodore Vance (Carrier Doctrine) in the biggest defence
// yet: Kade is the skirmish AI (Hard, Raider, Arson level 5), with fresh boats out of the fog every few
// rounds. On round 7 Kade sends the Hesper (the tanker from Mission 3), captured, with her crew lashed to
// the rails, rigged to burn, straight at the Terminal. Ortiz begs to go after her. A choice (buttons):
// let him (his two ships leave your line, sailing on their own to board her) or hold the line (and sink
// her yourself before she gets there). Hidden: Not That Navy (let him go, and the crew get home).
// Win: hold until the Home Fleet arrives (round 24), or sink Kade's flagship, the Pyre (from round 12).
// Lose: the Terminal is wrecked.
// ============================================================
import * as E from '../../engine/index.js';
import { moveBest, waterField } from '../ai.js';
import { baseOf, foundAt, hale, kade, lost, ortiz, plat, rigOf, sato, spawn, vance } from '../kit.js';

const PAR = 22, RELIEF = 24, BUDGET = 150, HESPER_AT = 7, PYRE_AT = 12, WAVES_EVERY = 3;
const NORTH = { x0: 16, y0: 0, x1: 45, y1: 1 }, SOUTH = { x0: 20, y0: 40, x1: 48, y1: 41 };

const terminal = st => baseOf(st, 'A');
const hesper = st => st.ships.find(s => s.id === 'hesper');
const pyre = st => st.ships.find(s => s.id === 'pyre');
const letOrtiz = M => M.picked?.hesper === 'ortiz';

export default {
  id: 'navy-8', arc: 'navy', n: 8,
  title: 'The Terminal', place: 'The Allocation Terminal', date: 'January 2062',
  faction: 'navy', commander: { id: 'vance', level: 4 },
  enemy: { faction: 'tide', name: 'Kade the Burner', ai: { difficulty: 'hard', personality: 'raider', commander: 'kade', level: 5 } },
  par: PAR,
  hide: ['victory'],
  summary: 'Kade is coming for the Allocation Terminal with everything he has. You are Commodore Vance.',
  teaches: ['A big defence', 'Escort carriers', 'Hard choices from the other chair'],

  map: `
    ..............................................................
    ..............................................................
    ..............................................................
    ..................................####........................
    .................................#####........................
    .................................####..T......................
    ................................####..........................
    ..................................................##..........
    ................................................###...........
    ...............................................####...........
    .............................................######...........
    ............................................####..............
    ..............................................#...............
    ....................###.......................................
    #..................####.......................................
    ####..............###.........................................
    ######......P...............................................##
    ########...................................................###
    ########.....c.............................................###
    ########..........D.......................................####
    ########..................................................####
    #########.....C...........................................####
    #########................................................#####
    #########................................................#####
    ##########...............................................#####
    ##########A.........O....................................#####
    #########........L........................................####
    ########...............................................K..####
    #######.......E...........................................####
    ######....................................................####
    ######......................................####...........###
    #####.............D........................#####............##
    ####.......................................####.............##
    ##...........c............................####...............#
    ..........................................##.................#
    ..............................................................
    ............P.....##..........................................
    ..................####........................................
    .................####.................................###.....
    ................##.................................######.....
    ..................................................T######.....
    ......................................................#.......`,
  homes: [
    { home: { x0: 8, y0: 14, x1: 22, y1: 36 }, spawn: { x0: 8, y0: 14, x1: 22, y1: 36 } },
    { home: { x0: 46, y0: 18, x1: 56, y1: 34 }, spawn: { x0: 46, y0: 18, x1: 56, y1: 34 } },
  ],

  setup(st, marks, H) {
    const me = st.players[0], foe = st.players[1], F = st.campaign.flags;
    const A = foundAt(st, 'A', marks.A[0], 0, { capital: true, level: 3, type: 'rich', reserves: 300 });
    plat(st, A, 'gun', 1, -1); plat(st, A, 'gun', 1, 1); plat(st, A, 'storage', 0, -1); plat(st, A, 'storage', 0, 1);
    marks.P.forEach((at, i) => { const b = foundAt(st, 'P' + i, at, 0, { level: 2 }); plat(st, b, 'gun', 1, 0); });
    const K = foundAt(st, 'K', marks.K[0], 1, { capital: true, level: 3, tideAge: 12, type: 'rich', reserves: 240 }); plat(st, K, 'gun', -1, 0);
    marks.T.forEach((at, i) => foundAt(st, 'T' + i, at, 1, { level: 2, tideAge: 9 }));
    // Vance's carrier group, and Ortiz's detachment
    const cv = H.ship(st, 0, 'carrier', ...marks.C[0], { id: 'indomitable' }); cv.name = 'Indomitable';
    H.ship(st, 0, 'escortcarrier', ...marks.E[0], { id: 'ec1' });
    marks.D.forEach(([x, y], i) => H.ship(st, 0, 'destroyer', x, y, { id: 'dd' + (i + 1) }));
    marks.c.forEach(([x, y], i) => H.ship(st, 0, 'corvette', x, y, { id: 'cv' + (i + 1) }));
    const o1 = H.ship(st, 0, 'destroyer', ...marks.O[0], { id: 'or1' }); o1.name = "Ortiz's destroyer";
    const o2 = H.ship(st, 0, 'landingcraft', ...marks.L[0], { id: 'or2' }); o2.name = "Ortiz's landing craft";
    for (const t of ['destroyer_program', 'platform_construction', 'gun_platforms', 'artillery', 'dry_docks', 'crew_quarters']) me.research.done[t] = true;
    me.money = 1500; me.oil = 60;
    const t = (type, b, dx, dy) => H.ship(st, 1, type, b.x + dx, b.y + dy);
    t('fireship', K, -3, -2); t('fireship', K, -3, 2); t('gunboat', K, -3, 0); t('incendiary', K, -1, 3); t('skiff', K, 1, -3);
    foe.money = 1400; foe.oil = 100;
    me.log = [{ turn: 1, text: 'The Allocation Terminal. Kade is coming.' }]; foe.log = [];
  },

  briefing: c => [
    sato("Commodore, every radar on the coast has Kade's boats massing east of the Terminal. Fireships, junks, the lot."),
    vance("Of course he is. We cleared his channel, so he goes for the one place every tanker on the shelves has to come to.", 'stern'),
    vance("Let him come. The Terminal has guns, I have aircraft, and the Home Fleet is three days out. We hold until it arrives.", 'stern'),
    ortiz("My detachment's on your left, Commodore. One destroyer and a landing craft."),
    vance("Then keep them where I put them, Captain. No heroics today.", 'stern'),
  ],

  goals: {
    main: `Hold the Terminal until the Home Fleet arrives (round ${RELIEF}), or sink Kade's flagship`,
    lose: 'The Terminal is wrecked',
    deadline: RELIEF,
    deadlineText: `The Home Fleet arrives at round ${RELIEF}: hold until then.`,
    progress: st => { const r = rigOf(st, terminal(st)); return `Terminal ${r ? r.hp : 0}/${r ? E.baseMaxHp(st, terminal(st)) : 0} HP${pyre(st) ? ' · the Pyre is out' : ''}`; },
  },
  secondary: [
    { id: 'intact', name: 'Untouched', desc: 'The Terminal never falls below half HP', done: (st, M) => !M.flags.halfDown, live: (st, M) => !M.flags.halfDown },
    { id: 'pyre', name: 'The Pyre', desc: "Sink Kade's flagship", done: (st, M) => !!M.flags.pyreSunk, live: () => true },
    { id: 'rigs', name: 'Every Rig', desc: 'Lose none of your three bases', done: st => !['A', 'P0', 'P1'].some(k => lost(st, k, 0)), live: st => !['A', 'P0', 'P1'].some(k => lost(st, k, 0)) },
  ],
  clearAchievement: 'the-terminal',

  steps: [
    {
      id: 'escort',
      say: [sato("Your Escort Carrier's Air Wing hits twice a turn out to six squares, Commodore. Cheap to build, too: your doctrine.")],
      do: 'Hold the Terminal. Your carriers\' aircraft reach further than any gun Kade has: <b>strike his boats before they close</b>.',
      markers: st => { const b = terminal(st); return b ? [{ x0: b.x, y0: b.y, x1: b.x, y1: b.y, label: 'The Terminal' }] : []; },
      check: () => false,
    },
  ],

  triggers: [
    { id: 'half', when: st => { const r = rigOf(st, terminal(st)); return !!r && r.hp <= E.baseMaxHp(st, terminal(st)) / 2; }, then: (st, M) => { M.flags.halfDown = true; }, say: [sato("The Terminal's down to half, Commodore!", 'worried')] },
    { id: 'pyreSunk', when: (st, M) => M.flags.pyreOut && !pyre(st), then: (st, M) => { M.flags.pyreSunk = st.round; } },
  ],

  // as you end your turn: the Terminal pays, and Ortiz's detachment sails on its own if you let it go
  beforeEndTurn(st, M, H) {
    st.players[0].money += BUDGET;
    if (letOrtiz(M) && !M.flags.rescueDone) chaseHesper(st, M, H);
  },
  // Kade's turn: the computer plays him; the mission adds fresh waves, the Hesper, and the Pyre
  enemyTurn(st, M, H) {
    const F = M.flags;
    if (st.round >= 3 && st.round % WAVES_EVERY === 0 && !F['wave' + st.round]) {
      F['wave' + st.round] = true;
      const north = (st.round / WAVES_EVERY) % 2 === 1;
      spawn(st, H, 1, st.round >= 12 ? ['fireship', 'incendiary', 'gunboat', 'skiff'] : ['fireship', 'gunboat', 'skiff'], north ? NORTH : SOUTH);
      H.say(st, [sato(north ? 'More of them coming in from the north, Commodore!' : 'Contacts to the south, closing!', 'worried')]);
    }
    if (st.round === HESPER_AT && !F.hesperOut) launchHesper(st, M, H);
    if (F.hesperOut && hesper(st)) sailHesper(st, M, H);
    if (st.round === PYRE_AT && !F.pyreOut) {
      F.pyreOut = true;
      const [s] = spawn(st, H, 1, ['incendiary'], { x0: 42, y0: 20, x1: 50, y1: 30 }, { hidden: false });
      if (s) { st.ships = st.ships.map(x => (x === s ? Object.assign(s, { id: 'pyre', name: 'the Pyre' }) : x)); M.track.push('pyre'); }
      H.say(st, [kade("Vance! Come out where I can see you. I'm on the Pyre. Come and sink me.", 'stern'), sato("That's his flagship, Commodore: the junk with the black sails. Sink her and his boats lose heart.")]);
    }
  },

  onChoice(st, M, H, id, opt) {
    if (id !== 'hesper') return;
    if (opt === 'ortiz') {
      M.locked.push('or1', 'or2');
      H.say(st, [vance("...Go, Captain. You have until she reaches the Terminal. Then she's mine.", 'stern'), ortiz("Aye, Commodore!", 'pleased')]);
    } else H.say(st, [vance("Negative, Captain. Hold your position. Every gun on the Hesper before she reaches the Terminal.", 'stern'), ortiz("...Aye, Commodore.", 'worried')]);
  },

  won: (st, M) => st.round >= RELIEF || !!M.flags.pyreSunk,
  onWin: (st, M, H) => H.say(st, [
    ...(M.flags.pyreSunk
      ? [sato("The Pyre's going down! Their boats are scattering, Commodore!", 'pleased'), kade("You haven't seen the last of me, Vance! I'll burn you yet!", 'stern'), sato("He's off her in a skiff, sir. Gone into the smoke.")]
      : [sato("Ships on the horizon, Commodore. Ours. The Home Fleet!", 'pleased'), ...(M.choices.ruizOffer === 'refused' ? [hale("Hello, Elias. Sorry we're late.", 'pleased')] : [])]),
    vance("The Terminal stands. Good work, all of you.", 'pleased'),
    ...(M.flags.crewSaved ? [ortiz("Commodore. Forty-one crew off the Hesper, all alive.", 'pleased'), vance("...So I'm told. Don't make a habit of it, Captain.", 'neutral')]
      : M.flags.hesperFate ? [ortiz("The Hesper's crew, Commodore. Forty-one of them.", 'stern'), vance("Forty-one lives against the Terminal, Captain. I'd make the same call again tomorrow.", 'stern')] : []),
  ]),
  achievementsOnWin: (st, M) => (letOrtiz(M) && M.flags.crewSaved ? ['not-that-navy'] : []),
  choices: (st, M) => ({ hesper: letOrtiz(M) ? (M.flags.crewSaved ? 'saved' : 'lost') : 'sunk' }),
  lost: st => lost(st, 'A', 0),
  onLose: (st, M, H) => H.say(st, [sato("The Terminal's gone, Commodore. It's burning end to end.", 'worried'), vance("...", 'stern')]),

  props: () => [{ kind: 'terminal', x: 4, y: 24 }],
};

// ---------- the Hesper ----------
function launchHesper(st, M, H) {
  M.flags.hesperOut = st.round;
  // (Kade's crew jumped off once she was pointed at the Terminal: she steers herself, nobody can command
  // her, and no automatic gun fires on her; only a captain's order can)
  const h = H.ship(st, 1, 'tanker', 16, 0, { id: 'hesper', rot: 1 }); h.name = 'the Hesper'; h.noncombatant = true;
  M.locked.push('hesper'); M.track.push('hesper');
  H.say(st, [
    sato("Commodore, a tanker coming down from the north. She's... that's the Hesper. She's ours.", 'worried'),
    kade("Recognise her, Vance? Forty-one of your crew are still aboard, tied to the rails. She's full to the brim and she's lit.", 'pleased'),
    ortiz("Commodore, give me the detachment! I can get alongside her and get them off!", 'worried'),
    vance("If she reaches the Terminal she takes half of it with her, Captain.", 'stern'),
    { ...vance("...", 'stern'), choice: { id: 'hesper', options: [{ id: 'ortiz', label: 'Let Ortiz go after her' }, { id: 'sink', label: 'Hold the line: sink her' }] } },
  ]);
}
function sailHesper(st, M, H) {
  const h = hesper(st), A = terminal(st);
  if (!A) return;
  const goal = [[A.x, A.y]];
  const D = waterField(st, goal);
  // two squares a turn, straight for the Terminal
  for (let step = 0; step < 2; step++) {
    let best = null, bv = Math.min(...E.shipCells(h).map(([a, b]) => D[b * st.W + a]));
    for (const [dx, dy] of [[0, 1], [-1, 1], [1, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [0, -1]]) {
      const n = { ...h, x: h.x + dx, y: h.y + dy };
      const cells = E.shipCells(n);
      if (cells.some(([a, b]) => a < 0 || b < 0 || a >= st.W || b >= st.H || E.isLand(st, a, b) || st.deposits.some(d => d.x === a && d.y === b) || (st.platforms || []).some(o => o.x === a && o.y === b))) continue;
      if (st.ships.some(s => s !== h && E.shipCells(s).some(([p, q]) => cells.some(([a, b]) => a === p && b === q)))) continue;
      const v = Math.min(...cells.map(([a, b]) => D[b * st.W + a]));
      if (v < bv) { bv = v; best = n; }
    }
    if (best) { h.x = best.x; h.y = best.y; } else if (step === 0) { // boxed in: she turns broadside and pushes on
      const r = { ...h, rot: h.rot ? 0 : 1 }; if (!E.shipCells(r).some(([a, b]) => a < 0 || b < 0 || a >= st.W || b >= st.H || E.isLand(st, a, b) || st.ships.some(s => s !== h && E.shipCells(s).some(([p, q]) => p === a && q === b)))) h.rot = r.rot;
    }
  }
  if (Math.min(...E.shipCells(h).map(([a, b]) => D[b * st.W + a])) <= 2) {
    // she blows up at the Terminal
    st.ships = st.ships.filter(s => s !== h);
    const r = rigOf(st, A); if (r) r.hp = Math.max(1, r.hp - 4);
    for (const s of st.ships) if (s.owner === 0 && E.dist(E.shipCells(s), [[A.x, A.y]]) <= 3) s.hp = Math.max(1, s.hp - 2);
    M.flags.hesperFate = 'blew'; M.flags.rescueDone = true; unlock(M);
    H.say(st, [sato("The Hesper's gone up against the Terminal! Fire on the jetties!", 'worried'), ...(letOrtiz(M) ? [ortiz("No... no, we were nearly there.", 'worried')] : [])]);
  }
}
// Ortiz's two ships go after her on their own; once the landing craft is alongside, the crew come off
function chaseHesper(st, M, H) {
  const h = hesper(st);
  if (!h) { if (!M.flags.rescueDone) { M.flags.rescueDone = true; M.flags.hesperFate ||= 'sunk'; unlock(M); } return; }
  if (!H.get(st, 'or1') && !H.get(st, 'or2')) return; // (the detachment is gone)
  for (const id of ['or2', 'or1']) {
    const s = H.get(st, id);
    if (!s) continue;
    const D = waterField(st, E.shipCells(h));
    moveBest(st, s, (x, y, rot) => Math.min(...E.shipCells({ ...s, x, y, rot }).map(([a, b]) => D[b * st.W + a])), { script: true });
  }
  // (the landing craft's marines, or a boarding party off the destroyer: whoever gets alongside first)
  const lc = ['or2', 'or1'].map(id => H.get(st, id)).find(s => s && E.dist(E.shipCells(s), E.shipCells(h)) <= 1);
  if (lc) {
    st.ships = st.ships.filter(s => s !== h);
    M.flags.crewSaved = st.round; M.flags.rescueDone = true; M.flags.hesperFate = 'saved'; unlock(M);
    H.say(st, [ortiz("We're aboard! Cutting them loose now... All forty-one, Commodore! We're scuttling her clear of the Terminal.", 'pleased'), vance("Get back in my line, Captain.", 'stern')]);
  }
}
function unlock(M) { M.locked = M.locked.filter(id => id !== 'or1' && id !== 'or2'); }
