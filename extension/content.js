// YouTube Music Content Script - Remote Control Bridge
(function () {
  'use strict';

  console.log('[YTMusic Remote] Content script loaded on music.youtube.com');

  let port = null;
  let isConnected = false;
  let lastStateJson = '';

  function connectToBackground() {
    if (!chrome.runtime?.id) {
      return; // Extension context invalidated or reloaded
    }

    try {
      port = chrome.runtime.connect({ name: 'ytm-remote-cs' });
      isConnected = true;

      port.onMessage.addListener((msg) => {
        if (msg.type === 'COMMAND') {
          handleCommand(msg.command, msg.payload);
        }
      });

      port.onDisconnect.addListener(() => {
        isConnected = false;
        port = null;
        // Retry silently
        setTimeout(connectToBackground, 3000);
      });

      // Send initial state immediately
      sendStateUpdate(true);
    } catch (err) {
      isConnected = false;
      port = null;
      setTimeout(connectToBackground, 3000);
    }
  }

  // Fallback direct message listener
  if (chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'COMMAND') {
        handleCommand(msg.command, msg.payload);
      }
    });
  }

  function getVideoElement() {
    return document.querySelector('video.video-stream') || document.querySelector('video');
  }

  function getPlayerBar() {
    return document.querySelector('ytmusic-player-bar');
  }

  function extractState() {
    const video = getVideoElement();
    const playerBar = getPlayerBar();

    let title = '';
    let artist = '';
    let album = '';
    let artwork = '';

    // 1. MediaSession API (most reliable)
    if (navigator.mediaSession && navigator.mediaSession.metadata) {
      const meta = navigator.mediaSession.metadata;
      if (meta.title) title = meta.title;
      if (meta.artist) artist = meta.artist;
      if (meta.album) album = meta.album;
      if (meta.artwork && meta.artwork.length > 0) {
        artwork = meta.artwork[meta.artwork.length - 1].src;
      }
    }

    // 2. DOM elements fallback
    if (playerBar) {
      if (!title) {
        const titleEl = playerBar.querySelector('.title.ytmusic-player-bar') ||
                        playerBar.querySelector('.title') ||
                        playerBar.querySelector('#layout .title');
        if (titleEl) title = titleEl.textContent.trim();
      }

      if (!artist) {
        const bylineEl = playerBar.querySelector('.byline.ytmusic-player-bar') ||
                         playerBar.querySelector('.byline') ||
                         playerBar.querySelector('.subtitle');
        if (bylineEl) {
          const parts = bylineEl.textContent.split('•').map(s => s.trim());
          if (parts[0]) artist = parts[0];
          if (parts[1] && !album) album = parts[1];
        }
      }

      if (!artwork) {
        const imgEl = playerBar.querySelector('.thumbnail-image-wrapper img') ||
                      playerBar.querySelector('img#img') ||
                      playerBar.querySelector('.image.ytmusic-player-bar') ||
                      playerBar.querySelector('img');
        if (imgEl && imgEl.src && !imgEl.src.startsWith('data:image/svg')) {
          artwork = imgEl.src;
        }
      }
    }

    // Liked / Disliked status
    let isLiked = false;
    let isDisliked = false;
    const likeBtn = document.querySelector('ytmusic-like-button-renderer #button-shape-like button') ||
                    document.querySelector('ytmusic-like-button-renderer .like');
    if (likeBtn) {
      isLiked = likeBtn.getAttribute('aria-pressed') === 'true';
    }

    const dislikeBtn = document.querySelector('ytmusic-like-button-renderer #button-shape-dislike button') ||
                       document.querySelector('ytmusic-like-button-renderer .dislike');
    if (dislikeBtn) {
      isDisliked = dislikeBtn.getAttribute('aria-pressed') === 'true';
    }

    // Shuffle & Repeat
    let isShuffle = false;
    let repeatMode = 'NONE';
    const shuffleBtn = playerBar ? playerBar.querySelector('.shuffle') : null;
    if (shuffleBtn) {
      isShuffle = shuffleBtn.getAttribute('aria-pressed') === 'true';
    }

    const repeatBtn = playerBar ? playerBar.querySelector('.repeat') : null;
    if (repeatBtn) {
      const ariaLabel = (repeatBtn.getAttribute('aria-label') || '').toLowerCase();
      if (ariaLabel.includes('one')) repeatMode = 'ONE';
      else if (ariaLabel.includes('all') || repeatBtn.getAttribute('aria-pressed') === 'true') repeatMode = 'ALL';
    }

    const currentTime = video ? Math.round(video.currentTime * 10) / 10 : 0;
    const duration = video && !isNaN(video.duration) ? Math.round(video.duration * 10) / 10 : 0;
    const isPlaying = video ? (!video.paused && !video.ended && video.readyState > 2) : false;
    const volume = video ? Math.round(video.volume * 100) / 100 : 1;
    const isMuted = video ? video.muted : false;

    return {
      title: title || 'No track playing',
      artist: artist || '',
      album: album || '',
      artwork: artwork || '',
      currentTime,
      duration,
      isPlaying,
      volume,
      isMuted,
      isLiked,
      isDisliked,
      isShuffle,
      repeatMode,
      hasMedia: !!(title || video)
    };
  }

  function sendStateUpdate(force = false) {
    if (!chrome.runtime?.id) return;

    const state = extractState();
    const stateJson = JSON.stringify(state);

    if (force || stateJson !== lastStateJson) {
      lastStateJson = stateJson;

      if (port && isConnected) {
        try {
          port.postMessage({
            type: 'STATE_UPDATE',
            payload: state
          });
          return;
        } catch (err) {
          isConnected = false;
        }
      }

      // Fallback message
      try {
        chrome.runtime.sendMessage({
          action: 'CONTENT_SCRIPT_STATE',
          payload: state
        }, () => {
          if (chrome.runtime.lastError) { /* ignore */ }
        });
      } catch (e) {}
    }
  }

  function handleCommand(command, payload) {
    const video = getVideoElement();
    const playerBar = getPlayerBar();

    switch (command) {
      case 'toggle_play': {
        const playPauseBtn = document.querySelector('#play-pause-button') ||
                             document.querySelector('ytmusic-player-bar #play-pause-button') ||
                             document.querySelector('.play-pause-button');
        if (playPauseBtn) {
          playPauseBtn.click();
        } else if (video) {
          if (video.paused) video.play(); else video.pause();
        }
        break;
      }

      case 'play': {
        if (video && video.paused) {
          const playPauseBtn = document.querySelector('#play-pause-button');
          if (playPauseBtn) playPauseBtn.click(); else video.play();
        }
        break;
      }

      case 'pause': {
        if (video && !video.paused) {
          const playPauseBtn = document.querySelector('#play-pause-button');
          if (playPauseBtn) playPauseBtn.click(); else video.pause();
        }
        break;
      }

      case 'next': {
        const nextBtn = document.querySelector('ytmusic-player-bar .next-button') ||
                        document.querySelector('.next-button') ||
                        document.querySelector('#right-controls .next-button');
        if (nextBtn) nextBtn.click();
        break;
      }

      case 'prev': {
        const prevBtn = document.querySelector('ytmusic-player-bar .previous-button') ||
                        document.querySelector('.previous-button') ||
                        document.querySelector('#left-controls .previous-button');
        if (prevBtn) prevBtn.click();
        break;
      }

      case 'seek': {
        if (video && typeof payload?.time === 'number') {
          video.currentTime = payload.time;
        }
        break;
      }

      case 'volume': {
        if (video && typeof payload?.volume === 'number') {
          const vol = Math.max(0, Math.min(1, payload.volume));
          video.volume = vol;
          video.muted = vol === 0;
        }
        break;
      }

      case 'like': {
        const likeBtn = document.querySelector('ytmusic-like-button-renderer #button-shape-like button') ||
                        document.querySelector('ytmusic-like-button-renderer .like');
        if (likeBtn) likeBtn.click();
        break;
      }

      case 'dislike': {
        const dislikeBtn = document.querySelector('ytmusic-like-button-renderer #button-shape-dislike button') ||
                           document.querySelector('ytmusic-like-button-renderer .dislike');
        if (dislikeBtn) dislikeBtn.click();
        break;
      }

      case 'shuffle': {
        const shuffleBtn = playerBar ? playerBar.querySelector('.shuffle') : null;
        if (shuffleBtn) shuffleBtn.click();
        break;
      }

      case 'repeat': {
        const repeatBtn = playerBar ? playerBar.querySelector('.repeat') : null;
        if (repeatBtn) repeatBtn.click();
        break;
      }
    }

    setTimeout(() => sendStateUpdate(true), 150);
  }

  function attachVideoListeners() {
    const video = getVideoElement();
    if (video) {
      ['play', 'pause', 'seeked', 'volumechange', 'durationchange', 'ratechange'].forEach(evt => {
        video.addEventListener(evt, () => sendStateUpdate(true));
      });
    }
  }

  setInterval(() => {
    attachVideoListeners();
    sendStateUpdate(false);
  }, 500);

  connectToBackground();
})();
