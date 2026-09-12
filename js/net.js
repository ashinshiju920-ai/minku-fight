"use strict";

/* ==========================================================================
   MINKU-FIGHT — Production Online & Wi-Fi Multiplayer Engine
   Optimized for Cloudflare Pages, GitHub Pages, and Local Wi-Fi
   
   Features:
   1. Global WebRTC P2P via PeerJS (works anywhere in the world on Cloudflare/GitHub Pages)
   2. Instant Same-Machine Multi-Tab P2P via BroadcastChannel
   3. Local Wi-Fi Sub-Millisecond WebSocket Relay (when running server.js)
   4. Public MQTT Broker Fallback as secondary WAN signaling
   5. Public Online Quick Match (Random Matchmaking lobby)
   6. 60Hz Fixed-Timestep Synchronization with Sequence Validation
   7. Resilient Character Select Handshake (fixes "VS -" desync)
   ========================================================================== */

let net = null;

// Clean alphanumeric room codes without confusing characters (no 0/O, 1/I)
const CODESET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const PEER_PREFIX = 'minku7-';
const QUICK_MATCH_ROOM = 'QUICK';

function mkCode() {
  let s = '';
  for (let i = 0; i < 4; i++) {
    s += CODESET[Math.random() * CODESET.length | 0];
  }
  return s;
}

// STUN servers for global NAT traversal
const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:global.stun.twilio.com:3478' }
  ]
};

/* ==========================================================================
   1. WebRTC Engine via PeerJS (Primary for Cloudflare & GitHub Pages)
   ========================================================================== */
function initPeerJS(id, onReady, onError) {
  if (typeof Peer === 'undefined') {
    return onError('PeerJS library not loaded');
  }

  try {
    const isHttps = (location.protocol === 'https:');
    const peer = new Peer(id, {
      debug: 1,
      secure: isHttps,
      config: ICE_CONFIG
    });

    peer.on('open', peerId => {
      onReady(peer, peerId);
    });

    peer.on('disconnected', () => {
      try {
        if (!peer.destroyed) {
          peer.reconnect();
        }
      } catch (e) {}
    });

    peer.on('error', err => {
      console.warn('PeerJS error:', err ? err.type : err);
      onError(err);
    });

    return peer;
  } catch (e) {
    onError(e);
  }
}

function wirePeerConnection(conn) {
  net.pConn = conn;

  function handleOpen() {
    net.up = true;
    net.mode = 'webrtc';
    stopNetTimers();
    onLinkUp();
  }

  if (conn.open) {
    handleOpen();
  } else {
    conn.on('open', handleOpen);
  }

  conn.on('data', data => {
    onLinkMessage(typeof data === 'string' ? data : JSON.stringify(data));
  });

  conn.on('close', () => {
    if (net && net.up) {
      toast('PEER DISCONNECTED');
      leaveToTitle();
    }
  });

  conn.on('error', err => {
    console.warn('Peer connection error:', err);
  });
}

/* ==========================================================================
   2. Local Wi-Fi WebSocket (When running via Node server.js)
   ========================================================================== */
function isLocalHost() {
  const h = location.hostname;
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '[::1]' ||
    h.startsWith('192.168.') ||
    h.startsWith('10.') ||
    h.startsWith('172.16.') ||
    h.startsWith('172.17.') ||
    h.startsWith('172.18.') ||
    h.startsWith('172.19.') ||
    h.startsWith('172.20.') ||
    h.startsWith('172.21.') ||
    h.startsWith('172.22.') ||
    h.startsWith('172.23.') ||
    h.startsWith('172.24.') ||
    h.startsWith('172.25.') ||
    h.startsWith('172.26.') ||
    h.startsWith('172.27.') ||
    h.startsWith('172.28.') ||
    h.startsWith('172.29.') ||
    h.startsWith('172.30.') ||
    h.startsWith('172.31.') ||
    h.endsWith('.local')
  );
}
window.isLocalHost = isLocalHost;

