// The side panel (resources, selected ship or base, shipyard, log) and the top bar.
import * as E from '../engine/index.js';
import { BASE_LEVELS, PLATFORMS } from '../data/bases.js';
import { DOMINATION } from '../data/economy.js';
import { TECH } from '../data/research.js';
import { PASSIVE_TEXT, SHIPS } from '../data/ships.js';
import { me, pcol, planRot, pname, selected, selectedBase } from './helpers.js';
import { S } from './state.js';

const CLASS_NAMES = { light: 'Light ships', sub: 'Submarines', escort: 'Escorts', capital: 'Capital ships', support: 'Support' };

// ---------- top bar ----------
export function renderTop() {
  const p = me(), r = S.st.players[p].research;
  const cur = r?.current ? TECH[r.current] : null;
  const left = cur ? E.turnsLeft(S.st, p) : null;
  document.getElementById('turn-info').innerHTML =
    `<b style="color:${pcol(p)}">${pname(p)}</b> · Round ${S.st.round}` +
    ` <button id="btn-research" class="research-btn ${cur ? '' : 'idle'}" title="Open the research tree (T)">🔬 ${cur ? `${cur.name} · ${left === Infinity ? '∞' : left} turn${left === 1 ? '' : 's'}` : 'Choose research'}</button>`;
}

