// ============================================================
// NAVY · MISSION 5 · REPRISAL
// The Corrigan Shelf, July 2061. Driftwood has brought Mother Ruiz down on the shelf: boats from every
// raft-town, coming for Corrigan Point. Admiral Hale takes command of the defence herself.
// Teaches: defending bases (Gun Platforms, Radar Masts), repairs (the Dry Dock, Hale's Damage Control),
// weather (a scripted storm), and telling contacts apart before you shoot.
// Ruiz's swarm brings refugee boats: on scan they're "?" contacts like any gunboat. Automatic fire
// (platforms, standing orders) only shoots ships in plain sight here, and never refugees: only you can.
// If Driftwood was taken (Mission 4), Ruiz offers to turn around for her people: a choice.
// Win: hold until dawn (round 14), or damage Ruiz's Mothership to 2 HP or less (she pulls everyone out).
// Secondary: Unbroken (no rig lost), Driven Off (Ruiz driven off by round 11), No Losses.
// Hidden: Eyes Before Guns (never fire on a refugee boat). Unlocks the Corrigan Pennant (cosmetic).
// ============================================================
import * as E from '../../engine/index.js';
import { PLATFORMS } from '../../data/bases.js';
import { SHIPS } from '../../data/ships.js';
import { moveBest, waterField } from '../ai.js';

const PAR = 12, DAWN = 14, DRIVE_BY = 11, RUIZ_OUT_HP = 2;
const RIGS = { W: 'the West Rig', N: 'the North Rig', E: 'the East Rig' };

const line = (who, text, mood = 'neutral') => ({ who, mood, text });
const hale = (t, m) => line('hale', t, m), sato = (t, m) => line('sato', t, m), ortiz = (t, m) => line('ortiz', t, m);
const ruiz = (t, m) => line('ruiz', t, m), kade = (t, m) => line('kade', t, m), vance = (t, m) => line('vance', t, m);

// the waves: when they come out of the fog (on the Tide's turn of that round), where from, and what they go for
const WAVES = [
  { id: 'west', round: 3, goal: 'W', box: { x0: 0, y0: 0, x1: 6, y1: 2 }, ships: ['skiff', 'skiff', 'gunboat'] },
  { id: 'narrows', round: 5, goal: 'N', box: { x0: 14, y0: 0, x1: 22, y1: 2 }, ships: ['gunboat', 'skiff', 'gunboat'], refugees: 2 },
  { id: 'east', round: 6, goal: 'E', box: { x0: 29, y0: 0, x1: 33, y1: 3 }, ships: ['skiff', 'skiff'], kade: ['fireship', 'fireship'] },
  { id: 'ruiz', round: 9, goal: 'A', box: { x0: 17, y0: 0, x1: 23, y1: 2 }, ships: ['mothership', 'gunboat', 'gunboat'], refugees: 2 },
];

const base = (st, k) => (st.bases || []).find(b => b.id === st.campaign.flags.bases?.[k]);
const lostRig = (st, k) => { const b = base(st, k); return !b || b.wrecked || b.owner !== 0; };
const rigsLost = st => Object.keys(RIGS).filter(k => lostRig(st, k));
const tide = st => st.ships.filter(s => s.owner === 1);
const fighters = st => tide(st).filter(s => !s.noncombatant);
const refugees = st => tide(st).filter(s => s.noncombatant);
const mothership = st => st.ships.find(s => s.id === 'ruiz');
const near = (st, a, b) => E.dist(E.shipCells(a), E.shipCells(b));
const burnedPath = M => M.choices.driftwood !== 'taken';
const ruizOut = M => !!M.flags.ruizOut;
const released = M => M.picked?.offer === 'release';

