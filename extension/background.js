// Background Service Worker - Cloud MQTT Bridge (using Paho MQTT)
importScripts('lib/paho-mqtt.js');

const BROKERS = [
  { host: 'broker.hivemq.com', port: 8884, path: '/mqtt' },
  { host: 'broker.emqx.io', port: 8084, path: '/mqtt' }
];
let currentBrokerIndex = 0;

let client = null;
let contentPort = null;
let roomId = '';
let webAppUrl = 'https://surya467.github.io/ytmusic-remote';
let cachedState = null;
let isConnected = false;
let isConnecting = false;

// Generate clean unique room ID
function generateRoomId() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return 'ytm_' + id;
}

// Load configuration
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

    console.log(`[Background] Initialized Room: ${roomId}`);
    if (callback) callback();
  });
}

function connectMqtt() {
  if (isConnecting) return;
  if (client && client.isConnected()) {
    return;
  }

  isConnecting = true;
  const target = BROKERS[currentBrokerIndex];
  const clientId = 'ytm_desk_' + Math.random().toString(16).substring(2, 10);

  console.log(`[Background] Connecting to Cloud Broker: ${target.host}:${target.port}${target.path} (Room: ${roomId})`);

  try {
    client = new Paho.Client(target.host, target.port, target.path, clientId);

    client.onConnectionLost = (responseObject) => {
      isConnected = false;
      isConnecting = false;
      console.warn('[Background] Broker connection lost:', responseObject.errorMessage);
      setTimeout(connectMqtt, 3000);
    };

    client.onMessageArrived = (message) => {
      try {
        const msg = JSON.parse(message.payloadString);
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
    };

    client.connect({
      useSSL: true,
      timeout: 10,
      keepAliveInterval: 30,
      cleanSession: true,
      onSuccess: () => {
        isConnected = true;
        isConnecting = false;
        console.log('✅ [Background] Connected to Cloud MQTT Broker');

        const cmdTopic = `ytmusic-remote/${roomId}/cmd`;
        client.subscribe(cmdTopic, {
          onSuccess: () => console.log(`[Background] Subscribed to ${cmdTopic}`),
          onFailure: (e) => console.error('[Background] Subscribe failed:', e)
        });

        if (cachedState) {
          publishState(cachedState);
        }
      },
      onFailure: (err) => {
        isConnected = false;
        isConnecting = false;
        console.warn(`[Background] Connection to ${target.host} failed:`, err.errorMessage || err);
        // Switch broker on failure
        currentBrokerIndex = (currentBrokerIndex + 1) % BROKERS.length;
        setTimeout(connectMqtt, 3000);
      }
    });

  } catch (err) {
    isConnecting = false;
    isConnected = false;
    console.error('[Background] Error creating Paho client:', err);
    setTimeout(connectMqtt, 3000);
  }
}

function publishState(state) {
  if (client && isConnected && roomId) {
    try {
      const stateTopic = `ytmusic-remote/${roomId}/state`;
      const msg = new Paho.Message(JSON.stringify(state));
      msg.destinationName = stateTopic;
      msg.qos = 0;
      client.send(msg);
    } catch (err) {
      console.warn('[Background] Error publishing state:', err);
    }
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

// Communication with Popup & Content script fallback
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

  if (request.action === 'CONTENT_SCRIPT_STATE') {
    cachedState = request.payload;
    publishState(cachedState);
    sendResponse({ received: true });
    return true;
  }
});

// Periodic keep-alive
setInterval(() => {
  if (!isConnected && !isConnecting) {
    connectMqtt();
  }
}, 15000);

// Initialize
initConfig(() => {
  connectMqtt();
});
