document.addEventListener('DOMContentLoaded', () => {
  const cloudDot = document.getElementById('cloudDot');
  const cloudStatusText = document.getElementById('cloudStatusText');
  const ytmDot = document.getElementById('ytmDot');
  const ytmStatusText = document.getElementById('ytmStatusText');
  const roomCodeDisplay = document.getElementById('roomCodeDisplay');
  const qrCanvas = document.getElementById('qrCanvas');
  const urlText = document.getElementById('urlText');
  const copyBtn = document.getElementById('copyBtn');
  const regenBtn = document.getElementById('regenBtn');
  const openYtmBtn = document.getElementById('openYtmBtn');
  const miniPlayer = document.getElementById('miniPlayer');
  const miniThumb = document.getElementById('miniThumb');
  const miniTitle = document.getElementById('miniTitle');
  const miniArtist = document.getElementById('miniArtist');
  const settingsToggle = document.getElementById('settingsToggle');
  const settingsPanel = document.getElementById('settingsPanel');
  const webAppUrlInput = document.getElementById('webAppUrlInput');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');

  let currentFullUrl = '';
  let currentRoomId = '';

  function renderQR(url) {
    if (window.QRCode && qrCanvas) {
      QRCode.toCanvas(qrCanvas, url, {
        width: 150,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      }, (err) => {
        if (err) console.error('QR Render error:', err);
      });
    }
  }

  function updateUI(status) {
    if (!status) return;

    // Cloud Relay Status
    if (status.isConnected) {
      cloudDot.className = 'dot green';
      cloudStatusText.textContent = 'Connected (Global)';
    } else {
      cloudDot.className = 'dot';
      cloudStatusText.textContent = 'Connecting...';
    }

    // YouTube Music Tab Status
    if (status.ytmConnected) {
      ytmDot.className = 'dot green';
      ytmStatusText.textContent = 'Tab Connected';

      if (status.lastState && status.lastState.title) {
        showMiniPlayer(status.lastState);
      }
    } else {
      ytmDot.className = 'dot red';
      ytmStatusText.textContent = 'Tab not open';
    }

    // Room ID & URL
    if (status.roomId) {
      currentRoomId = status.roomId;
      roomCodeDisplay.textContent = 'ROOM: ' + status.roomId.toUpperCase().replace('YTM_', '');
      
      const baseUrl = status.webAppUrl || 'https://dexter.github.io/ytmusic-remote';
      currentFullUrl = `${baseUrl.replace(/\/$/, '')}/#room=${status.roomId}`;
      urlText.textContent = currentFullUrl;
      webAppUrlInput.value = baseUrl;

      renderQR(currentFullUrl);
    }
  }

  function fetchStatus() {
    chrome.runtime.sendMessage({ action: 'GET_STATUS' }, (res) => {
      if (!chrome.runtime.lastError && res) {
        updateUI(res);
      }
    });
  }

  function showMiniPlayer(state) {
    if (!state || !state.title) return;
    miniTitle.textContent = state.title;
    miniArtist.textContent = state.artist || 'YouTube Music';
    if (state.artwork) {
      miniThumb.src = state.artwork;
      miniThumb.style.display = 'block';
    } else {
      miniThumb.style.display = 'none';
    }
    miniPlayer.style.display = 'flex';
  }

  // Copy link
  copyBtn.addEventListener('click', () => {
    if (!currentFullUrl) return;
    navigator.clipboard.writeText(currentFullUrl).then(() => {
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
    });
  });

  // Regenerate Room
  regenBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'REGENERATE_ROOM' }, (res) => {
      if (res && res.success) {
        fetchStatus();
      }
    });
  });

  // Open YouTube Music
  openYtmBtn.addEventListener('click', () => {
    chrome.tabs.query({ url: '*://music.youtube.com/*' }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.update(tabs[0].id, { active: true });
      } else {
        chrome.tabs.create({ url: 'https://music.youtube.com' });
      }
    });
  });

  // Settings toggle
  settingsToggle.addEventListener('click', () => {
    const isVisible = settingsPanel.style.display === 'block';
    settingsPanel.style.display = isVisible ? 'none' : 'block';
  });

  saveSettingsBtn.addEventListener('click', () => {
    let newUrl = webAppUrlInput.value.trim();
    if (newUrl) {
      // Auto-correct github.com repository link to github.io pages link if user entered github.com
      const ghRepoMatch = newUrl.match(/^https?:\/\/github\.com\/([^\/]+)\/([^\/]+)\/?$/i);
      if (ghRepoMatch) {
        newUrl = `https://${ghRepoMatch[1]}.github.io/${ghRepoMatch[2]}`;
      }

      chrome.runtime.sendMessage({ action: 'SET_WEBAPP_URL', url: newUrl }, (res) => {
        settingsPanel.style.display = 'none';
        fetchStatus();
      });
    }
  });

  // Initial & interval refresh
  fetchStatus();
  setInterval(fetchStatus, 2000);
});
