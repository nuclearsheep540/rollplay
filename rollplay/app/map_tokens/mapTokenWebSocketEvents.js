/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

/**
 * WebSocket map-token event handlers + send-function factory.
 *
 * Mirrors fog_management/hooks/fogWebSocketEvents.js — pure functions
 * taking dependencies as arguments; useMapTokens wires them.
 *
 * Two lanes (plan §3.2):
 *  - map_token_update / map_token_state_update — committed state. The
 *    server applies the op atomically and broadcasts the map's full token
 *    array; every client (including the sender, via its echo) replaces
 *    that board wholesale. Authoritative reconciliation.
 *  - map_token_drag / map_token_drag_denied — ephemeral presence: grab /
 *    release lift affordances, plus throttled mid-drag move frames when
 *    LIVE_DRAG_STREAMING is on (v1.1) — relayed, never persisted.
 */

/** Committed-state fragment: replace one map's token array wholesale. */
export const handleMapTokenStateUpdate = (data, { applyTokenBoard, addToLog, mergeTokenImages }) => {
  const assetId = data?.asset_id;
  if (!assetId || !applyTokenBoard) return;

  applyTokenBoard(assetId, data.tokens || [], {
    op: data.op,
    tokenId: data.token_id,
    updatedBy: data.updated_by,
  });

  // A place/reveal fragment can carry image refs for tokens entering the
  // player's world (their initial_state only had refs for tokens visible
  // at connect — decision 17 covers artwork identity too).
  if (data.token_images && mergeTokenImages) {
    mergeTokenImages(data.token_images);
  }

  // Server writes the adventure-log line to Mongo; live clients mirror it
  // locally off the broadcast (same pattern as combat_state et al).
  if (data.log_message && addToLog) {
    addToLog(data.log_message, 'system');
  }
};

/** Presence lane: someone's hand grabbed, moved, or released a token. */
export const handleMapTokenDrag = (data, { thisUserId, applyRemoteDrag }) => {
  if (!data?.token_id || !applyRemoteDrag) return;
  if (data.holder_user_id === thisUserId) return; // own echo — local state already reflects it

  applyRemoteDrag({
    tokenId: data.token_id,
    assetId: data.asset_id,
    phase: data.phase,
    holderUserId: data.holder_user_id,
    x: data.x,
    y: data.y,
  });
};

/** Grab denied — first hand already on the mini; our optimistic drag snaps back. */
export const handleMapTokenDragDenied = (data, { applyGrabDenial }) => {
  if (!data?.token_id || !applyGrabDenial) return;
  applyGrabDenial({ tokenId: data.token_id, heldBy: data.held_by });
};

/**
 * Build send functions for token operations. Returned object is stable for
 * a given (webSocket, isConnected) — re-create when those change.
 */
export const createMapTokenSendFunctions = (webSocket, isConnected) => {
  const send = (eventType, data) => {
    if (!webSocket || !isConnected) {
      console.warn(`🪙 Cannot send ${eventType} — WebSocket not connected`);
      return false;
    }
    webSocket.send(JSON.stringify({ event_type: eventType, data }));
    return true;
  };

  // Lane 1 — committed ops. place/move/configure carry the full token
  // (contract-validated server-side); remove carries token_id only.
  const sendMapTokenPlace = (assetId, token) =>
    send('map_token_update', { asset_id: assetId, op: 'place', token });
  const sendMapTokenMove = (assetId, token) =>
    send('map_token_update', { asset_id: assetId, op: 'move', token });
  const sendMapTokenRemove = (assetId, tokenId) =>
    send('map_token_update', { asset_id: assetId, op: 'remove', token_id: tokenId });
  const sendMapTokenConfigure = (assetId, token) =>
    send('map_token_update', { asset_id: assetId, op: 'configure', token });

  // Lane 2 — presence. grab on pointer-capture, throttled move frames while
  // streaming (LIVE_DRAG_STREAMING), release on pointer-up.
  const sendMapTokenGrab = (assetId, tokenId) =>
    send('map_token_drag', { asset_id: assetId, token_id: tokenId, phase: 'grab' });
  const sendMapTokenDragFrame = (assetId, tokenId, x, y) =>
    send('map_token_drag', { asset_id: assetId, token_id: tokenId, phase: 'move', x, y });
  const sendMapTokenRelease = (assetId, tokenId, x, y) =>
    send('map_token_drag', { asset_id: assetId, token_id: tokenId, phase: 'release', x, y });

  return {
    sendMapTokenPlace,
    sendMapTokenMove,
    sendMapTokenRemove,
    sendMapTokenConfigure,
    sendMapTokenGrab,
    sendMapTokenDragFrame,
    sendMapTokenRelease,
  };
};

/**
 * Register all token handlers with the router-style registerHandler.
 * Returns one cleanup function.
 */
export const registerMapTokenHandlers = ({ registerHandler, thisUserId,
                                           applyTokenBoard, applyRemoteDrag,
                                           applyGrabDenial, addToLog,
                                           mergeTokenImages }) => {
  if (!registerHandler) return () => {};

  const cleanups = [
    registerHandler('map_token_state_update', (data) =>
      handleMapTokenStateUpdate(data, { applyTokenBoard, addToLog, mergeTokenImages })),
    registerHandler('map_token_drag', (data) =>
      handleMapTokenDrag(data, { thisUserId, applyRemoteDrag })),
    registerHandler('map_token_drag_denied', (data) =>
      handleMapTokenDragDenied(data, { applyGrabDenial })),
  ];
  return () => cleanups.forEach((cleanup) => cleanup());
};
