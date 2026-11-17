// Sound effects, all made in code with the Web Audio API (no audio files to host).
// Volume and mute are remembered in the browser. Browsers only allow sound after the player has
// clicked or pressed a key, so the audio starts on the first input.
const PREF_KEY = 'lrs-prefs';
const prefs = () => { try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch { return {}; } };
const setPref = (k, v) => { try { localStorage.setItem(PREF_KEY, JSON.stringify({ ...prefs(), [k]: v })); } catch { /* blocked */ } };

let ac = null, master = null, noise = null, analyser = null;
export const volume = () => prefs().volume ?? 0.6;
export const muted = () => !!prefs().muted;
export function setVolume(v) { setPref('volume', v); if (master) master.gain.value = muted() ? 0 : v; }
export function setMuted(m) { setPref('muted', m); if (master) master.gain.value = m ? 0 : volume(); }

function audio() {
  if (ac) return ac;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ac = new AC();
  master = ac.createGain(); master.gain.value = muted() ? 0 : volume();
  // a gentle limiter so overlapping explosions don't clip
  const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6;
  master.connect(comp); comp.connect(ac.destination);
  analyser = ac.createAnalyser(); comp.connect(analyser);
  noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ac;
}
// Unlock on clicks / taps / keys (browsers block audio until the player interacts).
// iPhones and iPads also mute web audio when the ring/silent switch is on, unless the page is
// playing "media": a silent looping <audio> and the audio-session hint fix that.
let silent = null;
function unlock() {
  const a = audio();
  if (!a) return;
  if (a.state !== 'running') a.resume().catch(() => {});
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* older browsers */ }
  if (!silent) {
    silent = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
    silent.loop = true; silent.volume = 0.01; silent.setAttribute('playsinline', '');
  }
  if (silent.paused) silent.play().catch(() => {});
}
for (const ev of ['pointerdown', 'pointerup', 'click', 'touchend', 'keydown']) addEventListener(ev, unlock, { capture: true });

// ---------- building blocks ----------
function env(g, t, a, peak, decay) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + decay);
}
function noiseHit({ t, dur, type = 'lowpass', f0, f1 = f0, q = 1, peak = 0.6, attack = 0.005 }) {
  const src = ac.createBufferSource(); src.buffer = noise; src.loop = true;
  const f = ac.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ac.createGain(); env(g, t, attack, peak, dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t, Math.random() * 0.5); src.stop(t + attack + dur + 0.05);
}
function tone({ t, dur, f0, f1 = f0, type = 'sine', peak = 0.4, attack = 0.005, out = master }) {
  const o = ac.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ac.createGain(); env(g, t, attack, peak, dur);
  o.connect(g); g.connect(out);
  o.start(t); o.stop(t + attack + dur + 0.05);
}

