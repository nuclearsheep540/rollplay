/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  createMapTokenSendFunctions,
  registerMapTokenHandlers,
} from '../mapTokenWebSocketEvents';
import { HELD_STALENESS_MS, mintTokenId, snapTokenCenter } from '../config';
import { screenPointToSpace } from '@/app/shared/utils/screenToImage';

/**
 * useMapTokens — client state for the shared token board (plan §3.4).
 *
 * Owns the map_token_state slice (asset_id → token list, hydrated from
 * initial_state and reconciled wholesale from map_token_state_update
 * fragments), the remote-hold presence map, grab-denial signals, the DM's
 * local NPC drafts, and the chip→map carry flow.
 *
 * Commits are optimistic: the local board updates immediately and the
 * server's echoed fragment is the authoritative reconciliation (identical
 * values in the happy path, so nothing visibly moves twice).
 *
 * Lives at GameContent level (fog precedent) so the board outlives drawer
 * and panel toggles.
 */
export const useMapTokens = ({
  webSocket,
  isConnected,
  registerHandler,
  thisUserId,
  activeMap,
  addToLog,
}) => {
  // asset_id → [MapToken] — every map in the session keeps its own board.
  const [mapTokenState, setMapTokenState] = useState({});
  // token_id → { holderUserId, heldAtMs } — remote hands only (own drags
  // live in MapTokenLayer's refs; the server echo is filtered out).
  const [heldTokens, setHeldTokens] = useState({});
  // Latest grab denial — MapTokenLayer watches this to snap an optimistic
  // drag back home.
  const [lastDenial, setLastDenial] = useState(null);
  // DM-local NPC drafts (created, not yet placed). Not shared state: a
  // draft becomes visible to the table the moment it's placed.
  const [npcDrafts, setNpcDrafts] = useState([]);
  // Chip → map carry in flight (token payload without a position yet).
  // A ref, not state: nothing renders it — the chip owns its ghost, and
  // only dropCarriedToken reads it. Keeping it out of state avoids two
  // full GameContent re-renders per chip drag.
  const carriedTokenRef = useRef(null);

  const activeAssetId = activeMap?.map_config?.asset_id || null;
  const gridConfig = activeMap?.map_config?.grid_config || null;

  // MapTokenLayer registers its wrapper element + the image's natural size
  // so screen-point placement (chip drops) can convert without the layer.
  const layerMetricsRef = useRef({ element: null, naturalWidth: 0, naturalHeight: 0 });
  const attachTokenLayer = useCallback((element, naturalWidth, naturalHeight) => {
    layerMetricsRef.current = { element, naturalWidth, naturalHeight };
  }, []);

  // ── Incoming WS state ──────────────────────────────────────────────────────

  const applyTokenBoard = useCallback((assetId, tokens) => {
    setMapTokenState((previousState) => ({ ...previousState, [assetId]: tokens }));
    // A committed op settles any lift affordance for the tokens involved —
    // the release frame usually arrives first, but reconcile regardless.
  }, []);

  const applyRemoteDrag = useCallback(({ tokenId, phase, holderUserId }) => {
    if (phase === 'grab') {
      setHeldTokens((previousHolds) => ({
        ...previousHolds,
        [tokenId]: { holderUserId, heldAtMs: Date.now() },
      }));
    } else if (phase === 'release') {
      setHeldTokens((previousHolds) => {
        if (!previousHolds[tokenId]) return previousHolds;
        const nextHolds = { ...previousHolds };
        delete nextHolds[tokenId];
        return nextHolds;
      });
    }
    // v1 is markers-only: 'move' frames are reserved for the live-drag
    // fast-follow and ignored here.
  }, []);

  const applyGrabDenial = useCallback(({ tokenId, heldBy }) => {
    setLastDenial({ tokenId, heldBy, atMs: Date.now() });
  }, []);

  // A denial acts once — MapTokenLayer consumes it (snap-back) then clears
  // it, so a stale denial can never cancel a later legitimate drag.
  const clearDenial = useCallback(() => setLastDenial(null), []);

  // Ghost-hold cleanup (c): staleness — a lift with no release after
  // HELD_STALENESS_MS reverts (mirrors the server's lazy expiry). Deps on
  // the boolean, not the dict: hold churn must not keep resetting the
  // interval or a crashed holder's ghost could outlive its timeout.
  const hasHeldTokens = Object.keys(heldTokens).length > 0;
  useEffect(() => {
    if (!hasHeldTokens) return;
    const sweep = setInterval(() => {
      const nowMs = Date.now();
      setHeldTokens((previousHolds) => {
        const nextHolds = {};
        let changed = false;
        Object.entries(previousHolds).forEach(([tokenId, hold]) => {
          if (nowMs - hold.heldAtMs > HELD_STALENESS_MS) {
            changed = true;
          } else {
            nextHolds[tokenId] = hold;
          }
        });
        return changed ? nextHolds : previousHolds;
      });
    }, 2000);
    return () => clearInterval(sweep);
  }, [hasHeldTokens]);

  // Ghost-hold cleanup (b): holder disconnected. Called from the core
  // player_disconnected handler via gameContext.
  const clearHoldsForUser = useCallback((userId) => {
    setHeldTokens((previousHolds) => {
      const nextHolds = {};
      let changed = false;
      Object.entries(previousHolds).forEach(([tokenId, hold]) => {
        if (hold.holderUserId === userId) {
          changed = true;
        } else {
          nextHolds[tokenId] = hold;
        }
      });
      return changed ? nextHolds : previousHolds;
    });
  }, []);

  // ── Sends ──────────────────────────────────────────────────────────────────

  const sendFunctions = useMemo(
    () => createMapTokenSendFunctions(webSocket, isConnected),
    [webSocket, isConnected]
  );

  const clampToImage = useCallback((x, y) => {
    const { naturalWidth, naturalHeight } = layerMetricsRef.current;
    if (!naturalWidth || !naturalHeight) return { x, y };
    return {
      x: Math.max(0, Math.min(naturalWidth, x)),
      y: Math.max(0, Math.min(naturalHeight, y)),
    };
  }, []);

  // Committed ops send FIRST and only mutate the local board when the send
  // actually left — an optimistic mutation with no server echo coming
  // would diverge this client's board until the next rejoin.

  const commitTokenPlace = useCallback((token) => {
    if (!activeAssetId) return false;
    const clamped = clampToImage(token.x, token.y);
    const snapped = snapTokenCenter(clamped.x, clamped.y, gridConfig, token.footprint);
    const placedToken = {
      ...token,
      id: token.id || mintTokenId(), // pc chips mint at placement; npc drafts keep their draft id
      x: snapped.x,
      y: snapped.y,
      created_by: thisUserId, // server re-stamps; sent to satisfy the contract
      updated_at: new Date().toISOString(), // local sort hint until the echo lands
    };
    if (!sendFunctions.sendMapTokenPlace(activeAssetId, placedToken)) return false;
    setMapTokenState((previousState) => {
      const board = previousState[activeAssetId] || [];
      if (board.some((existingToken) => existingToken.id === placedToken.id)) return previousState;
      return { ...previousState, [activeAssetId]: [...board, placedToken] };
    });
    return true;
  }, [activeAssetId, gridConfig, thisUserId, clampToImage, sendFunctions]);

  const commitTokenMove = useCallback((token, nativeX, nativeY) => {
    if (!activeAssetId) return false;
    const clamped = clampToImage(nativeX, nativeY);
    const snapped = snapTokenCenter(clamped.x, clamped.y, gridConfig, token.footprint);
    const movedToken = { ...token, x: snapped.x, y: snapped.y, updated_at: new Date().toISOString() };
    if (!sendFunctions.sendMapTokenMove(activeAssetId, movedToken)) return false;
    setMapTokenState((previousState) => {
      const board = previousState[activeAssetId] || [];
      return {
        ...previousState,
        [activeAssetId]: board.map((existingToken) =>
          existingToken.id === movedToken.id ? movedToken : existingToken
        ),
      };
    });
    return true;
  }, [activeAssetId, gridConfig, clampToImage, sendFunctions]);

  const removeToken = useCallback((tokenId) => {
    if (!activeAssetId) return false;
    if (!sendFunctions.sendMapTokenRemove(activeAssetId, tokenId)) return false;
    setMapTokenState((previousState) => {
      const board = previousState[activeAssetId] || [];
      return {
        ...previousState,
        [activeAssetId]: board.filter((existingToken) => existingToken.id !== tokenId),
      };
    });
    return true;
  }, [activeAssetId, sendFunctions]);

  const grabToken = useCallback((tokenId) => {
    if (!activeAssetId) return false;
    return sendFunctions.sendMapTokenGrab(activeAssetId, tokenId);
  }, [activeAssetId, sendFunctions]);

  const releaseToken = useCallback((tokenId, x, y) => {
    if (!activeAssetId) return false;
    return sendFunctions.sendMapTokenRelease(activeAssetId, tokenId, x, y);
  }, [activeAssetId, sendFunctions]);

  // ── Chip → map carry (drag from drawer, decision 14) ───────────────────────

  const beginCarry = useCallback((token) => { carriedTokenRef.current = token; }, []);
  const cancelCarry = useCallback(() => { carriedTokenRef.current = null; }, []);

  /**
   * Drop the carried token at a screen point. Places it when the point is
   * over the map image; anywhere else is a no-op snap-back. Returns whether
   * a placement happened.
   */
  const dropCarriedToken = useCallback((clientX, clientY) => {
    const carried = carriedTokenRef.current;
    carriedTokenRef.current = null;
    if (!carried || !activeAssetId) return false;

    const { element, naturalWidth, naturalHeight } = layerMetricsRef.current;
    const point = screenPointToSpace(element, clientX, clientY, naturalWidth, naturalHeight);
    if (!point || !point.insideElement) return false;

    const placed = commitTokenPlace({ ...carried, x: point.x, y: point.y });
    if (placed && carried.kind === 'npc') {
      setNpcDrafts((previousDrafts) =>
        previousDrafts.filter((draft) => draft.id !== carried.id));
    }
    return placed;
  }, [activeAssetId, commitTokenPlace]);

  // ── DM NPC drafts ──────────────────────────────────────────────────────────

  const createNpcDraft = useCallback((label, footprint) => {
    const draft = {
      id: mintTokenId(),
      kind: 'npc',
      owner_user_id: null,
      character_id: null,
      label: (label || '').trim().slice(0, 64) || 'NPC',
      footprint: footprint || 1,
    };
    setNpcDrafts((previousDrafts) => [...previousDrafts, draft]);
    return draft;
  }, []);

  const removeNpcDraft = useCallback((draftId) => {
    setNpcDrafts((previousDrafts) =>
      previousDrafts.filter((draft) => draft.id !== draftId));
  }, []);

  // ── Handler registration ───────────────────────────────────────────────────

  useEffect(() => {
    if (!registerHandler) return;
    return registerMapTokenHandlers({
      registerHandler,
      thisUserId,
      applyTokenBoard,
      applyRemoteDrag,
      applyGrabDenial,
      addToLog,
    });
  }, [registerHandler, thisUserId, applyTokenBoard, applyRemoteDrag, applyGrabDenial, addToLog]);

  const tokensForActiveMap = useMemo(
    () => (activeAssetId ? mapTokenState[activeAssetId] || [] : []),
    [mapTokenState, activeAssetId]
  );

  return {
    // state
    mapTokenState,
    setMapTokenState, // initial_state hydration
    tokensForActiveMap,
    heldTokens,
    lastDenial,
    clearDenial,
    npcDrafts,
    // layer wiring
    attachTokenLayer,
    // committed ops
    commitTokenPlace,
    commitTokenMove,
    removeToken,
    // presence
    grabToken,
    releaseToken,
    clearHoldsForUser,
    // carry flow
    beginCarry,
    cancelCarry,
    dropCarriedToken,
    // DM drafts
    createNpcDraft,
    removeNpcDraft,
  };
};
