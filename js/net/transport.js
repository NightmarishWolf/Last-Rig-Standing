// How browsers talk to each other in an online game. Two interchangeable transports:
//
//   peer   (default) WebRTC peer-to-peer through PeerJS: the host's browser is reachable by its game
//          code, everyone connects straight to it. PeerJS's free public server only introduces the
//          browsers to each other; game messages go directly between them.
//   local  BroadcastChannel: tabs of the same browser on the same computer (testing, or two people on
//          one machine). Add ?net=local to the page address.
//
// Both give the same shape, so a server transport (Cloudflare) can slot in later:
//   host(code)    -> Promise<{ onConnection(cb(conn)), close() }>
//   join(code)    -> Promise<conn>
//   conn          = { id, send(msg), onMessage(cb), onClose(cb), close() }
const PEERJS_URL = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
const PREFIX = 'last-rig-standing-';

export const transportName = () => (new URLSearchParams(location.search).get('net') === 'local' ? 'local' : 'peer');
export const transport = () => (transportName() === 'local' ? localTransport : peerTransport);

// ---------- PeerJS (WebRTC) ----------
let peerLib = null;
function loadPeer() {
  if (window.Peer) return Promise.resolve(window.Peer);
  if (peerLib) return peerLib;
  peerLib = new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = PEERJS_URL; s.async = true;
    s.onload = () => (window.Peer ? ok(window.Peer) : fail(new Error('The online library didn\'t load.')));
    s.onerror = () => { peerLib = null; fail(new Error('Couldn\'t load the online library: check your internet connection.')); };
    document.head.appendChild(s);
  });
  return peerLib;
}
// Big messages (a whole game is 100-300 KB) are cut into pieces: browsers cap the size of a single
// WebRTC message, and some cap it low.
const CHUNK = 48000;
function wrapPeerConn(c) {
  const msgs = [], closes = [], parts = {};
  let closed = false;
  const closeAll = () => { if (!closed) { closed = true; closes.forEach(f => f()); } };
  c.on('data', d => {
    if (d && d.__chunk) {
      const p = parts[d.id] ||= [];
      p[d.i] = d.s;
      if (p.filter(x => x != null).length === d.n) { delete parts[d.id]; const m = JSON.parse(p.join('')); msgs.forEach(f => f(m)); }
      return;
    }
    msgs.forEach(f => f(d));
  });
  c.on('close', closeAll);
  c.on('error', closeAll);
  return {
    id: c.peer,
    send: m => {
      if (!c.open) return;
      const s = JSON.stringify(m);
      if (s.length <= CHUNK) { c.send(m); return; }
      const id = Math.random().toString(36).slice(2), n = Math.ceil(s.length / CHUNK);
      for (let i = 0; i < n; i++) c.send({ __chunk: 1, id, i, n, s: s.slice(i * CHUNK, (i + 1) * CHUNK) });
    },
    onMessage: f => msgs.push(f), onClose: f => closes.push(f), close: () => c.close(),
  };
}
const peerError = e => new Error(
  e?.type === 'unavailable-id' ? 'That game code is already being hosted (maybe in another tab).'
  : e?.type === 'peer-unavailable' ? 'No game found with that code. Check the code, and that the host has the game open.'
  : e?.type === 'network' || e?.type === 'server-error' || e?.type === 'socket-error' ? 'Couldn\'t reach the online server: check your internet connection.'
  : e?.type === 'browser-incompatible' ? 'This browser can\'t play online (no WebRTC).'
  : `Connection problem (${e?.type || e?.message || 'unknown'}).`);

const peerTransport = {
  async host(code) {
    const Peer = await loadPeer();
    const peer = new Peer(PREFIX + code);
    await new Promise((ok, fail) => { peer.on('open', ok); peer.on('error', e => fail(peerError(e))); });
    const subs = [];
    peer.on('connection', c => c.on('open', () => { const w = wrapPeerConn(c); subs.forEach(f => f(w)); }));
    // the PeerJS server dropped us (wifi blip...): reconnect so new players can still find the game
    peer.on('disconnected', () => { try { peer.reconnect(); } catch { /* destroyed */ } });
    return { onConnection: f => subs.push(f), close: () => peer.destroy() };
  },
  async join(code) {
    const Peer = await loadPeer();
    const peer = new Peer();
    await new Promise((ok, fail) => { peer.on('open', ok); peer.on('error', e => fail(peerError(e))); });
    const c = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
    return new Promise((ok, fail) => {
      const t = setTimeout(() => fail(new Error('No answer from that game. Check the code, and that the host has the game open.')), 15000);
      peer.on('error', e => { clearTimeout(t); fail(peerError(e)); });
      c.on('open', () => { clearTimeout(t); const w = wrapPeerConn(c); w.close = () => { c.close(); peer.destroy(); }; ok(w); });
    });
  },
};

// ---------- BroadcastChannel (same browser) ----------
const localTransport = {
  async host(code) {
    const ch = new BroadcastChannel(PREFIX + code), conns = new Map(), subs = [];
    ch.onmessage = ({ data: d }) => {
      if (d.to !== 'host') return;
      if (d.kind === 'open') {
        if (conns.has(d.from)) return;
        const msgs = [], closes = [];
        const c = { id: d.from, send: m => ch.postMessage({ to: d.from, from: 'host', kind: 'msg', m }), onMessage: f => msgs.push(f), onClose: f => closes.push(f), close: () => ch.postMessage({ to: d.from, from: 'host', kind: 'close' }), msgs, closes };
        conns.set(d.from, c);
        ch.postMessage({ to: d.from, from: 'host', kind: 'opened' });
        subs.forEach(f => f(c));
      } else if (d.kind === 'msg') conns.get(d.from)?.msgs.forEach(f => f(d.m));
      else if (d.kind === 'close') { const c = conns.get(d.from); conns.delete(d.from); c?.closes.forEach(f => f()); }
    };
    ch.postMessage({ to: '*', from: 'host', kind: 'hello' });
    return { onConnection: f => subs.push(f), close: () => { for (const c of conns.values()) c.close(); ch.close(); } };
  },
  async join(code) {
    const ch = new BroadcastChannel(PREFIX + code), me = 'c' + Math.random().toString(36).slice(2, 9);
    const msgs = [], closes = [];
    return new Promise((ok, fail) => {
      const t = setTimeout(() => { ch.close(); fail(new Error('No game found with that code in this browser.')); }, 3000);
      ch.onmessage = ({ data: d }) => {
        if (d.to !== me) return;
        if (d.kind === 'opened') {
          clearTimeout(t);
          ok({ id: me, send: m => ch.postMessage({ to: 'host', from: me, kind: 'msg', m }), onMessage: f => msgs.push(f), onClose: f => closes.push(f),
            close: () => { ch.postMessage({ to: 'host', from: me, kind: 'close' }); ch.close(); } });
        } else if (d.kind === 'msg') msgs.forEach(f => f(d.m));
        else if (d.kind === 'close') closes.forEach(f => f());
      };
      ch.postMessage({ to: 'host', from: me, kind: 'open' });
      addEventListener('beforeunload', () => ch.postMessage({ to: 'host', from: me, kind: 'close' }));
    });
  },
};
export const _wrapPeerConn = wrapPeerConn; // (for tests)
