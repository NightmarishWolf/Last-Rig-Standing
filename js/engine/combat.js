// Resolving shots: interception, screening, armor, damage, and sinking.
import { SHIPS } from '../data/ships.js';
import { coord, dist, inBounds, shipCells, zoneOf } from './geometry.js';
import { log, passives, pname, portAt, rigAt, shipAt } from './util.js';
import { PLATFORMS } from '../data/bases.js';
import { baseById, wreckBase } from './bases.js';
import { shipStat, weaponStat } from './modifiers.js';

export function resolveShot(st, ship, act, tx, ty) {
  const p = ship.owner;
  const me = st.players[p];
  const record = r => me.shots.push({ x: tx, y: ty, r, turn: st.turnCount });
  // whoever owns the waters, plus whoever gets hit, sees the splash
  const notify = new Set();
  const zone = zoneOf(st, tx, ty);
  if (zone !== 'middle' && zone !== p) notify.add(zone);

  if (act.air) {
    // frigates, then AA platforms, can each stop one missile/airstrike per round
    const fr = st.ships.find(s => s.owner !== p && passives(s).airDefense && !s.adUsed &&
      dist(shipCells(s), [[tx, ty]]) <= passives(s).airDefense) ||
      (st.platforms || []).find(o => o.owner !== p && o.kind === 'aa' && !o.buildLeft && !o.adUsed &&
        !baseById(st, o.baseId)?.wrecked && dist([[o.x, o.y]], [[tx, ty]]) <= PLATFORMS.aa.airDefense);
    if (fr) {
      fr.adUsed = true;
      record('intercepted');
      log(st, p, `${act.name} was intercepted by enemy air defense!`);
      log(st, fr.owner, `Your ${fr.kind ? 'AA Platform' : 'Frigate'} intercepted an incoming ${act.name.toLowerCase()} from ${pname(st, p)}.`);
      notify.add(fr.owner);
      notify.forEach(o => st.players[o].incoming.push({ x: tx, y: ty, turn: st.turnCount }));
      return;
    }
  }
  const squares = [];
  const r = act.area === 3 ? 1 : 0;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++)
    if (inBounds(st, tx + dx, ty + dy)) squares.push([tx + dx, ty + dy]);

  const dmgOf = (target) => Math.max(0, weaponStat(st, p, act, 'dmg') - (target ? shipStat(st, target.owner, target.type, 'armor') : 0));
  const structDmg = weaponStat(st, p, act, 'dmg') * (act.rigMult || 1);
  const hitShips = new Set();
  let anyHit = false, sunkName = null;
  for (const [x, y] of squares) {
    let target = shipAt(st, x, y, s => s.owner !== p);
    if (target && act.subsOnly && !passives(target).submerged) target = null;
    if (target && !hitShips.has(target.id)) {
      hitShips.add(target.id);
      const e = target.owner;
      notify.add(e);
      // corvette screen
      const tc = shipCells(target);
      const cv = st.ships.find(s => s.owner === e && s.id !== target.id && passives(s).screen && !s.screenUsed &&
        dist(shipCells(s), tc) <= 1);
      if (cv) { cv.screenUsed = true; log(st, e, `Your Corvette screened a hit meant for your ${SHIPS[target.type].name}.`); target = cv; }
      const dmg = dmgOf(target);
      target.hp -= dmg;
      target.combatRound = st.round; // seen combat (can't be sold for a while)
      anyHit = true;
      log(st, e, `Your ${SHIPS[target.type].name} was hit for ${dmg} damage by ${pname(st, p)} (${Math.max(0, target.hp)}/${shipStat(st, e, target.type, 'hp')} HP).`);
      if (target.hp <= 0) { sunkName = SHIPS[target.type].name; sink(st, target); }
      continue;
    }
    if (!act.subsOnly) {
      const port = portAt(st, x, y);
      if (port && port.owner !== p) {
        const e = port.owner;
        notify.add(e);
        port.hp -= structDmg;
        anyHit = true;
        if (port.hp <= 0) {
          st.ports = st.ports.filter(o => o !== port);
          log(st, p, `You destroyed ${pname(st, e)}'s forward port at ${coord(x, y)}!`);
          log(st, e, `Your forward port at ${coord(x, y)} was destroyed by ${pname(st, p)}!`);
          sunkName = sunkName || 'rig';
        } else log(st, e, `Your forward port at ${coord(x, y)} was hit by ${pname(st, p)}!`);
        continue;
      }
      const plat = (st.platforms || []).find(o => o.x === x && o.y === y);
      if (plat && plat.owner !== p) {
        const e = plat.owner, name = PLATFORMS[plat.kind].name;
        notify.add(e);
        plat.hp -= structDmg;
        anyHit = true;
        if (plat.hp <= 0) {
          st.platforms = st.platforms.filter(o => o !== plat);
          log(st, p, `You destroyed ${pname(st, e)}'s ${name} at ${coord(x, y)}!`);
          log(st, e, `Your ${name} at ${coord(x, y)} was destroyed by ${pname(st, p)}!`);
          sunkName = sunkName || 'rig';
        } else log(st, e, `Your ${name} at ${coord(x, y)} was hit by ${pname(st, p)}!`);
        continue;
      }
      const rig = rigAt(st, x, y);
      if (rig && rig.owner !== p) {
        const e = rig.owner;
        notify.add(e);
        rig.hp -= structDmg;
        anyHit = true;
        if (rig.hp <= 0) {
          st.rigs = st.rigs.filter(o => o !== rig);
          const b = rig.center && baseById(st, rig.baseId);
          if (b) wreckBase(st, b, p);
          else {
            log(st, p, `You destroyed ${pname(st, e)}'s oil rig at ${coord(x, y)}!`);
            log(st, e, `Your oil rig at ${coord(x, y)} was destroyed by ${pname(st, p)}!`);
          }
          sunkName = sunkName || 'rig';
        } else {
          log(st, e, `Your oil rig at ${coord(x, y)} was hit by ${pname(st, p)}!`);
        }
      }
    }
  }
  notify.forEach(o => st.players[o].incoming.push({ x: tx, y: ty, turn: st.turnCount }));
  record(sunkName ? 'sunk' : anyHit ? 'hit' : 'miss');
  if (sunkName && sunkName !== 'rig') log(st, p, `You sank an enemy ${sunkName}!`);
  else if (anyHit && !sunkName) log(st, p, `${act.name}: HIT at ${coord(tx, ty)}!`);
  else if (!anyHit) log(st, p, `${act.name}: miss at ${coord(tx, ty)}.`);
}

export function sink(st, ship) {
  st.ships = st.ships.filter(s => s !== ship);
  st.wrecks.push({ id: 'w' + st.nextId++, cells: shipCells(ship), type: ship.type, value: shipStat(st, ship.owner, ship.type, 'cost') });
  log(st, ship.owner, `Your ${SHIPS[ship.type].name} was sunk!`);
}
