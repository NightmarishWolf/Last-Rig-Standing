// Camera: which part of the world is on screen, and how zoomed in.
// S.cam is the top-left corner of the view, in squares. S.cell is the zoom (pixels per square).
// Small maps (like the tutorial) are simply shown whole ("fit" mode, no scrolling).
import { S } from './state.js';

export const ZOOM = { min: 3, max: 48, start: 22 };

// How many squares fit on screen at the current zoom.
export const viewSquares = () => ({ w: S.view.w / S.cell, h: S.view.h / S.cell });

// Visible square range (inclusive), clamped to the map.
export function visibleRange() {
  const v = viewSquares();
  return {
    x0: Math.max(0, Math.floor(S.cam.x)), y0: Math.max(0, Math.floor(S.cam.y)),
    x1: Math.min(S.st.W - 1, Math.ceil(S.cam.x + v.w)), y1: Math.min(S.st.H - 1, Math.ceil(S.cam.y + v.h)),
  };
}

// The furthest you can zoom out: the whole map fits on screen.
export const minZoom = () => Math.max(ZOOM.min, Math.min(S.view.w / S.st.W, S.view.h / S.st.H));

export function clampCam() {
  if (S.fit) { S.cam.x = 0; S.cam.y = 0; return; }
  S.cell = Math.min(ZOOM.max, Math.max(minZoom(), S.cell));
  const v = viewSquares(), pad = 4;
  S.cam.x = v.w >= S.st.W ? (S.st.W - v.w) / 2 : Math.min(S.st.W - v.w + pad, Math.max(-pad, S.cam.x));
  S.cam.y = v.h >= S.st.H ? (S.st.H - v.h) / 2 : Math.min(S.st.H - v.h + pad, Math.max(-pad, S.cam.y));
}

export function centerOn(x, y) {
  const v = viewSquares();
  S.cam.x = x + 0.5 - v.w / 2; S.cam.y = y + 0.5 - v.h / 2;
  clampCam();
}

// Zoom in/out keeping the square under (sx, sy) screen pixels in place.
export function zoomAt(factor, sx, sy) {
  if (S.fit) return;
  const wx = S.cam.x + sx / S.cell, wy = S.cam.y + sy / S.cell;
  S.cell = Math.min(ZOOM.max, Math.max(minZoom(), S.cell * factor));
  S.cam.x = wx - sx / S.cell; S.cam.y = wy - sy / S.cell;
  clampCam();
}

export function panBy(dxPixels, dyPixels) {
  if (S.fit) return;
  S.cam.x -= dxPixels / S.cell; S.cam.y -= dyPixels / S.cell;
  clampCam();
}

// Each player keeps their own camera between turns; a new player starts looking at their home.
export function switchCameraTo(p) {
  if (S.camOwner === p && S.camGame === S.st) return;
  if (S.camOwner !== null && S.camGame === S.st) S.cams[S.camOwner] = { x: S.cam.x, y: S.cam.y, cell: S.cell };
  if (S.camGame !== S.st) S.cams = {};
  S.camOwner = p; S.camGame = S.st;
  const saved = S.cams[p];
  if (saved) { S.cell = saved.cell; S.cam.x = saved.x; S.cam.y = saved.y; clampCam(); return; }
  S.cell = ZOOM.start;
  const sp = S.st.players[p].spawn, home = S.st.players[p].home;
  // look at the home waters, with the spawn strip in view
  centerOn(Math.round((sp.x0 + sp.x1 + home.x0 + home.x1) / 4), Math.round((home.y0 + home.y1) / 2));
}
