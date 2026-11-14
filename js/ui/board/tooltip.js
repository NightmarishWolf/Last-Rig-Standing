// Hover tooltip for oil deposits, rigs and ports (e.g. "18/35 oil left").
import { DEPOSITS, PORT, RIG } from '../../data/economy.js';
import { roundRect } from './canvas.js';
import { MARGIN } from '../constants.js';
import { me, pcol, pname, px, py } from '../helpers.js';
import { S } from '../state.js';

// Hovering an oil spot or rig shows how much oil is left, e.g. "18/35 oil left".
export function oilInfo(v, x, y) {
  const dep = v.deposits.find(d => d.x === x && d.y === y);
  const myRig = v.myRigs.find(r => r.x === x && r.y === y);
  const enemyRig = v.enemyRigs.find(r => r.x === x && r.y === y);
  const port = [...v.myPorts, ...v.enemyPorts].find(o => o.x === x && o.y === y);
  if (port) return [
    { t: port.owner === me() ? 'Your forward port' : `${pname(port.owner)}'s forward port`, c: pcol(port.owner) },
    { t: `HP ${port.hp}/${PORT.hp}`, c: '#ffffff', big: true },
    { t: `Launches ships within ${PORT.range} squares`, c: '#9fb3c6' },
  ];
  if (!dep && !myRig && !enemyRig) return null;
  const lines = [];
  if (myRig) lines.push({ t: `Your oil rig · HP ${myRig.hp}/${RIG.hp}`, c: pcol(me()) });
  else if (enemyRig) lines.push({ t: `${pname(enemyRig.owner)}'s oil rig`, c: pcol(enemyRig.owner) });
  if (dep) {
    const info = DEPOSITS[dep.type], max = dep.max ?? dep.reserves;
    lines.push({ t: `${info.name} deposit`, c: '#f0a531' });
    lines.push({ t: dep.reserves > 0 ? `${dep.reserves}/${max} oil left` : `Dry (0/${max})`, c: dep.reserves > 0 ? '#ffffff' : '#9aa5b1', big: true });
    if (dep.reserves > 0) lines.push({ t: `Pumps ${info.rate}/turn · about ${Math.ceil(dep.reserves / info.rate)} turns left`, c: '#9fb3c6' });
    if (!myRig && !enemyRig && dep.reserves > 0) lines.push({ t: 'No rig yet', c: '#9fb3c6' });
  } else lines.push({ t: 'Deposit not surveyed', c: '#9fb3c6' });
  return lines;
}

export function drawOilTooltip(v) {
  if (!S.hover || S.mode.kind === 'target') return;
  const lines = oilInfo(v, S.hover.x, S.hover.y);
  if (!lines) return;
  S.ctx.textAlign = 'left'; S.ctx.textBaseline = 'top';
  const fs = 12, lh = 17;
  const w = 12 + Math.max(...lines.map(l => { S.ctx.font = `${l.big ? 'bold 14px' : fs + 'px'} system-ui`; return S.ctx.measureText(l.t).width; })) + 12;
  const h = 10 + lines.reduce((t, l) => t + (l.big ? lh + 3 : lh), 0) + 6;
  let x = px(S.hover.x) + S.cell + 6, y = py(S.hover.y) - 4;
  if (x + w > MARGIN + S.st.W * S.cell) x = px(S.hover.x) - w - 6;
  if (y + h > MARGIN + S.st.H * S.cell) y = MARGIN + S.st.H * S.cell - h;
  S.ctx.fillStyle = 'rgba(8, 18, 28, 0.95)'; roundRect(x, y, w, h, 6); S.ctx.fill();
  S.ctx.strokeStyle = 'rgba(240,165,49,0.7)'; S.ctx.lineWidth = 1; roundRect(x, y, w, h, 6); S.ctx.stroke();
  let ty = y + 8;
  for (const l of lines) {
    S.ctx.font = `${l.big ? 'bold 14px' : fs + 'px'} system-ui`; S.ctx.fillStyle = l.c;
    S.ctx.fillText(l.t, x + 12, ty); ty += l.big ? lh + 3 : lh;
  }
}