export default {
  id: 'navy-5', arc: 'navy', n: 5,
  title: 'Reprisal', place: 'The Corrigan Shelf', date: 'July 2061',
  faction: 'navy', commander: { id: 'hale', level: 1 },
  enemy: { faction: 'tide', name: 'The Free Tide' },
  par: PAR,
  hide: ['victory'],
  cosmetics: ['corrigan-pennant'],
  summary: 'Mother Ruiz is coming for Corrigan Point with boats from every raft-town. Admiral Hale holds the shelf.',
  teaches: ['Base defences', 'Repairs', 'Weather', 'Identifying contacts'],

  map: `
    ..................................
    ..................................
    ..................................
    .......................##.........
    ...##..##..............#..#####...
    ..####.#....#.###........######...
    .#####........#####......#####....
    ...#.........######.......##......
    ...............##...##............
    ...................##.............
    ..................................
    ...............N..................
    ....W....................c........
    ..................................
    .......c.......P............E.....
    ...........C.......d..............
    ..................................
    ...............A.D................
    ..................................
    ..................###.............
    ##.......######################...
    ####.#############################
    ##################################
    ##################################`,
  homes: [
    { home: { x0: 10, y0: 14, x1: 21, y1: 19 }, spawn: { x0: 10, y0: 14, x1: 21, y1: 19 } },
    { home: { x0: 16, y0: 0, x1: 18, y1: 0 }, spawn: { x0: 16, y0: 0, x1: 18, y1: 0 } },
  ],

  setup(st, marks, H) {
    const me = st.players[0], foe = st.players[1];
    st.campaign.identifyFirst = true; // (automatic fire only at ships in plain sight, never at refugees)
    st.campaign.flags.bases = {};
    // Corrigan Point (your Admiralty, with its Dry Dock) and the shelf's three rigs, all Stations (level 2)
    const found = (k, [x, y], capital) => {
      const dep = { id: 'd_corrigan_' + k, x, y, type: 'medium', reserves: 120, max: 120 };
      st.deposits.push(dep);
      const b = E.foundBase(st, 0, dep, capital);
      b.level = 2;
      const r = st.rigs.find(r => r.baseId === b.id && r.center); r.hp = E.baseMaxHp(st, b);
      me.known[dep.id] = true;
      st.campaign.flags.bases[k] = b.id;
      return b;
    };
    const home = found('A', marks.A[0], true);
    for (const k of Object.keys(RIGS)) found(k, marks[k][0], false);
    const [dx, dy] = marks.D[0];
    st.platforms.push({ id: 'f' + st.nextId++, owner: 0, baseId: home.id, kind: 'drydock', x: dx, y: dy, hp: PLATFORMS.drydock.hp, buildLeft: 0 });
    // the defences are researched; what you build is up to you
    me.research ||= { done: {}, progress: {}, queue: [], current: null };
    for (const t of ['platform_construction', 'artillery', 'radar', 'gun_platforms', 'radar_masts', 'crew_quarters', 'dry_docks']) me.research.done[t] = true;
    // Hale's squadron
    const flag = H.ship(st, 0, 'cruiser', ...marks.C[0], { id: 'resolute' }); flag.name = 'Resolute';
    H.ship(st, 0, 'destroyer', ...marks.d[0], { id: 'dd1' });
    marks.c.forEach(([x, y], i) => H.ship(st, 0, 'corvette', x, y, { id: 'cv' + (i + 1) }));
    H.ship(st, 0, 'patrol', ...marks.P[0], { id: 'pk1' });
    me.money = 900; me.oil = 40;
    foe.money = 2000; foe.oil = 300;
    st.campaign.flags.refHp = {};
    me.log = [{ turn: 1, text: 'Corrigan Point. The Tide is massing north of the Spit.' }]; foe.log = [];
  },

  briefing: c => [
    ...(c.driftwood === 'taken' ? [
      hale("Three hundred and twelve people from Driftwood in the Corrigan Point stockade, Captain. Commodore Vance wants you court-martialled.", 'stern'),
      hale("Mother Ruiz wants them back. She's emptied every raft-town on the sea to come and get them."),
    ] : [
      hale("Driftwood burned, Captain. Every raft-town on the sea knows whose squadron lit it, and whose shelf that squadron sails from.", 'stern'),
      ortiz("Admiral, I...", 'worried'),
      hale("It isn't a reproach. It's the situation. Mother Ruiz is coming for Corrigan Point."),
    ]),
    sato("Long-range radar has contacts massing north of the Spit, ma'am. Forty at least. More every hour."),
    hale("This is my shelf. I'm taking command of its defence myself. Ortiz, you're with me on the Resolute."),
    hale("We hold the Point and the three rigs until dawn. Nobody gets through the Narrows that I haven't seen first.", 'stern'),
  ],

  goals: {
    main: `Hold Corrigan Point until dawn (round ${DAWN}), or drive Ruiz off`,
    lose: 'Corrigan Point is wrecked, or two of the three rigs are lost',
    deadline: DAWN,
    deadlineText: `Dawn comes at round ${DAWN}: hold until then.`,
    progress: (st, M) => {
      const m = mothership(st);
      return [`rigs ${3 - rigsLost(st).length}/3`, m && !ruizOut(M) ? `Mothership ${m.hp}/${SHIPS.mothership.hp} HP` : ''].filter(Boolean).join(' · ');
    },
  },
  secondary: [
    { id: 'unbroken', name: 'Unbroken', desc: 'Lose none of the three rigs', done: st => rigsLost(st).length === 0, live: st => rigsLost(st).length === 0 },
    { id: 'driven', name: 'Driven Off', desc: `Drive Ruiz off by round ${DRIVE_BY}`, done: (st, M) => ruizOut(M) && M.flags.ruizOut <= DRIVE_BY, live: (st, M) => (ruizOut(M) ? M.flags.ruizOut : st.round) <= DRIVE_BY && !released(M) },
    { id: 'nolosses', name: 'No Losses', desc: 'Lose no ships', done: st => !(st.players[0].stats?.shipsLost > 0), live: st => !(st.players[0].stats?.shipsLost > 0) },
  ],
  clearAchievement: 'reprisal',

  steps: [
    {
      id: 'guns',
      say: [
        sato("The rigs are Stations now, ma'am: room for platforms. Gun Platforms fire on their own at the start of every turn: range three, two damage."),
        hale("Mark this, both of you. On my shelf, nothing fires automatically at a contact. Platforms and standing orders shoot what we can see with our own eyes, nothing else.", 'stern'),
        sato("Aye, ma'am. Anything that's only a blip on the scope, you'll have to fire on by hand."),
      ],
      do: 'Click one of your rigs, then build a <b>Gun Platform</b> next to it (in the base card, pick Gun Platform, then a square).',
      spot: '[data-platform="gun"]',
      markers: st => Object.keys(RIGS).map(k => { const b = base(st, k); return b ? { x0: b.x, y0: b.y, x1: b.x, y1: b.y, label: RIGS[k].replace('the ', '') } : null; }).filter(Boolean),
      check: st => (st.platforms || []).some(o => o.owner === 0 && o.kind === 'gun') || st.round >= 4,
    },
    {
      id: 'radar',
      say: [sato("A Radar Mast sees five squares around its rig. One on the North Rig would watch the Narrows.")],
      do: 'Build a <b>Radar Mast</b> at one of your rigs: the North Rig watches the Narrows.',
      spot: '[data-platform="radar"]',
      check: st => (st.platforms || []).some(o => o.owner === 0 && o.kind === 'radar') || st.round >= 5,
    },
    {
      id: 'hold',
      do: (st, M) => mothership(st) && !ruizOut(M)
        ? `Hold the shelf. Damage <b>Ruiz's Mothership</b> to ${RUIZ_OUT_HP} HP or less and she'll pull her whole fleet out; or hold until dawn (round ${DAWN}).`
        : `Hold Corrigan Point and the three rigs until dawn (round ${DAWN}). Look before you shoot.`,
      markers: st => Object.keys(RIGS).filter(k => !lostRig(st, k)).map(k => { const b = base(st, k); return { x0: b.x, y0: b.y, x1: b.x, y1: b.y, label: RIGS[k].replace('the ', '') }; }),
      check: () => false,
    },
  ],

  triggers: [
    {
      id: 'damaged',
      when: st => st.ships.some(s => s.owner === 0 && s.hp < E.shipStat(st, 0, s.type, 'hp')),
      say: [
        sato("We've taken damage. Two ways to patch it, ma'am."),
        sato("Ships next to the Dry Dock at Corrigan Point repair two HP a turn. Or your Damage Control: every ship we have repairs at once, the Resolute double. It's on your commander card."),
      ],
    },
    {
      id: 'refugeeSeen',
      when: st => refugees(st).some(s => E.visibility(st, 0).ident.has(s.id)),
      say: [
        ortiz("Admiral... those slow contacts aren't warships. They're fishing boats. There are children on the decks.", 'worried'),
        hale("She brought them with her. Of course she did.", 'stern'),
        hale("Nobody fires on a contact they haven't seen with their own eyes. Not tonight."),
      ],
    },
    {
      id: 'refugeeHit',
      when: (st, M) => st.current === 0 && Object.entries(M.flags.refHp).some(([id, hp]) => { const s = st.ships.find(x => x.id === id); return s ? s.hp < hp : !(M.flags.gone || []).includes(id); }),
      then: (st, M) => { M.flags.refugeeHit = true; },
      say: [ortiz("Cease fire! Cease fire! That was a boat full of people!", 'worried'), hale("...Noted.", 'stern')],
    },
    {
      id: 'storm', when: (st, M) => !!M.flags.stormOn,
      say: [
        sato("Storm's on top of us, ma'am. In this, nothing sees past the next square. Ships in it make half speed."),
        hale("Then they can't see us either. Hold your positions."),
      ],
    },
    {
      id: 'rigLost', when: st => rigsLost(st).length >= 1,
      say: [sato("We've lost a rig! Lose another and the shelf's gone.", 'worried')],
    },
    {
      // Ruiz badly hurt (or sunk under her): she breaks off into the storm and takes the swarm with her
      id: 'ruizOut',
      when: (st, M) => !!M.flags.wave_ruiz && (!mothership(st) || mothership(st).hp <= RUIZ_OUT_HP),
      then: (st, M) => {
        M.flags.ruizOut = st.round;
        M.flags.ruizSunk = !mothership(st);
        st.ships = st.ships.filter(s => s.id !== 'ruiz'); // (gone into the rain, at full speed)
      },
    },
    {
      id: 'ruizHit', when: st => { const m = mothership(st); return !!m && m.hp <= SHIPS.mothership.hp - 2 && m.hp > RUIZ_OUT_HP; },
      say: [sato("The Mothership's hit! She's listing. One more good blow.", 'pleased')],
    },
  ],

  // Every Tide boat has a goal (a rig, or Corrigan Point): it sails there, standing off at its gun's range,
  // and shoots the goal, or anything of yours in range. Fireships ram. Ruiz's Mothership hangs back and
  // sends drones. Refugee boats trail the boats they came with, and run when shot at or when Ruiz leaves.
  enemyTurn(st, M, H) {
    const pull = released(M) || ruizOut(M);
    for (const k of tide(st)) {
      if (!st.ships.includes(k)) continue;
      if (k.noncombatant || pull) { refugeeMove(st, M, k, pull); continue; }
      if (k.type === 'fireship') fireshipMove(st, M, k);
      else if (k.type === 'mothership') ruizMove(st, M, k);
      else raiderMove(st, M, k);
    }
    // the weather comes in on round 7
    if (st.round === 6 && !M.flags.stormOn) {
      M.flags.stormOn = true;
      E.scriptEvent(st, { kind: 'fogbank', x: 18, y: 7, r: 6, until: 10 });
      E.scriptEvent(st, { kind: 'storm', x: 18, y: 7, r: 6, dx: 0, dy: 0, until: 10 });
    }
    // Ruiz speaks (round 7): an offer if Driftwood was taken, a promise if it burned
    if (st.round === 6 && !M.flags.ruizSpoke) {
      M.flags.ruizSpoke = true;
      if (burnedPath(M)) H.say(st, [
        ruiz("Corrigan Point. You don't know my voice. That's all right. I knew every name in Driftwood.", 'stern'),
        ruiz("I'm not calling to talk. I'm calling so you know who it was."),
      ]);
      else H.say(st, [
        ruiz("Corrigan Point. I'm told the one who took Driftwood didn't burn it. Then you have three hundred and twelve of my people."),
        ruiz("Give them back and I turn around. All of us, tonight. Nobody else goes in the water."),
        ortiz("Admiral... they're fishermen and kids. Let them go and this ends.", 'worried'),
        sato("Ma'am, the Council's standing order: no prisoner exchanges with the Unallocated. Ever.", 'worried'),
        { ...hale("Ruiz is waiting for an answer.", 'stern'), choice: { id: 'offer', options: [{ id: 'refuse', label: 'Refuse: "The Accords don\'t trade."' }, { id: 'release', label: 'Release the detainees' }] } },
      ]);
    }
    // new boats come out of the fog
    for (const w of WAVES) {
      if (st.round !== w.round || M.flags['wave_' + w.id] || pull) continue;
      M.flags['wave_' + w.id] = true;
      spawnWave(st, M, H, w);
    }
    // (what the refugee boats look like now: any drop on your turn is your doing)
    M.flags.refHp = Object.fromEntries(refugees(st).map(s => [s.id, s.hp]));
  },

  onChoice(st, M, H, id, opt) {
    if (id !== 'offer') return;
    if (opt === 'release') H.say(st, [
      hale("Open the stockade. Put them in boats and point them north.", 'stern'),
      ruiz("...Thank you, Admiral. I won't forget whose voice that was."),
      hale("Make sure you never have reason to find out.", 'stern'),
    ]);
    else H.say(st, [
      hale("The Accords don't trade, Ruiz. Turn your boats around or I'll sink them.", 'stern'),
      ruiz("Then I'll come and get them.", 'stern'),
    ]);
  },

  won: (st, M) => ruizOut(M) || released(M) || st.round >= DAWN,
  onWin: (st, M, H) => {
    M.flags.ending = released(M) ? 'released' : ruizOut(M) ? 'driven' : 'dawn';
    if (M.flags.ending === 'released') H.say(st, [
      sato("They're turning, ma'am. All of them. Heading north.", 'worried'),
      vance("Admiral. Tell me the reports are wrong. Tell me you didn't hand three hundred prisoners back to Ruiz.", 'stern'),
      hale("Nobody died on my shelf tonight, Commodore. Put that in your report next to mine.", 'stern'),
      ortiz("Thank you, Admiral.", 'pleased'),
      hale("Don't thank me, Captain. The Council will want someone's head for this, and it won't be Ruiz's.", 'stern'),
    ]);
    else H.say(st, [
      ...(M.flags.ending === 'driven'
        ? [M.flags.ruizSunk
            ? sato("The Mothership's going down! There's a fast boat pulling away from her stern... that's Ruiz. They're all turning north!", 'pleased')
            : sato("The Mothership's breaking off into the storm! They're all turning north. They're running, ma'am!", 'pleased'),
          ruiz("This isn't finished, Hale.", 'stern')]
        : [sato("Dawn, ma'am. They're pulling back through the Narrows. All of them.", 'pleased')]),
      hale("Corrigan Point stands. Damage reports from every rig in the hour.", 'pleased'),
      ortiz("Admiral. Those boats with the families in them. They'll be back, won't they? Every time we come for the rafts.", 'worried'),
      hale("Yes, Captain. That's the war we're in now. Get some sleep.", 'stern'),
    ]);
  },
  // the merciful ending can't earn Driven Off, so an S there rounds up to S+
  rankUp: (st, M, r) => (released(M) && r.rank === 'S' ? { rank: 'S+', note: 'Mercy: an S on the release ending rounds up to S+.' } : null),
  achievementsOnWin: (st, M) => (M.flags.refugeeHit ? [] : ['eyes-before-guns']),
  choices: (st, M) => ({ ruizOffer: M.picked?.offer === 'release' ? 'released' : M.picked?.offer === 'refuse' ? 'refused' : null }),
  lost: st => { const a = base(st, 'A'); return !a || a.wrecked || rigsLost(st).length >= 2; },
  onLose: (st, M, H) => H.say(st, [hale("The shelf is lost. Every rig we abandon tonight, the Council will count against the Accords.", 'stern')]),
};

