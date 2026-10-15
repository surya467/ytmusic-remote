// Background Service Worker - Cloud MQTT Bridge
importScripts('lib/mqtt.min.js');

const BROKERS = [
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://broker.emqx.io:8084/mqtt'
];
let currentBrokerIndex = 0;

let client = null;
let contentPort = null;
let roomId = '';
let webAppUrl = 'https://dexter.github.io/ytmusic-remote';
let cachedState = null;
let isConnected = false;

// Generate unique clean room code
function generateRoomId() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return 'ytm_' + id;
}

// Load settings
function initConfig(callback) {
  chrome.storage.local.get(['roomId', 'webAppUrl'], (res) => {
    if (!res.roomId) {
      roomId = generateRoomId();
      chrome.storage.local.set({ roomId });
    } else {
      roomId = res.roomId;
    }

    if (res.webAppUrl) {
      webAppUrl = res.webAppUrl;
    }

    console.log(`[Background] Initialized with Room ID: ${roomId}`);
    if (callback) callback();
  });
}

function connectMqtt() {
  if (client) {
    try { client.end(true); } catch (e) {}
  }

  const brokerUrl = BROKERS[currentBrokerIndex];
  console.log(`[Background] Connecting to cloud broker: ${brokerUrl} (Room: ${roomId})`);

  const clientId = 'ytm_desk_' + Math.random().toString(16).substring(2, 10);
  
  try {
    client = mqtt.connect(brokerUrl, {
      clientId,
      keepalive: 30,
      reconnectPeriod: 3000,
      clean: true
    });

    const cmdTopic = `ytmusic-remote/${roomId}/cmd`;
    const stateTopic = `ytmusic-remote/${roomId}/state`;

    client.on('connect', () => {
      console.log('✅ [Background] Connected to Cloud MQTT Broker');
      isConnected = true;

      // Subscribe to phone commands
      client.subscribe(cmdTopic, { qos: 0 }, (err) => {
        if (err) console.error('[Background] Subscription error:', err);
        else console.log(`[Background] Subscribed to commands: ${cmdTopic}`);
      });

      // Send initial state if available
      if (cachedState) {
        publishState(cachedState);
      }
    });

    client.on('message', (topic, message) => {
      try {
        const msg = JSON.parse(message.toString());
        console.log('[Background] Received phone command:', msg);

        if (msg.action === 'REQUEST_STATE') {
          if (cachedState) {
            publishState(cachedState);
          }
        } else if (contentPort) {
          contentPort.postMessage({
            type: 'COMMAND',
            command: msg.action,
            payload: msg.payload || {}
          });
        }
      } catch (err) {
        console.error('[Background] Error parsing phone command:', err);
      }
    });

    client.on('error', (err) => {
      console.warn('[Background] Broker connection error:', err.message);
      // Try next fallback broker
      currentBrokerIndex = (currentBrokerIndex + 1) % BROKERS.length;
    });

    client.on('offline', () => {
      isConnected = false;
      console.log('[Background] Broker connection offline');
    });

    client.on('close', () => {
      isConnected = false;
    });

  } catch (err) {
    console.error('[Background] Failed to start MQTT client:', err);
  }
}

function publishState(state) {
  if (client && isConnected && roomId) {
    const stateTopic = `ytmusic-remote/${roomId}/state`;
    client.publish(stateTopic, JSON.stringify(state), { qos: 0 });
  }
}

// Port connection to YouTube Music content script
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'ytm-remote-cs') {
    console.log('🎵 [Background] YouTube Music tab connected');
    contentPort = port;

    port.onMessage.addListener((msg) => {
      if (msg.type === 'STATE_UPDATE') {
        cachedState = msg.payload;
        publishState(cachedState);
      }
    });

    port.onDisconnect.addListener(() => {
      console.log('❌ [Background] YouTube Music tab disconnected');
      if (contentPort === port) {
        contentPort = null;
      }
    });
  }
});

// Messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'GET_STATUS') {
    sendResponse({
      isConnected,
      roomId,
      webAppUrl,
      ytmConnected: contentPort !== null,
      lastState: cachedState
    });
    return true;
  }

  if (request.action === 'SET_WEBAPP_URL') {
    webAppUrl = request.url;
    chrome.storage.local.set({ webAppUrl });
    sendResponse({ success: true, webAppUrl });
    return true;
  }

  if (request.action === 'REGENERATE_ROOM') {
    roomId = generateRoomId();
    chrome.storage.local.set({ roomId }, () => {
      connectMqtt();
      sendResponse({ success: true, roomId });
    });
    return true;
  }
});

// Initialize on startup
initConfig(() => {
  connectMqtt();
});
