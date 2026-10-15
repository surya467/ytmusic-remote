const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer, WebSocket } = require('ws');
const QRCode = require('qrcode');

const PORT = process.env.PORT || 9863;
const PUBLIC_DIR = path.join(__dirname, 'public');

// Find best local IPv4 address
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      // Skip internal (127.0.0.1) and non-ipv4 addresses
      if (net.family === 'IPv4' && !net.internal) {
        // Prefer standard private LAN IP ranges (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
        if (net.address.startsWith('192.168.') || net.address.startsWith('10.') || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(net.address)) {
          // Check interface name preference (Wi-Fi, Ethernet)
          const lowerName = name.toLowerCase();
          const priority = lowerName.includes('wi-fi') || lowerName.includes('wifi') ? 1 :
                           lowerName.includes('ethernet') ? 2 : 3;
          candidates.push({ ip: net.address, name, priority });
        } else {
          candidates.push({ ip: net.address, name, priority: 99 });
        }
      }
    }
  }

  candidates.sort((a, b) => a.priority - b.priority);
  return candidates.length > 0 ? candidates[0].ip : '127.0.0.1';
}

const LOCAL_IP = getLocalIp();
const LOCAL_URL = `http://localhost:${PORT}`;
const REMOTE_URL = `http://${LOCAL_IP}:${PORT}`;

// Current YouTube Music State cache
let currentState = {
  title: 'No track loaded',
  artist: 'Open YouTube Music on Desktop',
  album: '',
  artwork: '',
  currentTime: 0,
  duration: 0,
  isPlaying: false,
  volume: 1,
  isMuted: false,
  isLiked: false,
  isDisliked: false,
  isShuffle: false,
  repeatMode: 'NONE',
  hasMedia: false,
  lastUpdated: Date.now()
};

let qrCodeDataUrl = '';
QRCode.toDataURL(REMOTE_URL, { margin: 1, width: 256 })
  .then(url => { qrCodeDataUrl = url; })
  .catch(err => console.error('Error generating QR code:', err));

// MIME types
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// HTTP Server
const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // CORS headers for local extension communication
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API endpoints
  if (pathname === '/api/info') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ip: LOCAL_IP,
      port: PORT,
      localUrl: LOCAL_URL,
      remoteUrl: REMOTE_URL,
      qrCode: qrCodeDataUrl,
      ytmConnected: isExtensionConnected(),
      phoneCount: phoneClients.size,
      state: currentState
    }));
    return;
  }

  if (pathname === '/api/qr') {
    QRCode.toBuffer(REMOTE_URL, { margin: 1, width: 300 }, (err, buffer) => {
      if (err) {
        res.writeHead(500);
        res.end('Error generating QR');
      } else {
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(buffer);
      }
    });
    return;
  }

  // Static file serving from PUBLIC_DIR
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

  // Security check to avoid path traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback to index.html for SPA routing
      filePath = path.join(PUBLIC_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(404);
        res.end('File not found');
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
      }
    });
  });
});

// WebSocket Server
const wss = new WebSocketServer({ server });

let extensionWs = null;
const phoneClients = new Set();

function isExtensionConnected() {
  return extensionWs !== null && extensionWs.readyState === WebSocket.OPEN;
}

function broadcastToPhones(message) {
  const data = typeof message === 'string' ? message : JSON.stringify(message);
  for (const client of phoneClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

function sendToExtension(message) {
  if (isExtensionConnected()) {
    const data = typeof message === 'string' ? message : JSON.stringify(message);
    extensionWs.send(data);
    return true;
  }
  return false;
}

wss.on('connection', (ws, req) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const clientType = parsedUrl.searchParams.get('client') || 'unknown';

  if (clientType === 'extension') {
    if (extensionWs && extensionWs !== ws) {
      try { extensionWs.close(); } catch (e) {}
    }
    extensionWs = ws;
    console.log('✅ Chrome Extension connected from Desktop');

    // Notify phones that desktop extension is ready
    broadcastToPhones({
      type: 'DESKTOP_STATUS',
      connected: true,
      state: currentState
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'STATE_UPDATE' && msg.payload) {
          currentState = { ...currentState, ...msg.payload, lastUpdated: Date.now() };
          broadcastToPhones({
            type: 'STATE_UPDATE',
            payload: currentState
          });
        }
      } catch (err) {
        console.error('Error parsing extension message:', err);
      }
    });

    ws.on('close', () => {
      console.log('⚠️ Chrome Extension disconnected');
      if (extensionWs === ws) {
        extensionWs = null;
      }
      broadcastToPhones({
        type: 'DESKTOP_STATUS',
        connected: false
      });
    });

  } else {
    // Phone or mobile web client
    phoneClients.add(ws);
    console.log(`📱 Phone connected! (Active phones: ${phoneClients.size})`);

    // Immediately send current cached state and extension status
    ws.send(JSON.stringify({
      type: 'INIT',
      desktopConnected: isExtensionConnected(),
      state: currentState
    }));

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'COMMAND') {
          console.log(`📱 Received command: ${msg.command}`, msg.payload || '');
          const sent = sendToExtension(msg);
          if (!sent) {
            ws.send(JSON.stringify({
              type: 'ERROR',
              message: 'YouTube Music is not active on your desktop'
            }));
          }
        }
      } catch (err) {
        console.error('Error parsing phone message:', err);
      }
    });

    ws.on('close', () => {
      phoneClients.delete(ws);
      console.log(`📱 Phone disconnected. (Active phones: ${phoneClients.size})`);
    });
  }

  ws.on('error', (err) => {
    console.error(`WebSocket error (${clientType}):`, err.message);
  });
});

// Periodic heartbeat to keep connections alive
setInterval(() => {
  if (extensionWs && extensionWs.readyState === WebSocket.OPEN) {
    try { extensionWs.ping(); } catch (e) {}
  }
  for (const client of phoneClients) {
    if (client.readyState === WebSocket.OPEN) {
      try { client.ping(); } catch (e) {}
    }
  }
}, 25000);

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log('\n======================================================');
  console.log(' 🎵  YOUTUBE MUSIC REMOTE CONTROL SERVER  🎵');
  console.log('======================================================\n');
  console.log(`🖥️  Desktop Local URL: ${LOCAL_URL}`);
  console.log(`📱  Mobile Device URL: ${REMOTE_URL}\n`);
  console.log('Scan this QR code with your phone camera to open the remote:');

  QRCode.toString(REMOTE_URL, { type: 'terminal', small: true }, (err, qr) => {
    if (!err && qr) {
      console.log(qr);
    }
    console.log('------------------------------------------------------');
    console.log('Waiting for Chrome Extension and Phone to connect...');
    console.log('------------------------------------------------------\n');
  });
});
