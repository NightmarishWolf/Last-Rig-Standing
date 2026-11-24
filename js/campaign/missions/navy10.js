// ============================================================
// NAVY · MISSION 10 · THE ALLOCATION (finale of Navy Part One)
// The Drowned Reach, May 2062. Ruiz has pulled everyone she has left back to Haven, the Motherraft:
// four thousand people in a lagoon ringed by land. The only way in or out is the Gate, its north-west mouth
// (small boats). Four sides: you (Ortiz, Marines level 6); Ruiz (the skirmish AI); Vance's fleet (scripted:
// your ally, until it isn't); Kade (scripted raiders from the Cinder Isle who hit anyone).
// Act 1, the Gate: destroy (or take) the two Gate forts. The Lighthouse, taken with marines, becomes a
//   forward Dry Dock.
// Act 2, the Order: Vance, then the Council: burn Haven. Ruiz pleads (her words follow your choices).
//   Buttons: Obey, or Refuse. No second chance.
// Act 3a, Obey: wreck Haven (one great raft-town ringed with platforms). Lifeboats flee each one that falls; Kade goes for
//   the carriers. Hidden: Let Them Go (never fire on a lifeboat).
// Act 3b, Refuse: Vance's fleet turns on you; Ruiz calls a truce (you can't hit each other, and you share
//   sight). Hold Haven while 3,000 of its people get out by boat (to the west or south edge). Help comes
//   from what you did before: Maren's boats (Bracken), Mercy (healing), the Hesper's crew (a destroyer),
//   Lio's boats (Driftwood / Corrigan Point), Nyx (positions, either way), Hale (stands Vance down).
//   Kade tries to burn Haven himself. Win: the evacuation done, Vance's carriers sunk, or Hale arrives.
// Endings, achievements and a cosmetic for each. Hidden across the arc: Clean Hands.
// ============================================================
import * as E from '../../engine/index.js';
import { SHIPS } from '../../data/ships.js';
import { moveBest, waterField, shapeField } from '../ai.js';
import { baseOf, council, foundAt, freeSpot, hale, hpDropped, kade, keepHp, lio, lost, maren, nyx, ortiz, plat, rigOf, ruiz, sato, spawn, vance } from '../kit.js';

const PAR = 34, DEADLINE = 40, BUDGET = 200, KADE_EVERY = 4, PEOPLE = 4000, NEED = 3000, PER_BOAT = 250;
const ME = 0, RUIZ = 1, VANCE = 2, KADE = 3;
const P = { A: [22, 4], L: [38, 28], F1: [42, 27], F2: [52, 25], H: [53, 39], K: [66, 11] };
const DISTRICTS = []; // (Haven is one great raft-town now, ringed with platforms)
const STAGE = [46, 23];
const KADE_BOX = { x0: 60, y0: 3, x1: 69, y1: 8 };
const HAVEN_PLATFORMS = [['storage', 52, 39], ['storage', 54, 39], ['pump', 53, 40], ['gun', 58, 34], ['gun', 58, 44], ['gun', 48, 44], ['gun', 48, 34], ['quarters', 53, 38], ['radar', 49, 35], ['radar', 57, 35], ['radar', 57, 43], ['radar', 49, 43], ['aa', 50, 36], ['aa', 50, 42], ['aa', 56, 42], ['aa', 56, 36], ['drydock', 52, 38], ['helipad', 54, 40], ['airbase', 52, 40], ['lab', 54, 38], ['cruise', 48, 35], ['cruise', 49, 34], ['cruise', 57, 34], ['cruise', 58, 35], ['cruise', 58, 43], ['cruise', 57, 44], ['cruise', 49, 44], ['cruise', 48, 43], ['refinery', 49, 42], ['refinery', 50, 43], ['refinery', 56, 43], ['refinery', 57, 42], ['refinery', 57, 36], ['refinery', 56, 35], ['refinery', 50, 35], ['refinery', 49, 36], ['storage', 49, 37], ['storage', 49, 38], ['storage', 49, 39], ['storage', 49, 40], ['storage', 49, 41], ['storage', 51, 35], ['storage', 52, 35], ['storage', 53, 35], ['storage', 54, 35], ['storage', 55, 35], ['storage', 57, 41], ['storage', 57, 40], ['storage', 57, 39], ['storage', 57, 38], ['storage', 57, 37], ['storage', 51, 43], ['storage', 52, 43], ['storage', 53, 43], ['storage', 54, 43], ['storage', 55, 43]];
const vIds = ['v_cv1', 'v_cv2', 'v_ca1', 'v_ca2', 'v_dd1', 'v_dd2', 'v_dd3'];

const act = M => M.flags.act || 1;
const obey = M => M.picked?.order === 'obey';
const refuse = M => M.picked?.order === 'refuse';
const fallen = (st, k) => lost(st, k, RUIZ);
const fortsDown = st => fallen(st, 'F1') && fallen(st, 'F2');
const havenPlats = st => { const b = baseOf(st, 'H'); return b ? st.platforms.filter(o => o.baseId === b.id).length : 0; };
const havenDown = st => ['H', ...DISTRICTS].filter(k => fallen(st, k)).length;
const saved = M => (M.flags.saved || 0) * PER_BOAT;
const vanceShips = st => st.ships.filter(s => s.owner === VANCE);
const carriersLeft = st => st.ships.filter(s => s.owner === VANCE && s.type === 'carrier').length;
const C = M => M.choices || {};