function connectLocalWs(code, role, onOpen, onFail) {
  if (!location.protocol.startsWith('http')) return onFail('Not HTTP');
  if (!isLocalHost()) return onFail('Skipping local WS (Cloudflare / static host)');

  try {
    const wsProto = (location.protocol === 'https:') ? 'wss:' : 'ws:';
    const wsUrl = `${wsProto}//${location.host}/ws`;
    const ws = new WebSocket(wsUrl);

    let opened = false;
    const to = setTimeout(() => {
      if (!opened) {
        try { ws.close(); } catch (e) {}
        onFail('Local WS timeout');
      }
    }, 1800);

    ws.onopen = () => {
      opened = true;
      clearTimeout(to);
      ws.send(JSON.stringify({ t: 'join_room', code: code, role: role }));
      onOpen(ws);
    };

    ws.onmessage = ev => {
      onLinkMessage('' + ev.data);
    };

    ws.onerror = () => {
      if (!opened) {
        clearTimeout(to);
        onFail('Local WS unavailable');
      }
    };

    ws.onclose = () => {
      if (net && net.localWs === ws) {
        net.localWs = null;
      }
    };
  } catch (e) {
    onFail(e);
  }
}

/* ==========================================================================
   3. BroadcastChannel (Same Device / Multi-Tab Instant Pairing)
   ========================================================================== */
function setupBroadcastChannel(code) {
  if (typeof BroadcastChannel === 'undefined') return;
  try {
    const bc = new BroadcastChannel('minku_channel_' + code.toUpperCase());
    net.bc = bc;
    bc.onmessage = ev => {
      if (ev.data) onLinkMessage(ev.data);
    };

    // Announce presence on broadcast channel
    setTimeout(() => {
      if (net) netSend({ t: 'hi', tok: net.tok, role: net.role });
    }, 100);
  } catch (e) {}
}

/* ==========================================================================
   4. Host Duel Room (Supports Cloudflare Pages, GitHub, & Local Wi-Fi)
   ========================================================================== */
function hostRoom(onReady, onFail, customCode) {
  teardownNet();
  const code = (customCode || mkCode()).toUpperCase();

  net = {
    role: 'host',
    code: code,
    isQuickMatch: (customCode === QUICK_MATCH_ROOM),
    ping: 10,
    up: false,
    mode: null,
    peer: null,
    pConn: null,
    localWs: null,
    bc: null,
    tok: Math.random().toString(36).slice(2, 10),
    ctrl: { le: 0, ri: 0, up: 0, dn: 0, p: 0, k: 0, bl: 0, s1: 0, s2: 0, su: 0, gr: 0 },
    lastMsg: performance.now(),
    gotGame: false,
    gotStart: false,
    inSeq: 0,
    lastSeq: -1,
    selTimer: null
  };

  setupBroadcastChannel(code);
  onReady(code);

  // 1. Initialize Global WebRTC Peer for Cloudflare / Internet
  const peerId = PEER_PREFIX + code.toLowerCase();
  net.peer = initPeerJS(
    peerId,
    (peer, id) => {
      net.serverReady = true;
      const hs = document.getElementById('hostStatus');
      if (hs && hs.textContent.includes('CONNECTING')) {
        hs.textContent = 'WAITING FOR CHALLENGER…';
      }
      peer.on('connection', conn => {
        wirePeerConnection(conn);
      });
    },
    err => {
      // If ID is already in use (e.g. previous quickmatch host), try joining as guest instead
      if (err && err.type === 'unavailable-id' && net.isQuickMatch) {
        joinRoom(code, onFail, true);
      }
    }
  );

  // 2. Also try Local Wi-Fi WebSocket ONLY if hosted on local Node server
  if (isLocalHost()) {
    connectLocalWs(code, 'host', ws => {
      if (!net) return;
      net.localWs = ws;
    }, () => {});
  }
}

