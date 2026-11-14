// Saving and loading the game in the browser (localStorage).

const SAVE_KEY = 'last-rig-standing-save-v3';

export function save(st) {
  if (st.tutorial) return; // never overwrite the real save with the tutorial
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(st)); } catch { /* storage full or blocked */ }
}

export function load() {
  try { const raw = localStorage.getItem(SAVE_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
