// ============================================================
// NAVY · MISSION 7 · BRACKEN
// Bracken Bank, November 2061. The Allocation Council raises the quotas and orders Bracken Bank drilled
// at last: its richest deposit lies under Bracken Point's fishing grounds. Ortiz has to pump the quota
// while Mother Ruiz (the skirmish AI: Hard, Tycoon, Endless Swarm) races him for the bank's oil.
// The choice (round 3, buttons): clear the village now (the deposit opens at once; Maren's people join
// Ruiz), or give them time (escort their fishing boats out west; the deposit opens when they're gone).
// Mission 2's choice decides how Maren greets him. Hidden: Four Generations (every boat gets out).
// Win: pump the quota from the bank. Lose: Bank Station wrecked, or round 30.
// ============================================================
import * as E from '../../engine/index.js';
import { moveBest, waterField } from '../ai.js';
import { baseOf, council, foundAt, freeDeposit, lost, maren, ortiz, plat, rigOf, ruiz, sato, spawn, vance } from '../kit.js';

const PAR = 25, DEADLINE = 30, QUOTA = 200, EARLY = 18, BUDGET = 100, CHOICE_AT = 3, WAIT = 6;
const BANK = { x0: 11, y0: 5, x1: 30, y1: 22 };
const VILLAGE = [19, 23], EXIT = { x0: 0, y0: 17, x1: 1, y1: 23 };

const pumped = M => Math.floor(M.flags.pumped || 0);
const inBank = (x, y) => x >= BANK.x0 && x <= BANK.x1 && y >= BANK.y0 && y <= BANK.y1;
const bankRigs = st => st.rigs.filter(r => r.owner === 0 && inBank(r.x, r.y));
const cleared = M => M.picked?.bracken === 'clear';
const waiting = M => M.picked?.bracken === 'time';
const boats = st => st.ships.filter(s => s.boat);
const greedy = M => !!M.choices.drilledBracken;