/* ==========================================================================
   5. Join Duel Room (Direct by 4-Letter Code)
   ========================================================================== */
function joinRoom(code, onFail, isQuick) {
  teardownNet();
  code = (code || '').toUpperCase().trim();

  if (!code || (code.length !== 4 && code !== QUICK_MATCH_ROOM)) {
    return onFail('Please enter a valid 4-letter room code.');
  }

  net = {
    role: 'guest',
    code: code,
    isQuickMatch: !!isQuick,
    ping: 10,
    up: false,
    mode: null,
    peer: null,
    pConn: null,
    localWs: null,
    bc: null,
    tok: Math.random().toString(36).slice(2, 10),
    ctrl: null,
    lastMsg: performance.now(),
    gotGame: false,
    gotStart: false,
    inSeq: 0,
    lastSeq: -1,
    selTimer: null,
    retried: false
  };

  setupBroadcastChannel(code);

  const je = document.getElementById('joinErr');
  if (je) je.textContent = 'Connecting to host…';

  // 1. Try Global WebRTC via PeerJS
  const randomGuestId = PEER_PREFIX + 'g-' + Math.random().toString(36).slice(2, 8);
  net.peer = initPeerJS(
    randomGuestId,
    peer => {
      const targetHostId = PEER_PREFIX + code.toLowerCase();
      const conn = peer.connect(targetHostId, {
        reliable: true
      });
      wirePeerConnection(conn);
    },
    err => {
      console.warn('PeerJS join error:', err ? err.type : err);
      if (err && (err.type === 'peer-unavailable' || err.type === 'invalid-id')) {
        // Automatic retry once after 850ms to eliminate race condition when host was just starting
        if (net && !net.retried && !net.up && net.peer && !net.peer.destroyed) {
          net.retried = true;
          if (je) je.textContent = 'Contacting host, handshaking…';
          setTimeout(() => {
            if (net && !net.up && net.peer && !net.peer.destroyed) {
              const targetHostId = PEER_PREFIX + code.toLowerCase();
              const conn = net.peer.connect(targetHostId, { reliable: true });
              wirePeerConnection(conn);
            }
          }, 850);
          return;
        }
        if (net && !net.up) {
          clearTimeout(net.failTimer);
          teardownNet();
          onFail(`Room "${code}" not found. Make sure Player 1 clicked HOST and you entered the exact 4 letters.`);
        }
      }
    }
  );

  // 2. Also try Local Wi-Fi WebSocket ONLY if on local server
  if (isLocalHost()) {
    connectLocalWs(code, 'guest', ws => {
      if (!net) return;
      net.localWs = ws;
    }, () => {});
  }

  // Fallback timeout with helpful instructions
  net.failTimer = setTimeout(() => {
    if (net && !net.up && !net.gotGame) {
      teardownNet();
      onFail(`No host found with code "${code}". Make sure Player 1 clicked HOST and you entered the exact 4 letters.`);
    }
  }, 10000);
}

/* ==========================================================================
   6. Quick Match / Public Matchmaking (Instant Internet Duel)
   ========================================================================== */
function quickMatch(onStatus, onFail) {
  onStatus('SEARCHING FOR OPPONENT…');
  joinRoom(QUICK_MATCH_ROOM, () => {
    onStatus('HOSTING MATCH — WAITING FOR RIVAL…');
    hostRoom(
      () => {},
      onFail,
      QUICK_MATCH_ROOM
    );
  }, true);
}

/* ==========================================================================
   7. Packet Transmission & Event Routing
   ========================================================================== */
