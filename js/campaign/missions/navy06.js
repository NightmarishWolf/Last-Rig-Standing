// ============================================================
// NAVY · MISSION 6 · CLEAN SWEEP
// The Saltpan Channel, September 2061. After Reprisal the Council gives the shelf to Commodore Vance,
// and Vance gives Ortiz his orders: sweep the Saltpan Channel and clear every raft-town in its coves, so
// tankers never need an escort again. The first long mission, and the first against a real computer
// player: Kade the Burner (the skirmish AI, Hard, raider, Arson) builds, expands and hunts your tankers.
// Teaches: carriers (recon flights, airstrikes), the full economy at scale, assaulting raft-towns.
// Nyx offers charts of the raft-towns (round 2, a choice): a head start, but Nyx sells to everyone, and
// Kade starts turning up wherever your fleet is. Mercy, a hospital raft, is on Vance's list too; sparing
// it is a quiet hidden achievement.
// Win: clear Gullhaven, Lantern and Tarry Reach (wreck their central rigs, or take them with marines).
// Lose: 3 tankers lost, the carrier sunk, or round 32.
// Secondary: Clean Lane (no tanker lost), The Kiln (clear Kade's own base), Taken Whole (capture a town).
// ============================================================
import * as E from '../../engine/index.js';
import { PLATFORMS } from '../../data/bases.js';
import { SHIPS } from '../../data/ships.js';
import { moveBest, waterField } from '../ai.js';

const PAR = 26, DEADLINE = 34, FIRST_TANKER = 2, TANKER_EVERY = 4, LAST_TANKER = 26, TANKERS_LOST = 3, TANKER_PAY = 250;
const BUDGET = 150, FUEL = 5, NYX_PRICE = 300, AMBUSHES = [9, 15, 21];
const TOWNS = { G: 'Gullhaven', L: 'Lantern', T: 'Tarry Reach' };
const NAMES = { ...TOWNS, M: 'Mercy', K: 'the Kiln' };
const TERMINAL = { x0: 46, y0: 10, x1: 47, y1: 19 };
const LANE_START = { x0: 1, y0: 15, x1: 4, y1: 17 };

const line = (who, text, mood = 'neutral') => ({ who, mood, text });
const ortiz = (t, m) => line('ortiz', t, m), sato = (t, m) => line('sato', t, m), vance = (t, m) => line('vance', t, m);
const kade = (t, m) => line('kade', t, m), nyx = (t, m) => line('nyx', t, m);

const base = (st, k) => (st.bases || []).find(b => b.id === st.campaign.flags.bases?.[k]);
const rigOf = (st, b) => b && st.rigs.find(r => r.baseId === b.id && r.center);
const fallen = (st, k) => { const b = base(st, k); return !b || b.wrecked || b.owner !== 1; };
const cleared = (M, k) => !!M.flags.cleared?.[k];
const townsLeft = (st, M) => Object.keys(TOWNS).filter(k => !cleared(M, k));
const carrier = st => st.ships.find(s => s.id === 'indomitable');
const tankersLost = M => (M.flags.tankersLost || 0);
const found = (M, k) => !!M.flags.found?.[k];
const spared = M => !M.flags.mercyHit;
const mercyGone = st => { const b = base(st, 'M'); return !b || b.wrecked || b.owner !== 1; };

// the towns you know about (and the way to the Terminal), on the map
const townMarkers = (st, M) => [
  ...Object.keys(NAMES).filter(k => found(M, k) && !cleared(M, k)).map(k => { const b = base(st, k); return b && { x0: b.x, y0: b.y, x1: b.x, y1: b.y, label: k === 'M' ? 'Mercy ✚' : NAMES[k][0].toUpperCase() + NAMES[k].slice(1) }; }).filter(Boolean),
  { ...TERMINAL, label: 'To the Terminal' },
];

