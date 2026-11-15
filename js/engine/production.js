// Shipyards: ships are paid for up front, built over a few turns, and launched next to the yard.
//
// Yards: your Home Yard (the spawn strip), every forward port, and every finished Dry Dock.
// player.builds = [{ id, ship, yard, left, total, paid }] — in order; each yard works on its
// first `slots` ships, the rest wait in line. When `left` reaches 0 the ship appears next to
// the yard at the start of your turn, ready to go.
import { PLATFORMS } from '../data/bases.js';
import { QUEUE, YARDS } from '../data/production.js';
import { TECH } from '../data/research.js';
import { SHIPS } from '../data/ships.js';
import { activePlatforms } from './bases.js';
import { cellsOf, coord, inBounds, inSpawn, isLand } from './geometry.js';
import { pstat, shipStat } from './modifiers.js';
import { shipNeeds, shipUnlocked } from './research.js';
import { addShip } from './setup.js';
import { forwardPorts } from './stats.js';
import { fail, log, ok, rigAt, shipAt } from './util.js';
import { platformAt } from './bases.js';

export const shipCost = (st, p, type) => shipStat(st, p, type, 'cost');

// Every yard player p can build at right now.
export function yardsOf(st, p) {
  const sp = st.players[p].spawn;
  const list = [{ id: 'home', kind: 'home', name: YARDS.home.name, x: Math.round((sp.x0 + sp.x1) / 2), y: Math.round((sp.y0 + sp.y1) / 2), ...YARDS.home }];
  for (const o of forwardPorts(st, p))
    list.push({ id: o.id, kind: 'port', ...YARDS.port, name: `Port ${coord(o.x, o.y)}`, x: o.x, y: o.y, r: pstat(st, p, 'portRange') });
  for (const d of activePlatforms(st, p, 'drydock'))
    list.push({ id: d.id, kind: 'drydock', ...YARDS.drydock, name: `Dry Dock ${coord(d.x, d.y)}`, x: d.x, y: d.y, r: PLATFORMS.drydock.launch });
  return list;
}
export const yardById = (st, p, id) => yardsOf(st, p).find(y => y.id === id);

export const buildTurns = (st, p, type, yard) => Math.max(1, shipStat(st, p, type, 'build') - (yard?.faster || 0));

export const buildsOf = (st, p) => (st.players[p].builds ||= []);
export const yardQueue = (st, p, yardId) => buildsOf(st, p).filter(b => b.yard === yardId);

// Ships of a type you own plus ones being built (for ships with a fleet limit).
const ownedOrBuilding = (st, p, type) =>
  st.ships.filter(s => s.owner === p && s.type === type).length + buildsOf(st, p).filter(b => b.ship === type).length;

export function buildProblem(st, p, type, yardId) {
  const def = SHIPS[type];
  if (!def || def.hidden) return 'Unknown ship.';
  if (!shipUnlocked(st, p, type)) return `Research ${TECH[shipNeeds(type)]?.name || '?'} first.`;
  const yard = yardById(st, p, yardId || 'home');
  if (!yard) return 'That shipyard is gone.';
  if (yardQueue(st, p, yard.id).length >= QUEUE.max) return `${yard.name} is full (${QUEUE.max} ships in line).`;
  const lim = def.passives?.limit;
  if (lim && ownedOrBuilding(st, p, type) >= lim) return `Limit ${lim}.`;
  if (st.players[p].money < shipCost(st, p, type)) return 'Not enough money.';
  return null;
}

// "buyShip" { ship, yard }: pay now, the yard starts building.
export function doBuyShip(st, a) {
  const p = st.current;
  const why = buildProblem(st, p, a.ship, a.yard);
  if (why) return fail(why);
  const yard = yardById(st, p, a.yard || 'home');
  const cost = shipCost(st, p, a.ship), turns = buildTurns(st, p, a.ship, yard);
  st.players[p].money -= cost;
  buildsOf(st, p).push({ id: 'b' + st.nextId++, ship: a.ship, yard: yard.id, left: turns, total: turns, paid: cost });
  const ahead = yardQueue(st, p, yard.id).length - 1;
  log(st, p, `${yard.name} started a ${SHIPS[a.ship].name}: ready in ${turns} turn${turns > 1 ? 's' : ''}${ahead >= yard.slots ? ` once the ${ahead - yard.slots + 1} ahead of it are done` : ''}.`);
  return ok();
}