export default {
  id: 'navy-10', arc: 'navy', n: 10,
  title: 'The Allocation', place: 'The Drowned Reach', date: 'May 2062',
  faction: 'navy', commander: { id: 'ortiz', level: 6 },
  enemy: { faction: 'tide', name: '"Mother" Ruiz', ai: { difficulty: 'hard', personality: 'conqueror', commander: 'ruiz', level: 9 } },
  others: [{ faction: 'navy', name: 'Commodore Vance' }, { faction: 'tide', name: 'Kade the Burner' }],
  par: PAR,
  hide: ['victory'],
  summary: 'Haven. Four thousand people, one lagoon, and the order everyone knew was coming.',
  teaches: ['Everything you have learned', 'Truces and shifting sides'],
  cosmetics: (st, M) => (refuse(M) ? ['mutineer-pennant'] : ['council-ribbon']),

  map: `
    ......................................................................
    ......................................................................
    ......................................................................
    ......................................#...............................
    ......................................##....###.......................
    .....................................###########......................
    ....................................###########.......................
    ....................................############......................
    ...................................#############..........###.........
    ...................................#############........#######.......
    .........#.#.......................##############......#########......
    .........#####.......................#############......#########.....
    .........#######....................############.......##########.....
    .........#######...................############.........#########.....
    .......##########....................#########.........#########......
    .......##########......................######.........##########......
    ........#########......................######.........#.#####.#.......
    ........#########......................#####...............#..........
    .......###########......................###...........................
    ........#########.....................................................
    .........########.....................................................
    ..........######......................................................
    ...........####.......................................................
    ............###.......................................................
    ......................................................................
    ......................................................................
    .........................#.##..........................##.............
    .........................######.....................#######...........
    .......................##########..................##########.........
    .....................############..................###.#######........
    .....................##############......................######.......
    .....................##.###########........................#####......
    ............#...........###########.........##..............#####.....
    ...........###...........#########........####...............####.....
    ..........######..#.......#######........###.................####.....
    ..........#########.........#####........###..................###.....
    ......#############.....................###....................###....
    ......############......................###....................###....
    .....#############......................###....................###....
    ....#############.#.....................###.....................##....
    ....#############.......................####....................##....
    ....############.........................###...................###....
    .....############.........................###..................###....
    ......###########.........................####.................###....
    .......#########...........................####...............###.....
    .......########............................#####.............####.....
    .......########.............................#####..........#####......
    .......#####..................................######......####........
    .........###...................................##############.........
    ...........#......................................#########...........`,
  homes: [
    { home: { x0: 13, y0: 0, x1: 31, y1: 9 }, spawn: { x0: 13, y0: 0, x1: 31, y1: 9 } },
    { home: { x0: 44, y0: 30, x1: 62, y1: 47 }, spawn: { x0: 44, y0: 30, x1: 62, y1: 47 } },
    { home: { x0: 38, y0: 19, x1: 54, y1: 25 }, spawn: { x0: 38, y0: 19, x1: 54, y1: 25 } },
    { home: { x0: 60, y0: 3, x1: 69, y1: 13 }, spawn: { x0: 60, y0: 3, x1: 69, y1: 13 } },
  ],

  setup(st, marks, H) {
    const F = st.campaign.flags;
    st.truce = [[ME, VANCE]]; // (Vance's fleet sails with you, for now)
    foundAt(st, 'A', P.A, ME, { capital: true, level: 2, type: 'rich', reserves: 260 });
    const L = foundAt(st, 'L', P.L, RUIZ, { level: 1, tideAge: 6, type: 'small', reserves: 80 });
    const F1 = foundAt(st, 'F1', P.F1, RUIZ, { level: 2, tideAge: 9 }); plat(st, F1, 'gun', -1, 0); plat(st, F1, 'gun', 0, 1);
    const F2 = foundAt(st, 'F2', P.F2, RUIZ, { level: 2, tideAge: 9 }); plat(st, F2, 'gun', -1, 0); plat(st, F2, 'gun', 0, -1);
    const Hv = foundAt(st, 'H', P.H, RUIZ, { capital: true, level: 3, tideAge: 14, type: 'rich', reserves: 300 });
    // (Haven's ring of platforms, laid out as drawn in the Map Maker: four corner gun towers, cruise batteries
    // and radar at every corner, AA, refineries, a wall of storage tanks, and the yard in the middle)
    for (const [kind, x, y] of HAVEN_PLATFORMS) plat(st, Hv, kind, x - P.H[0], y - P.H[1]);
    for (const o of st.platforms.filter(o => o.baseId === Hv.id)) o.onLoan = true; // (built over years: no upkeep to bankrupt Ruiz with)
    DISTRICTS.forEach(k => foundAt(st, k, P[k], RUIZ, { level: 1, tideAge: 12, type: 'small', reserves: 80 }));
    foundAt(st, 'K', P.K, KADE, { capital: true, level: 2, tideAge: 9 });
    // Ortiz's squadron
    const sq = [['cruiser', 24, 6, 'resolute'], ['destroyer', 26, 2, 'dd1'], ['destroyer', 16, 2, 'dd2'], ['destroyer', 18, 7, 'dd3'], ['corvette', 28, 5, 'cv1'], ['corvette', 14, 5, 'cv2'],
      ['assault', 26, 9, 'as1'], ['landingcraft', 20, 9, 'lc1'], ['landingcraft', 15, 8, 'lc2'], ['supply', 21, 1, 'sp1']];
    for (const [t, x, y, id] of sq) H.ship(st, ME, t, x, y, { id });
    H.get(st, 'resolute').name = 'Resolute';
    for (const t of ['destroyer_program', 'guided_missiles', 'gun_platforms', 'platform_construction', 'dry_docks', 'crew_quarters']) st.players[ME].research.done[t] = true;
    st.players[ME].money = 1600; st.players[ME].oil = 70;
    // Vance's fleet: two carriers, two cruisers, three destroyers (scripted)
    // (already on station off the Gate, outside the lagoon: they've been shelling the forts for a week)
    const vf = [['carrier', 'v_cv1'], ['carrier', 'v_cv2'], ['cruiser', 'v_ca1'], ['cruiser', 'v_ca2'], ['destroyer', 'v_dd1'], ['destroyer', 'v_dd2'], ['destroyer', 'v_dd3']];
    for (const [t, id] of vf) { const box = { x0: 38, y0: 19, x1: 54, y1: 25 }; let rot = t === 'carrier' ? 1 : 0, at = freeSpot(st, t, box, { rot }); if (!at) { rot = 1 - rot; at = freeSpot(st, t, box, { rot }); } const s = H.ship(st, VANCE, t, at[0], at[1], { id, rot }); s.ownFuel = true; s.onLoan = true; } // (scripted: no fuel or upkeep to run out of)
    H.get(st, 'v_cv1').name = 'Indomitable'; H.get(st, 'v_cv2').name = 'Sovereign';
    st.players[VANCE].money = 0; st.players[VANCE].oil = 999;
    // Ruiz: everything she has left, at the Gate and in the lagoon
    for (const [t, x, y] of [['gunboat', 42, 29], ['gunboat', 52, 26], ['skiff', 46, 28], ['skiff', 48, 26], ['fireship', 47, 30], ['lancer', 50, 31], ['gunboat', 55, 31], ['queen', 52, 46], ['skiff', 46, 33], ['gunboat', 59, 33]]) H.ship(st, RUIZ, t, x, y);
    st.players[RUIZ].money = 1400; st.players[RUIZ].oil = 120;
    st.players[KADE].money = 0; st.players[KADE].oil = 999;
    st.players[ME].log = [{ turn: 1, text: 'The Drowned Reach. Haven is behind the Gate.' }];
    for (const p of [RUIZ, VANCE, KADE]) st.players[p].log = [];
    F.act = 1;
  },

  briefing: c => [
    vance("This is it, Captain. Every boat Ruiz has left is in that lagoon, behind the Gate. Break the forts and we're through.", 'stern'),
    sato("Kade's still out there too, sir. The Cinder Isle, north of the lagoon. He's not with Ruiz any more. He's not with anyone.", 'worried'),
    ...(c.nyxTold === 'confronted' ? [vance("And Captain: what Nyx told you stays between us. Win me the Gate first.", 'stern')] : []),
    ...(c.nyxTold === 'silent' ? [ortiz("(He doesn't know what Nyx told me. Not yet.)", 'worried')] : []),
    vance("My ships will keep Ruiz's boats off you, but the forts are yours. The Council wants to see what you're made of.", 'stern'),
    vance("Once we're through the Gate, wait for my word. Not before.", 'stern'),
    ortiz("Understood, Commodore.", 'stern'),
  ],

  goals: {
    main: 'Break the Gate: destroy or take its two forts',
    mainNow: (st, M) => act(M) === 1 ? 'Break the Gate: destroy or take its two forts'
      : act(M) === 2 ? 'The order is coming'
      : obey(M) ? 'Burn Haven: wreck the Motherraft at its heart'
      : `Hold Haven while its people get out: ${saved(M)}/${NEED} so far. Boats only launch through an exit clear of Vance's ships`,
    lose: `Your Resolute is sunk, or round ${DEADLINE} passes`,
    loseNow: (st, M) => refuse(M) ? `Haven burns, the Resolute is sunk, too few get out, or round ${DEADLINE} passes` : `The Resolute is sunk, or round ${DEADLINE} passes`,
    deadline: DEADLINE,
    progress: (st, M) => act(M) === 1 ? `forts ${['F1', 'F2'].filter(k => fallen(st, k)).length}/2${lost(st, 'L', RUIZ) ? ' · Lighthouse taken' : ''}`
      : obey(M) ? `Haven's platforms ${havenPlats(st)} left · Motherraft ${rigOf(st, baseOf(st, 'H'))?.hp ?? 0} HP` : refuse(M) ? `out ${saved(M)}/${NEED} · lost ${(M.flags.boatsLost || 0) * PER_BOAT} · Vance's carriers ${carriersLeft(st)}` : '',
  },
  secondary: [
    { id: 'lighthouse', name: 'The Lighthouse', desc: 'Take the Lighthouse with marines (it becomes your forward Dry Dock)', done: (st, M) => !!M.flags.lighthouse, live: () => true },
    { id: 'kade', name: 'Cinders', desc: "Wreck Kade's base on the Cinder Isle", done: st => lost(st, 'K', KADE), live: () => true },
    { id: 'whole', name: 'Whole Squadron', desc: "Lose no more than two ships", done: st => (st.players[ME].stats?.shipsLost || 0) <= 2, live: st => (st.players[ME].stats?.shipsLost || 0) <= 2 },
  ],
  clearAchievement: 'the-allocation',

  steps: [
    {
      id: 'gate',
      say: [sato("Two forts either side of the Gate, sir, gun platforms on both. And the Lighthouse rig in front: take it with marines and it's a dry dock on Ruiz's doorstep.")],
      do: 'Break the Gate: destroy or take the <b>two forts</b>. Take the <b>Lighthouse</b> with marines for a forward Dry Dock.',
      markers: st => [['F1', 'West fort'], ['F2', 'East fort'], ['L', 'Lighthouse']].filter(([k]) => !lost(st, k, RUIZ)).map(([k, label]) => { const b = baseOf(st, k); return { x0: b.x, y0: b.y, x1: b.x, y1: b.y, label }; }),
      check: st => fortsDown(st),
    },
    {
      id: 'order',
      do: 'Hold at the Gate. The order is coming.',
      check: (st, M) => !!M.picked?.order,
    },
    {
      id: 'end',
      do: (st, M) => obey(M) ? `Burn <b>Haven</b>: break through its platforms and wreck the <b>Motherraft</b>.`
        : `Hold Haven. Get its people out to the <b>west</b> or <b>south</b> edge: <b>${saved(M)}/${NEED}</b>. Keep Vance's fleet off the Motherraft.`,
      markers: (st, M) => (obey(M) ? ['H', ...DISTRICTS].filter(k => !fallen(st, k)) : ['H']).map(k => { const b = baseOf(st, k); return b && { x0: b.x, y0: b.y, x1: b.x, y1: b.y, label: k === 'H' ? 'Haven' : 'District' }; }).filter(Boolean),
      check: () => false,
    },
  ],

  triggers: [
    { id: 'fort1', when: st => fallen(st, 'F1') || fallen(st, 'F2'), say: [sato("One fort down! One to go.", 'pleased')] },
    {
      id: 'lighthouse', when: st => { const b = baseOf(st, 'L'); return b && !b.wrecked && b.owner === ME; },
      then: (st, M) => { M.flags.lighthouse = st.round; const b = baseOf(st, 'L'); const at = [[1, 0], [0, 1], [-1, 0], [0, -1]].map(([dx, dy]) => [b.x + dx, b.y + dy]).find(([x, y]) => !E.isLand(st, x, y) && !st.ships.some(s => E.shipCells(s).some(([a, c]) => a === x && c === y))); if (at) plat(st, b, 'drydock', at[0] - b.x, at[1] - b.y); },
      say: [sato("The Lighthouse is ours, sir! The engineers are rigging a dry dock there now: we can build and repair right on the Gate.", 'pleased')],
    },
    { id: 'kadeFirst', when: (st, M) => !!M.flags.kadeWaves, say: [kade("Ruiz! Vance! Ortiz! Look at you all, fighting over a raft. I'll burn the lot of you and save you the trouble.", 'pleased')] },
    { id: 'resoluteHurt', when: st => { const r = st.ships.find(s => s.id === 'resolute'); return !!r && r.hp <= 2; }, say: [sato("The Resolute's badly hit, sir! If we lose her, we lose this.", 'worried')] },
    { id: 'kiln', when: st => lost(st, 'K', KADE), say: [sato("Kade's base on the Cinder Isle is burning, sir.", 'pleased'), kade("You can't burn a man who's already on fire, Ortiz!", 'stern')] },
    { id: 'half', when: (st, M) => refuse(M) && saved(M) >= NEED / 2, say: [ruiz("Half of them clear, Ortiz. Half.", 'worried')] },
    { id: 'evacLoss', when: (st, M) => refuse(M) && (M.flags.boatsLost || 0) >= 2, say: [ruiz("He's shooting the boats, Ortiz! Vance is shooting the boats!", 'worried')] },
    { id: 'lifeHit', when: (st, M) => obey(M) && !!M.flags.lifeHit, say: [sato("...That was a lifeboat, sir.", 'worried')] },
  ],

  // ---------- as your turn ends: money, Mercy's healing, and the evacuation boats sail ----------
  beforeEndTurn(st, M, H) {
    const F = M.flags;
    st.players[ME].money += BUDGET;
    if (obey(M) && hpDropped(M, 'life', st)) F.lifeHit = true;
    if (refuse(M)) {
      if (F.mercy) for (const s of st.ships.filter(s => s.owner === ME && E.dist(E.shipCells(s), [P.H]) <= 6)) s.hp = Math.min(E.shipStat(st, ME, s.type, 'hp'), s.hp + 1);
      sailBoats(st, M, H, ME);
    }
  },
  // ---------- the other sides' turns ----------
  enemyTurn(st, M, H, p) {
    const F = M.flags;
    if (p === RUIZ) { // (the computer plays Ruiz; the mission adds the order when the Gate falls)
      if (act(M) === 1 && fortsDown(st)) { F.act = 2; theOrder(st, M, H); }
      if (obey(M)) { lifeboats(st, M, H); sailBoats(st, M, H, RUIZ); keepHp(M, 'life', st.ships.filter(s => s.owner === RUIZ && s.lifeboat).map(s => s.id), st); }
      return;
    }
    if (p === VANCE) return vanceTurn(st, M, H);
    if (p === KADE) return kadeTurn(st, M, H);
  },

  onChoice(st, M, H, id, opt) {
    if (id !== 'order') return;
    M.flags.act = 3; M.flags.act3 = st.round;
    if (opt === 'obey') {
      H.say(st, [ortiz("...Understood, Commodore. All ships: target the Motherraft.", 'stern'), ruiz("Then may you live long enough to understand what you've done, Ortiz.", 'stern'), vance("Good man.", 'pleased'), vance("My air wings will work Haven over from outside the reef. Your ships go in.", 'stern')]);
      // the blockade closes: Ruiz can't buy her way out of this one
      st.players[RUIZ].money = Math.min(st.players[RUIZ].money, 300);
    } else startMutiny(st, M, H);
  },

  won: (st, M) => (obey(M) && havenDown(st) === 1 + DISTRICTS.length) || (refuse(M) && (saved(M) >= NEED || (carriersLeft(st) === 0 && vanceShips(st).length < 3))),
  onWin: (st, M, H) => H.say(st, ending(st, M)),
  achievementsOnWin: (st, M) => {
    const out = [obey(M) ? 'allocation-holds' : 'mutiny'];
    if (obey(M) && !M.flags.lifeHit) out.push('lifeboats');
    const a = C(M)._ach || [];
    if (refuse(M) && ['eyes-before-guns', 'mercy', 'four-generations', 'not-that-navy'].every(x => a.includes(x))) out.push('clean-hands');
    return out;
  },
  choices: (st, M) => ({ haven: obey(M) ? 'burned' : 'saved', evacuated: saved(M) }),
  lost: (st, M) => !st.ships.some(s => s.id === 'resolute') || st.round > DEADLINE
    || (refuse(M) && (fallen(st, 'H') || PEOPLE - (M.flags.boatsLost || 0) * PER_BOAT < NEED)),
  onLose: (st, M, H) => H.say(st, refuse(M) && fallen(st, 'H')
    ? [ruiz("Haven... it's burning. Everyone still aboard...", 'worried'), ortiz("I'm sorry. I'm so sorry.", 'worried')]
    : [vance("We've lost it, Captain. Pull back.", 'stern')]),

  props: st => ['H', ...DISTRICTS].map(k => { const b = baseOf(st, k); return b && { kind: 'rafttown', x: b.x, y: b.y, burnt: b.wrecked }; }).filter(Boolean),
};