// ---------- the sounds ----------
const SOUNDS = {
  gun: t => { noiseHit({ t, dur: 0.14, type: 'bandpass', f0: 1400, f1: 500, q: 0.8, peak: 0.5 }); tone({ t, dur: 0.16, f0: 160, f1: 50, peak: 0.5 }); },
  heavy: t => { noiseHit({ t, dur: 0.55, f0: 900, f1: 120, peak: 0.9 }); tone({ t, dur: 0.45, f0: 90, f1: 28, peak: 0.8 }); },
  rocket: t => { for (let i = 0; i < 3; i++) noiseHit({ t: t + i * 0.07, dur: 0.3, type: 'bandpass', f0: 2600, f1: 700, q: 1.5, peak: 0.35 }); },
  missile: t => { noiseHit({ t, dur: 0.7, type: 'bandpass', f0: 500, f1: 2600, q: 1.2, peak: 0.45, attack: 0.04 }); tone({ t, dur: 0.6, f0: 300, f1: 900, type: 'sawtooth', peak: 0.05, attack: 0.05 }); },
  cruise: t => { noiseHit({ t, dur: 1.1, type: 'bandpass', f0: 300, f1: 1800, q: 1, peak: 0.5, attack: 0.1 }); tone({ t, dur: 1, f0: 120, f1: 60, peak: 0.2, attack: 0.1 }); },
  torpedo: t => {
    tone({ t, dur: 0.18, f0: 120, f1: 60, peak: 0.6 }); // the tube's thunk
    for (let i = 0; i < 6; i++) tone({ t: t + 0.1 + i * 0.06, dur: 0.05, f0: 300 + Math.random() * 400, f1: 200, peak: 0.08 }); // bubbles
    noiseHit({ t: t + 0.05, dur: 0.6, f0: 400, f1: 150, peak: 0.25, attack: 0.05 });
  },
  depth: t => { tone({ t, dur: 0.08, f0: 500, f1: 200, peak: 0.2 }); noiseHit({ t: t + 0.25, dur: 0.6, f0: 260, f1: 60, peak: 0.9, attack: 0.02 }); },
  aa: t => { for (let i = 0; i < 6; i++) noiseHit({ t: t + i * 0.065, dur: 0.05, type: 'highpass', f0: 2500, peak: 0.35 }); },
  plane: t => { noiseHit({ t, dur: 1.2, f0: 250, f1: 500, q: 2, peak: 0.35, attack: 0.4 }); tone({ t, dur: 1.1, f0: 95, f1: 110, type: 'sawtooth', peak: 0.04, attack: 0.4 }); },
  boom: t => { noiseHit({ t, dur: 0.7, f0: 1600, f1: 90, peak: 0.9 }); tone({ t, dur: 0.5, f0: 75, f1: 30, peak: 0.7 }); },
  bigboom: t => { noiseHit({ t, dur: 1.4, f0: 1200, f1: 50, peak: 1 }); tone({ t, dur: 1.1, f0: 60, f1: 22, peak: 0.9 }); noiseHit({ t: t + 0.15, dur: 0.8, type: 'bandpass', f0: 3000, f1: 800, peak: 0.2 }); },
  splash: t => { noiseHit({ t, dur: 0.4, type: 'bandpass', f0: 2200, f1: 400, q: 0.7, peak: 0.35, attack: 0.01 }); },
  thud: t => { noiseHit({ t, dur: 0.5, f0: 300, f1: 60, peak: 0.6 }); tone({ t, dur: 0.4, f0: 70, f1: 35, peak: 0.6 }); }, // underwater hit
  flak: t => { for (let i = 0; i < 4; i++) noiseHit({ t: t + i * 0.09, dur: 0.18, f0: 1500, f1: 300, peak: 0.4 }); },
  ping: t => { tone({ t, dur: 0.6, f0: 1250, peak: 0.25, attack: 0.002 }); tone({ t: t + 0.32, dur: 0.5, f0: 1250, peak: 0.08, attack: 0.002 }); },
  chime: t => { tone({ t, dur: 0.25, f0: 660, peak: 0.18, type: 'triangle' }); tone({ t: t + 0.13, dur: 0.4, f0: 990, peak: 0.16, type: 'triangle' }); },
  oil: t => { for (let i = 0; i < 4; i++) tone({ t: t + i * 0.09, dur: 0.12, f0: 110 - i * 8, f1: 70, peak: 0.25 }); },
};

// Play a sound now, or `delay` seconds from now. Unknown names are ignored.
export function play(name, delay = 0) {
  if (muted() || !SOUNDS[name]) return;
  const a = audio();
  if (!a) return;
  const go = () => { try { SOUNDS[name](a.currentTime + Math.max(0, delay)); } catch (e) { console.warn('sound', name, e); } };
  if (a.state === 'running') go();
  else a.resume().then(() => { if (a.state === 'running') go(); }, () => {}); // still waking up: play as soon as it can
}

// for checking: the audio state and the current output level
export function soundCheck() {
  if (!analyser) return { state: ac?.state || 'none' };
  const d = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(d);
  return { state: ac.state, level: Math.sqrt(d.reduce((t, v) => t + v * v, 0) / d.length) };
}