// ---------- the Tide's boats ----------
// a free spot for a ship of this type inside a box, out of your sight (north rows first)
function freeSpot(st, type, box, rot = 0) {
  for (let y = box.y0; y <= box.y1; y++) for (let x = box.x0; x <= box.x1; x++) {
    const cells = E.shipCells({ type, x, y, rot });
    if (cells.some(([a, b]) => a < 0 || b < 0 || a >= st.W || b >= st.H || E.isLand(st, a, b) || E.seesSquare(st, 0, a, b))) continue;
    if (st.ships.some(s => E.shipCells(s).some(([p, q]) => cells.some(([a, b]) => a === p && b === q)))) continue;
    return [x, y, rot];
  }
  return null;
}
function spawnWave(st, M, H, w) {
  const types = [...w.ships, ...(burnedPath(M) && w.kade ? w.kade : [])];
  let lead = null;
  for (const type of types) {
    // (the Mothership comes bow first, lengthways, so she fits the Narrows)
    const at = freeSpot(st, type, w.box, type === 'mothership' ? 1 : 0);
    if (!at) continue;
    const s = H.ship(st, 1, type, at[0], at[1], { rot: at[2], id: type === 'mothership' ? 'ruiz' : w.id + (M.flags.n = (M.flags.n || 0) + 1) });
    s.goal = w.goal;
    if (type === 'mothership') s.name = "Ruiz's Mothership";
    lead ||= s;
    M.track.push(s.id);
  }
  for (let i = 0; i < (w.refugees || 0); i++) {
    const at = freeSpot(st, 'refugee', { ...w.box, y0: 0, y1: 1 });
    if (!at || !lead) continue;
    const s = H.ship(st, 1, 'refugee', at[0], at[1], { id: 'ref' + (M.flags.n = (M.flags.n || 0) + 1) });
    s.noncombatant = true; s.follow = lead.id;
    M.track.push(s.id);
  }
  const say = {
    west: [sato("Contacts on the western reef! Three of them, threading the rocks toward the West Rig.", 'worried')],
    narrows: [sato("Contacts in the Narrows, heading for the North Rig. Five. Three fast... and two slow, low in the water. Could be anything.", 'worried')],
    east: burnedPath(M)
      ? [sato("Contacts east, coming round the end of the Spit for the East Rig!", 'worried'), kade("Morning, Corrigan. Remember me? I brought matches.", 'stern'), sato("Fireships with them! Keep them off the rigs!", 'worried')]
      : [sato("Contacts east, coming round the end of the Spit for the East Rig!", 'worried')],
    ruiz: [
      sato("Big contact in the Narrows, ma'am. Bigger than anything they've sent. It's a Drone Mothership.", 'worried'),
      hale("That'll be Ruiz. She doesn't send what she can't replace: hurt her ship badly enough and she'll take the whole swarm home."),
    ],
  }[w.id];
  if (say) H.say(st, say);
}

