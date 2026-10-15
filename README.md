# 🎵 YouTube Music Mobile Remote (Spotify-Connect Style)

> Control YouTube Music playing on your desktop browser directly from your phone — **from anywhere in the world, on any network, with zero server configuration**.

[![GitHub Actions](https://img.shields.io/badge/GitHub%20Pages-Automated%20Deploy-green?logo=github)](https://github.com)
[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Ready%20for%20Publishing-blue?logo=googlechrome)](https://chrome.google.com/webstore)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## ✨ Features

- **No Same-Network Requirement**: Works seamlessly whether your phone is on 5G/4G cellular, office Wi-Fi, or home Wi-Fi. No ports to forward, no firewall barriers, and no local Node.js server needed by your users.
- **Instant QR Pairing**: Open YouTube Music, click the extension icon, and scan the QR code with your phone camera. You're paired in less than a second.
- **Spotify-like Mobile UI**:
  - Live album artwork with dynamic ambient lighting glow.
  - Real-time track title, artist name, and album information.
  - Interactive progress bar with live scrubbing/seeking.
  - Play, Pause, Next track, Previous track.
  - Volume slider with one-tap mute/unmute.
  - Like (Thumbs Up) and Dislike (Thumbs Down) controls.
  - Shuffle and Repeat toggles.
  - Screen wake-lock (keeps your phone screen awake while music is playing).
  - Tactile haptic feedback when tapping buttons.
- **PWA Ready**: Tap "Add to Home Screen" on iOS Safari or Android Chrome to use it like a native mobile app!
- **Store-Ready**: Designed for zero-friction distribution on the Chrome Web Store.

---

## 🏗️ Architecture

```
┌─────────────────────────────────┐           ┌─────────────────────────────────┐
│     Desktop Google Chrome       │           │          Mobile Phone           │
│                                 │           │   (Safari / Chrome / Android)   │
│  [music.youtube.com]            │           │                                 │
│        ▲                        │           │    [Spotify-style Web App]      │
│        │ DOM / MediaSession     │           │                                 │
│  [Extension Content Script]     │           │                                 │
│        ▲                        │           │                                 │
│        │ Chrome Runtime Port    │           │                                 │
│  [Extension Background Worker]  │           │                                 │
└────────┼────────────────────────┘           └────────────────┼────────────────┘
         │                                                     │
         │ Secure WebSocket (WSS)                              │ Secure WebSocket (WSS)
         └───────────────────────► [ Cloud Relay ] ◄───────────┘
                                   (HiveMQ / EMQX)
```

1. **Chrome Extension (Manifest V3)**: Injected into `music.youtube.com`. Reads player state directly from DOM & MediaSession API, listens for phone commands, and bridges to the cloud broker over secure WebSockets (`wss://`).
2. **Cloud Relay Broker**: Free, high-speed, enterprise-grade MQTT over WSS broker. Routes encrypted messages between desktop and mobile with ultra-low latency (~20ms).
3. **Hosted Mobile Web App (`web-app/`)**: Static client-side app hosted on GitHub Pages or Vercel. Reads `#room=<roomId>` from the scanned QR code and connects to the same cloud room.

---

## 🚀 Quick Start (Testing Locally in Chrome)

### Step 1: Load the Extension in Chrome
1. In Chrome, open `chrome://extensions`.
2. Turn ON **"Developer mode"** in the top-right corner.
3. Click **"Load unpacked"** in the top-left.
4. Select the `extension/` folder inside this repository:
   ```
   C:\Users\dexter\.gemini\antigravity\scratch\ytmusic-remote\extension
   ```

### Step 2: Open YouTube Music
1. Navigate to [music.youtube.com](https://music.youtube.com) and play any song.
2. Click the **YT Music Remote** extension icon in your Chrome toolbar.
3. You will see:
   - `Cloud Relay: Connected (Global)`
   - `YouTube Music Tab: Tab Connected`
   - A generated QR Code and Room Code.

### Step 3: Scan with your Phone
1. Scan the QR code using your phone's camera.
2. The Spotify-like remote will load on your phone and immediately sync playback with your desktop!

---

## 🌐 Deploying to GitHub & GitHub Pages

To make the web app accessible to anyone in the world:

1. Create a new repository on [GitHub](https://github.com/new) named `ytmusic-remote`.
2. Push this project to your repository:
   ```bash
   git remote add origin https://github.com/<YOUR-USERNAME>/ytmusic-remote.git
   git branch -M main
   git push -u origin main
   ```
3. Enable GitHub Pages:
   - On GitHub, go to your repository **Settings → Pages**.
   - Under **Build and deployment → Source**, choose **GitHub Actions**.
   - The included workflow (`.github/workflows/deploy.yml`) will automatically publish the mobile app to:
     `https://<YOUR-USERNAME>.github.io/ytmusic-remote`
4. Set your GitHub Pages URL in the extension:
   - Click the extension icon in Chrome → Click the **Gear icon (⚙️)** in the top right.
   - Enter your GitHub Pages URL: `https://<YOUR-USERNAME>.github.io/ytmusic-remote`
   - Click **Save**. All generated QR codes will now point to your live hosted web app!

---

## 🛍️ Publishing to the Chrome Web Store

1. Zip the contents of the `extension/` folder (ensure `manifest.json` is at the root of the ZIP).
2. Go to the [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole).
3. Pay the one-time $5 Google developer registration fee (if not already registered).
4. Click **"New Item"** and upload your ZIP file.
5. Add description, promotional screenshots (we provide 16x16, 48x48, 128x128 icons in `extension/icons/`), and submit for review!

---

## 📄 License

MIT License — feel free to modify and share!
