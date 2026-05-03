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
 * Honours the no-flicker contract: if the payload carries a region with
 * a mask, the engine decodes it before swapping. If fog_config is
 * null/undefined or has no regions, the local fog is cleared.
 *
 * Step-1 reads regions[0] only — single-region rendering. Multi-region
 * compositing (FogRegionStack) lands later; the protocol is already
 * v2-shaped so the WS contract doesn't need a follow-up break.
 */
export const handleRemoteFogUpdate = async (data, { engine }) => {
  if (!engine) {
    console.warn('☁️ Received fog_config_update but no engine available');
    return;
  }
  const fogConfig = data?.fog_config;
  const firstRegion = fogConfig?.regions?.[0] ?? null;
  if (!firstRegion || !firstRegion.mask) {
    await engine.loadFromRegion(null); // clears + nulls the captured id
    console.log('☁️ Remote fog cleared');
    return;
  }
  try {
    await engine.loadFromRegion(firstRegion);
    console.log(
      `☁️ Remote fog applied: ${firstRegion.mask_width}x${firstRegion.mask_height} (region ${firstRegion.id})`
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
    // fogConfig may be null (clear) or { version: 2, regions: [...] }
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