function netSend(o) {
  if (!net) return;
  let s = '';
  try { s = JSON.stringify(o); } catch (e) { return; }

  // If a specific mode is already active and verified, use it directly
  if (net.mode === 'webrtc' && net.pConn && net.pConn.open) {
    try { net.pConn.send(s); return; } catch (e) {}
  }
  if (net.mode === 'local_ws' && net.localWs && net.localWs.readyState === WebSocket.OPEN) {
    try { net.localWs.send(s); return; } catch (e) {}
  }
  if (net.mode === 'broadcast' && net.bc) {
    try { net.bc.postMessage(s); return; } catch (e) {}
  }

  // Fallback / initial discovery: broadcast across all open channels
  if (net.pConn && net.pConn.open) {
    try { net.pConn.send(s); } catch (e) {}
  }
  if (net.localWs && net.localWs.readyState === WebSocket.OPEN) {
    try { net.localWs.send(s); } catch (e) {}
  }
  if (net.bc) {
    try { net.bc.postMessage(s); } catch (e) {}
  }
}

function onLinkMessage(str) {
  if (!str || !net) return;
  let d = null;
  try { d = JSON.parse(str); } catch (e) { return; }
  if (!d) return;

  net.lastMsg = performance.now();
  net.gotGame = true;

  if (!net.up) {
    net.up = true;
    if (!net.mode) {
      if (net.pConn && net.pConn.open) net.mode = 'webrtc';
      else if (net.localWs && net.localWs.readyState === WebSocket.OPEN) net.mode = 'local_ws';
      else net.mode = 'broadcast';
    }
    stopNetTimers();
    onLinkUp();
  }

  onNetData(d);
}

function onLinkUp() {
  sfx('ok');
  stopNetTimers();
  if (net) net.gotStart = false;

  if (net.role === 'host') {
    toast('CHALLENGER CONNECTED!');
    const hs = document.getElementById('hostStatus');
    if (hs) hs.textContent = 'CHALLENGER CONNECTED!';

    let togTries = 0;
    const sendTog = () => {
      if (!net || !net.up) return;
      if (window.game && window.game.online) return;
      netSend({ t: 'togsel' });
      if (++togTries < 6 && (!net.guestInSel)) {
        setTimeout(sendTog, 250);
      }
    };

    setTimeout(() => {
      if (!net || !net.up) return;
      if (window.game && window.game.online) return;
      showScreen('scrSelect');
      selSetup('host');
      sendTog();
    }, 200);
  } else {
    const je = document.getElementById('joinErr');
    if (je) je.textContent = 'Connected to host! Entering selection…';
    setTimeout(() => {
      if (!net || !net.up) return;
      showScreen('scrSelect');
      selSetup('guest');
      netSend({ t: 'togsel_ack' });
    }, 200);
  }
}

function stopNetTimers() {
  if (!net) return;
  if (net.failTimer) {
    clearTimeout(net.failTimer);
    net.failTimer = null;
  }
  if (net.selTimer) {
    clearInterval(net.selTimer);
    net.selTimer = null;
  }
}

function teardownNet() {
  if (net) {
    net.up = false;
    stopNetTimers();
    if (net.bc) {
      try { net.bc.close(); } catch (e) {}
    }
    if (net.pConn) {
      try { net.pConn.close(); } catch (e) {}
    }
    if (net.peer) {
      try { net.peer.destroy(); } catch (e) {}
    }
    if (net.localWs) {
      try { net.localWs.close(); } catch (e) {}
    }
  }
  net = null;
}

/* ==========================================================================
   8. In-Game Protocol & State Handshake
   ========================================================================== */
