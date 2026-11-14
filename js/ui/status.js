// The hint line under the board, and error toasts.
import * as E from '../engine/index.js';
import { SHIPS } from '../data/ships.js';
import { oilInfo } from './board/tooltip.js';
import { centerOffset, me, pname, reach, selected } from './helpers.js';
import { S } from './state.js';

export function updateStatus() {
  const el = document.getElementById('status');
  const s = selected();
  let t = '';
  if (S.mode.kind === 'move' && s) {
    if (S.hover) {
      const [ox, oy] = centerOffset(s.type, s.rot);
      const n = reach().get((S.hover.x - ox) + ',' + (S.hover.y - oy));
      t = n ? `Move ${n.d} square${n.d > 1 ? 's' : ''} for <b class="oil">${E.moveCost(S.st, s, n.d)} oil</b>. Green dashed box = what it would see from there. Click to move.` : 'Click a highlighted spot to move, or pick an action in the panel.';
    } else t = `<b>${SHIPS[s.type].name}</b> selected. White dashed box = what it can see (sight ${SHIPS[s.type].sight}). Click a highlighted spot to move. R to turn. Esc to deselect.`;
  } else if (S.mode.kind === 'target' && s) {
    const a = SHIPS[s.type].actions.find(x => x.id === S.mode.actionId);
    t = `<b>${a.name}</b>: click a target in the highlighted range. Right-click or Esc to cancel.`;
  } else if (S.mode.kind === 'placeShip') t = `Place your <b>${SHIPS[S.mode.ship].name}</b> in the outlined launch zone: your spawn strip, or near one of your forward ports. R to turn, Esc to cancel.`;
  else if (S.mode.kind === 'placePort') {
    const why = S.hover && E.portBuildProblem(S.st, me(), S.hover.x, S.hover.y);
    t = S.hover && !why ? `Click to build a forward port here for <b class="money">$${E.portCost(S.st, me())}</b>. Ships can launch inside the dashed area.`
      : `Click a <b style="color:#7fd17a">highlighted island coast</b> next to one of your ships to build a port.${why ? ` <span style="color:#f09595">${why}</span>` : ''} Esc to cancel.`;
  }
  else if (S.mode.kind === 'placeRig') {
    const any = E.getView(S.st, me()).deposits.some(d => !E.rigBuildProblem(S.st, me(), d.x, d.y));
    const why = S.hover && E.rigBuildProblem(S.st, me(), S.hover.x, S.hover.y);
    t = !any ? '<b>No deposit available right now.</b> A rig needs a discovered deposit with one of your ships right next to it. Esc to cancel.'
      : S.hover && !why ? `Click to build a rig here for <b class="money">$${E.rigCost(S.st, me())}</b>.`
      : `Click a <b style="color:#7fd17a">highlighted deposit</b> to build a rig.${why && S.hover ? ` <span style="color:#f09595">${why}</span>` : ''} Esc to cancel.`;
  }
  else t = 'Click one of your ships to select it. Red-outlined "?" = enemy contacts (coloured by owner). S/M/R = small/medium/rich oil.';
  const oil = S.hover && oilInfo(E.getView(S.st, me()), S.hover.x, S.hover.y);
  if (oil && S.mode.kind !== 'target') t = oil.map(l => l.t).join(' · ');
  if (S.hover) t += ` <span class="muted">· ${E.coord(S.hover.x, S.hover.y)}${(S.st.players[me()].surveyed || {})[S.hover.x + ',' + S.hover.y] ? ' · <span style="color:#a9d77a">surveyed</span>' : ''} · ${(z => z === 'middle' ? "No Man's Sea" : z === me() ? 'Your waters' : pname(z) + "'s waters")(E.zoneOf(S.st, S.hover.x, S.hover.y))}</span>`;
  el.innerHTML = t;
}

export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.remove('hidden');
  clearTimeout(S.toastTimer); S.toastTimer = setTimeout(() => el.classList.add('hidden'), 2600);
}
