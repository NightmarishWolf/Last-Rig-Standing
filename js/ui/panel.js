// The side panel (resources, selected ship, shipyard, log) and the top bar.
import * as E from '../engine/index.js';
import { DEPOSITS, DOMINATION, ECONOMY, PORT, TIER_RIGS } from '../data/economy.js';
import { PASSIVE_TEXT, SHIPS } from '../data/ships.js';
import { me, pcol, pname, selected } from './helpers.js';
import { S } from './state.js';

// ---------- panel ----------
export function renderTop() {
  const p = me();
  document.getElementById('turn-info').innerHTML =
    `<b style="color:${pcol(p)}">${pname(p)}</b> · Round ${S.st.round} · Your home waters have the <b style="color:${pcol(p)}">${['teal', 'orange', 'purple', 'gold'][p]}</b> dashed border`;
}

export function renderPanel() {
  const p = me(), pl = S.st.players[p];
  const rigs = E.rigsOwned(S.st, p);
  const tier = rigs >= TIER_RIGS[3] ? 3 : rigs >= TIER_RIGS[2] ? 2 : 1;
  const s = selected();
  let html = `
  <div class="card">
    <h3>Admirals</h3>
    <div class="row" style="margin-top:0">${S.st.players.map((o, i) => `<span class="chip ${o.out ? 'out' : ''} ${i === p ? 'me' : ''}" style="--c:${pcol(i)}">${o.name}${o.seat === 'ai' ? ' (CPU)' : ''}${o.out ? ' · out' : ''}${S.st.domination && o.domStreak > 0 && !o.out ? ` · <b style="color:#ffd666">domination ${o.domStreak}/${DOMINATION.rounds}</b>` : ''}</span>`).join('')}</div>
    ${S.st.domination ? `<div class="small muted" style="margin-top:6px">Domination: hold rigs on ${E.dominationNeed(S.st)} of ${E.middleDeposits(S.st).length} No Man's Sea deposits for ${DOMINATION.rounds} rounds to win. You hold ${E.middleRigs(S.st, p)}.</div>` : ''}
  </div>
  <div class="card">
    <h3>Resources</h3>
    <div class="stats">
      <div class="stat"><span>Money</span><span class="v money">$${pl.money}</span></div>
      <div class="stat"><span>Oil</span><span class="v oil" title="Storage cap: oil pumped past ${ECONOMY.oilCap} spills">${pl.oil}/${ECONOMY.oilCap}</span></div>
      <div class="stat"><span>Oil price</span><span class="v">$${S.st.market.price.toFixed(2)}</span></div>
      <div class="stat"><span>Rigs</span><span class="v">${rigs}</span></div>
      <div class="stat"><span>Fleet</span><span class="v">${S.st.ships.filter(x => x.owner === p).length} ships</span></div>
      <div class="stat"><span>Upkeep</span><span class="v" style="color:#f09595">−$${E.upkeepTotal(S.st, p)}/turn</span></div>
      <div class="stat"><span>Oil/turn</span><span class="v oil">+${S.st.rigs.filter(r => r.owner === p).reduce((t, r) => { const d = S.st.deposits.find(d => d.id === r.depId); return t + Math.min(DEPOSITS[d.type].rate, d.reserves); }, 0)}</span></div>
      <div class="stat"><span>Tier</span><span class="v">${tier}</span></div>
    </div>
    <div class="small muted" style="margin-top:6px">Sell oil (price drops as you sell, recovers each turn):</div>
    <div class="row">
      ${[1, 5, 10].map(n => `<button data-sell="${n}" ${pl.oil < n ? 'disabled' : ''}>Sell ${n} ($${E.sellValue(S.st, n).total})</button>`).join('')}
      <button data-sell="all" ${pl.oil < 1 ? 'disabled' : ''}>All</button>
    </div>
    <div class="row">
      <button data-rig="1" class="${S.mode.kind === 'placeRig' ? 'active' : ''}" ${pl.money < E.rigCost(S.st, p) ? 'disabled' : ''}>Build rig ($${E.rigCost(S.st, p)})</button>
      <button data-port="1" class="${S.mode.kind === 'placePort' ? 'active' : ''}" ${pl.money < E.portCost(S.st, p) ? 'disabled' : ''} title="Build on an island coast next to one of your ships. Launch new ships near it.">Build port ($${E.portCost(S.st, p)})</button>
      <button data-end="1" class="primary" style="margin-left:auto">End turn</button>
    </div>
  </div>`;

  if (s) {
    const def = SHIPS[s.type];
    const pas = Object.entries(def.passives || {}).map(([k, val]) => PASSIVE_TEXT[k] ? `<li>${PASSIVE_TEXT[k](val)}</li>` : '').join('');
    const canMove = !(s.acted && !def.passives?.hitAndRun);
    html += `
    <div class="card">
      <h3>Selected · ${def.name}</h3>
      <div class="stats">
        <div class="stat"><span>HP</span><span class="v">${s.hp}/${def.hp}</span></div>
        <div class="stat"><span>Moves left</span><span class="v">${canMove ? s.movesLeft : 0}</span></div>
        <div class="stat"><span>Oil/square</span><span class="v oil">${def.oil}${E.moveCost(S.st, s, 2) < def.oil * 2 ? ' (½)' : ''}</span></div>
        <div class="stat"><span>Sight</span><span class="v">${def.sight}</span></div>
        <div class="stat"><span>Upkeep</span><span class="v">$${E.upkeepOf(s.type)}/turn</span></div>
      </div>
      ${pas ? `<ul class="small muted" style="padding-left:18px;margin:8px 0 0">${pas}</ul>` : ''}
      ${def.actions.map(a => {
        const why = E.canUseAction(S.st, s, a);
        const shots = s.activeAction === a.id && s.shotsLeft > 0 ? ` — ${s.shotsLeft} shot${s.shotsLeft > 1 ? 's' : ''} left` : '';
        return `<button class="action-btn ${S.mode.kind === 'target' && S.mode.actionId === a.id ? 'active' : ''}" data-act="${a.id}" ${why ? 'disabled' : ''}>
          <b>${a.name}</b>${a.free ? ' <span class="small muted">(free)</span>' : ''}${shots}
          <span class="why">${why || describeAction(a)}</span></button>`;
      }).join('')}
      <div class="row">
        <button data-rotate="1" ${!canMove || s.movesLeft < 1 ? 'disabled' : ''}>Turn 90° (R) · ${E.moveCost(S.st, s, 1)} oil</button>
        <button data-deselect="1" class="ghost">Deselect</button>
      </div>
    </div>`;
  }

  html += `<div class="card"><h3>Shipyard</h3><div class="small muted">New ships launch in your spawn zone (the lighter strip at your map edge) or within ${PORT.range} squares of one of your forward ports. Ready next turn. Press R to turn while placing.</div>`;
  for (const t of [1, 2, 3]) {
    const unlocked = E.tierUnlocked(S.st, p, t);
    html += `<div class="shop-tier"><div class="tier-head"><span>Tier ${t}</span><span>${unlocked ? 'Unlocked' : `Needs ${TIER_RIGS[t]} rigs`}</span></div>`;
    for (const [k, def] of Object.entries(SHIPS).filter(([, d]) => d.tier === t)) {
      const afford = pl.money >= def.cost;
      const tip = [describeShip(def), ...Object.entries(def.passives || {}).map(([pk, pv]) => PASSIVE_TEXT[pk]?.(pv))].filter(Boolean).join('\n');
      html += `<div class="shop-item ${unlocked ? '' : 'locked'}" title="${tip.replace(/"/g, '&quot;')}">
        ${shapeSvg(def.shape)}
        <div><div class="name">${def.name}</div><div class="meta">HP ${def.hp} · Move ${def.move} · ${def.oil} oil/sq · Sight ${def.sight} · Upkeep $${E.upkeepOf(k)}</div></div>
        <button data-buy="${k}" class="${S.mode.kind === 'placeShip' && S.mode.ship === k ? 'active' : ''}" ${!unlocked || !afford ? 'disabled' : ''}>$${def.cost}</button>
      </div>`;
    }
    html += '</div>';
  }
  html += '</div>';

  html += `<div class="card"><h3>Log</h3><div class="log">${pl.log.map(l => `<div class="${l.turn >= S.st.turnCount - 1 ? 'new' : ''}">${l.text}</div>`).join('')}</div></div>`;
  document.getElementById('panel').innerHTML = html;
}

function describeAction(a) {
  switch (a.kind) {
    case 'attack': return `Range ${a.range}, ${a.dmg} dmg${a.shots ? ` × ${a.shots} shots` : ''}${a.area === 3 ? ', 3×3 area' : ''}${a.subsOnly ? ', subs only' : ''}${a.rigMult ? `, ×${a.rigMult} vs rigs` : ''}${a.cooldown ? `, reload ${a.cooldown}` : ''}`;
    case 'scan': return `Reveal a ${a.size}×${a.size} area within ${a.range}${a.cooldown ? `, reload ${a.cooldown}` : ''}`;
    case 'survey': return `Find oil within ${a.radius} square${a.radius > 1 ? 's' : ''} of this ship`;
    case 'mine': return `Place a hidden mine next to this ship (max ${a.max})`;
    case 'repair': return `Heal ${a.amount} HP on an adjacent ship or rig`;
    case 'spoof': return `Plant a fake contact on the enemy's screen within ${a.range}`;
    case 'salvage': return `Recover ${a.share * 100}% of a wreck's value (adjacent)`;
  }
  return '';
}

const describeShip = def => def.actions.map(a => `${a.name}: ${describeAction(a)}`).join('\n');

function shapeSvg(shape) {
  const s = 9, w = Math.max(...shape.map(c => c[0])) + 1, h = Math.max(...shape.map(c => c[1])) + 1;
  return `<svg width="52" height="24" viewBox="0 0 52 24"><g transform="translate(${(52 - w * s) / 2},${(24 - h * s) / 2})">${shape.map(([x, y]) => `<rect x="${x * s}" y="${y * s}" width="${s - 1}" height="${s - 1}" rx="1.5" fill="#2bb3a3"/>`).join('')}</g></svg>`;
}
