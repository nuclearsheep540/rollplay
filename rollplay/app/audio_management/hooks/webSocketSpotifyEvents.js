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

export const createSpotifySendFunctions = (webSocket, isConnected, userId) => {
  /**
   * @param {'sync'|'select'|'play'|'pause'|'stop'|'channel_volume'} action
   * @param {object} payload  shape varies by action, e.g.
   *   sync           → { track_uri, track_meta, is_playing, position_ms, context_uri }
   *   select         → { track_uri, track_meta }
   *   channel_volume → { level }
   */
  const sendSpotifyControl = (action, payload = {}) => {
    if (!webSocket || !isConnected) {
      console.log('❌ Cannot send spotify control - WebSocket not connected');
      return;
    }
    webSocket.send(JSON.stringify({
      event_type: 'spotify_control',
      data: { action, triggered_by: userId, ...payload },
    }));
  };

  return { sendSpotifyControl };
};
