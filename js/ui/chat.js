// Chat for online games: a small panel in the bottom-left corner, in the lobby and during the game.
// Lines and quick emotes go through the host (net/session.js); this file only shows them.
//   / (slash) opens the chat and puts the cursor in it; Esc or Enter on an empty line closes it.
import { PLAYER_COLORS } from '../data/maps.js';
import { play } from './sound.js';

const EMOTES = [
  ['👍', '👍'], ['👋', '👋'], ['😂', '😂'], ['😮', '😮'], ['😡', '😡'], ['🤝', '🤝'], ['🎯', '🎯'], ['💥', '💥'],
  ['gg', 'GG'], ['glhf', 'GL HF'], ['wait', 'Wait!'], ['hurry', 'Hurry up'], ['nice', 'Nice move'], ['oops', 'Oops'],
];
const EMOTE_TEXT = Object.fromEntries(EMOTES);
let say = () => {}, mySeat = () => null;
let lines = [], open = false, unread = 0, shown = false, peekTimer = null;

export function initChat(o) { say = o.say; mySeat = o.mySeat; }

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lineHtml = l => {
  const c = PLAYER_COLORS[l.seat] || '#9ab';
  const body = l.emote ? `<span class="chat-emote">${esc(EMOTE_TEXT[l.emote] || l.emote)}</span>` : esc(l.text);
  return `<div class="chat-line"><b style="color:${c}">${esc(l.name)}</b> ${body}</div>`;
};

function el() {
  let e = document.getElementById('chat');
  if (e) return e;
  e = document.createElement('div');
  e.id = 'chat'; e.className = 'chat hidden';
  e.innerHTML = `
    <button class="chat-toggle" data-chattoggle title="Chat (/)">💬 <span data-chatunread class="chat-unread hidden"></span></button>
    <div class="chat-peek hidden" data-chatpeek></div>
    <div class="chat-box hidden" data-chatbox>
      <div class="chat-head"><b>💬 Chat</b><button class="ghost" data-chatclose title="Close (Esc)">✕</button></div>
      <div class="chat-log" data-chatlog></div>
      <div class="chat-emotes">${EMOTES.map(([k, t]) => `<button data-emote="${k}" title="${esc(t)}">${esc(t)}</button>`).join('')}</div>
      <form class="chat-form" data-chatform><input class="text-in" data-chatin maxlength="200" placeholder="Say something… (Enter to send)" autocomplete="off"></form>
    </div>`;
  document.body.appendChild(e);
  e.querySelector('[data-chattoggle]').onclick = () => setOpen(!open);
  e.querySelector('[data-chatclose]').onclick = () => setOpen(false);
  e.querySelector('[data-chatform]').onsubmit = ev => {
    ev.preventDefault();
    const inp = e.querySelector('[data-chatin]'), t = inp.value.trim();
    if (!t) { if (!e.classList.contains('docked')) setOpen(false); return; }
    say(t); inp.value = '';
  };
  e.querySelector('[data-chatin]').onkeydown = ev => { ev.stopPropagation(); if (ev.key === 'Escape' && !e.classList.contains('docked')) { ev.preventDefault(); setOpen(false); } };
  e.querySelectorAll('[data-emote]').forEach(b => b.onclick = () => say(null, b.dataset.emote));
  return e;
}

function setOpen(v, focus = true) {
  open = v;
  const e = el();
  e.querySelector('[data-chatbox]').classList.toggle('hidden', !open);
  e.querySelector('[data-chattoggle]').classList.toggle('hidden', open);
  e.querySelector('[data-chatpeek]').classList.add('hidden');
  if (open) { unread = 0; renderLog(); if (focus) e.querySelector('[data-chatin]').focus(); }
  else e.querySelector('[data-chatin]').blur();
  renderUnread();
}
function renderUnread() {
  const u = el().querySelector('[data-chatunread]');
  u.textContent = unread > 9 ? '9+' : unread;
  u.classList.toggle('hidden', !unread);
}
function renderLog() {
  const log = el().querySelector('[data-chatlog]');
  log.innerHTML = lines.length ? lines.map(lineHtml).join('') : '<div class="muted small">No messages yet. Say hi!</div>';
  log.scrollTop = log.scrollHeight;
}

// In the lobby the chat sits inside the page (always open) instead of floating over it. The page is
// redrawn whenever someone joins or a setting changes, so the chat is lifted out first and put back
// after, keeping what you were typing.
let hadFocus = false;
export function undockChat() {
  const e = document.getElementById('chat');
  if (!e || !e.classList.contains('docked')) return;
  hadFocus = document.activeElement === e.querySelector('[data-chatin]');
  document.body.appendChild(e);
}
export function dockChat(slot) {
  const e = el();
  if (!slot) {
    if (e.classList.contains('docked')) { e.classList.remove('docked'); document.body.appendChild(e); setOpen(false, false); }
    return;
  }
  e.classList.add('docked');
  slot.appendChild(e);
  shown = true; e.classList.remove('hidden');
  setOpen(true, false);
  if (hadFocus) e.querySelector('[data-chatin]').focus();
  hadFocus = false;
}

// Show or hide the whole thing (only in online games and lobbies).
export function showChat(v, { openNow = false } = {}) {
  const e = el();
  if (v === shown && !openNow) return;
  shown = v;
  e.classList.toggle('hidden', !v);
  if (!v) { setOpen(false); return; }
  if (openNow) setOpen(true, false);
}
export function setChatLines(list) { lines = [...(list || [])]; unread = 0; renderLog(); renderUnread(); }
export function addChat(line) {
  lines.push(line);
  if (lines.length > 80) lines.shift();
  renderLog();
  if (line.seat === mySeat()) return;
  play('chime', 0);
  if (!open && shown && !el().classList.contains('docked')) {
    unread++; renderUnread();
    const pk = el().querySelector('[data-chatpeek]');
    pk.innerHTML = lineHtml(line);
    pk.classList.remove('hidden');
    clearTimeout(peekTimer);
    peekTimer = setTimeout(() => pk.classList.add('hidden'), line.emote ? 3500 : 5000);
  }
}

// "/" opens the chat
document.addEventListener('keydown', e => {
  if (!shown || open || e.key !== '/' || e.target?.closest?.('input, textarea, select')) return;
  e.preventDefault();
  setOpen(true);
});
