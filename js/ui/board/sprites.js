// Ship sprites on the board: each ship type drawn top-down (shipart.js) in its owner's colour, rasterised
// once per size and colour, then turned to the ship's heading. Until a picture is ready (or when zoomed
// far out) the plain hull is drawn instead.
import { SPRITES, shipSVG } from './shipart.js';
import { S } from '../state.js';
import { requestDraw } from './render.js';

const SIZES = [16, 24, 32, 44, 60, 84]; // pixels a square the pictures are made at
const cache = new Map();
const dpr = () => window.devicePixelRatio || 1;

export const hasSprite = type => !!SPRITES[type];
export const spriteZoom = () => S.cell >= 12;

function picture(type, color) {
  const want = S.cell * dpr(), size = SIZES.find(z => z >= want) || SIZES[SIZES.length - 1];
  const key = type + '|' + color + '|' + size;
  let e = cache.get(key);
  if (e) return e.ready ? e.canvas : null;
  e = { ready: false, canvas: null };
  cache.set(key, e);
  const [w, h] = SPRITES[type];
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = w * size; c.height = h * size;
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    e.canvas = c; e.ready = true;
    requestDraw();
  };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(shipSVG(type, color));
  return null;
}

// Draw a ship's sprite with its top-left square at board pixel (X, Y), facing rot (0–3, quarter turns
// clockwise like cellsOf). Returns false if the picture isn't ready yet.
export function drawSprite(ctx, type, X, Y, rot, color, alpha = 1) {
  const pic = picture(type, color);
  if (!pic) return false;
  const [w, h] = SPRITES[type], c = S.cell;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  const r = ((rot % 4) + 4) % 4;
  if (r === 0) ctx.translate(X, Y);
  else if (r === 1) { ctx.translate(X + h * c, Y); ctx.rotate(Math.PI / 2); }
  else if (r === 2) { ctx.translate(X + w * c, Y + h * c); ctx.rotate(Math.PI); }
  else { ctx.translate(X, Y + w * c); ctx.rotate(-Math.PI / 2); }
  ctx.drawImage(pic, 0, 0, w * c, h * c);
  ctx.restore();
  return true;
}