const goalTarget = (st, k) => {
  // its goal (or, once that rig is gone, the nearest one still standing; Corrigan Point last)
  const live = ['W', 'N', 'E', 'A'].map(g => base(st, g)).filter(b => b && !b.wrecked && b.owner === 0);
  const mine = base(st, k.goal);
  const b = mine && !mine.wrecked && mine.owner === 0 ? mine : live.sort((a, c) => (a.capital - c.capital) || (E.dist(E.shipCells(k), [[a.x, a.y]]) - E.dist(E.shipCells(k), [[c.x, c.y]])))[0];
  return b ? st.rigs.find(r => r.baseId === b.id && r.center) : null;
};
const gunOf = k => SHIPS[k.type].actions.find(a => a.kind === 'attack');

// fire every shot this ship has at the first target that takes it
function shootAt(st, k, targets) {
  const act = gunOf(k);
  if (!act) return;
  for (let shot = 0; shot < (act.shots || 1); shot++) {
    let fired = false;
    for (const [x, y] of targets) if (E.applyAction(st, { type: 'act', shipId: k.id, actionId: act.id, x, y }).ok) { fired = true; break; }
    if (!fired) break;
  }
}
// what's in range: your rigs and platforms near its goal first, then your ships (weakest first)
function targetsFor(st, k, rig) {
  const out = [];
  const plats = (st.platforms || []).filter(o => o.owner === 0 && rig && o.baseId === rig.baseId).sort((a, b) => (b.kind === 'gun') - (a.kind === 'gun'));
  if (rig) out.push([rig.x, rig.y]);
  for (const o of plats) out.push([o.x, o.y]);
  for (const s of st.ships.filter(s => s.owner === 0).sort((a, b) => a.hp - b.hp)) out.push(...E.shipCells(s));
  for (const r of st.rigs.filter(r => r.owner === 0 && r !== rig)) out.push([r.x, r.y]);
  return out;
}