function onNetData(d) {
  if (!d || !d.t) return;

  switch (d.t) {
    case 'hi':
      if (net && !net.up) {
        net.up = true;
        onLinkUp();
      }
      break;
    case 'away':
      toast(d.v ? 'OPPONENT TABBED OUT' : 'OPPONENT IS BACK');
      break;
    case 'togsel':
      netSend({ t: 'togsel_ack' });
      const selScr = document.getElementById('scrSelect');
      const alreadyInSel = selScr && !selScr.hidden && (typeof sel !== 'undefined') && sel && sel.mode === 'guest';
      if (!alreadyInSel) {
        showScreen('scrSelect');
        selSetup('guest');
      }
      break;
    case 'togsel_ack':
      if (net) net.guestInSel = true;
      break;
    case 'start':
      netSend({ t: 'start_ack' });
      if (net.gotStart && window.game && window.game.phase === 'fight') break;
      net.gotStart = true;
      if (net.selTimer) {
        clearInterval(net.selTimer);
        net.selTimer = null;
      }
      destroyGameUI();
      createGame({ mode: net.role, chars: d.chars, names: d.names });
      break;
    case 'start_ack':
      // Host received guest start confirmation
      break;
    case 'req_start':
      // Guest is ready and requested start sync
      if (net && net.role === 'host') {
        const p1Char = (window.game && window.game.chars) ? window.game.chars[0] : Math.max(0, Math.min(CHARS.length - 1, (typeof sel !== 'undefined' ? sel.my : 0) || 0));
        const p2Char = (window.game && window.game.chars) ? window.game.chars[1] : Math.max(0, Math.min(CHARS.length - 1, (typeof sel !== 'undefined' && sel.rem >= 0) ? sel.rem : 0));
        const chars = [p1Char, p2Char];
        const names = (window.game && window.game.names) ? window.game.names : [myName(), (typeof sel !== 'undefined' && saneName(sel.remName)) || CHARS[chars[1]].name];
        netSend({ t: 'start', chars: chars, names: names });
      }
      break;
    case 'sel': {
      const isReady = (d.ready !== undefined) ? d.ready : (d.r !== undefined ? d.r : false);
      selRemote(d.i, isReady, d.name);
      // Immediately reply with own selection so rival never sees "VS -"
      if (typeof sel !== 'undefined' && sel.mode !== 'cpu') {
        netSend({ t: 'sel_reply', i: sel.my, r: sel.ready, ready: sel.ready, name: myName() });
      }
      break;
    }
    case 'sel_reply': {
      const isReady = (d.ready !== undefined) ? d.ready : (d.r !== undefined ? d.r : false);
      selRemote(d.i, isReady, d.name);
      break;
    }
    case 'i':
      if (d.seq !== undefined && net.lastSeq !== undefined && d.seq < net.lastSeq) {
        return; // Discard out-of-order input packet
      }
      if (d.seq !== undefined) net.lastSeq = d.seq;

      net.ctrl = {
        le: !!(d.m & 1),
        ri: !!(d.m & 2),
        up: !!(d.m & 4),
        dn: !!(d.m & 8),
        p:  !!(d.m & 16),
        k:  !!(d.m & 32),
        bl: !!(d.m & 64),
        s1: !!(d.m & 128),
        s2: !!(d.m & 256),
        su: !!(d.m & 512),
        gr: !!(d.m & 1024)
      };
      break;
    case 's':
      if (window.game && window.game.mode === 'guest') pushSnap(d);
      break;
    case 'ping':
      netSend({ t: 'pong', ts: d.ts });
      break;
    case 'pong':
      net.ping = Math.max(1, Math.round(performance.now() - d.ts));
      break;
    case 'endchoice':
      if (d.a === 'select') {
        destroyGameUI();
        showScreen('scrSelect');
        selSetup('guest');
        window.game = null;
        startAttract();
      } else if (d.a === 'menu') {
        leaveToTitle();
      }
      break;
    case 'bye':
      toast('OPPONENT LEFT THE MATCH');
      leaveToTitle();
      break;
  }
}

document.addEventListener('visibilitychange', () => {
  if (net && net.up && window.game && window.game.online) {
    netSend({ t: 'away', v: document.hidden });
  }
});

/* ==========================================================================
   9. 60 FPS Snapshot Synchronization & Jitter Buffer
   ========================================================================== */
