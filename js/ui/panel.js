// The side panel (resources, selected ship or base, shipyard, log) and the top bar.
import * as E from '../engine/index.js';
import { BASE_LEVELS, PLATFORMS } from '../data/bases.js';
import { STRIKES } from '../data/economy.js';
import { CONQUEST, DOMINATION, LAST_RIG } from '../data/victory.js';
import { TECH } from '../data/research.js';
import { PASSIVE_TEXT, SHIPS, forFaction } from '../data/ships.js';
import { FACTIONS, SUPPLY } from '../data/factions.js';
import { COMMANDERS, EXCLUSIVE_LEVEL, perksAt } from '../data/commanders.js';
import { me, oil, pcol, planRot, pname, selected, selectedBase, usd } from './helpers.js';
import { S } from './state.js';
import { EVENTS, EVENT_TUNING, SPILLS } from '../data/events.js';
import { FLEET, QUEUE, STANDING } from '../data/production.js';
import { DIFFICULTY, PERSONALITIES } from '../data/bots.js';

const CLASS_NAMES = { light: 'Light ships', sub: 'Submarines', escort: 'Escorts', capital: 'Capital ships', support: 'Support' };

// ---------- top bar ----------
export function renderTop() {
  const p = me(), r = S.st.players[p].research;
  const cur = r?.current ? TECH[r.current] : null;
  const left = cur ? E.turnsLeft(S.st, p) : null;
  document.getElementById('turn-info').innerHTML =
    `<b style="color:${pcol(p)}">${pname(p)}</b> · Round ${S.st.round}` +
    (S.st.simul ? ` <span class="simul-badge" title="Simultaneous rounds: everyone plays at once; the round ends when all are ready">⚡ ${S.st.players.filter((pl, i) => !pl.out && S.st.ready?.[i]).length}/${S.st.players.filter(pl => !pl.out).length} ready</span>` : '') +
    ` <button id="btn-research" class="research-btn ${cur ? '' : 'idle'}" title="Open the research tree (T)">🔬 ${cur ? `${cur.name} · ${left === Infinity ? '∞' : left} turn${left === 1 ? '' : 's'}` : 'Choose research'}</button>` +
    (S.st.finalReserves ? ` <span class="alert-badge">🛢️ Final Reserves: ${S.st.finalReserves.roundsLeft} rounds</span>` : '') +
    (S.st.players[p].exile != null ? ` <span class="alert-badge red">⚠ Admiralty lost: ${S.st.players[p].exile} turns</span>` : '') +
    upkeepBadges(p);
}

// Warnings in the top bar: next turn's upkeep can't be paid, or there's not enough oil for your orders.
function upkeepBadges(p) {
  if (S.botTurn || S.spectate || S.st.phase !== 'playing') return '';
  const f = E.upkeepForecast(S.st, p), o = E.oilForecast(S.st, p);
  let out = '';
  if (f.unpaid.length) out += ` <span class="alert-badge red" title="Next turn's upkeep is $${f.need + f.funding}; you have ${usd(S.st.players[p].money)}. Unpaid ships lose 1 HP.">⚠ Upkeep short ${usd(f.short)}: ${f.sinking.length ? `${E.shipNames(f.sinking)} will sink` : `${f.unpaid.length} ship${f.unpaid.length > 1 ? 's' : ''} lose HP`}</span>`;
  else if (f.need > 0 && S.st.players[p].money < f.need * 3) {
    const turns = Math.floor(S.st.players[p].money / Math.max(1, f.need + f.funding));
    out += ` <span class="alert-badge" title="Upkeep is $${f.need + f.funding} a turn. Sell oil before it runs out: unpaid ships lose HP, and 1-HP ships like Survey Ships sink.">💰 Money for ${turns} more turn${turns === 1 ? '' : 's'} of upkeep</span>`;
  }
  if (o.short) out += ` <span class="alert-badge" title="Ships on voyages or standing orders want ${o.want} oil at the end of this turn; you have ${o.have}.">⛽ Low oil: some orders will stall</span>`;
  return out;
}

// The same warning, with a fix, in the Resources card.
function upkeepWarning(st, p) {
  const f = E.upkeepForecast(st, p);
  if (!f.unpaid.length) return '';
  const fix = f.oilToCover != null
    ? `<button data-cover="${f.oilToCover}" class="primary">Sell ${f.oilToCover} oil to cover it</button>`
    : '<span class="small">Not enough oil to cover it: sell a ship, or cut research funding.</span>';
  return `<div class="voyage warn-box">⚠ <b>Next turn's upkeep is $${f.need + f.funding}${f.funding ? ` (incl. $${f.funding} research funding)` : ''}, you have ${usd(st.players[p].money)}.</b>
    ${f.sinking.length ? `${E.shipNames(f.sinking)} will <b>sink</b>` : `${f.unpaid.length} ship${f.unpaid.length > 1 ? 's' : ''} will lose 1 HP`} if you end your turn like this.
    <div class="row" style="margin-top:6px">${fix}</div></div>`;
}

