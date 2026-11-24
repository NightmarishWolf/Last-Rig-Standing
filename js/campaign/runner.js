// ============================================================
// Running a campaign mission: building its game from the hand-made map, moving through its steps
// (each with dialogue, an instruction and a check), firing its triggers, playing the scripted enemy,
// and deciding when it's won or lost. No DOM here: the app (js/app/campaign.js) shows it.
//
// st.campaign = { id, step, queue: [lines], qi (lines read), fired: {trigger ids}, flags: {},
//   track: [ship ids kept on radar], ships0: { id: hp } (your starting fleet), outcome: null|'won'|'lost',
//   wonRound, ach: [achievement ids earned], lastEnemy: {...} }
// ============================================================
import * as E from '../engine/index.js';
import { SHIPS } from '../data/ships.js';
import { COMMANDERS } from '../data/commanders.js';
import { MISSIONS } from './index.js';
import { parseMap } from './mapfile.js';
import { scoreMission } from './score.js';

export const missionOf = st => (st?.campaign ? MISSIONS[st.campaign.id] : null);

// ---------- helpers the missions use ----------
export const H = {
  ship(st, owner, type, x, y, { rot = 0, id } = {}) {
    const s = {
      id: id || 's' + st.nextId++, owner, type, x, y, rot, hp: SHIPS[type].hp,
      movesLeft: SHIPS[type].move, acted: false, shotsLeft: 0, activeAction: null,
      cooldowns: {}, freeUsed: {}, screenUsed: false, adUsed: false,
    };
    st.ships.push(s);
    return s;
  },
  get: (st, id) => st.ships.find(s => s.id === id),
  // any ship of owner's within r squares of (x, y)
  near: (st, owner, x, y, r) => st.ships.some(s => s.owner === owner && E.dist(E.shipCells(s), [[x, y]]) <= r),
  distTo: (st, a, b) => E.dist(E.shipCells(a), E.shipCells(b)),
  seen: (st, id) => E.visibility(st, 0).ident.has(id),     // in plain sight of your ships
  spotted: (st, id) => E.visibility(st, 0).ships.has(id),  // seen, or a contact
  say(st, lines) { st.campaign.queue.push(...lines); },
  achieve(st, id) { if (!st.campaign.ach.includes(id)) st.campaign.ach.push(id); },
};

// ---------- a new mission ----------
// opts.choices: what you decided in earlier missions (from your profile), e.g. { drilledBracken: true }
export function newMissionGame(id, opts = {}) {
  const def = MISSIONS[id];
  const map = parseMap(def.map);
  const cmd = COMMANDERS[def.commander.id];
  const st = E.newGame({
    seed: def.seed || 1, turnTimer: 0, fog: 'on',
    seats: [
      { seat: 'human', faction: def.faction, commander: def.commander.id, level: def.commander.level, name: cmd?.name || 'You' },
      // (a mission's enemy is scripted, or with def.enemy.ai a real computer player: { difficulty, personality, commander, level })
      def.enemy.ai
        ? { seat: 'ai', faction: def.enemy.faction, difficulty: def.enemy.ai.difficulty, personality: def.enemy.ai.personality, commander: def.enemy.ai.commander, level: def.enemy.ai.level }
        : { seat: 'human', faction: def.enemy.faction, name: def.enemy.name },
      // (more sides, each scripted by the mission: def.others = [{ faction, name }])
      ...(def.others || []).map(o => ({ seat: 'human', faction: o.faction, name: o.name })),
    ],
    scenario: {
      W: map.W, H: map.H, land: map.land, mapType: def.mapType, homes: def.homes,
      build(st) {
        st.campaign = { id, step: -1, queue: [], qi: 0, fired: {}, flags: {}, track: [], ships0: {}, outcome: null, ach: [], locked: [], choices: { ...(opts.choices || {}) } };
        st.rigs = []; st.bases = []; st.platforms = []; st.ports = []; st.ships = []; st.deposits = [];
        def.setup(st, map.marks, H);
        for (const s of st.ships.filter(s => s.owner === 0)) st.campaign.ships0[s.id] = s.hp;
      },
    },
  });
  st.players.forEach((pl, i) => { pl.hideHome = i !== 0; });
  if (def.enemy.ai) st.players[1].name = def.enemy.name;
  (def.others || []).forEach((o, i) => { st.players[2 + i].name = o.name; });
  st.players[0].log = st.players[0].log.filter(l => !/outlast the enemy/.test(l.text)); // (the skirmish welcome doesn't belong here)
  enterStep(st, 0);
  return st;
}

const talkDone = M => M.qi >= M.queue.length;
export const currentLine = st => (st.campaign && !talkDone(st.campaign) ? st.campaign.queue[st.campaign.qi] : null);
export const currentStep = st => missionOf(st)?.steps[st.campaign.step] || null;
// (a line with a choice on it waits for an answer: Next and Skip stop there)
export function readLine(st) { const M = st.campaign; if (M && !talkDone(M) && !M.queue[M.qi].choice) M.qi++; }
export function skipTalk(st) {
  const M = st.campaign; if (!M) return;
  while (!talkDone(M) && !M.queue[M.qi].choice) M.qi++;
}
// A choice in the dialogue: line.choice = { id, options: [{ id, label }] }. The answer goes in
// M.picked[id] and to the mission's onChoice(st, M, H, choiceId, optionId), which can queue the replies.
export const pendingChoice = st => currentLine(st)?.choice || null;
export function choose(st, optionId) {
  const M = st.campaign, c = pendingChoice(st);
  if (!c || !c.options.some(o => o.id === optionId)) return false;
  (M.picked ||= {})[c.id] = optionId;
  M.qi++;
  missionOf(st).onChoice?.(st, M, H, c.id, optionId);
  update(st);
  return true;
}