export default {
  id: 'navy-7', arc: 'navy', n: 7,
  title: 'Bracken', place: 'Bracken Bank', date: 'November 2061',
  faction: 'navy', commander: { id: 'ortiz', level: 4 },
  enemy: { faction: 'tide', name: '"Mother" Ruiz', ai: { difficulty: 'hard', personality: 'tycoon', commander: 'ruiz', level: 3 } },
  par: PAR,
  // giving the village time costs rounds the clearing path doesn't: par stretches to match
  parBonus: (st, M) => (M.picked?.bracken === 'time' ? 6 : 0),
  hide: ['victory'],
  summary: 'The Council wants Bracken Bank drilled, village or no village. Ruiz wants its oil too.',
  teaches: ['Quotas', 'Racing for oil', 'Escorting the defenceless'],

  map: `
    ........................................
    ........................................
    ..............###.......................
    ..............###........###............
    .........................###............
    ........###.............................
    ........###.......................B.....
    ........###.........d...................
    .....c..................................
    ..............d.........................
    ......X.................................
    .........c....................##........
    ...A....................d.....##........
    .......D......................##........
    ................d.......................
    ....S...D...........................##..
    ......S.............................##..
    ..........##...............d............
    ..........##............................
    ........................................
    .....##............R.............C......
    .....##........f......f.................
    ..................####..f...............
    ................########................
    ##########......########....############
    ########################################
    ########################################
    ########################################`,
  homes: [
    { home: { x0: 0, y0: 8, x1: 8, y1: 17 }, spawn: { x0: 1, y0: 8, x1: 8, y1: 17 } },
    { home: { x0: 32, y0: 2, x1: 39, y1: 9 }, spawn: { x0: 32, y0: 2, x1: 39, y1: 9 } },
  ],

  setup(st, marks, H) {
    const me = st.players[0], foe = st.players[1], F = st.campaign.flags;
    foundAt(st, 'A', marks.A[0], 0, { capital: true, level: 2, type: 'rich', reserves: 260 });
    const B = foundAt(st, 'B', marks.B[0], 1, { capital: true, level: 2, tideAge: 9, type: 'rich', reserves: 220 }); plat(st, B, 'gun', -1, 1);
    const C = foundAt(st, 'C', marks.C[0], 1, { level: 2, tideAge: 9 });
    if (greedy(st.campaign)) foundAt(st, 'K', [26, 20], 1, { level: 1, tideAge: 6 }); // (Bracken's friends: a raft-town at the village's door)
    marks.d.forEach((at, i) => freeDeposit(st, 'bank' + i, at, i % 2 ? 'medium' : 'small'));
    F.richAt = marks.R[0];
    // Ortiz's squadron and two Survey Ships to found the bank's rigs
    H.ship(st, 0, 'cruiser', ...marks.X[0], { id: 'ca1' }).name = 'Resolute';
    marks.D.forEach(([x, y], i) => H.ship(st, 0, 'destroyer', x, y, { id: 'dd' + (i + 1) }));
    marks.c.forEach(([x, y], i) => H.ship(st, 0, 'corvette', x, y, { id: 'cv' + (i + 1) }));
    marks.S.forEach(([x, y], i) => H.ship(st, 0, 'survey', x, y, { id: 'sv' + (i + 1) }));
    me.research.done.destroyer_program = true;
    me.money = 1300; me.oil = 50;
    // Bracken Point's fishing boats, still drawn up at the jetty
    F.boatSpots = marks.f;
    // Ruiz's boats
    const t = (type, b, dx, dy) => H.ship(st, 1, type, b.x + dx, b.y + dy);
    t('gunboat', B, -3, 1); t('skiff', B, -2, 3); t('prospector', B, 1, 2); t('gunboat', C, -3, 0); t('skiff', C, 2, -2);
    foe.money = 1000; foe.oil = 60;
    me.log = [{ turn: 1, text: 'Bracken Bank. The Council wants its quota.' }]; foe.log = [];
  },

  briefing: c => [
    council("Captain Ortiz. The Allocation Council has revised the northern quotas upward by eleven percent."),
    council("Bracken Bank will be surveyed, drilled and brought into production. You will deliver the first quota from it."),
    ortiz("The bank's richest deposit lies under Bracken Point's fishing grounds. There's a village there.", 'worried'),
    council("We are aware of the village, Captain."),
    vance("You heard them. The bank's yours. Ruiz will be racing you for every barrel, so don't stand about.", 'stern'),
    ...(c.drilledBracken
      ? [sato("Sir... after last spring, Maren Holt won't be pleased to see our flag again.", 'worried')]
      : [sato("Maren Holt remembers we left her grounds alone last spring, sir. That might count for something.")]),
  ],

  goals: {
    main: `Pump ${QUOTA} oil from Bracken Bank`,
    lose: `Bank Station is wrecked, or the quota isn't met by round ${DEADLINE}`,
    deadline: DEADLINE,
    progress: (st, M) => `quota ${Math.min(QUOTA, pumped(M))}/${QUOTA} · ${bankRigs(st).length} rigs on the bank`,
  },
  secondary: [
    { id: 'early', name: 'Ahead of Quota', desc: `Meet the quota by round ${EARLY}`, done: (st, M) => (M.wonRound || st.round) <= EARLY, live: st => st.round <= EARLY },
    { id: 'market', name: 'Brine Market', desc: "Clear Ruiz's base, Brine Market", done: st => lost(st, 'B', 1), live: () => true },
    { id: 'rigs', name: 'Held', desc: 'Lose no rig you found on the bank', done: (st, M) => !M.flags.rigLost, live: (st, M) => !M.flags.rigLost },
  ],
  clearAchievement: 'bracken',

  steps: [
    {
      id: 'survey',
      say: [sato("Survey Ships first, sir. Sound the bank's deposits, then found rigs on them. Every barrel they pump counts toward the quota.")],
      do: 'Send your <b>Survey Ships</b> onto Bracken Bank: survey its deposits and <b>found rigs</b> on them.',
      markers: [{ ...BANK, label: 'Bracken Bank' }],
      check: st => bankRigs(st).length >= 1 || st.round >= 6,
    },
    {
      id: 'quota',
      do: (st, M) => `Pump the quota: <b>${pumped(M)}/${QUOTA}</b> oil from the bank so far, from ${bankRigs(st).length} rig${bankRigs(st).length === 1 ? '' : 's'}.`
        + (waiting(M) && boats(st).length ? ' Escort Bracken Point\'s fishing boats out to the <b>west edge</b>.' : ''),
      markers: (st, M) => [{ ...BANK, label: 'Bracken Bank' }, ...(waiting(M) && boats(st).length ? [{ ...EXIT, label: 'Out' }] : [])],
      check: () => false,
    },
  ],

  triggers: [
    {
      id: 'race', when: st => (st.bases || []).some(b => b.owner === 1 && !b.wrecked && inBank(b.x, b.y)),
      say: [sato("Ruiz has a raft-town on the bank now, sir. Every rig she founds is oil we don't get.", 'worried')],
    },
    { id: 'half', when: (st, M) => pumped(M) >= QUOTA / 2, say: [sato("Halfway to quota, sir.", 'pleased')] },
    { id: 'rigLost', when: (st, M) => !!M.flags.rigLost, say: [sato("We've lost a rig on the bank!", 'worried')] },
    { id: 'boatLost', when: (st, M) => (M.flags.boatsLost || 0) >= 1, say: [maren("One of my boats is gone, Captain. You said you'd see us out.", 'stern')] },
  ],

  // the choice and the fishing boats run here, as your turn ends
  beforeEndTurn(st, M, H) {
    const F = M.flags;
    // the quota: what the bank's rigs pump this turn
    F.pumped = (F.pumped || 0) + bankRigs(st).reduce((t, r) => t + E.rigRate(st, r), 0);
    // rigs lost
    const n = bankRigs(st).length; if (n < (F.rigsHad || 0)) F.rigLost = true; F.rigsHad = n;
    st.players[0].money += BUDGET;
    // the village's boats sail for the west edge (once you've chosen to wait), and are gone there
    if (waiting(M)) {
      if (!F.boatsSpawned) {
        F.boatsSpawned = true;
        F.boats = F.boatSpots.map(([x, y], i) => { const s = H.ship(st, 0, 'refugee', x, y, { id: 'boat' + i }); s.boat = true; s.ownFuel = true; s.onLoan = true; s.name = ['the Kittiwake', 'the Fourth Gen', 'the Holt'][i]; M.locked.push(s.id); return s.id; });
      }
      const out = []; for (let y = EXIT.y0; y <= EXIT.y1; y++) for (let x = EXIT.x0; x <= EXIT.x1; x++) if (!E.isLand(st, x, y)) out.push([x, y]);
      for (const id of F.boats) {
        const b = H.get(st, id);
        if (!b) { if (!(F.gone || []).includes(id) && !(F.dead || []).includes(id)) { (F.dead ||= []).push(id); F.boatsLost = (F.boatsLost || 0) + 1; } continue; }
        const blocked = new Set(); for (const s of st.ships) if (s !== b) for (const [a, c] of E.shipCells(s)) blocked.add(a + ',' + c);
        const D = waterField(st, out, { blocked });
        moveBest(st, b, (x, y, rot) => Math.min(...E.shipCells({ ...b, x, y, rot }).map(([a, c]) => D[c * st.W + a])), { script: true });
        if (E.shipCells(b).some(([x]) => x <= EXIT.x1)) { st.ships = st.ships.filter(s => s !== b); (F.gone ||= []).push(id); }
      }
      if (!F.boatsDone && F.boats.every(id => !H.get(st, id))) {
        F.boatsDone = st.round;
        openRich(st, M);
        H.say(st, F.boatsLost
          ? [maren(`That's what's left of us out, Captain. Drill your bank.`, 'stern')]
          : [maren("All three boats out, every soul aboard. Four generations on this water, Captain. We'll find another.", 'worried'), ortiz("I'm sorry, Maren.", 'worried'), maren("I know you are. That's why I'm still talking to you.")]);
      } else if (!F.boatsDone && st.round >= F.waitFrom + WAIT) {
        F.boatsDone = st.round; openRich(st, M);
        H.say(st, [council("The Council's patience is exhausted, Captain. The deposit is open. Proceed.")]);
      }
    }
  },

  // (Ruiz's turn: the computer plays her; the mission adds the Council's order and its fallout)
  enemyTurn(st, M, H) {
    const F = M.flags;
    if (st.round === CHOICE_AT - 1 && !F.asked) {
      F.asked = true;
      H.say(st, [
        council("Captain. Bracken Point stands on the bank's richest deposit. Clear it."),
        ...(greedy(M)
          ? [maren("So that's how it ends. You took our grounds last spring, and now you've come for our houses.", 'stern'), maren("Give us a few days to get the boats out. Or don't. I can't stop you.", 'stern')]
          : [maren("Captain Ortiz. You left our grounds alone once. I'm asking you to remember that.", 'worried'), maren("Give us a few days. We'll take the boats and go. Nobody has to burn.", 'worried')]),
        sato("Sir, if we wait, the deposit sits idle and Ruiz gets a head start on the rest of the bank.", 'worried'),
        { ...ortiz("...", 'worried'), choice: { id: 'bracken', options: [{ id: 'clear', label: 'Clear the village now' }, { id: 'time', label: 'Give them time to leave' }] } },
      ]);
    }
  },

  onChoice(st, M, H, id, opt) {
    if (id !== 'bracken') return;
    if (opt === 'clear') {
      M.flags.burned = true;
      openRich(st, M);
      // Maren's people go to Ruiz: their boats turn up on her side, armed
      spawn(st, H, 1, ['skiff', 'skiff', 'gunboat'], { x0: 12, y0: 19, x1: 26, y1: 22 });
      H.say(st, [
        sato("Bracken Point is... it's burning, sir.", 'worried'),
        maren("Remember this, Captain. Every one of us will.", 'stern'),
        ruiz("Maren's people are mine now, Ortiz. You sent them to me.", 'stern'),
      ]);
    } else {
      M.flags.waitFrom = st.round;
      H.say(st, [ortiz("Maren. Get your boats ready. We'll see you out to the west.", 'stern'), council("This delay is noted, Captain."), maren("...Thank you.", 'worried')]);
    }
  },

  won: (st, M) => pumped(M) >= QUOTA,
  onWin: (st, M, H) => H.say(st, [
    sato("That's the quota, sir. Tankers are loading at the bank.", 'pleased'),
    council("The quota is met. The Council is satisfied."),
    ...(M.flags.burned
      ? [ortiz("Satisfied.", 'stern'), vance("Don't look like that, Captain. The lights stay on in eleven cities because of this bank.", 'stern')]
      : [vance("You lost the Council six days of oil being sentimental, Captain. They noticed.", 'stern'), ortiz("Then they can notice that nobody died for it.", 'stern')]),
  ]),
  achievementsOnWin: (st, M) => (waiting(M) && (M.flags.gone || []).length === 3 ? ['four-generations'] : []),
  choices: (st, M) => ({ bracken: M.flags.burned ? 'cleared' : 'evacuated', boatsOut: (M.flags.gone || []).length }),
  lost: (st, M) => lost(st, 'A', 0) || st.round > DEADLINE,
  onLose: (st, M, H) => H.say(st, [council("The quota has not been met. Captain Ortiz is relieved of command.")]),

  props: st => {
    const M = st.campaign;
    return [{ kind: 'village', x: VILLAGE[0], y: VILLAGE[1], label: M.flags.burned ? 'Bracken Point (burnt)' : 'Bracken Point', burnt: !!M.flags.burned },
      ...(!M.flags.boatsSpawned && !M.flags.burned ? [{ kind: 'boats', x: 20, y: 22 }] : [])];
  },
};

// the rich deposit under the fishing grounds opens
function openRich(st, M) {
  if (M.flags.richOpen) return;
  M.flags.richOpen = st.round;
  freeDeposit(st, 'rich', M.flags.richAt, 'rich', 200);
}