function pushSnap(d) {
  const g = window.game;
  if (!g) return;

  if (g.lastSnapFrame && d.fn && d.fn <= g.lastSnapFrame) return;
  if (d.fn) g.lastSnapFrame = d.fn;

  g.snapBuf.push({ rt: performance.now(), d: d });
  if (g.snapBuf.length > 18) g.snapBuf.shift();

  if (d.fx) {
    for (let i = 0; i < d.fx.length; i++) {
      const e = d.fx[i];
      applyFx(e[0], e[1], e[2], e[3], e[4]);
    }
  }
}

let hostFrameCounter = 0;
function buildSnap() {
  const g = window.game;
  const fs = [];
  for (let i = 0; i < 2; i++) {
    const f = g.fighters[i], p = f.pose;
    fs.push([
      +f.x.toFixed(1), +f.y.toFixed(1), f.dir, f.hp, f.meter, +f.flash.toFixed(2),
      (f.fxTrail ? 1 : 0) | (f.fxGhost ? 2 : 0),
      +p.hy.toFixed(1), +p.lean.toFixed(2), +p.head.toFixed(2),
      +p.aF[0].toFixed(2), +p.aF[1].toFixed(2), +p.aB[0].toFixed(2), +p.aB[1].toFixed(2),
      +p.lF[0].toFixed(2), +p.lF[1].toFixed(2), +p.lB[0].toFixed(2), +p.lB[1].toFixed(2),
      +p.fF.toFixed(2), +p.fB.toFixed(2), +p.rot.toFixed(2),
      +f.vx.toFixed(1), +f.vy.toFixed(1)
    ]);
  }
  return {
    t: 's',
    fn: ++hostFrameCounter,
    ph: g.phase,
    timer: +g.timer.toFixed(1),
    wins: g.wins,
    rd: g.round,
    cb: [g.fighters[0].comboN, g.fighters[0].comboT > 0 ? 1 : 0, g.fighters[1].comboN, g.fighters[1].comboT > 0 ? 1 : 0],
    pr: g.projectiles.map(p => [+p.x.toFixed(0), +p.y.toFixed(0), Math.sign(p.vx), p.ci]),
    f: fs,
    fx: g.evq
  };
}