// ---------- panel ----------
export function renderPanel() {
  const panelEl = document.getElementById('panel');
  panelEl.classList.toggle('locked', !!S.botTurn && !S.spectate);
  if (S.spectate) { panelEl.innerHTML = spectatorPanel(); return; }
  const st = S.st, p = me(), pl = st.players[p];
  const s = selected(), b = selectedBase();
  const oilTurn = st.rigs.filter(r => r.owner === p).reduce((t, r) => t + E.rigRate(st, r), 0);
  const rp = E.rpIncome(st, p);
  let html = `
  ${victoryCard(st, p)}
  ${commanderCard(st, p)}
  ${worldCard(st, p)}
  <div class="card">
    <h3>Resources</h3>
    <div class="stats">
      <div class="stat"><span>Money</span><span class="v money">${usd(pl.money)}</span></div>
      <div class="stat"><span>Oil</span><span class="v oil" title="Storage cap: oil pumped past this spills. Storage Tanks and research raise it.">${oil(pl.oil)}/${E.oilCapOf(st, p)}</span></div>
      <div class="stat"><span>Oil price</span><span class="v">$${(st.market.price * E.sellMultOf(st, p)).toFixed(2)}</span></div>
      <div class="stat"><span>Oil/turn</span><span class="v oil">+${oilTurn}</span></div>
      <div class="stat"><span>Bases</span><span class="v">${E.basesOf(st, p).filter(x => !x.wrecked).length}</span></div>
      <div class="stat"><span>Fleet</span><span class="v">${st.ships.filter(x => x.owner === p).length} ships</span></div>
      <div class="stat"><span>Upkeep</span><span class="v" style="color:#f09595">−$${E.upkeepTotal(st, p)}/turn</span></div>
      <div class="stat"><span>Research</span><span class="v" style="color:#9fd0ff">+${rp.total} RP</span></div>
    </div>
    <div class="small muted" style="margin-top:6px">Sell oil (price drops as you sell, recovers each turn):</div>
    <div class="row">
      ${[1, 5, 10].map(n => `<button data-sell="${n}" ${pl.oil < n ? 'disabled' : ''}>Sell ${n} (${usd(E.sellValue(st, n, p).total)})</button>`).join('')}
      <button data-sell="all" ${pl.oil < 1 ? 'disabled' : ''}>All</button>
    </div>
    ${autoSellRow(st, p)}
    <div class="row">
      <button data-rig="1" class="${S.mode.kind === 'placeRig' ? 'active' : ''}" title="On a discovered deposit next to one of your ships (or within 5 of a ship with Rig Crews, like a Survey Ship or Prospector Skiff): founds a new rig base. Inside one of your claims: builds a Wellhead.">Build rig (base $${E.baseFoundCost(st, p)})</button>
      ${E.portUnlocked(st, p) ? `<button data-port="1" class="${S.mode.kind === 'placePort' ? 'active' : ''}" ${pl.money < E.portCost(st, p) ? 'disabled' : ''} title="Build on an island coast next to one of your ships. Launch new ships near it.">Build port ($${E.portCost(st, p)})</button>` : ''}
      <button data-end="1" class="primary" style="margin-left:auto" ${S.st.simul ? 'title="Done for this round: the round ends when everyone is ready"' : ''}>${S.st.simul ? 'Ready ✓' : 'End turn'} <span class="key-hint">⏎</span></button>
    </div>
    ${upkeepWarning(st, p)}
  </div>`;

  if (b) html += baseCard(b);
  if (S.mode.kind === 'fleetPick') html += fleetPickCard();
  if (s) html += shipCard(s);
  const f = s && E.fleetOf(st, s.id);
  if (f) html += fleetCard(f, s);
  if (s) html += standingCard(s, f);

  html += shipyardCard(st, p);
  // (typing an auto-sell amount: keep the box, and what's in it, across redraws)
  const typing = document.activeElement?.classList.contains('autokeep-in') ? document.activeElement : null;
  const caret = typing && typing.selectionStart;
  document.getElementById('panel').innerHTML = html;
  if (typing) {
    const span = document.querySelector('#panel [data-autokeep-edit]');
    if (span) { span.replaceWith(typing); typing.focus(); try { typing.setSelectionRange(caret, caret); } catch { /* number inputs */ } }
  }
  if (!s) lastShownShip = null; // re-selecting the same ship later flashes again
  // a newly selected ship: bring its card into view
  document.querySelector('#panel .selected-card.flash')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// remember which shipyard classes are folded open (the panel is redrawn all the time)
document.getElementById('panel')?.addEventListener('toggle', e => {
  const t = e.target.closest?.('[data-tier]');
  if (t) (S.shopOpen ||= { light: true })[t.dataset.tier] = t.open;
}, true);

// ---------- shipyards ----------
export const currentYard = (st, p) => E.yardById(st, p, S.yard) || E.yardById(st, p, 'home');

function shipyardCard(st, p) {
  const pl = st.players[p], yards = E.yardsOf(st, p), yard = currentYard(st, p);
  const builds = E.buildsOf(st, p);
  let html = `<div class="card"><h3>Shipyard</h3>`;
  if (yards.length > 1) html += `<div class="yard-tabs">${yards.map(y => {
    const n = builds.filter(b => b.yard === y.id).length;
    return `<button class="yard-tab ${y.id === yard.id ? 'active' : ''}" data-yard="${y.id}" title="${y.slots} at a time${y.faster ? `, ${y.faster} turn faster` : ''}">${y.kind === 'home' ? '⚓' : y.kind === 'port' ? '⛵' : y.kind === 'tide' ? '🌊' : '🔧'} ${y.name}${n ? ` <b>${n}</b>` : ''}</button>`;
  }).join('')}</div>`;
  const q = E.yardQueue(st, p, yard.id);
  html += `<div class="small muted">${yard.name} builds ${yard.slots} ship${yard.slots > 1 ? 's' : ''} at a time${yard.faster ? `, each ${yard.faster} turn faster` : ''}. You pay up front; finished ships appear next to the yard at the start of your turn.${yard.kind !== 'home' && !S.fit ? ' <button class="ghost small-btn" data-yard-show="1">Show</button>' : ''}</div>`;
  if (q.length) {
    html += `<div class="build-queue">${q.map((b, i) => {
      const working = i < yard.slots;
      const started = b.left < b.total;
      const status = !working ? 'waiting in line' : b.waiting ? 'waiting for room to launch' : `${b.left} turn${b.left === 1 ? '' : 's'} left`;
      const pct = working ? Math.round((b.total - b.left) / b.total * 100) : 0;
      return `<div class="build-item ${working ? '' : 'queued'}">
        ${shapeSvg(SHIPS[b.ship].shape, 40, 18)}
        <div><div class="name">${SHIPS[b.ship].name}</div><div class="bar"><span style="width:${pct}%"></span></div><div class="meta">${status}</div></div>
        <button class="ghost small-btn" data-cancel-build="${b.id}" title="Cancel: refunds $${started ? Math.floor(b.paid * QUEUE.refundStarted) : b.paid}${started ? ' (half, work has started)' : ''}">✕</button>
      </div>`;
    }).join('')}</div>`;
  } else html += `<div class="small muted" style="margin-top:6px">Nothing being built here.</div>`;
  const full = q.length >= QUEUE.max;
  for (const cls of Object.keys(CLASS_NAMES)) {
    // (a commander's exclusive ship only shows for that commander)
    const list = Object.entries(SHIPS).filter(([k, d]) => d.cls === cls && !d.hidden && (!d.polar || st.ice) && forFaction(k, pl.faction) && (!d.commander || pl.commander?.id === d.commander));
    if (!list.length) continue;
    // each class folds away (light ships start open), so the list never turns into one long scroll
    const open = (S.shopOpen ||= { light: true })[cls];
    const ready = list.filter(([k]) => E.shipUnlocked(st, p, k)).length;
    html += `<details class="shop-tier" data-tier="${cls}" ${open ? 'open' : ''}><summary class="tier-head"><span>${CLASS_NAMES[cls]}</span><span class="small muted">${ready}/${list.length} unlocked</span></summary>`;
    for (const [k, def] of list) {
      const unlocked = E.shipUnlocked(st, p, k), cost = E.shipCost(st, p, k);
      const why = E.buildProblem(st, p, k, yard.id);
      const turns = E.buildTurns(st, p, k, yard);
      const tip = [describeShip(def, p), ...Object.entries(def.passives || {}).map(([pk, pv]) => PASSIVE_TEXT[pk]?.(pv))].filter(Boolean).join('\n');
      html += `<div class="shop-item ${unlocked ? '' : 'locked'}" title="${tip.replace(/"/g, '&quot;')}">
        ${shapeSvg(def.shape)}
        <div><div class="name">${def.commander ? `<span title="${COMMANDERS[def.commander].name}'s exclusive ship">${COMMANDERS[def.commander].icon}</span> ` : ''}${def.name}${def.pack ? ` <span class="pack-tag" title="One order launches ${E.packSize(st, p, k)} boats">×${E.packSize(st, p, k)}</span>` : ''}</div><div class="meta">${unlocked
          ? `HP ${E.shipStat(st, p, k, 'hp')} · Move ${E.shipStat(st, p, k, 'move')} · ${+E.shipStat(st, p, k, 'oil').toFixed(2)} oil/sq · Sight ${E.shipStat(st, p, k, 'sight')} · Upkeep $${E.upkeepOf(st, p, k)} · <b>⏱ ${turns} turn${turns > 1 ? 's' : ''}</b>`
          : !E.commanderShipOk(st, p, k) ? `🔒 ${COMMANDERS[def.commander].name} level ${EXCLUSIVE_LEVEL}` : `🔒 Needs research: <b>${TECH[E.shipNeeds(k)]?.name || '?'}</b>`}</div></div>
        <button data-buy="${k}" ${why ? `disabled title="${why.replace(/"/g, '&quot;')}"` : `title="Build at ${yard.name}"`}>$${cost}</button>
      </div>`;
    }
    html += '</details>';
  }
  if (full) html += `<div class="small muted">This yard's line is full (${QUEUE.max}).</div>`;
  return html + '</div>';
}

// ---------- fleets ----------
function fleetPickCard() {
  const st = S.st, ids = S.mode.ids;
  const ships = ids.map(id => st.ships.find(s => s.id === id)).filter(Boolean);
  const near = nearbyLoners(ships[0]);
  return `<div class="card fleet-card">
    <h3>Forming a fleet</h3>
    <div class="small">Click your ships on the map to add or remove them (${ships.length}/${FLEET.maxShips}). They must be within ${FLEET.joinRange} squares of the biggest ship, which becomes the flagship.</div>
    <div class="plat-list">${ships.map(s => `<span class="plat-chip">${SHIPS[s.type].name}</span>`).join('')}</div>
    <div class="row">
      <button class="primary" data-fleet-create="1" ${ships.length < 2 ? 'disabled' : ''}>Create fleet (${ships.length})</button>
      ${near.length ? `<button data-fleet-nearby="1">Add all nearby (${near.length})</button>` : ''}
      <button class="ghost" data-fleet-cancel="1">Cancel</button>
    </div>
  </div>`;
}

// Your ships near this one that aren't in a fleet yet.
export function nearbyLoners(s) {
  if (!s) return [];
  return S.st.ships.filter(o => o.owner === s.owner && o.id !== s.id && !E.fleetOf(S.st, o.id) && !(S.mode.ids || []).includes(o.id) &&
    Math.max(Math.abs(o.x - s.x), Math.abs(o.y - s.y)) <= FLEET.joinRange);
}

function fleetCard(f, s) {
  const st = S.st, ships = E.fleetShips(st, f), L = E.flagship(st, f);
  const oil = ships.reduce((t, x) => t + E.shipStat(st, f.owner, x.type, 'oil'), 0);
  const out = f.members.filter(m => { const x = st.ships.find(o => o.id === m.id); return x && (x.x !== L.x + m.dx || x.y !== L.y + m.dy); }).length;
  const pts = f.order?.points || [];
  return `<div class="card fleet-card">
    <h3>⚑ Fleet ${f.name} · ${ships.length} ships</h3>
    <div class="stats">
      <div class="stat"><span>Flagship</span><span class="v">${SHIPS[L.type].name}</span></div>
      <div class="stat"><span>Speed</span><span class="v">${E.fleetSpeed(st, f)}/turn</span></div>
      <div class="stat"><span>Oil/square</span><span class="v oil">${+oil.toFixed(2)}</span></div>
      <div class="stat"><span>In formation</span><span class="v">${ships.length - out}/${ships.length}</span></div>
    </div>
    <div class="small muted" style="margin-top:6px">The fleet sails together at the speed of its slowest ship. Click the map beyond the teal area to send the whole fleet (this ship ends up where you click), Shift+click for waypoints. Moving one ship by hand is fine: it rejoins later.</div>
    ${pts.length ? `<div class="voyage">⚓ Fleet heading to <b>${E.coord(pts[pts.length - 1].x, pts[pts.length - 1].y)}</b>${pts.length > 1 ? ` via ${pts.length - 1} more waypoint${pts.length > 2 ? 's' : ''}` : ''}. Sails on when you end your turn.
      <div class="row" style="margin-top:6px"><button data-fleet-stop="${f.id}">Stop fleet</button></div></div>` : ''}
    <div class="row">
      ${out ? `<button data-fleet-regroup="${f.id}" title="Stragglers sail back to their places now">Regroup (${out})</button>` : ''}
      <button data-fleet-reform="${f.id}" title="Keep the ships where they are now as the new formation">Keep this formation</button>
      ${nearbyLoners(L).length ? `<button data-fleet-join="${f.id}" title="Add your nearby ships that aren't in a fleet">Add nearby (${nearbyLoners(L).length})</button>` : ''}
    </div>
    <div class="row">
      <button data-fleet-leave="${s.id}" class="ghost">Take this ship out</button>
      <button data-fleet-disband="${f.id}" class="ghost">Disband fleet</button>
    </div>
  </div>`;
}

// ---------- standing orders ----------
function standingCard(s, f) {
  const st = S.st, unit = f || s, o = unit.standing;
  const who = f ? `Fleet ${f.name}` : 'this ship';
  let now = '';
  if (o) {
    const t = o.kind === 'escort' && st.ships.find(x => x.id === o.target);
    now = o.kind === 'patrol' ? `patrolling ${o.points.length} points` : o.kind === 'guard' ? `guarding ${E.coord(o.x, o.y)}`
      : o.kind === 'escort' ? `escorting the ${t ? SHIPS[t.type].name : '?'}` : 'exploring';
  }
  const pick = S.mode.kind === 'patrolPick' ? `<div class="voyage">🔁 Click patrol points on the map (${S.mode.points.length} so far). The route loops back to where ${who} is now.
      <div class="row" style="margin-top:6px"><button class="primary" data-standing-patrol-go="1" ${S.mode.points.length ? '' : 'disabled'}>Start patrol</button><button class="ghost" data-mode-cancel="1">Cancel</button></div></div>`
    : S.mode.kind === 'escortPick' ? `<div class="voyage">🛡️ Click one of your ships to escort. <div class="row" style="margin-top:6px"><button class="ghost" data-mode-cancel="1">Cancel</button></div></div>` : '';
  return `<div class="card">
    <h3>Standing orders${f ? ` · Fleet ${f.name}` : ''}</h3>
    <div class="small ${o ? '' : 'muted'}">${o ? `${STANDING[o.kind].icon} Now <b>${now}</b>. Runs each time you end your turn.` : `Give ${who} a job to keep doing on its own. Runs when you end your turn, with the movement left.`}</div>
    <div class="standing-grid">
      ${Object.entries(STANDING).map(([k, d]) => `<button class="${o?.kind === k || S.mode.kind === k + 'Pick' ? 'active' : ''}" data-standing="${k}" title="${d.text}">${d.icon} ${d.name}</button>`).join('')}
    </div>
    ${o ? `<div class="row"><button class="ghost" data-standing-clear="1">Clear standing orders</button></div>` : ''}
    ${pick}
    ${!f && S.mode.kind !== 'fleetPick' ? `<div class="row"><button data-fleet-pick="1" title="Group ships to sail together in formation">⚑ Form a fleet…</button>${E.fleetsOf(st, s.owner).filter(x => { const l = E.flagship(st, x); return l && Math.max(Math.abs(l.x - s.x), Math.abs(l.y - s.y)) <= FLEET.joinRange; }).map(x => `<button data-fleet-join-one="${x.id}">Join Fleet ${x.name}</button>`).join('')}</div>` : ''}
  </div>`;
}

// Spectator mode: every admiral side by side.
function spectatorPanel() {
  const st = S.st;
  const rows = st.players.map((o, i) => {
    const oilIn = st.rigs.filter(r => r.owner === i).reduce((t, r) => t + E.rigRate(st, r), 0);
    const pers = o.ai ? PERSONALITIES[o.ai.personality] : null, diff = o.ai ? DIFFICULTY[o.ai.difficulty] : null;
    return `<div class="spec-row ${o.out ? 'out' : ''} ${i === st.current ? 'now' : ''}" style="--c:${pcol(i)}">
      <div class="spec-name"><b>${o.name}</b> <span class="small" title="${chipTitle(o)}">${FACTIONS[o.faction || 'navy'].icon}${o.commander ? ` ${COMMANDERS[o.commander.id].icon} <span class="muted">${o.commander.level}</span>` : ''}</span> ${pers ? `<span class="small muted">${pers.icon} ${pers.name} · ${diff.icon} ${diff.name}</span>` : ''}${o.out ? ' <span class="small muted">· out</span>' : ''}</div>
      <div class="stats">
        <div class="stat"><span>Money</span><span class="v money">${usd(o.money)}</span></div>
        <div class="stat"><span>Oil</span><span class="v oil">${oil(o.oil)} (+${oilIn})</span></div>
        <div class="stat"><span>Bases</span><span class="v">${E.basesOf(st, i).filter(b => !b.wrecked).length}</span></div>
        <div class="stat"><span>Ships</span><span class="v">${st.ships.filter(s => s.owner === i).length}</span></div>
        <div class="stat"><span>Techs</span><span class="v">${Object.keys(o.research.done).length}</span></div>
        <div class="stat"><span>Building</span><span class="v">${(o.builds || []).length}</span></div>
      </div>
    </div>`;
  }).join('');
  return `${victoryCard(st, st.current)}
    ${worldCard(st, -1)}<div class="card"><h3>${st.replay ? '🎬 Replay' : '👁 Spectating'} · round ${st.round}</h3><div class="spec-list">${rows}</div></div>`;
}

// Everyone's standing, and your progress toward each way of winning.
// Automated Trading: sell everything above a chosen amount at the end of each turn.
// −/+ change it by 1 (Shift: 10); click the number to type it.
function autoSellRow(st, p) {
  if (!E.canAutoSell(st, p)) return '';
  const a = st.players[p].autoSell || { on: false, keep: 0 }, cap = Math.round(E.pstat(st, p, 'oilCap'));
  return `<div class="autosell ${a.on ? 'on' : ''}" title="At the end of each of your turns (after voyages and standing orders), oil above this amount is sold at the market price.">
    <button class="small-btn ${a.on ? 'primary' : ''}" data-autosell-toggle>🤖 Auto-sell: ${a.on ? 'On' : 'Off'}</button>
    <span class="small">keep</span>
    <button class="small-btn" data-autokeep="-1" ${a.keep <= 0 ? 'disabled' : ''} title="−1 (Shift: −10)">−</button>
    <span class="autokeep" data-autokeep-edit title="Click to type an amount (0 to ${cap})">${a.keep}</span>
    <button class="small-btn" data-autokeep="1" ${a.keep >= cap ? 'disabled' : ''} title="+1 (Shift: +10)">+</button>
    <span class="small">oil</span>
  </div>`;
}

// World events, slicks and blowouts: what's going on now and what's announced for next round.
function worldCard(st, p) {
  const ev = st.events, rows = [];
  const left = e => (e.until != null ? ` <span class="muted small">· ${e.until - st.round + 1} round${e.until - st.round ? 's' : ''} left</span>` : '');
  for (const e of ev?.active || []) {
    const d = EVENTS[e.kind];
    if (e.kind === 'blowout' && p >= 0 && e.owner !== p) continue;
    const where = e.x != null && e.kind !== 'storm' ? ` <a class="jump" data-jump="${e.x},${e.y}">${E.coord(Math.max(0, Math.min(st.W - 1, e.x)), Math.max(0, Math.min(st.H - 1, e.y)))}</a>` : '';
    rows.push(`<div class="world-row" title="${d.desc}">${d.icon} <b>${d.name}</b>${where}${left(e)}</div>`);
  }
  if (ev?.pending) { const d = EVENTS[ev.pending.kind]; rows.push(`<div class="world-row next" title="${d.desc}">📣 Next round: ${d.icon} ${d.name}</div>`); }
  const slicks = (st.spills || []).length;
  if (slicks) rows.push(`<div class="world-row" title="No rigs can be built in a slick; sailing through one costs double oil. Drillships and Fleet Tenders can clean them up.">🛢️ ${slicks} oil slick${slicks > 1 ? 's' : ''} on the map</div>`);
  const blown = p >= 0 ? st.rigs.filter(r => r.owner === p && r.blowout) : [];
  for (const r of blown) rows.push(`<div class="world-row"><button class="small-btn" data-fixblowout="${r.id}" ${st.players[p].money < EVENT_TUNING.blowout.fixCost ? 'disabled' : ''} title="Pay to fix it now: it pumps again from your next turn">🔥 Fix blowout at ${E.coord(r.x, r.y)} ($${EVENT_TUNING.blowout.fixCost})</button></div>`);
  if (!rows.length) return '';
  return `<div class="card world-card"><h3>World</h3>${rows.join('')}</div>`;
}

function victoryCard(st, p) {
  const v = E.victorySummary(st, p);
  const capOk = q => { const c = E.capitalOf(st, q); return c && !c.wrecked; };
  const chips = st.players.map((o, i) => `<span class="chip ${o.out ? 'out' : ''} ${i === p ? 'me' : ''}" style="--c:${pcol(i)}"><span title="${chipTitle(o)}">${FACTIONS[o.faction || 'navy'].icon}${o.commander ? COMMANDERS[o.commander.id].icon : ''}</span> ${o.name}${o.seat === 'ai' ? ` <span title="Computer player · ${DIFFICULTY[o.ai.difficulty].name}">🤖</span>` : ''}${o.out ? ' · out'
    : o.exile != null ? ` · <b style="color:#ff6b6b">⚠ ${o.exile} turn${o.exile > 1 ? 's' : ''}</b>` : ''}${E.victoryOn(st, 'domination') && o.domStreak > 0 && !o.out ? ` · <b style="color:#ffd666">🗺️ ${o.domStreak}/${DOMINATION.rounds}</b>` : ''}</span>`).join('');
  const rivals = st.players.map((_, i) => i).filter(i => i !== p && !st.players[i].out);
  const rows = [];
  rows.push(`⚔️ <b>Conquest:</b> ${rivals.filter(capOk).length} rival Admiralt${rivals.filter(capOk).length === 1 ? 'y' : 'ies'} left${v.exile != null ? ` · <b style="color:#ff6b6b">yours is lost: ${v.exile} turn${v.exile > 1 ? 's' : ''} to rebuild or move it!</b>` : ''}`);
  if (v.domination) rows.push(`🗺️ <b>Domination:</b> you claim ${v.domination.mine} squares, ${Math.round(v.domination.share * 100)}% of claimed sea (need ${Math.round(DOMINATION.share * 100)}% and ${v.domination.needMap} squares)`);
  if (E.victoryOn(st, 'postoil')) {
    const plants = (st.platforms || []).filter(o => o.kind === 'fusion' && (o.owner === p || E.getView(st, p).enemyPlatforms.includes(o)));
    rows.push(`⚛️ <b>Post-Oil:</b> ${v.fusion ? `your Fusion Plant: ${v.fusion.buildLeft} turn${v.fusion.buildLeft === 1 ? '' : 's'} left` : st.players[p].research.done.fusion_engineering ? 'ready: build the Fusion Plant at a Hub' : 'research Era V (Fusion Engineering)'}${plants.filter(o => o.owner !== p).map(o => ` · <b style="color:#ff6b6b">${pname(o.owner)}'s plant: ${o.buildLeft} turns!</b>`).join('')}`);
  }
  if (E.victoryOn(st, 'lastrig')) {
    const pct = Math.round(v.world.left / v.world.start * 100);
    rows.push(`🛢️ <b>Last Rig:</b> ${v.world.final ? `<b style="color:#ffd666">Final Reserves: ${v.world.final.roundsLeft} rounds left</b>` : `world oil ${pct}% (countdown at ${Math.round(LAST_RIG.threshold * 100)}%)`} · you control ${v.oil}`);
  }
  return `<div class="card">
    <h3>Admirals & victory</h3>
    <div class="row" style="margin-top:0">${chips}</div>
    <div class="victory-rows">${rows.map(r => `<div>${r}</div>`).join('')}</div>
  </div>`;
}

let lastShownShip = null;
// Navy: in supply or not (and how long it's been away); Free Tide: on the Tide or not.
function factionStat(st, p, s) {
  if (st.players[p].faction === 'tide') {
    const on = E.shipOnTide(st, s);
    return `<div class="stat" title="On the Tide: +1 move, half oil, heals each turn"><span>Tide</span><span class="v" style="color:${on ? '#7fd17a' : '#8aa3b8'}">${on ? '🌊 on the rafts' : 'off the Tide'}</span></div>`;
  }
  const sup = E.inSupply(st, s), low = E.lowOnSupplies(s);
  const text = sup ? '📦 in supply' : low ? `⚠ low (−${SUPPLY.lowDmg} dmg)` : `out ${s.away || 0}/${SUPPLY.lowAfter} rounds`;
  return `<div class="stat" title="In supply near your bases, ports, home waters or a Supply Ship: repairs ${SUPPLY.heal} HP a turn out of combat. ${SUPPLY.lowAfter}+ rounds out of supply: −${SUPPLY.lowDmg} damage."><span>Supply</span><span class="v" style="color:${sup ? '#7fd17a' : low ? '#f0a531' : '#c8d3dd'}">${text}</span></div>`;
}

// a player's faction and commander, for their chip's tooltip
// Your commander and their powers (click to use; aimed ones then want a square on the map).
function commanderCard(st, p) {
  const c = st.players[p].commander;
  if (!c) return '';
  const C = COMMANDERS[c.id], powers = E.powersOf(st, p);
  return `<div class="card cmd-panel"><h3 title="${chipTitle(st.players[p])}">${C.icon} ${C.name} <span class="muted small">level ${c.level}</span></h3>
    <div class="row power-row">${powers.map(w => {
      const why = E.powerProblem(st, p, w.id);
      const active = S.mode.kind === 'power' && S.mode.power === w.id;
      return `<button class="power-btn ${active ? 'active' : ''}" data-power="${w.id}" ${why ? 'disabled' : ''} title="${(w.name + ': ' + w.text + (why ? '\n\n' + why : '')).replace(/"/g, '&quot;')}">
        <span class="pw-icon">${w.icon}</span> ${w.name}${w.cd > 0 ? ` <span class="pw-cd">${w.cd}</span>` : ''}</button>`;
    }).join('') || '<span class="small muted">Powers unlock at level 1 and 8.</span>'}</div></div>`;
}

