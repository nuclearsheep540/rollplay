/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

/**
 * WebSocket fog event handlers + send-function factory.
 *
 * Mirrors audio_management/hooks/webSocketAudioEvents.js — pure
 * functions that take dependencies as arguments rather than reading
 * from React state, so consumers can wire them however they like.
 */

/**
 * Apply an incoming fog_config_update to the local engine.
 *
 * Honours the no-flicker contract: if the payload carries a mask, the
 * engine decodes it before swapping. If fog_config is null/undefined,
 * the local fog is cleared.
 *
 * Spread-don't-reconstruct (per feedback_field_drift.md): we never
 * cherry-pick fields out of fog_config — the whole object is passed
 * through, so new optional fields added to the contract continue to
 * round-trip without code changes.
 */
export const handleRemoteFogUpdate = async (data, { engine }) => {
  if (!engine) {
    console.warn('☁️ Received fog_config_update but no engine available');
    return;
  }
  const fogConfig = data?.fog_config;
  if (!fogConfig || !fogConfig.mask) {
    await engine.loadFromDataUrl(null); // clears
    console.log('☁️ Remote fog cleared');
    return;
  }
  try {
    await engine.loadFromDataUrl(fogConfig.mask);
    console.log(
      `☁️ Remote fog applied: ${fogConfig.mask_width}x${fogConfig.mask_height} v${fogConfig.version}`
    );
  } catch (err) {
    console.error('☁️ Failed to apply remote fog mask:', err);
  }
};

/**
 * Build send functions for fog operations. Returned object is stable
 * for a given (webSocket, isConnected) — re-create when those change.
 */
export const createFogSendFunctions = (webSocket, isConnected) => {
  const sendFogUpdate = (filename, fogConfig) => {
    if (!webSocket || !isConnected) {
      console.warn('☁️ Cannot send fog update — WebSocket not connected');
      return false;
    }
    if (!filename) {
      console.warn('☁️ Cannot send fog update — missing filename');
      return false;
    }
    // fogConfig may be null (clear) or { mask, mask_width, mask_height, version }
    webSocket.send(JSON.stringify({
      event_type: 'fog_config_update',
      data: { filename, fog_config: fogConfig },
    }));
    return true;
  };

  return { sendFogUpdate };
};

/**
 * Convenience wrapper to register the fog handler with a router-style
 * registerHandler(eventType, callback) → cleanup function.
 *
 * Returns a single cleanup function to unsubscribe.
 */
export const registerFogHandlers = ({ registerHandler, engine }) => {
  if (!registerHandler) return () => {};
  return registerHandler('fog_config_update', (data) =>
    handleRemoteFogUpdate(data, { engine })
  );
};