function raiderMove(st, M, k) {
  const rig = goalTarget(st, k);
  if (!rig) return;
  const range = gunOf(k)?.range || 2;
  const D = waterField(st, [[rig.x, rig.y]]);
  moveBest(st, k, (x, y, rot) => {
    const d = Math.min(...E.shipCells({ ...k, x, y, rot }).map(([a, b]) => D[b * st.W + a]));
    return d <= range ? (range - d) * 0.3 : d;
  });
  shootAt(st, k, targetsFor(st, k, rig));
}

function fireshipMove(st, M, k) {
  const rig = goalTarget(st, k);
  if (!rig) return;
  // anything of yours that gets in its way gets rammed instead
  const blocker = st.ships.filter(s => s.owner === 0 && near(st, k, s) <= 2).sort((a, b) => near(st, k, a) - near(st, k, b))[0];
  const aim = blocker ? E.shipCells(blocker) : [[rig.x, rig.y]];
  const D = waterField(st, aim);
  if (Math.min(...E.shipCells(k).map(([a, b]) => D[b * st.W + a])) > 1) moveBest(st, k, (x, y, rot) => Math.min(...E.shipCells({ ...k, x, y, rot }).map(([a, b]) => D[b * st.W + a])));
  for (const [x, y] of aim) if (E.applyAction(st, { type: 'act', shipId: k.id, actionId: 'ram', x, y }).ok) break;
}