// ---------- Act 2: the order ----------
function theOrder(st, M, H) {
  const c = C(M);
  // the Council doesn't do this by halves: Vance's losses are made good and his fleet is brought up to strength
  const types = { v_cv1: 'carrier', v_cv2: 'carrier', v_ca1: 'cruiser', v_ca2: 'cruiser', v_dd1: 'destroyer', v_dd2: 'destroyer', v_dd3: 'destroyer' };
  let came = 0;
  for (const id of vIds) {
    const was = H.get(st, id);
    if (was) { was.hp = SHIPS[was.type].hp; continue; }
    const box = { x0: 36, y0: 18, x1: 56, y1: 25 }; let rot = types[id] === 'carrier' ? 1 : 0, at = freeSpot(st, types[id], box, { rot });
    if (!at) { rot = 1 - rot; at = freeSpot(st, types[id], box, { rot }); }
    if (!at) continue;
    const s = H.ship(st, VANCE, types[id], at[0], at[1], { id, rot }); s.ownFuel = true; s.onLoan = true; came++;
    if (id === 'v_cv1') s.name = 'Indomitable'; if (id === 'v_cv2') s.name = 'Sovereign';
  }
  if (came) H.say(st, [sato(`Relief ships coming up from the fleet train, sir: ${came} of them. Vance's squadron is back at full strength.`, 'neutral')]);
  H.say(st, [
    sato("Both forts are down, sir. The Gate is open.", 'pleased'),
    vance("Well done, Captain. Now listen carefully. The Council has authorised the final measure.", 'stern'),
    council("Haven is the last base of the Free Tide on the northern shelves. It will be destroyed. All of it."),
    vance("You heard them. Every raft, every platform. When Haven burns, the Tide is finished and the war is over.", 'stern'),
    ruiz("Ortiz. I know you can hear me on this channel.", 'worried'),
    ...(c.driftwood === 'taken' ? [ruiz("You took Driftwood and nobody went into the water. Lio told me. I'm asking the man who did that.", 'worried')]
      : [ruiz("You burned Driftwood. I know. I'm asking anyway, because there's nobody else to ask.", 'worried')]),
    ...(c.ruizOffer === 'released' ? [ruiz("Your Admiral gave me back three hundred people once. Give me four thousand.", 'worried')] : []),
    ...(c.bracken === 'evacuated' ? [maren("Captain. It's Maren Holt. You gave us time once. Give them time.", 'worried')] : c.bracken === 'cleared' ? [maren("Captain. It's Maren Holt. Some of my people are on Haven now. You sent them there.", 'stern')] : []),
    ruiz("There are four thousand people on Haven. Children. Old people. Nobody here has a gun pointed at you. Please.", 'worried'),
    vance("Captain Ortiz. Execute the order.", 'stern'),
    { ...ortiz("...", 'worried'), choice: { id: 'order', options: [{ id: 'obey', label: 'Obey: burn Haven' }, { id: 'refuse', label: 'Refuse the order' }] } },
  ]);
}

