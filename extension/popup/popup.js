document.addEventListener('DOMContentLoaded', () => {
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const qrCanvas = document.getElementById('qrCanvas');
  const openYtmBtn = document.getElementById('openYtmBtn');
  const miniPlayer = document.getElementById('miniPlayer');
  const miniThumb = document.getElementById('miniThumb');
  const miniTitle = document.getElementById('miniTitle');
  const miniArtist = document.getElementById('miniArtist');

  const WEB_APP_URL = 'https://surya467.github.io/ytmusic-remote';
  let renderedRoomId = '';

  function renderQR(roomId) {
    if (window.QRCode && qrCanvas && roomId) {
      if (renderedRoomId === roomId) return;
      renderedRoomId = roomId;

      const fullUrl = `${WEB_APP_URL}/#room=${roomId}`;
      QRCode.toCanvas(qrCanvas, fullUrl, {
        width: 170,
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

  function updateStatus(status) {
    if (!status) return;

    // 1. YouTube Music Tab is not open -> Red
    if (!status.ytmConnected) {
      statusDot.className = 'status-dot red';
      statusText.textContent = 'YouTube Music is not open';
    }
    // 2. Tab is open, but phone has not connected -> Yellow
    else if (!status.phoneConnected) {
      statusDot.className = 'status-dot yellow';
      statusText.textContent = 'Not connected';
    }
    // 3. Phone is connected -> Green
    else {
      statusDot.className = 'status-dot green';
      statusText.textContent = 'Connected';
    }

    // Render QR Code
    if (status.roomId) {
      renderQR(status.roomId);
    }

    // Mini Player
    if (status.lastState && status.lastState.title && status.lastState.title !== 'No track playing') {
      showMiniPlayer(status.lastState);
    } else {
      miniPlayer.style.display = 'none';
    }
  }

  function fetchStatus() {
    chrome.runtime.sendMessage({ action: 'GET_STATUS' }, (res) => {
      if (!chrome.runtime.lastError && res) {
        updateStatus(res);
      }
    });
  }

  function showMiniPlayer(state) {
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

  // Robust "Open YouTube Music" button handler
  openYtmBtn.addEventListener('click', (e) => {
    e.preventDefault();

    try {
      chrome.tabs.query({ url: '*://music.youtube.com/*' }, (tabs) => {
        if (chrome.runtime.lastError || !tabs || tabs.length === 0) {
          chrome.tabs.create({ url: 'https://music.youtube.com/' });
        } else {
          const targetTab = tabs[0];
          chrome.tabs.update(targetTab.id, { active: true }, () => {
            if (targetTab.windowId !== undefined) {
              chrome.windows.update(targetTab.windowId, { focused: true });
            }
          });
        }
      });
    } catch (err) {
      // Fallback
      window.open('https://music.youtube.com/', '_blank');
    }
  });

  // Initial fetch and poll
  fetchStatus();
  setInterval(fetchStatus, 1500);
});
