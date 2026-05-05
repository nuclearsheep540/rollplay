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
 * Apply an incoming fog_config_update to the local fog state.
 *
 * Defers to `fog.loadFromConfig` so the full multi-region payload is
 * hydrated atomically — every region's engine gets its mask applied,
 * region metadata (enabled, opacity, feather, etc.) updates, and stale
 * engines for removed regions are dropped. Honours the no-flicker
 * contract via the engine's decode-then-swap loadFromDataUrl.
 *
 * Pass `loadFromConfig` (the bound method from useFogRegions) rather
 * than a raw engine; the handler doesn't need to know about the
 * engine pool internals.
 */
export const handleRemoteFogUpdate = async (data, { loadFromConfig }) => {
  if (!loadFromConfig) {
    console.warn('☁️ Received fog_config_update but no loadFromConfig available');
    return;
  }
  const fogConfig = data?.fog_config ?? null;
  try {
    await loadFromConfig(fogConfig);
    const regionCount = fogConfig?.regions?.length ?? 0;
    console.log(`☁️ Remote fog applied: ${regionCount} region(s)`);
  } catch (err) {
    console.error('☁️ Failed to apply remote fog config:', err);
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
export const registerFogHandlers = ({ registerHandler, loadFromConfig }) => {
  if (!registerHandler) return () => {};
  return registerHandler('fog_config_update', (data) =>
    handleRemoteFogUpdate(data, { loadFromConfig })
  );
};