// ---------- Act 3b: mutiny ----------
function startMutiny(st, M, H) {
  const c = C(M), F = M.flags;
  st.truce = [[ME, RUIZ]]; // (Ruiz stops firing on you; Vance is on his own)
  F.mutinyAt = st.round;
  // Ruiz turns to getting her people out: she fights only to defend, and her treasury goes on boats
  const rp = st.players[RUIZ]; if (rp.ai) { rp.ai.personality = 'tycoon'; rp.ai.mem = {}; } rp.money = Math.min(rp.money, 300);
  // Vance was never short of ships: the second group of the squadron closes up from the north
  const second = spawn(st, H, VANCE, ['carrier', 'cruiser', 'destroyer', 'destroyer'], { x0: 56, y0: 18, x1: 69, y1: 25 }, { track: false, hidden: false });
  for (const s of second) { s.ownFuel = true; s.onLoan = true; if (s.type === 'carrier') s.name = 'Dominion'; }
  F.mercy = c.mercy === 'spared';
  F.extraBoats = c.bracken === 'evacuated' ? 1 : 0;
  H.say(st, [
    ortiz("No, Commodore. I won't do it.", 'stern'),
    vance("Then you're relieved, Captain. And anyone who stands between my fleet and that raft is a mutineer.", 'stern'),
    ortiz("Ruiz. Get your people into boats. Every boat you've got. We'll hold the lagoon.", 'stern'),
    ruiz("...All boats! Everyone off Haven! Head for open water!", 'worried'),
    sato("Sir... I'm with you. So is every crew in the squadron.", 'worried'),
    sato("And sir, the rest of Vance's squadron is coming in from the east, off the Gate. Another carrier, the Dominion, and three escorts.", 'worried'),
  ]);
  // what you did before comes back now
  const near = { x0: 13, y0: 0, x1: 31, y1: 9 };
  if (c.hesper === 'saved') { const [d] = spawn(st, H, ME, ['destroyer'], near, { track: false, hidden: false }); if (d) d.name = 'Hesper crew'; H.say(st, [line('sato', "Sir! A destroyer coming up astern, flying our pennant. It's the Hesper's crew. All forty-one of them volunteered.", 'pleased')]); }
  if (c.driftwood === 'taken' || c.ruizOffer === 'released') { spawn(st, H, RUIZ, ['gunboat', 'gunboat', 'skiff'], { x0: 45, y0: 30, x1: 60, y1: 33 }, { track: false, hidden: false }); H.say(st, [lio("Captain Ortiz! It's Lio, from Driftwood. We've got boats. Tell us where.", 'pleased')]); }
  if (F.extraBoats) H.say(st, [maren("Bracken's fishing fleet is coming in from the west, Captain. Every boat we have. We'll carry people out.", 'pleased')]);
  if (F.mercy) H.say(st, [ruiz("Mercy's moored in the lagoon, Ortiz. Her doctors will patch your ships if you stay close to Haven.", 'neutral')]);
  // Nyx sells to everyone
  if (c.nyxCharts) { H.say(st, [nyx("Captain. You paid me once, but Vance pays more. He knows where every ship of yours is. Nothing personal.", 'neutral')]); F.vanceSees = true; }
  else { H.say(st, [nyx("Captain. You never bought from me, so here's one on the house: Vance's whole fleet, on your scope. A sea with no Tide has no market.", 'pleased')]); F.nyxGift = true; }
  // the first blow: whoever knew it was coming
  if (c.nyxTold === 'confronted') { F.vanceFirst = true; H.say(st, [sato("They were ready for this, sir! Vance's carriers are already launching!", 'worried')]); }
  else { F.vanceStunned = st.round; H.say(st, [sato("Vance's fleet is scrambling, sir. They didn't see this coming. We have a turn.", 'pleased')]); }
  if (c.ruizOffer === 'refused') F.haleAt = st.round + 12;
  if (F.nyxGift) for (const s of vanceShips(st)) if (!M.track.includes(s.id)) M.track.push(s.id);
}