function chipTitle(o) {
  const f = FACTIONS[o.faction || 'navy'], c = o.commander && COMMANDERS[o.commander.id];
  if (!c) return `${f.name} · no commander`;
  const perks = perksAt(o.commander.id, o.commander.level, o.commander.mastery);
  return (`${f.name} · ${c.name} (${c.title}), level ${o.commander.level}\n` + perks.map(k => `• ${k.name}: ${k.text}`).join('\n')).replace(/"/g, '&quot;');
}

function shipCard(s) {
  const st = S.st, p = me(), def = SHIPS[s.type];
  const pas = Object.entries(def.passives || {}).map(([k, val]) => PASSIVE_TEXT[k] ? `<li>${PASSIVE_TEXT[k](k === 'armor' ? E.shipStat(st, p, s.type, 'armor') : val)}</li>` : '').join('');
  const canMove = !(s.acted && !def.passives?.hitAndRun);
  const oilRate = E.shipStat(st, p, s.type, 'oil');
  // flashes a few times when a ship is newly selected, then keeps a highlighted border
  const fresh = s.id !== lastShownShip;
  lastShownShip = s.id;
  return `
    <div class="card selected-card ${fresh ? 'flash' : ''}">
      <h3>Selected · ${def.name}</h3>
      <div class="stats">
        <div class="stat"><span>HP</span><span class="v">${s.hp}/${E.shipStat(st, p, s.type, 'hp')}</span></div>
        <div class="stat"><span>Moves left</span><span class="v">${canMove ? s.movesLeft : 0}</span></div>
        <div class="stat"><span>Oil/square</span><span class="v oil">${+oilRate.toFixed(2)}${E.moveCost(st, s, 4) < oilRate * 4 - 1e-9 ? ' (½)' : ''}</span></div>
        <div class="stat"><span>Sight</span><span class="v">${E.shipStat(st, p, s.type, 'sight')}</span></div>
        <div class="stat"><span>Upkeep</span><span class="v">$${E.upkeepOf(st, p, s.type)}/turn</span></div>
        ${factionStat(st, p, s)}
      </div>
      ${pas ? `<ul class="small muted" style="padding-left:18px;margin:8px 0 0">${pas}</ul>` : ''}
      ${def.actions.map(a => {
        const why = E.canUseAction(st, s, a);
        const shots = s.activeAction === a.id && s.shotsLeft > 0 ? ` — ${s.shotsLeft} shot${s.shotsLeft > 1 ? 's' : ''} left` : '';
        return `<button class="action-btn ${S.mode.kind === 'target' && S.mode.actionId === a.id ? 'active' : ''}" data-act="${a.id}" ${why ? 'disabled' : ''}>
          <b>${a.name}</b>${a.money ? ` <span class="money small">$${a.money}${E.weaponStat(st, p, a, 'shots') > 1 ? '/shot' : ''}</span>` : ''}${a.oil ? ` <span class="oil small">${a.oil} oil</span>` : ''}${a.free ? ' <span class="small muted">(doesn\'t use the action)</span>' : ''}${shots}
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
      ${(why => `<div class="row"><button data-sell-ship="${s.id}" class="ghost" ${why ? 'disabled' : ''} title="${why || 'Half its price back (less if damaged). Only in your home waters or base claims, and not within 3 rounds of combat.'}">💲 Sell ship (${usd(E.shipSaleValue(st, s))})</button>${why ? `<span class="small muted">${why}</span>` : ''}</div>`)(E.shipSaleProblem(st, s))}
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
    const why = b.wrecked ? 'Base is wrecked' : !unlocked ? `Needs ${TECH[def.tech].name}` : def.megaproject && !E.victoryOn(st, 'postoil') ? 'Post-Oil victory is off'
      : def.megaproject && b.level < def.needsLevel ? 'Needs a Hub (level 4) base' : full ? 'No free slots' : pl.money < cost ? 'Not enough money' : '';
    html += `<button class="plat-btn ${S.mode.kind === 'placePlatform' && S.mode.platform === k ? 'active' : ''} ${unlocked ? '' : 'locked'}" data-platform="${k}" ${why ? 'disabled' : ''}
      title="${def.text} ${def.turns} turns to build, $${Math.round(def.upkeep * E.pstat(st, p, 'platformUpkeepMult'))}/turn upkeep.${why ? ' (' + why + ')' : ''}">
      <span class="code">${def.code}</span><span>${def.name}</span><span class="cost">${unlocked ? '$' + cost : '🔒'}</span></button>`;
  }
  html += `</div>${longRangeRow(st, p, b)}
      <div class="row">
        ${next ? `<button data-upgrade="${b.id}" ${up ? 'disabled' : ''} title="${up || ''}">Upgrade to ${next.name} ($${next.cost})</button>${up ? `<span class="small muted">${up}</span>` : ''}` : '<span class="small muted">Highest base level.</span>'}
        <button data-deselect="1" class="ghost">Close</button>
      </div>
      ${!b.capital && !b.wrecked && !E.moveCapitalProblem(st, p, b) ? `<div class="voyage" style="border-color:#7a3535;background:#2a1212;color:#f5b5b5">⚠ Your Admiralty is lost. Make this base your new Admiralty?
        <div class="row" style="margin-top:6px"><button data-move-capital="${b.id}" class="primary">Move Admiralty here ($${CONQUEST.moveCapitalCost})</button></div></div>` : ''}
    </div>`;
  return html;
}