// "cancelBuild" { buildId }: full refund if work hasn't started, half if it has.
export function doCancelBuild(st, a) {
  const p = st.current, list = buildsOf(st, p);
  const b = list.find(x => x.id === a.buildId);
  if (!b) return fail('Nothing to cancel.');
  const started = b.left < b.total;
  const refund = started ? Math.floor(b.paid * QUEUE.refundStarted) : b.paid;
  st.players[p].money += refund;
  st.players[p].builds = list.filter(x => x !== b);
  log(st, p, `Cancelled a ${SHIPS[b.ship].name} (refunded $${refund}).`);
  return ok();
}

// Is there room for a new ship of this type here? Everything counts (even enemies you can't see:
// the yard crew can look out of the window).
function freeSpot(st, p, cells) {
  for (const [x, y] of cells) {
    if (!inBounds(st, x, y) || isLand(st, x, y)) return false;
    if (st.blocked && st.blocked.includes(x + ',' + y)) return false;
    if (shipAt(st, x, y) || rigAt(st, x, y) || platformAt(st, x, y)) return false;
    if (st.mines.some(m => m.owner !== p && m.x === x && m.y === y)) return false;
  }
  return true;
}

// Where a finished ship appears: the free spot closest to the yard.
export function launchSpot(st, p, type, yard) {
  const sp = st.players[p].spawn;
  let cands = [];
  if (yard.kind === 'home') {
    for (let y = sp.y0; y <= sp.y1; y++) for (let x = sp.x0; x <= sp.x1; x++) cands.push([x, y]);
  } else {
    for (let dy = -yard.r; dy <= yard.r; dy++) for (let dx = -yard.r; dx <= yard.r; dx++) cands.push([yard.x + dx, yard.y + dy]);
  }
  cands.sort((a, b) => (Math.abs(a[0] - yard.x) + Math.abs(a[1] - yard.y)) - (Math.abs(b[0] - yard.x) + Math.abs(b[1] - yard.y)));
  const inside = (x, y) => yard.kind === 'home' ? inSpawn(st, p, x, y) : Math.max(Math.abs(x - yard.x), Math.abs(y - yard.y)) <= yard.r;
  // first try to leave a square of open water around the new ship (so nobody gets boxed in), then take any gap
  const roomy = cells => cells.every(([cx, cy]) => [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
    .every(([dx, dy]) => !shipAt(st, cx + dx, cy + dy)));
  for (const pass of [roomy, () => true])
    for (const [x, y] of cands)
      for (const rot of [0, 1, 2, 3]) {
        const cells = cellsOf(type, x, y, rot);
        if (cells.every(([cx, cy]) => inside(cx, cy)) && freeSpot(st, p, cells) && pass(cells)) return { x, y, rot };
      }
  return null;
}

// Start of your turn: yards work on their ships, and finished ones are launched.
export function processYards(st, p) {
  const list = buildsOf(st, p);
  if (!list.length) return;
  const yards = yardsOf(st, p);
  // a yard that was destroyed hands its work to the Home Yard
  for (const b of list) if (!yards.some(y => y.id === b.yard)) {
    log(st, p, `A shipyard was lost: its ${SHIPS[b.ship].name} moves to the Home Yard.`);
    b.yard = 'home';
  }
  const done = [];
  for (const yard of yards) {
    const q = list.filter(b => b.yard === yard.id).slice(0, yard.slots);
    for (const b of q) {
      if (b.left > 0) b.left--;
      if (b.left > 0) continue;
      const spot = launchSpot(st, p, b.ship, yard);
      if (!spot) { if (!b.waiting) log(st, p, `${yard.name}: a finished ${SHIPS[b.ship].name} is waiting for room to launch.`); b.waiting = true; continue; }
      addShip(st, p, b.ship, spot.x, spot.y, spot.rot, true);
      log(st, p, `${yard.name} launched a ${SHIPS[b.ship].name} at ${coord(spot.x, spot.y)}.`);
      done.push(b);
    }
  }
  if (done.length) st.players[p].builds = list.filter(b => !done.includes(b));
}