// ---------- the boats: evacuation (yours, Refuse) or lifeboats (Ruiz's, Obey) ----------
const EXITS = st => { const out = []; for (let y = 0; y < st.H; y++) if (!E.isLand(st, 0, y)) out.push([0, y]); for (let x = 0; x < st.W; x++) if (!E.isLand(st, x, st.H - 1)) out.push([x, st.H - 1]); return out; };
function sailBoats(st, M, H, owner) {
  const F = M.flags;
  // new boats leave Haven (Refuse: every turn while there are people aboard)
  if (owner === ME && !fallen(st, 'H') && (F.launched || 0) * PER_BOAT < PEOPLE) {
    // (Haven's own small craft ferry people out through the Gate to the boats waiting outside it;
    // those boats then make the run for open water)
    // (a boat only goes out through an exit you've cleared: none launch with Vance's guns within 5 of it)
    const GATE = { x0: 44, y0: 24, x1: 56, y1: 29 };
    const hot = box => !F.haleStood && vanceShips(st).some(v => E.shipCells(v).some(([x, y]) => x >= box.x0 - 5 && x <= box.x1 + 5 && y >= box.y0 - 5 && y <= box.y1 + 5));
    const open = [GATE].filter(b => !hot(b)); // (the Gate is Haven's only way out)
    const n = 2 + (F.extraBoats || 0);
    for (let i = 0; i < n && open.length && (F.launched || 0) * PER_BOAT < PEOPLE; i++) {
      const at = freeSpot(st, 'refugee', open[(F.launched || 0) % open.length]);
      if (!at) break;
      const b = H.ship(st, ME, 'refugee', at[0], at[1], { id: 'ev' + (F.n = (F.n || 0) + 1) });
      Object.assign(b, { boat: true, noncombatant: true, ownFuel: true, onLoan: true, name: 'Evacuation boat' });
      M.locked.push(b.id); (F.boats ||= []).push(b.id); F.launched = (F.launched || 0) + 1;
    }
    const shut = !open.length;
    if (shut && !F.heldSaid) { F.heldSaid = true; H.say(st, [ruiz("Ortiz, the boats are holding! Vance has guns on the Gate. Clear it and we'll go.", 'worried')]); }
    if (!shut) F.heldSaid = false;
  }
  const exits = EXITS(st);
  for (const id of (owner === ME ? F.boats : F.life) || []) {
    const b = H.get(st, id);
    if (!b) { if (!(F.out || []).includes(id) && !(F.dead || []).includes(id)) { (F.dead ||= []).push(id); if (owner === ME) F.boatsLost = (F.boatsLost || 0) + 1; } continue; }
    const blocked = new Set(); for (const s of st.ships) if (s !== b) for (const [a, c] of E.shipCells(s)) blocked.add(a + ',' + c);
    let D = waterField(st, exits, { blocked, diag: false });
    if (Math.min(...E.shipCells(b).map(([a, c]) => D[c * st.W + a])) >= 1e9) D = waterField(st, exits, { diag: false }); // (boxed in: head for the exit anyway and wait for a gap)
    b.movesLeft = Math.max(b.movesLeft, 4);
    moveBest(st, b, (x, y, rot) => Math.min(...E.shipCells({ ...b, x, y, rot }).map(([a, c]) => D[c * st.W + a])), { script: true });
    if (E.shipCells(b).some(([x, y]) => x === 0 || y === st.H - 1)) {
      st.ships = st.ships.filter(s => s !== b); (F.out ||= []).push(id);
      if (owner === ME) F.saved = (F.saved || 0) + 1;
    }
  }
}
// (Obey) while Haven burns its people take to the lifeboats: two every other round, then the rest when it falls
function lifeboats(st, M, H) {
  const F = M.flags;
  if (!fallen(st, 'H') && st.round % 2 === 0 && F.lbRound !== st.round && (F.life || []).length < 12) {
    F.lbRound = st.round;
    const [x, y] = P.H;
    for (let i = 0; i < 2; i++) {
      const at = freeSpot(st, 'refugee', { x0: x - 6, y0: y - 9, x1: x + 6, y1: y - 6 }); // (out of the yard, toward the Gate)
      if (!at) break;
      const b = H.ship(st, RUIZ, 'refugee', at[0], at[1], { id: 'lb' + (F.n = (F.n || 0) + 1) });
      Object.assign(b, { lifeboat: true, noncombatant: true, ownFuel: true, name: 'Lifeboat' });
      M.locked.push(b.id); (F.life ||= []).push(b.id); M.track.push(b.id);
    }
    if ((F.life || []).length <= 2) H.say(st, [sato("Boats coming out of Haven, sir. Lifeboats. Packed.", 'worried'), vance("Let them run. Without Haven they're nothing.", 'neutral')]);
  }
  for (const k of ['H', ...DISTRICTS]) {
    if (!fallen(st, k) || (F.lifeFrom || []).includes(k)) continue;
    (F.lifeFrom ||= []).push(k);
    const [x, y] = P[k];
    for (let i = 0; i < (k === 'H' ? 4 : 2); i++) {
      const at = freeSpot(st, 'refugee', { x0: x - 3, y0: y - 3, x1: x + 3, y1: y + 3 });
      if (!at) break;
      const b = H.ship(st, RUIZ, 'refugee', at[0], at[1], { id: 'lb' + (F.n = (F.n || 0) + 1) });
      Object.assign(b, { lifeboat: true, noncombatant: true, ownFuel: true, name: 'Lifeboat' });
      M.locked.push(b.id); (F.life ||= []).push(b.id); M.track.push(b.id);
    }
    if (F.lifeFrom.length === 1) H.say(st, [sato("Boats coming off the burning rafts, sir. Lifeboats. Packed.", 'worried'), vance("Let them run. Without Haven they're nothing.", 'neutral')]);
  }
}