// Long-range launchers in this base (recon drones, cruise missiles, bombers) and the satellite pass.
function longRangeRow(st, p, b) {
  const pads = E.platformsOf(st, b).filter(o => !o.buildLeft && (PLATFORMS[o.kind].strike || PLATFORMS[o.kind].recon));
  const sat = b.capital && st.players[p].research.done.satellites;
  if (!pads.length && !sat) return '';
  const btn = o => {
    const def = PLATFORMS[o.kind], s = def.strike || def.recon;
    const why = b.wrecked ? 'Base is wrecked' : E.strikeProblem(st, p, o);
    const cost = def.strike ? ` · ${s.oil} oil${s.money ? ` + $${s.money}` : ''}` : s.money ? ` · $${s.money}` : '';
    const label = def.strike ? s.name : 'Recon drone';
    return `<button class="${S.mode.kind === 'baseStrike' && S.mode.platformId === o.id ? 'active' : ''}" data-strike="${o.id}" ${why ? 'disabled' : ''} title="${why || def.text}">
      ${def.strike ? '🎯' : '🛩️'} ${label} <span class="small muted">range ${s.range}${cost}${o.cd ? ` · ${o.cd} turn${o.cd > 1 ? 's' : ''}` : ''}</span></button>`;
  };
  return `<div class="small muted" style="margin:8px 0 4px">Long range (aim at squares you can see; scout first with a drone or satellite):</div>
    <div class="row" style="margin-top:0">${pads.map(btn).join('')}
    ${sat ? `<button class="${S.mode.kind === 'satellite' ? 'active' : ''}" data-satellite="1" ${E.satelliteReady(st, p) && st.players[p].money >= STRIKES.satellite.money ? "" : "disabled"} title="Reveal a 7×7 area anywhere on the map ($${STRIKES.satellite.money})">🛰️ Satellite pass <span class="small muted">$${STRIKES.satellite.money}</span>${st.players[p].satCd ? ` <span class="small muted">· ${st.players[p].satCd} turns</span>` : ''}</button>` : ''}</div>`;
}