export default {
  id: 'navy-6', arc: 'navy', n: 6,
  title: 'Clean Sweep', place: 'The Saltpan Channel', date: 'September 2061',
  faction: 'navy', commander: { id: 'ortiz', level: 3 },
  enemy: { faction: 'tide', name: 'Kade the Burner', ai: { difficulty: 'hard', personality: 'raider', commander: 'kade', level: 3 } },
  par: PAR,
  hide: ['victory'],
  summary: 'Vance has the shelf now. His orders: clear every raft-town out of the Saltpan Channel.',
  teaches: ['Carriers', 'A full campaign economy', 'Assaulting raft-towns', 'A thinking enemy'],

  map: `
    ................................................
    ......................##........................
    ...##.................##.............L..........
    ...##.........G.........d...................##..
    ................................................
    ................................................
    .........#####.....#####....#####.....#####.....
    .......########...#######...######...########...
    .......########...#######...######...########...
    .......########...#######...######...########...
    .....c.S..###.................##................
    ...P.....D...c..................................
    ......C............d............................
    ............D................d..........#.......
    ...A................##..........................
    ....................##..........................
    ..............................##............d...
    ................................................
    ................................................
    ................###.................##..........
    .....#######...#######...######...######...####.
    .....#######...#######...######...######...####.
    .....#######...#######...######...######...####.
    ........###......####.....####.....####.........
    ................................................
    ................................................
    ..##....M..........d.......T......##............
    ..##...........##..........................K....
    ...............##...............................
    ................................................`,
  homes: [
    { home: { x0: 0, y0: 11, x1: 7, y1: 18 }, spawn: { x0: 1, y0: 11, x1: 7, y1: 18 } },
    { home: { x0: 39, y0: 24, x1: 47, y1: 29 }, spawn: { x0: 39, y0: 24, x1: 47, y1: 29 } },
  ],

  setup(st, marks, H) {
    const me = st.players[0], foe = st.players[1];
    const F = st.campaign.flags; F.bases = {}; F.found = {}; F.cleared = {};
    const found_ = (k, [x, y], owner, { capital = false, level = 1, tideAge = 0, type = 'medium', reserves = 140 } = {}) => {
      const dep = { id: 'd_saltpan_' + k, x, y, type, reserves, max: reserves };
      st.deposits.push(dep);
      const b = E.foundBase(st, owner, dep, capital);
      b.level = level; b.tideAge = tideAge;
      rigOf(st, b).hp = E.baseMaxHp(st, b);
      st.players[owner].known[dep.id] = true;
      F.bases[k] = b.id;
      return b;
    };
    const plat = (b, kind, dx, dy) => st.platforms.push({ id: 'f' + st.nextId++, owner: b.owner, baseId: b.id, kind, x: b.x + dx, y: b.y + dy, hp: PLATFORMS[kind].hp, buildLeft: 0 });
    // yours: Saltpan Station, the Navy's forward base at the west end of the channel
    const home = found_('A', marks.A[0], 0, { capital: true, level: 2, type: 'rich', reserves: 300 });
    // the Tide's: three raft-towns, a hospital raft, and Kade's own base, the Kiln
    const G = found_('G', marks.G[0], 1, { level: 2, tideAge: 9 });
    const L = found_('L', marks.L[0], 1, { level: 2, tideAge: 9 }); plat(L, 'gun', 0, 1);
    const T = found_('T', marks.T[0], 1, { level: 2, tideAge: 9 }); plat(T, 'gun', 0, -1);
    const M = found_('M', marks.M[0], 1, { level: 1, tideAge: 9, type: 'small', reserves: 60 }); M.noDock = true; M.hospital = true;
    const K = found_('K', marks.K[0], 1, { capital: true, level: 3, tideAge: 12, type: 'rich', reserves: 220 }); plat(K, 'gun', -1, 0); plat(K, 'gun', 0, -1);
    // free oil, for whoever gets there first
    marks.d.forEach(([x, y], i) => st.deposits.push({ id: 'd_saltpan_free' + i, x, y, type: i % 2 ? 'medium' : 'small', reserves: 120, max: 120 }));
    // Ortiz's squadron, with Vance's carrier on loan
    const cv = H.ship(st, 0, 'carrier', ...marks.C[0], { id: 'indomitable' }); cv.name = 'Indomitable'; cv.onLoan = true; // (Vance's command pays for her)
    marks.D.forEach(([x, y], i) => H.ship(st, 0, 'destroyer', x, y, { id: 'dd' + (i + 1) }));
    marks.c.forEach(([x, y], i) => H.ship(st, 0, 'corvette', x, y, { id: 'cv' + (i + 1) }));
    H.ship(st, 0, 'survey', ...marks.S[0], { id: 'sv1' });
    H.ship(st, 0, 'landingcraft', ...marks.P[0], { id: 'lc1' });
    me.research.done.destroyer_program = true;
    me.money = 1500; me.oil = 50;
    // Kade's boats, at home and in the towns
    const tide = (type, b, dx, dy) => { const s = H.ship(st, 1, type, b.x + dx, b.y + dy); return s; };
    tide('gunboat', G, 2, 1); tide('skiff', G, -2, 1);
    tide('gunboat', L, -3, 1); tide('skiff', L, 2, 2);
    tide('gunboat', T, -3, -1); tide('skiff', T, 2, 1);
    tide('fireship', K, -4, 1); tide('fireship', K, -4, -2); tide('gunboat', K, -2, 2); tide('prospector', K, 1, 1);
    foe.money = 900; foe.oil = 60;
    F.mercyHp = rigOf(st, M).hp;
    me.log = [{ turn: 1, text: 'The Saltpan Channel. Clear the raft-towns; keep the tankers moving.' }]; foe.log = [];
  },

  briefing: c => [
    ...(c.ruizOffer === 'released'
      ? [vance("The Council has relieved Admiral Hale pending inquiry. She handed three hundred prisoners back to Ruiz. I'd call that something stronger than a lapse.", 'stern')]
      : [vance("Admiral Hale has been called back to headquarters. Rested, with honours, after Corrigan Point. The northern shelves are mine now.", 'pleased')]),
    vance("Captain, I've spent two years watching this Navy guard rigs while the Tide picks the lanes clean. That stops today."),
    vance("The Saltpan Channel. Every raft-town in its coves is a base for the boats that hit our tankers. You'll clear them. All of them.", 'stern'),
    ortiz("All of them, Commodore? Some of those towns are just people living on the water."),
    vance("People living on stolen oil, Captain. I'm lending you the Indomitable. Use her aircraft. Bring the channel back clean.", 'stern'),
    sato(`The Council's funding the operation, sir: $${BUDGET} and ${FUEL} oil a turn on top of our own rigs, and $${TANKER_PAY} for every tanker that reaches the Terminal. There's free oil in the channel too, if we found bases on it.`),
    sato("Tankers will keep sailing the lane while we work, sir. The Terminal won't wait. If Kade's boats get loose among them..."),
    ortiz("Then we don't let them.", 'stern'),
  ],

  goals: {
    main: 'Clear the three raft-towns of the Saltpan Channel (wreck their rigs, or take them)',
    lose: `Three tankers lost, the Indomitable sunk, or still sweeping after round ${DEADLINE}`,
    deadline: DEADLINE,
    progress: (st, M) => `towns ${3 - townsLeft(st, M).length}/3 · tankers in ${M.flags.delivered || 0}, lost ${tankersLost(M)}/${TANKERS_LOST}`,
  },
  secondary: [
    { id: 'lane', name: 'Clean Lane', desc: 'Lose no tankers', done: (st, M) => tankersLost(M) === 0, live: (st, M) => tankersLost(M) === 0 },
    { id: 'kiln', name: 'The Kiln', desc: "Clear Kade's own base, the Kiln", done: (st, M) => cleared(M, 'K'), live: () => true },
    { id: 'taken', name: 'Taken Whole', desc: 'Capture a raft-town with marines', done: (st, M) => !!M.flags.captured, live: () => true },
  ],
  clearAchievement: 'clean-sweep',

  steps: [
    {
      id: 'recon',
      say: [
        sato("The Indomitable's aircraft are yours, sir. A Recon Flight is free every turn: eight squares out, a four-square patch, anything under it shows up."),
        sato("And her Airstrike hits anything we can see out to eight squares. Two damage. Rafts don't shoot at planes, mostly."),
      ],
      do: 'Select the <b>Indomitable</b> and fly a <b>Recon Flight</b> over the coves to look for raft-towns.',
      spot: '[data-action="recon"]',
      markers: townMarkers,
      check: (st, M) => !!M.flags.reconFlown || st.round >= 4,
    },
    {
      id: 'sweep',
      do: (st, M) => `Find and clear the raft-towns: ${Object.entries(TOWNS).map(([k, n]) => (cleared(M, k) ? `<s>${n}</s>` : found(M, k) ? `<b>${n}</b>` : 'unknown')).join(', ')}. Keep the tankers alive: ${tankersLost(M)}/${TANKERS_LOST} lost.`,
      markers: townMarkers,
      check: () => false,
    },
  ],

  triggers: [
    {
      id: 'nyx', when: st => st.round >= 2,
      say: [
        nyx("Captain Ortiz. Don't bother tracing this, the radio's on a raft that won't be there in an hour."),
        nyx("They call me Old Salt Nyx. I sell things. Right now I'm selling charts: every raft-town in the Saltpan Channel, where it is, what it's got."),
        sato("Sir, that's the black market. If anyone finds out we bought from Nyx...", 'worried'),
        { ...nyx(`Three hundred dollars, Captain. Cheaper than a week of looking.`), choice: { id: 'charts', options: [{ id: 'buy', label: `Buy the charts ($${NYX_PRICE})` }, { id: 'refuse', label: 'Refuse: we find them ourselves' }] } },
      ],
    },
    {
      id: 'mercy', when: (st, M) => found(M, 'M'),
      say: [
        sato("Sir, the raft-town in the southwest cove. White tarps, red crosses painted on every roof. That's a hospital.", 'worried'),
        sato("The charts call it Mercy. Wounded from every raft in the sea end up there."),
        vance("I know what it is, Captain. It's a raft-town in the channel. It's on the list.", 'stern'),
        ortiz("...Understood, Commodore.", 'worried'),
      ],
    },
    {
      id: 'kiln', when: (st, M) => found(M, 'K'),
      say: [sato("Southeast cove: gun platforms, fireships moored up, a lot of smoke. That's the Kiln, sir. Kade's own base."), kade("Come and visit, Corrigan. I'll keep the fires lit.", 'pleased')],
    },
    { id: 'tankerIn', when: (st, M) => (M.flags.delivered || 0) >= 1, say: [sato(`First tanker's in at the Terminal, sir. The Council pays $${TANKER_PAY} a load delivered.`, 'pleased')] },
    { id: 'tankerLost1', when: (st, M) => tankersLost(M) >= 1, say: [sato("We've lost a tanker! Lose three and Vance pulls the whole operation.", 'worried')] },
    { id: 'tankerLost2', when: (st, M) => tankersLost(M) >= 2, say: [vance("Two tankers, Captain. One more and I relieve you.", 'stern')] },
    { id: 'town1', when: (st, M) => townsLeft(st, M).length <= 2, say: [sato("That's one raft-town down, sir.", 'pleased'), vance("One. Keep going.")] },
    { id: 'town2', when: (st, M) => townsLeft(st, M).length <= 1, say: [sato("Two down. One left.", 'pleased')] },
    { id: 'taken', when: (st, M) => !!M.flags.captured, say: [ortiz("We hold it, and nobody's in the water. Get the people ashore at Saltpan and feed them.", 'pleased'), vance("I said clear them, Captain, not collect them. ...It counts.", 'stern')] },
    { id: 'mercyHit', when: (st, M) => !!M.flags.mercyHit, say: [sato("Hits on Mercy, sir.", 'worried')] },
    { id: 'kilnDown', when: (st, M) => cleared(M, 'K'), say: [sato("The Kiln's finished, sir! Kade's lost his home.", 'pleased'), kade("You think I need a home to burn things, Corrigan?", 'stern')] },
  ],

  onChoice(st, M, H, id, opt) {
    if (id !== 'charts') return;
    const me = st.players[0];
    if (opt === 'buy' && me.money >= NYX_PRICE) {
      me.money -= NYX_PRICE;
      M.flags.charts = true;
      for (const k of ['G', 'L', 'T', 'M']) M.flags.found[k] = true;
      H.say(st, [nyx("Pleasure doing business. You'll find them marked. The Kiln's not on there; Kade pays me too."), ortiz("Kade pays you?", 'worried'), nyx("Everybody pays me, Captain.")]);
    } else if (opt === 'buy') {
      M.picked.charts = 'refuse';
      H.say(st, [nyx("Come back when you've got the money, Captain.")]);
    } else H.say(st, [nyx("Your loss. Good hunting.")]);
  },

  // as you end your turn: tankers sail on toward the Terminal, a new one joins every few rounds;
  // and what you did to the towns this turn is noted
  beforeEndTurn(st, M, H) {
    noteTowns(st, M);
    // Vance's operation is funded from the Council: a budget every turn on top of your own oil
    st.players[0].money += BUDGET; st.players[0].oil = Math.max(st.players[0].oil, Math.min(E.oilCapOf(st, 0), st.players[0].oil + FUEL)); // (no more than your tanks hold)
    E.log(st, 0, `Operation budget from the Council: +$${BUDGET} and ${FUEL} oil.`);
    sailTankers(st, M, H);
  },
  // (the Tide's turn: the computer plays Kade; the mission adds Nyx's ambushes if you bought the charts)
  enemyTurn(st, M, H) {
    noteTowns(st, M);
    if (M.flags.charts && AMBUSHES.includes(st.round) && !M.flags['ambush' + st.round]) { M.flags['ambush' + st.round] = true; ambush(st, M, H); }
    M.flags.mercyHp = rigOf(st, base(st, 'M'))?.hp ?? null;
  },
  watch(st, M) { noteTowns(st, M); },

  won: (st, M) => townsLeft(st, M).length === 0,
  onWin: (st, M, H) => {
    H.say(st, [
      sato("That's the last of them, sir. The lane's clear from Saltpan to the Terminal.", 'pleased'),
      ...(mercyGone(st)
        ? [sato("...Mercy's gone too, sir.", 'worried'), vance("The channel is clean, Captain. Well done. That's how a war ends: completely.", 'pleased'), ortiz("Yes, Commodore.", 'worried')]
        : [vance("Mercy is still afloat, Captain. I'll make a note of that.", 'stern'),
          ortiz("There were four hundred wounded on that raft, Commodore.", 'stern'),
          vance("Four hundred mouths Ruiz has to feed and patch up and send back out against us. That was the point.", 'stern'),
          ortiz("Then she'll have to feed them. We're not that Navy, sir.", 'stern')]),
      ...(M.flags.charts ? [sato("Sir... Kade turned up on top of us three times. Like someone told him where we'd be.", 'worried')] : []),
    ]);
  },
  achievementsOnWin: (st, M) => (spared(M) && !mercyGone(st) ? ['mercy'] : []),
  choices: (st, M) => ({ nyxCharts: !!M.flags.charts, mercy: mercyGone(st) ? 'sunk' : spared(M) ? 'spared' : 'damaged' }),
  lost: (st, M) => tankersLost(M) >= TANKERS_LOST || !carrier(st) || st.round > DEADLINE,
  onLose: (st, M, H) => H.say(st, [vance("I'm relieving you, Captain. The channel will be cleared by someone who can finish a job.", 'stern')]),

  props: st => {
    const M = st.campaign;
    return Object.keys(NAMES).filter(k => found(M, k) || fallen(st, k)).map(k => { const b = base(st, k); return b && { kind: 'rafttown', x: b.x, y: b.y, burnt: b.wrecked, hospital: k === 'M' }; }).filter(Boolean);
  },
};

