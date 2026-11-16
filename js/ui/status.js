// The hint line under the board, and error toasts.
import * as E from '../engine/index.js';
import { SHIPS } from '../data/ships.js';
import { oilInfo } from './board/tooltip.js';
import { centerOffset, me, planRot, pname, reach, selected } from './helpers.js';
import { S } from './state.js';
import { PLATFORMS } from '../data/bases.js';
import { voyagePreview, voyageLabel } from './board/modes.js';

export function updateStatus() {
  const el = document.getElementById('status');
  const s = selected();
  let t = '';
  if (S.mode.kind === 'move' && s) {
    if (S.hover) {
      const pr = planRot(s);
      const [ox, oy] = centerOffset(s.type, pr);
      const n = reach().get((S.hover.x - ox) + ',' + (S.hover.y - oy) + ',' + pr);
      const wp = S.plan.length;
      t = wp ? (() => {
        const path = voyagePreview(s, S.hover.x - ox, S.hover.y - oy, pr);
        if (!path || !path.length) return `<b>${wp} waypoint${wp > 1 ? 's' : ''}</b> planned. No sea route from there to here. Pick another spot (Esc clears the waypoints).`;
        return `<b>${wp} waypoint${wp > 1 ? 's' : ''}</b> planned. Click to finish the route here: <b>${E.pathMoves(path, s.rot)} squares</b>, ${voyageLabel(s, E.pathMoves(path, s.rot))}, about <b class="oil">${E.fmt2(E.moveCost(S.st, s, E.pathMoves(path, s.rot)))} oil</b>. <b>Shift+click</b> adds another waypoint, <b>Esc</b> clears them.`;
      })() : n ? `Move ${n.d} square${n.d > 1 ? 's' : ''} for <b class="oil">${E.fmt2(E.moveCost(S.st, s, n.d))} oil</b>. Green dashed box = what it would see from there. Click to move.` : (() => {
        if (S.fit) return 'Click a highlighted spot to move, or pick an action in the panel.';
        const path = voyagePreview(s, S.hover.x - ox, S.hover.y - oy, pr);
        if (!path || !path.length) return 'No sea route to there. Pick another spot, or an action in the panel.';
        const f = E.fleetOf(S.st, s.id);
        if (f) return `Click to send <b>Fleet ${f.name}</b> here (about ${E.pathMoves(path, s.rot)} squares at speed ${E.fleetSpeed(S.st, f)}). The whole fleet sails in formation each time you end your turn. <b>Shift+click</b> to add a waypoint instead.`;
        return `Click to set sail: <b>${E.pathMoves(path, s.rot)} squares</b>, ${voyageLabel(s, E.pathMoves(path, s.rot))}, about <b class="oil">${E.fmt2(E.moveCost(S.st, s, E.pathMoves(path, s.rot)))} oil</b> in total. The ship sails on by itself each time you end your turn. <b>Shift+click</b> to add a waypoint instead.`;
      })();
    } else t = `<b>${SHIPS[s.type].name}</b> selected. White dashed box = what it can see (sight ${SHIPS[s.type].sight}). Click a highlighted spot to move. <b>R</b> plans a turn (it only turns when it moves). <b>Shift+click</b> adds waypoints to route around things. Esc to deselect.`;
  } else if (S.mode.kind === 'target' && s) {
    const a = SHIPS[s.type].actions.find(x => x.id === S.mode.actionId);
    t = `<b>${a.name}</b>: click a target in the highlighted range. Right-click or Esc to cancel.`;
  } else if (S.mode.kind === 'fleetPick') t = `<b>Forming a fleet:</b> click your ships to add or remove them (${S.mode.ids.length} picked), then <b>Create fleet</b> in the panel. Esc to cancel.`;
  else if (S.mode.kind === 'baseStrike') {
    const o = (S.st.platforms || []).find(x => x.id === S.mode.platformId);
    const why = o && S.hover && E.strikeProblem(S.st, me(), o, S.hover.x, S.hover.y);
    t = `<b>${E.strikeName(o.kind)}</b>: click a square in the shaded range.${why ? ` <span style="color:#f09595">${why}</span>` : ''} Esc to cancel.`;
  }
  else if (S.mode.kind === 'satellite') t = '<b>Satellite pass</b>: click anywhere on the map to reveal a 7×7 area. Esc to cancel.';
  else if (S.mode.kind === 'patrolPick') t = `<b>Patrol:</b> click the points to patrol between (${S.mode.points.length} so far), then <b>Start patrol</b> in the panel. Esc to cancel.`;
  else if (S.mode.kind === 'escortPick') t = `<b>Escort:</b> click one of your ships to look after. Esc to cancel.`;
  else if (S.mode.kind === 'placePlatform') {
    const why = S.hover && E.platformProblem(S.st, me(), S.mode.platform, S.hover.x, S.hover.y);
    const def = PLATFORMS[S.mode.platform];
    t = S.hover && !why ? `Click to build a <b>${def.name}</b> here for <b class="money">$${E.platformCost(S.st, me(), S.mode.platform)}</b> (${def.turns} turns). ${def.text}`
      : `Place a <b>${def.name}</b> on a <b style="color:#7fd17a">highlighted square</b> inside the base's claim.${why ? ` <span style="color:#f09595">${why}</span>` : ''} Esc to cancel.`;
  }
  else if (S.mode.kind === 'placePort') {
    const why = S.hover && E.portBuildProblem(S.st, me(), S.hover.x, S.hover.y);
    t = S.hover && !why ? `Click to build a forward port here for <b class="money">$${E.portCost(S.st, me())}</b>. Ships can launch inside the dashed area.`
      : `Click a <b style="color:#7fd17a">highlighted island coast</b> next to one of your ships to build a port.${why ? ` <span style="color:#f09595">${why}</span>` : ''} Esc to cancel.`;
  }
  else if (S.mode.kind === 'placeRig') {
    const any = E.getView(S.st, me()).deposits.some(d => !E.rigBuildProblem(S.st, me(), d.x, d.y));
    const why = S.hover && E.rigBuildProblem(S.st, me(), S.hover.x, S.hover.y);
    t = !any ? '<b>No deposit available right now.</b> A rig needs a discovered deposit with one of your ships right next to it (Survey, Command, Repair Ships and Carriers can be up to 5 squares away). Esc to cancel.'
      : S.hover && !why ? `Click to build a rig here for <b class="money">$${E.rigCost(S.st, me())}</b>.`
      : `Click a <b style="color:#7fd17a">highlighted deposit</b> to build a rig.${why && S.hover ? ` <span style="color:#f09595">${why}</span>` : ''} Esc to cancel.`;
  }
  else t = S.fit ? 'Click one of your ships to select it. Red-outlined "?" = enemy contacts (coloured by owner). S/M/R = small/medium/rich oil.'
    : 'Click a ship to select it (<b>Tab</b> = next ship). <b>Drag</b> or <b>WASD</b> to scroll, <b>mouse wheel</b> to zoom, click the minimap to jump.';
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