function guestInterp() {
  const g = window.game;
  if (!g || g.snapBuf.length < 1) return;

  const ping = (net && net.ping != null) ? net.ping : 15;
  // Adaptive buffer: 16-24ms on local network, 35-65ms on global internet
  const isLocal = (net && (net.mode === 'local_ws' || net.bc));
  const bufMs = isLocal ? clamp(16 + ping * 0.4, 16, 26) : clamp(28 + ping * 0.5, 32, 75);
  const rt = performance.now() - bufMs;

  let a = g.snapBuf[0], b = g.snapBuf[Math.min(1, g.snapBuf.length - 1)];
  for (let i = 0; i < g.snapBuf.length - 1; i++) {
    const s0 = g.snapBuf[i], s1 = g.snapBuf[i + 1];
    if (rt >= s0.rt && rt <= s1.rt) {
      a = s0; b = s1; break;
    }
    if (rt > s1.rt) { a = s1; b = s1; }
  }

  const k = (a === b) ? 0 : clamp((rt - a.rt) / Math.max(1, b.rt - a.rt), 0, 1);
  const prevPh = g.phase;
  g.phase = b.d.ph;
  g.timer = b.d.timer;
  g.wins = b.d.wins;
  g.round = b.d.rd;

  // Guest trigger for Match End victory screen
  if (b.d.ph === 'match' && typeof showEnd === 'function') {
    const endScr = document.getElementById('scrEnd');
    if (endScr && endScr.hidden) {
      showEnd(g);
    }
  } else if (b.d.ph === 'end' && prevPh !== 'end' && typeof showRoundWin === 'function') {
    const wSlot = (g.wins[0] > (a.d && a.d.wins ? a.d.wins[0] : 0)) ? 0 : 1;
    showRoundWin(g.fighters[wSlot], g);
  }

  for (let i = 0; i < 2; i++) {
    const fa = a.d.f[i], fb = b.d.f[i], f = g.fighters[i];

    // Smooth interpolation with dead reckoning extrapolation
    f.x = lerp(fa[0], fb[0], k);
    f.y = lerp(fa[1], fb[1], k);

    if (rt > b.rt) {
      const extraTime = Math.min(0.066, (rt - b.rt) / 1000);
      f.x += (fb[21] || 0) * extraTime;
      f.y += (fb[22] || 0) * extraTime;
    }

    f.dir = fb[2];
    f.hp = fb[3];
    f.meter = fb[4];
    f.flash = fb[5];

    const fl = fb[6];
    f.fxTrail = !!(fl & 1);
    f.fxGhost = !!(fl & 2);

    f.pose = {
      hy: lerp(fa[7], fb[7], k),
      lean: lerpA(fa[8], fb[8], k),
      head: lerpA(fa[9], fb[9], k),
      aF: [lerpA(fa[10], fb[10], k), lerpA(fa[11], fb[11], k)],
      aB: [lerpA(fa[12], fb[12], k), lerpA(fa[13], fb[13], k)],
      lF: [lerpA(fa[14], fb[14], k), lerpA(fa[15], fb[15], k)],
      lB: [lerpA(fa[16], fb[16], k), lerpA(fa[17], fb[17], k)],
      fF: lerpA(fa[18], fb[18], k),
      fB: lerpA(fa[19], fb[19], k),
      rot: lerpA(fa[20], fb[20], k)
    };
    f.dispHp += (f.hp - f.dispHp) * 0.55;
    f.sk = skelFor(f.pose, f.x, GY - f.y - f.pose.hy, f.dir);
  }

  g.fighters[0].comboN = b.d.cb[0];
  g.fighters[0].comboT = b.d.cb[1];
  g.fighters[1].comboN = b.d.cb[2];
  g.fighters[1].comboT = b.d.cb[3];

  for (let i = 0; i < 2; i++) {
    const f = g.fighters[i];
    if (f.fxTrail && f.sk) f.trailPts.push({ x: f.sk.haF[0], y: f.sk.haF[1], t: 0 });
    for (let j = 0; j < f.trailPts.length; j++) f.trailPts[j].t += 0.016;
    f.trailPts = f.trailPts.filter(p => p.t < 0.12);

    if (f.fxGhost) {
      f.ghostT -= 0.016;
      if (f.ghostT <= 0) {
        f.ghostT = 0.045;
        f.ghosts.push({ pose: clonePose(f.pose), x: f.x, y: f.y, dir: f.dir, t: 0 });
      }
    }
    for (let j = 0; j < f.ghosts.length; j++) f.ghosts[j].t += 0.016;
    f.ghosts = f.ghosts.filter(gg => gg.t < 0.26);
  }

  g.projectiles = b.d.pr.map(p => ({
    x: p[0],
    y: p[1],
    vx: p[2] * CHARS[p[3]].proj.speed,
    r: CHARS[p[3]].proj.r,
    aura: CHARS[p[3]].aura,
    ci: p[3],
    owner: -1,
    dead: false,
    trail: 0
  }));
}

/* ============ Guest 60Hz Input Dispatch ============ */
function guestSendInput() {
  if (!net) return;
  const c = localCtrl(1);
  const m = (c.le ? 1 : 0) | (c.ri ? 2 : 0) | (c.up ? 4 : 0) | (c.dn ? 8 : 0) |
            (c.p ? 16 : 0) | (c.k ? 32 : 0) | (c.bl ? 64 : 0) | (c.s1 ? 128 : 0) |
            (c.s2 ? 256 : 0) | (c.su ? 512 : 0) | (c.gr ? 1024 : 0);

  const now = performance.now();
  if (net._lastM !== m || now - net._lastT >= 16) {
    net._lastM = m;
    net._lastT = now;
    net.inSeq = (net.inSeq || 0) + 1;
    netSend({ t: 'i', m: m, seq: net.inSeq, tok: net.tok });
  }
}
