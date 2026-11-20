// Online connection settings for whoever hosts this site (e.g. on GitHub Pages).
//
// Most of the time two browsers can connect straight to each other. Behind some routers and
// firewalls (mobile data, offices, schools) they can't, and the game has to go through a RELAY
// (a "TURN server") that passes the messages along. PeerJS's free public relay is always tried, but
// it's shared by everyone and can be slow or full. For reliable games, add your own below: free
// tiers exist (for example Cloudflare Realtime TURN, or Metered.ca's "Open Relay"); they give you a
// URL, a username and a password.
//
// Anything added here is used by every player of this copy of the game. Players can also add their
// own on the Online page (Connection settings); those are kept in their browser only.
export const RELAYS = [
  // { urls: ['turn:turn.example.com:3478', 'turns:turn.example.com:5349?transport=tcp'], username: 'user', credential: 'password' },
];

// PeerJS's own defaults (a public STUN server to find your address, and PeerJS's public relay).
export const DEFAULT_ICE = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
];