// ---------- Vance's fleet (scripted) ----------
function vanceTurn(st, M, H) {
  st.players[VANCE].money = 5000; // (scripted: the Council pays for the shells)
  try { vanceActs(st, M, H); } finally { st.players[VANCE].money = 0; }
}
function vanceActs(st, M, H) {
  const F = M.flags;
  const hostile = refuse(M);
  // Obey: every carrier afloat flies one strike a turn at Haven's defences, the deadliest first (AA, missiles,
  // guns, the airbase), one platform a strike. Your ships still have to go in and burn the Motherraft.
  if (obey(M) && carriersLeft(st)) {
    const hb = baseOf(st, 'H');
    const order = ['aa', 'cruise', 'gun', 'airbase', 'missile', 'radar', 'helipad'];
    const targets = hb ? st.platforms.filter(o => o.baseId === hb.id && order.includes(o.kind)).sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || b.y - a.y * 0 - (a.y - b.y) * 0) : [];
    for (const cv of vanceShips(st).filter(s => s.type === 'carrier')) {
      const o = targets.shift(); if (!o) break;
      st.platforms = st.platforms.filter(p => p !== o);
      E.log(st, ME, `Vance's aircraft destroyed one of Haven's ${o.kind === 'aa' ? 'AA Platforms' : o.kind === 'cruise' ? 'Cruise Missile Batteries' : o.kind === 'gun' ? 'Gun Platforms' : o.kind}.`);
    }
    if (!F.strikeSaid) { F.strikeSaid = true; H.say(st, [sato("Vance's aircraft are over Haven, sir. They're taking its defences apart, one platform at a time.", 'worried')]); }
  }
  if (hostile && F.vanceStunned === st.round) return; // (caught off guard: they lose a turn)
  if (hostile && F.haleStood) return; // (stood down: they hold position and hold fire)
  if (hostile && F.haleAt && st.round >= F.haleAt && !F.haleStood) {
    F.haleStood = st.round;
    H.say(st, [hale("Commodore Vance. This is Admiral Hale, with the Home Fleet, and the Council's inquiry into your dealings with Old Salt Nyx.", 'stern'), hale("Stand your fleet down. Now.", 'stern'), vance("...All ships. Cease fire.", 'stern'), hale("Captain Ortiz, see those boats clear. Nobody else touches them.", 'stern')]);
    return;
  }
  // the fleet train keeps feeding him ships while a carrier still flies his flag
  if (hostile && carriersLeft(st) && st.round > F.mutinyAt && (st.round - F.mutinyAt) % 3 === 0 && (F.waves || 0) < 6) {
    F.waves = (F.waves || 0) + 1;
    const got = spawn(st, H, VANCE, F.waves % 2 ? ['destroyer', 'destroyer'] : ['cruiser', 'destroyer'], F.waves % 2 ? { x0: 34, y0: 0, x1: 54, y1: 2 } : { x0: 56, y0: 18, x1: 69, y1: 25 }, { track: !!F.nyxGift, hidden: false });
    for (const s of got) { s.ownFuel = true; s.onLoan = true; }
    if (got.length) H.say(st, [sato(`More of Vance's ships coming in, sir, ${F.waves % 2 ? 'from the north' : 'from the east'}. ${got.length} of them. They'll keep coming while his carriers are afloat.`, 'worried')]);
  }
  const v = E.visibility(st, VANCE);
  const targets = st.ships.filter(s => s.owner !== VANCE && !E.allied(st, VANCE, s.owner))
    .filter(s => (F.vanceSees && s.owner === ME) || v.ships.has(s.id)).filter(s => !(obey(M) && s.lifeboat));
  const havenRig = rigOf(st, baseOf(st, 'H'));
  // where to go: the Gate in Act 1-2; into the lagoon after
  const v0 = E.visibility(st, VANCE);
  // Act 1: in range of whichever fort still stands; then the Gate; then into the lagoon
  const forts = ['F1', 'F2'].filter(k => !fallen(st, k)).map(k => P[k]);
  const goal = act(M) === 1 && forts.length ? forts : act(M) < 3 ? [STAGE] : [P.H];
  // (Refuse: the carriers stand off outside the Gate, where the boats come out, and fly strikes; the rest go in)
  const carrierGoal = hostile ? [STAGE] : goal;
  // (Refuse: the escorts hunt the boats once they're out of the Gate; with none in sight they hold its approaches)
  const boatsSeen = hostile ? st.ships.filter(b => b.boat && b.owner === ME && (F.vanceSees || v0.ships.has(b.id))).flatMap(b => E.shipCells(b)) : [];
  // (with no boats in sight: the first group holds the Gate, the second group and the relief ships the water east of it)
  const NEEDLE_OUT = [60, 23]; // (the second group's station: east of the Gate)
  const huntGoal = i => hostile ? (boatsSeen.length ? boatsSeen : [i ? NEEDLE_OUT : STAGE]) : goal;
  const fields = {}, Ds = {};
  for (const [i, s] of vanceShips(st).entries()) {
    if (s.order) E.applyAction(st, { type: 'cancelOrder', shipId: s.id });
    const stop = s.type === 'carrier' ? 7 : 3;
    // (a field for this ship's shape, so the carriers find the channels they actually fit through)
    const side = vIds.includes(s.id) ? 0 : 1;
    const g = s.type === 'carrier' ? (hostile && side ? [NEEDLE_OUT] : carrierGoal) : huntGoal(side), gk = (s.type === 'carrier' ? 'c' : 'o' + (boatsSeen.length ? '' : '')) + side;
    const D = Ds[gk] ||= waterField(st, g, { diag: false });
    const sf = fields[s.type + gk] ||= shapeField(st, s, g, stop);
    // (no way through for this shape: fall back on plain sea distance)
    const stuck = sf(s.x, s.y, s.rot) >= 1e6;
    moveBest(st, s, (x, y, rot) => {
      const d = Math.min(...E.shipCells({ ...s, x, y, rot }).map(([a, b]) => D[b * st.W + a]));
      const f = stuck ? Math.max(0, d - stop) : sf(x, y, rot);
      if (f >= 1e6) return 1e6;
      return f ? f + stop : stop + Math.max(0, stop - d) * 0.4; // (in range: don't crowd in closer than needed)
    });
    for (const a of SHIPS[s.type].actions.filter(a => a.kind === 'attack' && !a.subsOnly)) for (let k = 0; k < (a.shots || 1); k++) {
      // in range: enemy ships (evacuation boats first when hostile), then Haven's rafts and Ruiz's rigs
      // (Act 1: the forts are your test; his ships only fire on what comes close)
      const inRange = (cells) => E.dist(E.shipCells(s), cells) <= (act(M) === 1 ? Math.min(a.range, 3) : a.range);
      const pick = [...targets.filter(t => st.ships.includes(t) && inRange(E.shipCells(t))).sort((x, y) => (hostile ? (y.boat ? 1 : 0) - (x.boat ? 1 : 0) : 0) || x.hp - y.hp).map(t => E.shipCells(t)),
        ...(act(M) >= 3 && havenRig && inRange([[havenRig.x, havenRig.y]]) ? [[[havenRig.x, havenRig.y]]] : []),
        ...st.rigs.filter(r => r.owner === RUIZ && !E.allied(st, VANCE, RUIZ) && act(M) >= 2 && inRange([[r.x, r.y]]) && (act(M) >= 3 || !['H', ...DISTRICTS].some(k => rigOf(st, baseOf(st, k)) === r))).map(r => [[r.x, r.y]])];
      if (!pick.some(cells => cells.some(([x, y]) => E.applyAction(st, { type: 'act', shipId: s.id, actionId: a.id, x, y }).ok))) break;
    }
  }
}