// ---------- what the player has found and cleared ----------
function noteTowns(st, M) {
  const F = M.flags;
  for (const k of Object.keys(NAMES)) {
    const b = base(st, k);
    if (!b) continue;
    if (!F.found[k] && E.seesSquare(st, 0, b.x, b.y)) F.found[k] = true;
    if (!F.cleared[k] && (b.wrecked || b.owner !== 1)) {
      F.cleared[k] = st.round; F.found[k] = true;
      if (b.owner === 0 && !b.wrecked) F.captured = true;
    }
  }
  // any damage to Mercy's rig on your turn is yours
  const r = rigOf(st, base(st, 'M'));
  if (st.current === 0 && F.mercyHp != null && (!r || r.hp < F.mercyHp)) F.mercyHit = true;
  if (st.current === 0 && st.players[0].scans?.length) F.reconFlown = true;
}

// ---------- tankers ----------
function freeSpot(st, type, box) {
  for (let y = box.y0; y <= box.y1; y++) for (let x = box.x0; x <= box.x1; x++) {
    const cells = E.shipCells({ type, x, y, rot: 0 });
    if (cells.some(([a, b]) => a >= st.W || b >= st.H || E.isLand(st, a, b))) continue;
    if (st.ships.some(s => E.shipCells(s).some(([p, q]) => cells.some(([a, b]) => a === p && b === q)))) continue;
    return [x, y];
  }
  return null;
}
function sailTankers(st, M, H) {
  const F = M.flags;
  F.tankers ||= [];
  // the ones that never made it
  for (const id of F.tankers) if (!H.get(st, id) && !(F.arrived || []).includes(id) && !(F.counted || []).includes(id)) { F.tankersLost = (F.tankersLost || 0) + 1; (F.counted ||= []).push(id); }
  const T = [];
  for (let y = TERMINAL.y0; y <= TERMINAL.y1; y++) for (let x = TERMINAL.x0; x <= TERMINAL.x1; x++) if (!E.isLand(st, x, y)) T.push([x, y]);
  for (const id of F.tankers) {
    const t = H.get(st, id);
    if (!t) continue;
    // (routing round every other ship and rig; laden tankers make 5 squares a turn in the lane)
    const blocked = new Set();
    for (const s of st.ships) if (s !== t) for (const [a, b] of E.shipCells(s)) blocked.add(a + ',' + b);
    for (const d of st.deposits) blocked.add(d.x + ',' + d.y);
    const D = waterField(st, T, { blocked });
    t.movesLeft = Math.max(t.movesLeft, 5);
    moveBest(st, t, (x, y, rot) => Math.min(...E.shipCells({ ...t, x, y, rot }).map(([a, b]) => D[b * st.W + a])) + (rot === 0 ? 0 : 0.4), { script: true });
    if (E.shipCells(t).some(([x]) => x >= TERMINAL.x0)) {
      st.ships = st.ships.filter(s => s !== t);
      (F.arrived ||= []).push(id);
      F.delivered = (F.delivered || 0) + 1;
      st.players[0].money += TANKER_PAY;
      E.log(st, 0, `A tanker reached the Terminal: +$${TANKER_PAY}.`);
    }
  }
  // a new tanker sets out (it sails from next turn)
  if (st.round >= FIRST_TANKER && st.round <= LAST_TANKER && (st.round - FIRST_TANKER) % TANKER_EVERY === 0 && !F['tanker' + st.round]) {
    const at = freeSpot(st, 'tanker', LANE_START);
    if (at) {
      F['tanker' + st.round] = true;
      const t = H.ship(st, 0, 'tanker', at[0], at[1], { id: 'tk' + st.round });
      t.name = 'Tanker ' + (F.tankers.length + 1); t.ownFuel = true; t.onLoan = true;
      M.locked.push(t.id);
      F.tankers.push(t.id);
      E.log(st, 0, `${t.name} sets out for the Terminal.`);
    }
  }
}

