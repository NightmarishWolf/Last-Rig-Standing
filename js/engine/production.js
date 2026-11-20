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
import { commanderShipOk, shipNeeds, shipUnlocked } from './research.js';
import { COMMANDERS, EXCLUSIVE_LEVEL } from '../data/commanders.js';
import { addShip } from './setup.js';
import { forwardPorts } from './stats.js';
import { fail, log, ok, rigAt, shipAt, tally, tallyUnit } from './util.js';
import { platformAt } from './bases.js';
import { inTideOf, packSize, raftDocks } from './factions.js';

export const shipCost = (st, p, type) => shipStat(st, p, type, 'cost');

// Every yard player p can build at right now.
export function yardsOf(st, p) {
  const sp = st.players[p].spawn;
  const list = [{ id: 'home', kind: 'home', name: YARDS.home.name, x: Math.round((sp.x0 + sp.x1) / 2), y: Math.round((sp.y0 + sp.y1) / 2), ...YARDS.home }];
  for (const o of forwardPorts(st, p))
    list.push({ id: o.id, kind: 'port', ...YARDS.port, name: `Port ${coord(o.x, o.y)}`, x: o.x, y: o.y, r: pstat(st, p, 'portRange') });
  for (const d of activePlatforms(st, p, 'drydock'))
    list.push({ id: d.id, kind: 'drydock', ...YARDS.drydock, name: `Dry Dock ${coord(d.x, d.y)}`, x: d.x, y: d.y, r: PLATFORMS.drydock.launch });
  // Free Tide: every base with a big enough Tide is a Raft Dock (boats launch anywhere on its Tide)
  for (const y of raftDocks(st, p)) list.push({ ...YARDS.tide, ...y });
  return list;
}
export const yardById = (st, p, id) => yardsOf(st, p).find(y => y.id === id);

export const buildTurns = (st, p, type, yard) =>
  Math.max(1, shipStat(st, p, type, 'build') - (yard?.faster || 0) - (st.players[p].bonus?.build || 0)); // (Admiral+ bots build faster)

export const buildsOf = (st, p) => (st.players[p].builds ||= []);
export const yardQueue = (st, p, yardId) => buildsOf(st, p).filter(b => b.yard === yardId);

// Ships of a type you own plus ones being built (for ships with a fleet limit).
const ownedOrBuilding = (st, p, type) =>
  st.ships.filter(s => s.owner === p && s.type === type).length + buildsOf(st, p).filter(b => b.ship === type).length;

export function buildProblem(st, p, type, yardId) {
  const def = SHIPS[type];
  if (!def || def.hidden || (def.polar && !st.ice)) return 'Unknown ship.';
  if (def.faction && def.faction !== (st.players[p].faction || 'navy')) return "That's another faction's ship.";
  if (!commanderShipOk(st, p, type)) return `Only ${COMMANDERS[def.commander].name} (level ${EXCLUSIVE_LEVEL}+) can build the ${def.name}.`;
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
  const b = { id: 'b' + st.nextId++, ship: a.ship, yard: yard.id, left: turns, total: turns, paid: cost };
  buildsOf(st, p).push(b);
  const ahead = yardQueue(st, p, yard.id).length - 1;
  // (Ruiz's Born Ready: a Skiff Pack launches right away if the yard has a free slot)
  if (SHIPS[a.ship].pack && pstat(st, p, 'packInstant') > 0 && ahead < yard.slots && launchBuild(st, p, b, yard)) {
    st.players[p].builds = buildsOf(st, p).filter(x => x !== b);
    return ok();
  }
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
  const tide = yard.kind === 'tide' ? [{ x: yard.x, y: yard.y, r: yard.r }] : null;
  const inside = (x, y) => yard.kind === 'home' ? inSpawn(st, p, x, y) : tide ? inTideOf(tide, x, y) : Math.max(Math.abs(x - yard.x), Math.abs(y - yard.y)) <= yard.r;
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
// Launch a finished build from its yard (a pack launches all its boats, if there's room). True when done.
function launchBuild(st, p, b, yard) {
  // (b.boats: how many are still to go, if there wasn't room for all at once)
  b.boats ??= packSize(st, p, b.ship);
  const each = (b.paid ?? shipStat(st, p, b.ship, 'cost')) / packSize(st, p, b.ship);
  let first = null;
  while (b.boats > 0) {
    const spot = launchSpot(st, p, b.ship, yard);
    if (!spot) break;
    addShip(st, p, b.ship, spot.x, spot.y, spot.rot, true);
    b.boats--; first ||= spot;
    tally(st, p, 'shipsBuilt');
    tallyUnit(st, p, b.ship, 'built'); tallyUnit(st, p, b.ship, 'value', each);
  }
  if (first) log(st, p, `${yard.name} launched a ${SHIPS[b.ship].name} at ${coord(first.x, first.y)}.`, { k: 'done', x: first.x, y: first.y });
  if (b.boats > 0) { if (!b.waiting) log(st, p, `${yard.name}: a finished ${SHIPS[b.ship].name} is waiting for room to launch.`, { k: 'fleet' }); b.waiting = true; return false; }
  return true;
}

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
      if (launchBuild(st, p, b, yard)) done.push(b);
    }
  }
  if (done.length) st.players[p].builds = list.filter(b => !done.includes(b));
}