function enterStep(st, i, ui = {}) {
  const M = st.campaign, def = missionOf(st);
  M.step = i; M.stepRound = st.round;
  const s = def.steps[i];
  if (!s) return;
  s.enter?.(st, M, H);
  // (a step you've already done by the time you get to it is passed by quietly)
  if (s.say && !(i > 0 && s.check?.(st, M, H, ui))) H.say(st, s.say);
}

// After every action (and every redraw): triggers, step checks, win and loss. Returns true if anything changed.
export function update(st, ui = {}) {
  const M = st.campaign, def = missionOf(st);
  if (!M || M.outcome || st.phase !== 'playing') return false;
  const before = JSON.stringify([M.step, M.queue.length, M.qi, M.fired, M.flags, M.ach]);
  keepTracks(st);
  def.watch?.(st, M, H); // (a mission's own bookkeeping, before its triggers and goals are checked)
  for (const t of def.triggers || []) {
    if (M.fired[t.id] || !t.when(st, M, H)) continue;
    M.fired[t.id] = st.round;
    t.then?.(st, M, H);
    if (t.say) H.say(st, t.say);
  }
  let guard = 0;
  while (talkDone(M) && def.steps[M.step] && def.steps[M.step].check?.(st, M, H, ui) && guard++ < 20) {
    def.steps[M.step].done?.(st, M, H);
    enterStep(st, M.step + 1, ui);
  }
  if (!M.wonRound && def.won(st, M, H)) { M.wonRound = st.round; def.onWin?.(st, M, H); for (const a of def.achievementsOnWin?.(st, M) || []) H.achieve(st, a); }
  if (M.wonRound && talkDone(M)) M.outcome = 'won';
  else if (!M.wonRound && def.lost(st, M, H)) { M.outcome = 'lost'; def.onLose?.(st, M, H); }
  keepTracks(st);
  return before !== JSON.stringify([M.step, M.queue.length, M.qi, M.fired, M.flags, M.ach]);
}

// contacts the mission keeps on your radar: shown as "?" until you see them
function keepTracks(st) {
  const rev = st.players[0].reveals.ships;
  for (const id of st.campaign.track) if (H.get(st, id) && !rev.includes(id)) rev.push(id);
}

// A mission's own business as you end your turn (before your voyages and standing orders run):
// e.g. an escorted ship sailing on.
E.turnHooks.beforeEndTurn = st => {
  const def = missionOf(st), M = st.campaign;
  if (def && !M.outcome && st.current === 0) def.beforeEndTurn?.(st, M, H);
  // (a computer enemy's turn: the mission's own scripted business on that side, e.g. ambushes)
  if (def && !M.outcome && st.current !== 0 && st.players[st.current].seat === 'ai') def.enemyTurn?.(st, M, H, st.current);
};

// The scripted enemy's turn (the app calls this when it's the enemy's go), then back to you.
export function enemyTurn(st) {
  const M = st.campaign, def = missionOf(st);
  if (!M || st.phase !== 'playing') return;
  while (st.current !== 0 && st.phase === 'playing') {
    if (!M.outcome && st.players[st.current].seat !== 'ai') def.enemyTurn?.(st, M, H, st.current);
    E.applyAction(st, { type: 'endTurn' });
  }
  update(st);
}

// the goals as they stand (a mission in acts can change them: goals.mainNow / loseNow (st, M))
export function goalsNow(st) {
  const def = missionOf(st), M = st.campaign;
  return { main: def.goals.mainNow?.(st, M) || def.goals.main, lose: def.goals.loseNow?.(st, M) || def.goals.lose };
}

// ---------- the result ----------
export function missionResult(st) {
  const M = st.campaign, def = missionOf(st);
  const rounds = M.wonRound || st.round;
  let had = 0, kept = 0, lost = 0;
  for (const [id, hp] of Object.entries(M.ships0)) {
    const s = H.get(st, id);
    had += hp; kept += s ? Math.min(hp, s.hp) : 0; if (!s) lost++;
  }
  const keptShare = had ? kept / had : 1;
  // (a mission can add rounds to its par for a choice that costs time: def.parBonus(st, M))
  const ctx = { rounds, par: def.par + (def.parBonus?.(st, M) || 0), keptShare, shipsLost: lost };
  const secondary = (def.secondary || []).map(g => ({ id: g.id, name: g.name, desc: g.desc, done: !!g.done(st, M, ctx) }));
  const res = { ...ctx, secondary, ...scoreMission({ ...ctx, secondary }), choices: def.choices?.(st, M) || null };
  // a mission can round a rank up (e.g. an S on Reprisal's merciful ending counts as S+): def.rankUp → { rank, note }
  const up = def.rankUp?.(st, M, res);
  if (up) Object.assign(res, { rank: up.rank, rankNote: up.note });
  return res;
}

// ---------- what the board shows ----------
export function markers(st) {
  const s = currentStep(st), M = st.campaign;
  if (!s || !M || M.outcome) return [];
  const m = typeof s.markers === 'function' ? s.markers(st, M, H) : s.markers;
  return talkDone(M) ? m || [] : [];
}
// the briefing (some depend on what you chose in earlier missions)
export const briefingOf = (def, choices = {}) => (typeof def.briefing === 'function' ? def.briefing(choices) : def.briefing);
export const props = st => { const p = missionOf(st)?.props; return typeof p === 'function' ? p(st, st.campaign) : p || []; };