// ---------- panel ----------
export function renderPanel() {
  const st = S.st, p = me(), pl = st.players[p];
  const s = selected(), b = selectedBase();
  const oilTurn = st.rigs.filter(r => r.owner === p).reduce((t, r) => t + E.rigRate(st, r), 0);
  const rp = E.rpIncome(st, p);
  let html = `
  <div class="card">
    <h3>Admirals</h3>
    <div class="row" style="margin-top:0">${st.players.map((o, i) => `<span class="chip ${o.out ? 'out' : ''} ${i === p ? 'me' : ''}" style="--c:${pcol(i)}">${o.name}${o.seat === 'ai' ? ' (CPU)' : ''}${o.out ? ' · out' : ''}${st.domination && o.domStreak > 0 && !o.out ? ` · <b style="color:#ffd666">domination ${o.domStreak}/${DOMINATION.rounds}</b>` : ''}</span>`).join('')}</div>
    ${st.domination ? `<div class="small muted" style="margin-top:6px">Domination: hold rigs on ${E.dominationNeed(st)} of the ${E.dominationDeposits(st).length} rich deposits in No Man's Sea for ${DOMINATION.rounds} rounds to win. You hold ${E.middleRigs(st, p)}.</div>` : ''}
  </div>
  <div class="card">
    <h3>Resources</h3>
    <div class="stats">
      <div class="stat"><span>Money</span><span class="v money">$${pl.money}</span></div>
      <div class="stat"><span>Oil</span><span class="v oil" title="Storage cap: oil pumped past this spills. Storage Tanks and research raise it.">${pl.oil}/${E.oilCapOf(st, p)}</span></div>
      <div class="stat"><span>Oil price</span><span class="v">$${(st.market.price * E.sellMultOf(st, p)).toFixed(2)}</span></div>
      <div class="stat"><span>Oil/turn</span><span class="v oil">+${oilTurn}</span></div>
      <div class="stat"><span>Bases</span><span class="v">${E.basesOf(st, p).filter(x => !x.wrecked).length}</span></div>
      <div class="stat"><span>Fleet</span><span class="v">${st.ships.filter(x => x.owner === p).length} ships</span></div>
      <div class="stat"><span>Upkeep</span><span class="v" style="color:#f09595">−$${E.upkeepTotal(st, p)}/turn</span></div>
      <div class="stat"><span>Research</span><span class="v" style="color:#9fd0ff">+${rp.total} RP</span></div>
    </div>
    <div class="small muted" style="margin-top:6px">Sell oil (price drops as you sell, recovers each turn):</div>
    <div class="row">
      ${[1, 5, 10].map(n => `<button data-sell="${n}" ${pl.oil < n ? 'disabled' : ''}>Sell ${n} ($${E.sellValue(st, n, p).total})</button>`).join('')}
      <button data-sell="all" ${pl.oil < 1 ? 'disabled' : ''}>All</button>
    </div>
    <div class="row">
      <button data-rig="1" class="${S.mode.kind === 'placeRig' ? 'active' : ''}" title="On a discovered deposit next to one of your ships: founds a new rig base. Inside one of your claims: builds a Wellhead.">Build rig (base $${E.baseFoundCost(st, p)})</button>
      ${E.portUnlocked(st, p) ? `<button data-port="1" class="${S.mode.kind === 'placePort' ? 'active' : ''}" ${pl.money < E.portCost(st, p) ? 'disabled' : ''} title="Build on an island coast next to one of your ships. Launch new ships near it.">Build port ($${E.portCost(st, p)})</button>` : ''}
      <button data-end="1" class="primary" style="margin-left:auto">End turn</button>
    </div>
  </div>`;

  if (b) html += baseCard(b);
  if (s) html += shipCard(s);

  html += `<div class="card"><h3>Shipyard</h3><div class="small muted">New ships launch in your spawn zone, or near your forward ports and dry docks. Ready next turn. Press R to turn while placing.</div>`;
  for (const cls of Object.keys(CLASS_NAMES)) {
    const list = Object.entries(SHIPS).filter(([, d]) => d.cls === cls && !d.hidden);
    if (!list.length) continue;
    html += `<div class="shop-tier"><div class="tier-head"><span>${CLASS_NAMES[cls]}</span></div>`;
    for (const [k, def] of list) {
      const unlocked = E.shipUnlocked(st, p, k), cost = E.shipCost(st, p, k);
      const tip = [describeShip(def, p), ...Object.entries(def.passives || {}).map(([pk, pv]) => PASSIVE_TEXT[pk]?.(pv))].filter(Boolean).join('\n');
      html += `<div class="shop-item ${unlocked ? '' : 'locked'}" title="${tip.replace(/"/g, '&quot;')}">
        ${shapeSvg(def.shape)}
        <div><div class="name">${def.name}</div><div class="meta">${unlocked
          ? `HP ${E.shipStat(st, p, k, 'hp')} · Move ${E.shipStat(st, p, k, 'move')} · ${+E.shipStat(st, p, k, 'oil').toFixed(2)} oil/sq · Sight ${E.shipStat(st, p, k, 'sight')} · Upkeep $${E.upkeepOf(st, p, k)}`
          : `🔒 Needs research: <b>${TECH[E.shipNeeds(k)].name}</b>`}</div></div>
        <button data-buy="${k}" class="${S.mode.kind === 'placeShip' && S.mode.ship === k ? 'active' : ''}" ${!unlocked || pl.money < cost ? 'disabled' : ''}>$${cost}</button>
      </div>`;
    }
    html += '</div>';
  }
  html += '</div>';
  html += `<div class="card"><h3>Log</h3><div class="log">${pl.log.map(l => `<div class="${l.turn >= st.turnCount - 1 ? 'new' : ''}">${l.text}</div>`).join('')}</div></div>`;
  document.getElementById('panel').innerHTML = html;
}

function shipCard(s) {
  const st = S.st, p = me(), def = SHIPS[s.type];
  const pas = Object.entries(def.passives || {}).map(([k, val]) => PASSIVE_TEXT[k] ? `<li>${PASSIVE_TEXT[k](k === 'armor' ? E.shipStat(st, p, s.type, 'armor') : val)}</li>` : '').join('');
  const canMove = !(s.acted && !def.passives?.hitAndRun);
  const oil = E.shipStat(st, p, s.type, 'oil');
  return `
    <div class="card">
      <h3>Selected · ${def.name}</h3>
      <div class="stats">
        <div class="stat"><span>HP</span><span class="v">${s.hp}/${E.shipStat(st, p, s.type, 'hp')}</span></div>
        <div class="stat"><span>Moves left</span><span class="v">${canMove ? s.movesLeft : 0}</span></div>
        <div class="stat"><span>Oil/square</span><span class="v oil">${+oil.toFixed(2)}${E.moveCost(st, s, 4) < Math.ceil(oil * 4) ? ' (½)' : ''}</span></div>
        <div class="stat"><span>Sight</span><span class="v">${E.shipStat(st, p, s.type, 'sight')}</span></div>
        <div class="stat"><span>Upkeep</span><span class="v">$${E.upkeepOf(st, p, s.type)}/turn</span></div>
      </div>
      ${pas ? `<ul class="small muted" style="padding-left:18px;margin:8px 0 0">${pas}</ul>` : ''}
      ${def.actions.map(a => {
        const why = E.canUseAction(st, s, a);
        const shots = s.activeAction === a.id && s.shotsLeft > 0 ? ` — ${s.shotsLeft} shot${s.shotsLeft > 1 ? 's' : ''} left` : '';
        return `<button class="action-btn ${S.mode.kind === 'target' && S.mode.actionId === a.id ? 'active' : ''}" data-act="${a.id}" ${why ? 'disabled' : ''}>
          <b>${a.name}</b>${a.free ? ' <span class="small muted">(free)</span>' : ''}${shots}
          <span class="why">${why || describeAction(a, p)}</span></button>`;
      }).join('')}
      ${S.plan.length ? `<div class="voyage">✎ Planning a route with <b>${S.plan.length} waypoint${S.plan.length > 1 ? 's' : ''}</b>. Click the destination to set sail, Shift+click to add more, Esc to clear.
        <div class="row" style="margin-top:6px"><button data-clear-plan="1">Clear waypoints</button></div></div>` : ''}
      ${s.order ? `<div class="voyage">⚓ On a voyage to <b>${(pts => E.coord(pts[pts.length - 1].x, pts[pts.length - 1].y))(E.orderPoints(s.order))}</b>${E.orderPoints(s.order).length > 1 ? ` via ${E.orderPoints(s.order).length - 1} more waypoint${E.orderPoints(s.order).length > 2 ? 's' : ''}` : ''}. Sails on automatically when you end your turn.
        <div class="row" style="margin-top:6px"><button data-cancel-order="1">Cancel voyage</button></div></div>`
        : S.fit || S.plan.length ? '' : '<div class="small muted" style="margin-top:8px">Tip: click beyond the teal area to send this ship on a multi-turn voyage. Hold <b>Shift</b> and click to add waypoints first.</div>'}
      <div class="row">
        <button data-plan-rotate="1" ${!canMove ? 'disabled' : ''} title="Plan which way the ship faces. Nothing is spent until you click to move or set a voyage.">Plan turn 90° (R)</button>
        ${planRot(s) !== s.rot ? `<button data-turn-here="1" ${!canMove || s.movesLeft < 1 ? 'disabled' : ''}>Turn in place</button>` : ''}
        ${S.fit ? '' : '<button data-center="1" class="ghost">Centre view (Space)</button>'}
        <button data-deselect="1" class="ghost">Deselect</button>
      </div>
    </div>`;
}

// The selected rig base: level, claim, slots, platforms, and what you can build.
function baseCard(b) {
  const st = S.st, p = me(), pl = st.players[p];
  const lvl = BASE_LEVELS[b.level], next = BASE_LEVELS[b.level + 1];
  const plats = E.platformsOf(st, b);
  const center = st.rigs.find(r => r.baseId === b.id && r.center);
  const wells = st.rigs.filter(r => r.baseId === b.id);
  const oil = wells.reduce((t, r) => t + E.rigRate(st, r), 0);
  const up = next ? E.upgradeProblem(st, p, b) : 'max';
  let html = `
    <div class="card base-card">
      <h3>${b.capital ? '★ ' : ''}${E.baseName(st, b)} · ${lvl.name} (level ${b.level})</h3>
      ${b.wrecked ? '<div class="voyage" style="border-color:#7a3535;background:#2a1212;color:#f5b5b5">💥 Wrecked. Platforms are offline. Rebuild the central rig (Build rig, with a ship next to it) to bring it back.</div>' : ''}
      <div class="stats">
        <div class="stat"><span>Claim</span><span class="v">${E.claimSize(st, b)}×${E.claimSize(st, b)}</span></div>
        <div class="stat"><span>Slots</span><span class="v">${E.slotsUsed(st, b)}/${E.baseSlots(st, b)}</span></div>
        <div class="stat"><span>Rigs</span><span class="v">${wells.length} · +${oil} oil</span></div>
        <div class="stat"><span>Central rig</span><span class="v">${center ? `${center.hp}/${E.baseMaxHp(st, b)} HP` : 'destroyed'}</span></div>
      </div>
      ${plats.length ? `<div class="plat-list">${plats.map(o => `<span class="plat-chip ${o.buildLeft ? 'building' : ''}" title="${PLATFORMS[o.kind].text}">${PLATFORMS[o.kind].code} ${PLATFORMS[o.kind].name}${o.buildLeft ? ` · ${o.buildLeft} turn${o.buildLeft > 1 ? 's' : ''}` : ''}</span>`).join('')}</div>` : '<div class="small muted" style="margin-top:6px">No platforms yet.</div>'}
      <div class="small muted" style="margin:8px 0 4px">Build a platform (pick one, then click a square inside the claim):</div>
      <div class="plat-grid">`;
  for (const [k, def] of Object.entries(PLATFORMS)) {
    const unlocked = E.platformUnlocked(st, p, k);
    const cost = E.platformCost(st, p, k);
    const full = !def.onDeposit && E.slotsUsed(st, b) >= E.baseSlots(st, b);
    const why = b.wrecked ? 'Base is wrecked' : !unlocked ? `Needs ${TECH[def.tech].name}` : full ? 'No free slots' : pl.money < cost ? 'Not enough money' : '';
    html += `<button class="plat-btn ${S.mode.kind === 'placePlatform' && S.mode.platform === k ? 'active' : ''} ${unlocked ? '' : 'locked'}" data-platform="${k}" ${why ? 'disabled' : ''}
      title="${def.text} ${def.turns} turns to build, $${Math.round(def.upkeep * E.pstat(st, p, 'platformUpkeepMult'))}/turn upkeep.${why ? ' (' + why + ')' : ''}">
      <span class="code">${def.code}</span><span>${def.name}</span><span class="cost">${unlocked ? '$' + cost : '🔒'}</span></button>`;
  }
  html += `</div>
      <div class="row">
        ${next ? `<button data-upgrade="${b.id}" ${up ? 'disabled' : ''} title="${up || ''}">Upgrade to ${next.name} ($${next.cost})</button>${up ? `<span class="small muted">${up}</span>` : ''}` : '<span class="small muted">Highest base level.</span>'}
        <button data-deselect="1" class="ghost">Close</button>
      </div>
    </div>`;
  return html;
}

export function describeAction(a, p = me()) {
  const w = k => E.weaponStat(S.st, p, a, k);
  switch (a.kind) {
    case 'attack': { const shots = w('shots'); return `Range ${w('range')}, ${w('dmg')} dmg${shots > 1 ? ` × ${shots} shots` : ''}${a.area === 3 ? ', 3×3 area' : ''}${a.subsOnly ? ', subs only' : ''}${a.rigMult ? `, ×${a.rigMult} vs rigs` : ''}${a.cooldown ? `, reload ${a.cooldown}` : ''}`; }
    case 'scan': return `Reveal a ${a.size}×${a.size} area within ${w('range')}${a.cooldown ? `, reload ${a.cooldown}` : ''}`;
    case 'survey': { const r = a.radius + E.pstat(S.st, p, 'surveyRadius'); return `Find oil within ${r} square${r > 1 ? 's' : ''} of this ship`; }
    case 'mine': return `Place a hidden mine next to this ship (max ${a.max})`;
    case 'repair': return `Heal ${a.amount} HP on an adjacent ship, rig or platform`;
    case 'spoof': return `Plant a fake contact on the enemy's screen within ${a.range}`;
    case 'salvage': return `Recover ${a.share * 100}% of a wreck's value (adjacent)`;
  }
  return '';
}

const describeShip = (def, p) => def.actions.map(a => `${a.name}: ${describeAction(a, p)}`).join('\n');

function shapeSvg(shape) {
  const s = 9, w = Math.max(...shape.map(c => c[0])) + 1, h = Math.max(...shape.map(c => c[1])) + 1;
  return `<svg width="52" height="24" viewBox="0 0 52 24"><g transform="translate(${(52 - w * s) / 2},${(24 - h * s) / 2})">${shape.map(([x, y]) => `<rect x="${x * s}" y="${y * s}" width="${s - 1}" height="${s - 1}" rx="1.5" fill="#2bb3a3"/>`).join('')}</g></svg>`;
}
