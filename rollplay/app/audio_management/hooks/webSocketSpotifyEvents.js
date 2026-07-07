/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

/**
 * WebSocket glue for the DM-controlled Spotify BGM bed.
 *
 * Mirrors webSocketAudioEvents.js:
 *  - handleSpotifyState(data, handlers): inbound `spotify_state` (and the
 *    `spotify` block of `initial_state`) → drives each client's SDK via the
 *    applySpotifySnapshot fn supplied through gameContext.
 *  - createSpotifySendFunctions(...): outbound DM control over the WS
 *    (server-authoritative: server re-broadcasts `spotify_state` to everyone).
 */

export const handleSpotifyState = (data, handlers) => {
  if (handlers?.applySpotifySnapshot) {
    handlers.applySpotifySnapshot(data);
  }
};

export const createSpotifySendFunctions = (webSocket, isConnected, playerName) => {
  /**
   * @param {'select'|'play'|'pause'|'stop'} action
   * @param {object} payload  e.g. { track_uri, track_meta: { name, artist, art_url, duration_ms } }
   */
  const sendSpotifyControl = (action, payload = {}) => {
    if (!webSocket || !isConnected) {
      console.log('❌ Cannot send spotify control - WebSocket not connected');
      return;
    }
    webSocket.send(JSON.stringify({
      event_type: 'spotify_control',
      data: { action, triggered_by: playerName, ...payload },
    }));
  };

  return { sendSpotifyControl };
};