// Ruiz keeps 8 or more squares from your nearest ship (a cruiser has to come and get her), within drone range (7) of what she's after,
// sweeps it with a drone and sends the swarm. Badly hurt, she takes everyone home.
function ruizMove(st, M, k) {
  if (k.hp <= RUIZ_OUT_HP) return;
  const rig = goalTarget(st, k);
  if (!rig) return;
  const mine = st.ships.filter(s => s.owner === 0);
  const D = waterField(st, [[rig.x, rig.y]]);
  moveBest(st, k, (x, y, rot) => {
    const cells = E.shipCells({ ...k, x, y, rot });
    const d = Math.min(...cells.map(([a, b]) => D[b * st.W + a]));
    const close = mine.length ? Math.min(...mine.map(s => E.dist(cells, E.shipCells(s)))) : 99;
    return (d <= 7 ? 0 : d - 7) + (close < 8 ? (8 - close) * 3 : 0);
  });
  // gun platforms first, then the rig, then whatever's close
  const plats = (st.platforms || []).filter(o => o.owner === 0 && o.kind === 'gun').map(o => [o.x, o.y]);
  const targets = [...plats, ...targetsFor(st, k, rig)].filter(([x, y]) => E.dist(E.shipCells(k), [[x, y]]) <= 7);
  if (targets[0]) E.applyAction(st, { type: 'act', shipId: k.id, actionId: 'recon', x: targets[0][0], y: targets[0][1] });
  for (let shot = 0; shot < 3; shot++) {
    let fired = false;
    for (const [x, y] of targets) if (E.applyAction(st, { type: 'act', shipId: k.id, actionId: 'drones', x, y }).ok) { fired = true; break; }
    if (!fired) break;
  }
}