// ---------- Kade's raiders (scripted): out of the Cinder Isle every few rounds; they burn whatever's closest ----------
function kadeTurn(st, M, H) {
  const F = M.flags;
  st.players[KADE].money = 5000; // (scripted: ammunition is on the house; spent back to nothing after)
  try { kadeActs(st, M, H, F); } finally { st.players[KADE].money = 0; }
}
function kadeActs(st, M, H, F) {
  if (st.round >= 3 && st.round % KADE_EVERY === 3 && !lost(st, 'K', KADE) && st.ships.filter(s => s.owner === KADE).length < 8 && !F['k' + st.round]) {
    F['k' + st.round] = true; F.kadeWaves = (F.kadeWaves || 0) + 1;
    spawn(st, H, KADE, st.round >= 15 ? ['fireship', 'fireship', 'incendiary', 'gunboat'] : ['fireship', 'gunboat', 'skiff'], refuse(M) && F.kadeWaves >= 2 ? { x0: 57, y0: 19, x1: 68, y1: 25 } : KADE_BOX).forEach(s => { s.ownFuel = true; s.onLoan = true; });
    if (refuse(M) && F.kadeWaves >= 2 && !F.kadeHaven) { F.kadeHaven = true; H.say(st, [kade("If Haven won't burn for the Navy, Ruiz, it'll burn for the Tide. A martyr's worth more than a raft.", 'stern'), ruiz("Kade, you animal! There are children on it!", 'worried'), sato("His fireships are coming in from the east, sir. Straight for the Gate and Haven.", 'worried')]); }
  }
  for (const s of st.ships.filter(s => s.owner === KADE)) {
    // what to burn: Act 3 Refuse, Haven; Act 3 Obey, the carriers; otherwise the nearest ship of anyone's
    let aim = null;
    if (refuse(M) && !fallen(st, 'H')) aim = [P.H];
    else if (obey(M) && carriersLeft(st)) aim = E.shipCells(st.ships.filter(o => o.owner === VANCE && o.type === 'carrier').sort((a, b) => E.dist(E.shipCells(s), E.shipCells(a)) - E.dist(E.shipCells(s), E.shipCells(b)))[0]);
    else { const t = st.ships.filter(o => o.owner !== KADE && !o.noncombatant).sort((a, b) => E.dist(E.shipCells(s), E.shipCells(a)) - E.dist(E.shipCells(s), E.shipCells(b)))[0]; if (t) aim = E.shipCells(t); }
    if (!aim) continue;
    const D = waterField(st, aim, { diag: false });
    moveBest(st, s, (x, y, rot) => Math.min(...E.shipCells({ ...s, x, y, rot }).map(([a, b]) => D[b * st.W + a])));
    for (const a of SHIPS[s.type].actions.filter(a => a.kind === 'attack' || a.kind === 'fire')) {
      const near = [...st.ships.filter(o => o.owner !== KADE && !o.noncombatant && E.dist(E.shipCells(s), E.shipCells(o)) <= (a.range || 1)).map(o => E.shipCells(o)), ...st.rigs.filter(r => r.owner !== KADE && E.dist(E.shipCells(s), [[r.x, r.y]]) <= (a.range || 1)).map(r => [[r.x, r.y]])];
      for (let k = 0; k < (a.shots || 1); k++) if (!near.some(cells => cells.some(([x, y]) => E.applyAction(st, { type: 'act', shipId: s.id, actionId: a.id, x, y }).ok))) break;
    }
  }
}

