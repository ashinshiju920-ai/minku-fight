const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const PORT = process.env.PORT || 8080;

// Get Local Area Network (Wi-Fi / Ethernet) IP addresses
function getLanIps() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal (127.0.0.1) and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push({ iface: name, ip: iface.address });
      }
    }
  }
  return ips;
}

// In-memory rooms for local Wi-Fi signaling & ultra-fast relay
const rooms = new Map(); // roomCode -> Set of client sockets

function getRoom(code) {
  code = (code || '').toUpperCase().trim();
  if (!rooms.has(code)) rooms.set(code, new Set());
  return rooms.get(code);
}

function leaveAllRooms(socket) {
  for (const [code, clients] of rooms.entries()) {
    if (clients.has(socket)) {
      clients.delete(socket);
      // Notify remaining clients
      for (const peer of clients) {
        sendWs(peer, JSON.stringify({ t: 'peer_leave' }));
      }
      if (clients.size === 0) rooms.delete(code);
    }
  }
}

// Lightweight RFC 6455 WebSocket Encoder
function sendWs(socket, data) {
  if (!socket || socket.destroyed || !socket.writable) return;
  const payload = Buffer.from(data, 'utf8');
  const len = payload.length;
  let header;

  if (len <= 125) {
    header = Buffer.alloc(2);
    header[0] = 0x81; // FIN + text frame
    header[1] = len;
  } else if (len <= 65535) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }

  socket.write(Buffer.concat([header, payload]));
}

// HTTP Server: Serves files + API info
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  const parsedUrl = req.url.split('?')[0];

  // API endpoint to discover host's LAN IP for Wi-Fi multiplayer
  if (parsedUrl === '/api/info') {
    const lanIps = getLanIps();
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({
      port: PORT,
      lanIps: lanIps,
      primaryIp: lanIps.length > 0 ? lanIps[0].ip : 'localhost'
    }));
    return;
  }

  // Static File Serving
  let filePath = path.join(__dirname, parsedUrl === '/' ? 'index.html' : parsedUrl);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(__dirname, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  res.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Access-Control-Allow-Origin': '*'
  });

  fs.createReadStream(filePath).pipe(res);
});

// Upgrade HTTP to WebSocket for instantaneous local Wi-Fi signaling & relay
server.on('upgrade', (req, socket, head) => {
  if (req.url.split('?')[0] !== '/ws') {
    socket.destroy();
    return;
  }

  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.destroy();
    return;
  }

  const acceptKey = crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');

  const headers = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${acceptKey}`
  ];

  socket.write(headers.join('\r\n') + '\r\n\r\n');

  // Buffer state for WebSocket frame parsing
  let buffer = Buffer.alloc(0);

  socket.on('data', chunk => {
    buffer = Buffer.concat([buffer, chunk]);

    while (buffer.length >= 2) {
      const byte0 = buffer[0];
      const byte1 = buffer[1];
      const opcode = byte0 & 0x0f;
      const isMasked = (byte1 & 0x80) !== 0;
      let payloadLen = byte1 & 0x7f;
      let offset = 2;

      // Handle close or ping frames
      if (opcode === 0x08) { // Close
        socket.end();
        return;
      }
      if (opcode === 0x09) { // Ping
        // Send Pong (opcode 0x0A)
        const pong = Buffer.from([0x8a, 0x00]);
        socket.write(pong);
      }

      if (payloadLen === 126) {
        if (buffer.length < 4) return;
        payloadLen = buffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLen === 127) {
        if (buffer.length < 10) return;
        payloadLen = Number(buffer.readBigUInt64BE(2));
        offset = 10;
      }

      let maskKey = null;
      if (isMasked) {
        if (buffer.length < offset + 4) return;
        maskKey = buffer.subarray(offset, offset + 4);
        offset += 4;
      }

      if (buffer.length < offset + payloadLen) return;

      const payload = buffer.subarray(offset, offset + payloadLen);
      buffer = buffer.subarray(offset + payloadLen);

      if (isMasked) {
        for (let i = 0; i < payload.length; i++) {
          payload[i] ^= maskKey[i % 4];
        }
      }

      // Process message
      try {
        const str = payload.toString('utf8');
        const msg = JSON.parse(str);
        handleClientMessage(socket, msg);
      } catch (err) {}
    }
  });

  socket.on('close', () => {
    leaveAllRooms(socket);
  });

  socket.on('error', () => {
    leaveAllRooms(socket);
  });
});

function handleClientMessage(socket, msg) {
  if (!msg || !msg.t) return;

  if (msg.t === 'join_room') {
    const code = (msg.code || '').toUpperCase().trim();
    leaveAllRooms(socket);
    const room = getRoom(code);
    room.add(socket);
    socket.roomCode = code;
    socket.role = msg.role || 'guest';

    // Acknowledge join
    sendWs(socket, JSON.stringify({
      t: 'joined_room',
      code: code,
      clientsCount: room.size
    }));

    // If 2 players are now in the room, notify both!
    if (room.size >= 2) {
      for (const peer of room) {
        sendWs(peer, JSON.stringify({
          t: 'peer_ready',
          code: code
        }));
      }
    }
    return;
  }

  // Relay all other messages to other peers in the same room with < 0.5ms latency
  if (socket.roomCode && rooms.has(socket.roomCode)) {
    const room = rooms.get(socket.roomCode);
    const str = JSON.stringify(msg);
    for (const peer of room) {
      if (peer !== socket) {
        sendWs(peer, str);
      }
    }
  }
}

server.listen(PORT, '0.0.0.0', () => {
  const ips = getLanIps();
  console.log(`\n======================================================`);
  console.log(`  MINKU-FIGHT Local Wi-Fi & Multiplayer Server Active!`);
  console.log(`  Port: ${PORT}`);
  console.log(`  Local host URL:    http://localhost:${PORT}`);
  if (ips.length > 0) {
    console.log(`  Same Wi-Fi URL:    http://${ips[0].ip}:${PORT}`);
  }
  console.log(`======================================================\n`);
});