// Refugee boats come in behind the boats they sailed with and wait just inside the Narrows, in the lee
// of the Spit, in among the fighting; shot at, or with the swarm leaving, they make for the north edge and are gone.
const SHELTER = { x0: 19, y0: 6, x1: 24, y1: 10 };
function refugeeMove(st, M, k, pull) {
  const hurt = k.hp < SHIPS[k.type].hp;
  if (hurt || pull) {
    const N = waterField(st, Array.from({ length: st.W }, (_, x) => [x, 0]));
    moveBest(st, k, (x, y, rot) => Math.min(...E.shipCells({ ...k, x, y, rot }).map(([a, b]) => N[b * st.W + a])));
    if (Math.min(...E.shipCells(k).map(c => c[1])) === 0) { st.ships = st.ships.filter(s => s !== k); (M.flags.gone ||= []).push(k.id); }
    return;
  }
  // (they wait for the boat they came with to clear the Narrows first)
  const lead = st.ships.find(s => s.id === k.follow && s.owner === 1);
  if (lead && Math.min(...E.shipCells(lead).map(c => c[1])) < SHELTER.y0) {
    const D = waterField(st, E.shipCells(lead));
    moveBest(st, k, (x, y, rot) => { const d = Math.min(...E.shipCells({ ...k, x, y, rot }).map(([a, b]) => D[b * st.W + a])); return d >= 2 ? d - 2 : 2 - d; });
    return;
  }
  const spots = [];
  for (let y = SHELTER.y0; y <= SHELTER.y1; y++) for (let x = SHELTER.x0; x <= SHELTER.x1; x++) if (!E.isLand(st, x, y)) spots.push([x, y]);
  const D = waterField(st, spots);
  moveBest(st, k, (x, y, rot) => Math.max(...E.shipCells({ ...k, x, y, rot }).map(([a, b]) => D[b * st.W + a])));
}