// ---------- the endings ----------
const line = (who, text, mood = 'neutral') => ({ who, mood, text });
function ending(st, M) {
  const c = C(M);
  if (obey(M)) {
    const got = (M.flags.out || []).filter(id => id.startsWith('lb')).length, all = (M.flags.life || []).length;
    return [
      sato("Haven is... it's gone, sir.", 'worried'),
      council("The northern shelves are secure. The Allocation holds. The Council thanks Commodore Vance and Captain Ortiz."),
      vance("You'll have a squadron of your own for this, Ortiz. Admiral before you're forty. The war's over.", 'pleased'),
      ...(got >= all - 1 && all ? [ortiz("Most of the lifeboats got clear. Most.", 'worried'), sato("Yes, sir. Most.", 'worried')]
        : [ortiz("How many lifeboats got clear, Sato?", 'worried'), sato(`${got} of ${all}, sir.`, 'worried')]),
      ortiz("My family's town kept its lights on because of the Accords. I used to think that made it simple.", 'stern'),
      sato("Sir?", 'neutral'),
      ortiz("Nothing, Sato. Set a course for home.", 'stern'),
    ];
  }
  const how = M.flags.haleStood ? 'hale' : carriersLeft(st) === 0 ? 'beaten' : 'out';
  return [
    ...(how === 'out' ? [ruiz(`That's the last boat clear, Ortiz. ${saved(M).toLocaleString()} people. Out of the lagoon, alive.`, 'pleased')]
      : how === 'beaten' ? [sato("Vance's carriers are all gone, sir! What's left of his fleet is turning away!", 'pleased'), vance("This isn't over, Ortiz. You'll hang for this.", 'stern')]
      : [sato("Vance's fleet is standing down, sir. Admiral Hale's flag is on the horizon.", 'pleased')]),
    ...(how === 'hale'
      ? [hale("Captain Ortiz. You disobeyed a lawful order from your commanding officer.", 'stern'), ortiz("Yes, Admiral.", 'stern'), hale("Commodore Vance is under arrest for his dealings with Nyx. You will stand before the same inquiry. I'll be there.", 'stern'), hale("...For what it's worth, Mateo, I'd have refused too.", 'neutral')]
      : [council("Captain Ortiz is charged with mutiny. He will be taken into custody when he returns to the Allocation's waters."), ruiz("Then don't go back, Ortiz. There's room on the water for one more.", 'neutral'), ortiz("...Set a course, Sato. Somewhere they can't find us.", 'stern')]),
    sato("Aye, sir. Where to?", 'neutral'),
    ortiz("Out to sea. We'll work out the rest from there.", 'stern'),
  ];
}