// ---------- Nyx sold you out: Kade turns up where your fleet is ----------
function ambush(st, M, H) {
  // (they find your fleet: the warship with the most of your ships around it)
  const mine = st.ships.filter(s => s.owner === 0 && !M.locked.includes(s.id));
  // (but not the Indomitable's group: losing her would end the mission outright, which is too cruel for a trap
  // the player can't see coming)
  const cv = carrier(st), clear = s => !cv || E.dist(E.shipCells(s), E.shipCells(cv)) > 5;
  const crowd = s => mine.filter(o => E.dist(E.shipCells(o), E.shipCells(s)) <= 4).length;
  const target = (mine.some(clear) ? mine.filter(clear) : []).sort((a, b) => crowd(b) - crowd(a))[0];
  if (!target) return;
  const spots = [];
  for (let r = 4; r <= 6 && spots.length < 4; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const x = target.x + dx, y = target.y + dy;
    if (x < 0 || y < 0 || x >= st.W || y >= st.H || E.isLand(st, x, y) || E.seesSquare(st, 0, x, y)) continue;
    if (st.ships.some(s => E.shipCells(s).some(([a, b]) => a === x && b === y))) continue;
    if (spots.some(([a, b]) => Math.abs(a - x) < 2 && Math.abs(b - y) < 2)) continue;
    spots.push([x, y]);
  }
  // (they show on your scope as contacts: you get one turn's warning)
  ['fireship', 'skiff', 'gunboat'].forEach((type, i) => { if (spots[i]) { const s = H.ship(st, 1, type, ...spots[i]); if (s) M.track.push(s.id); } });
  H.say(st, M.flags.ambushes ? [kade("There you are again, Corrigan.", 'pleased')] : [
    sato("Contacts on the scope, sir, closing on the fleet out of nowhere! Fireships, by the look of them!", 'worried'),
    kade("Funny thing, Corrigan. Wherever you go, I seem to know about it first.", 'pleased'),
  ]);
  M.flags.ambushes = (M.flags.ambushes || 0) + 1;
}