export function describeAction(a, p = me()) {
  const w = k => E.weaponStat(S.st, p, a, k);
  switch (a.kind) {
    case 'attack': { const shots = w('shots'); return `Range ${w('range')}, ${w('dmg')} dmg${shots > 1 ? ` × ${shots} shots` : ''}${a.area === 3 ? ', 3×3 area' : ''}${a.subsOnly ? ', subs only' : ''}${a.rigMult ? `, ×${a.rigMult} vs rigs` : ''}${a.oil ? `, ${a.oil} oil per launch` : ''}${a.longRange ? ', target must be visible' : ''}${a.cooldown ? `, reload ${a.cooldown}` : ''}${a.selfDestruct ? ', the ship is destroyed' : ''}`; }
    case 'scan': return `Reveal a ${a.size}×${a.size} area within ${w('range')}${a.cooldown ? `, reload ${a.cooldown}` : ''}`;
    case 'survey': { const r = a.radius + E.pstat(S.st, p, 'surveyRadius'); return `Find oil within ${r} square${r > 1 ? 's' : ''} of this ship`; }
    case 'mine': return `Place a hidden mine next to this ship (max ${a.max})`;
    case 'repair': return `Heal ${a.amount} HP on an adjacent ship, rig or platform`;
    case 'spoof': return `Plant a fake contact on the enemy's screen within ${a.range}`;
    case 'salvage': return `Recover ${a.share * 100}% of a wreck's value (adjacent)`;
    case 'clean': return `Clean up an oil slick within ${a.range}: takes ${SPILLS.clean.rounds} rounds off it`;
    case 'board': return `Capture an adjacent enemy ship that's burning (🔥: ${E.pstat(S.st, p, 'boardShare') ? 'half' : 'a third'} of its HP or less). The skiff's crew goes over; if the ship isn't burning they're beaten back (−1 HP)`;
    case 'assault': return `Capture an enemy base (not an Admiralty) within ${a.range}: its central rig must be at half HP or less, with no defending ships within 2 squares${a.cooldown ? `, reload ${a.cooldown}` : ''}`;
  }
  return '';
}

const describeShip = (def, p) => def.actions.map(a => `${a.name}${a.money ? ` ($${a.money}${a.shots > 1 ? '/shot' : ''})` : ''}: ${describeAction(a, p)}`).join('\n');

function shapeSvg(shape, W = 52, H = 24) {
  const w = Math.max(...shape.map(c => c[0])) + 1, h = Math.max(...shape.map(c => c[1])) + 1;
  const s = Math.min(9, Math.floor((W - 4) / w), Math.floor((H - 2) / h));
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><g transform="translate(${(W - w * s) / 2},${(H - h * s) / 2})">${shape.map(([x, y]) => `<rect x="${x * s}" y="${y * s}" width="${s - 1}" height="${s - 1}" rx="1.5" fill="#2bb3a3"/>`).join('')}</g></svg>`;
}
