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
  // image_asset_id → { url, token_area } — hydrated from initial_state
  // (server-filtered to this user's visible tokens) and extended by
  // place/reveal fragments (decision 27).
  const [tokenImages, setTokenImages] = useState({});
  // asset_id → { token_id → { holderUserId, heldAtMs } } — remote hands
  // only (own drags live in MapTokenLayer's refs; the server echo is
  // filtered out). Scoped per map: token ids are only unique per board and
  // NPC stamps reuse one id across maps, so a hold on map A must never
  // block or steer the same-id token on map B.
  const [heldTokens, setHeldTokens] = useState({});
  // asset_id → { token_id → { x, y, atMs } } (native px) — live-drag move
  // frames. A ref, never state: frames arrive at ~20 Hz and must not
  // re-render the tree; MapTokenLayer's rAF loop reads this and lerps
  // discs directly.
  const remoteDragFramesRef = useRef({});
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

  const applyRemoteDrag = useCallback(({ tokenId, assetId, phase, holderUserId, x, y }) => {
    if (!assetId) return;
    if (phase === 'grab') {
      // A new hand starts clean. Frames outlive their drag by design (they
      // steer the disc until the committed position catches up), so a leftover
      // from a previous drag — one whose release relay the server suppressed,
      // or that ended while we were disconnected — must not steer this one.
      if (remoteDragFramesRef.current[assetId]) {
        delete remoteDragFramesRef.current[assetId][tokenId];
      }
      setHeldTokens((previousHolds) => ({
        ...previousHolds,
        [assetId]: {
          ...(previousHolds[assetId] || {}),
          [tokenId]: { holderUserId, heldAtMs: Date.now() },
        },
      }));
    } else if (phase === 'move') {
      // Hot path (~20 Hz): straight into the ref — no state, no re-render.
      // The layer's rAF loop picks it up. A frame from a holder we haven't
      // seen grab (join-mid-drag) still steers once the grab lands; until
      // then it's just a ref entry the layer ignores.
      if (typeof x === 'number' && typeof y === 'number') {
        if (!remoteDragFramesRef.current[assetId]) {
          remoteDragFramesRef.current[assetId] = {};
        }
        remoteDragFramesRef.current[assetId][tokenId] = { x, y, atMs: Date.now() };
      }
    } else if (phase === 'release') {
      // The release frame carries where the hand let go, and the mover sends
      // it BEFORE the lane-1 commit (plan §3.2). Adopt it as a provisional
      // position: without it the hold clears here while the board still holds
      // the pre-drag position, so the disc snapped home for the length of a
      // Mongo round-trip and then jumped to its destination. The authoritative
      // fragment lands moments later and applies the grid snap on top — a
      // sub-cell correction rather than a round trip across the map.
      //
      // The frame is deliberately NOT deleted here: it keeps steering the disc
      // through the render that clears the hold, so the handover is seamless.
      // MapTokenLayer disposes of it when the disc settles.
      if (typeof x === 'number' && typeof y === 'number') {
        setMapTokenState((previousState) => {
          const board = previousState[assetId];
          if (!board) return previousState;
          let boardChanged = false;
          const nextBoard = board.map((existingToken) => {
            if (existingToken.id !== tokenId) return existingToken;
            if (existingToken.x === x && existingToken.y === y) return existingToken;
            boardChanged = true;
            return { ...existingToken, x, y };
          });
          return boardChanged ? { ...previousState, [assetId]: nextBoard } : previousState;
        });
      }
      setHeldTokens((previousHolds) => {
        if (!previousHolds[assetId]?.[tokenId]) return previousHolds;
        const nextBoardHolds = { ...previousHolds[assetId] };
        delete nextBoardHolds[tokenId];
        return { ...previousHolds, [assetId]: nextBoardHolds };
      });
    }
  }, []);

  const mergeTokenImages = useCallback((imageRefs) => {
    setTokenImages((previousImages) => ({ ...previousImages, ...imageRefs }));
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
  const hasHeldTokens = Object.values(heldTokens).some(
    (boardHolds) => Object.keys(boardHolds).length > 0);
  useEffect(() => {
    if (!hasHeldTokens) return;
    const sweep = setInterval(() => {
      const nowMs = Date.now();
      setHeldTokens((previousHolds) => {
        const nextHolds = {};
        let changed = false;
        Object.entries(previousHolds).forEach(([assetId, boardHolds]) => {
          const nextBoardHolds = {};
          Object.entries(boardHolds).forEach(([tokenId, hold]) => {
            // A recent move frame counts as hand activity — streaming drags
            // refresh the hold without touching state (frames live in a ref).
            const lastFrameAtMs = remoteDragFramesRef.current[assetId]?.[tokenId]?.atMs || 0;
            const lastActivityMs = Math.max(hold.heldAtMs, lastFrameAtMs);
            if (nowMs - lastActivityMs > HELD_STALENESS_MS) {
              changed = true;
              if (remoteDragFramesRef.current[assetId]) {
                delete remoteDragFramesRef.current[assetId][tokenId];
              }
            } else {
              nextBoardHolds[tokenId] = hold;
            }
          });
          if (Object.keys(nextBoardHolds).length > 0) {
            nextHolds[assetId] = nextBoardHolds;
          } else if (Object.keys(boardHolds).length > 0) {
            changed = true; // board emptied entirely
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
      Object.entries(previousHolds).forEach(([assetId, boardHolds]) => {
        const nextBoardHolds = {};
        Object.entries(boardHolds).forEach(([tokenId, hold]) => {
          if (hold.holderUserId === userId) {
            changed = true;
            if (remoteDragFramesRef.current[assetId]) {
              delete remoteDragFramesRef.current[assetId][tokenId];
            }
          } else {
            nextBoardHolds[tokenId] = hold;
          }
        });
        if (Object.keys(nextBoardHolds).length > 0) {
          nextHolds[assetId] = nextBoardHolds;
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

  /**
   * Commit a configure op (label/footprint/hidden/locked). DM-only for npc
   * tokens server-side; the UI only offers the toggles to the DM. Sends the
   * full token with the changes folded in (the server whitelists what a
   * configure may actually touch).
   */
  const configureToken = useCallback((token, changes) => {
    if (!activeAssetId) return false;
    const configuredToken = { ...token, ...changes, updated_at: new Date().toISOString() };
    if (!sendFunctions.sendMapTokenConfigure(activeAssetId, configuredToken)) return false;
    setMapTokenState((previousState) => {
      const board = previousState[activeAssetId] || [];
      return {
        ...previousState,
        [activeAssetId]: board.map((existingToken) =>
          existingToken.id === configuredToken.id ? configuredToken : existingToken
        ),
      };
    });
    return true;
  }, [activeAssetId, sendFunctions]);

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

  // Live-drag streaming (v1.1): relay one throttled mid-drag frame. The
  // layer owns the throttle; this is fire-and-forget presence.
  const streamTokenDrag = useCallback((tokenId, nativeX, nativeY) => {
    if (!activeAssetId) return false;
    return sendFunctions.sendMapTokenDragFrame(activeAssetId, tokenId, nativeX, nativeY);
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
   *
   * Every refusal names its gate on console.debug — a silently eaten
   * release is undiagnosable from the outside (the 2026-07-23 gridless
   * placement report), and the chip needs the boolean to animate the
   * ghost home instead of vanishing it.
   */
  const dropCarriedToken = useCallback((clientX, clientY) => {
    const refuse = (reason) => {
      console.debug(`🪙 [map-tokens] drop refused: ${reason}`);
      return false;
    };

    const carried = carriedTokenRef.current;
    carriedTokenRef.current = null;
    if (!carried) return refuse('no-carry (pointerup without a beginCarry)');
    if (!activeAssetId) return refuse('no-active-map');

    const { element, naturalWidth, naturalHeight } = layerMetricsRef.current;
    if (!element || !naturalWidth || !naturalHeight) {
      return refuse('no-layer-metrics (map image not laid out yet — still loading?)');
    }
    const point = screenPointToSpace(element, clientX, clientY, naturalWidth, naturalHeight);
    if (!point) return refuse('layer-rect-unresolvable');
    if (!point.insideElement) return refuse('outside-image');

    // Drafts are NOT consumed at placement — the chip persists as the
    // token's home (per-map stamp, like a pc chip) and carries the
    // "return token" CTA that takes it back off the board.
    const placed = commitTokenPlace({ ...carried, x: point.x, y: point.y });
    if (!placed) return refuse('send-failed (WebSocket not connected?)');
    return true;
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
      // DM tokens start hidden (decision 17): the ambush is the default,
      // revealing is the deliberate act. Toggleable on the draft row before
      // placement; lock is placed-tokens-only (decision 18 invariant).
      hidden: true,
      image_asset_id: null,
      owner_user_id: null,
    };
    setNpcDrafts((previousDrafts) => [...previousDrafts, draft]);
    return draft;
  }, []);

  /**
   * Assign a draft to a player before placement — the companion arrives
   * on the board already theirs (the owner rides the place op).
   */
  const assignNpcDraft = useCallback((draftId, ownerUserId) => {
    setNpcDrafts((previousDrafts) =>
      previousDrafts.map((draft) =>
        draft.id === draftId ? { ...draft, owner_user_id: ownerUserId || null } : draft
      ));
  }, []);

  /**
   * Stamp a copy of an npc token (board token or draft) into the draft
   * list — never onto the board: placement stays a deliberate drag
   * (decision 14). Copies label/size/hidden/avatar; lock is placed-only
   * (decision 18), so the copy starts unlocked.
   */
  const duplicateNpcToken = useCallback((sourceToken) => {
    const duplicatedDraft = {
      id: mintTokenId(),
      kind: 'npc',
      owner_user_id: null,
      character_id: null,
      label: sourceToken.label || 'NPC',
      footprint: sourceToken.footprint || 1,
      hidden: sourceToken.hidden === true,
      image_asset_id: sourceToken.image_asset_id || null,
      // An assigned companion duplicates to the same player's hand.
      owner_user_id: sourceToken.owner_user_id || null,
    };
    setNpcDrafts((previousDrafts) => [...previousDrafts, duplicatedDraft]);
    return duplicatedDraft;
  }, []);

  const toggleNpcDraftHidden = useCallback((draftId) => {
    setNpcDrafts((previousDrafts) =>
      previousDrafts.map((draft) =>
        draft.id === draftId ? { ...draft, hidden: !draft.hidden } : draft
      ));
  }, []);

  const removeNpcDraft = useCallback((draftId) => {
    setNpcDrafts((previousDrafts) =>
      previousDrafts.filter((draft) => draft.id !== draftId));
  }, []);

  /**
   * Recall an npc token from the board back into the DM's draft list.
   * Works for ANY board token — including ones this browser never drafted
   * (placed pre-refresh, or by an earlier session) — by rebuilding the
   * draft from the token itself. The draft is the recalled token's home;
   * discard it with ✕ if it isn't wanted again.
   */
  const recallNpcToken = useCallback((token) => {
    if (!removeToken(token.id)) return false;
    setNpcDrafts((previousDrafts) => {
      if (previousDrafts.some((draft) => draft.id === token.id)) return previousDrafts;
      const rebuiltDraft = {
        id: token.id,
        kind: 'npc',
        owner_user_id: null,
        character_id: null,
        label: token.label || 'NPC',
        footprint: token.footprint || 1,
        hidden: token.hidden === true, // a recalled ambusher stays an ambusher
        image_asset_id: token.image_asset_id || null, // the face survives the recall
        owner_user_id: token.owner_user_id || null, // a companion stays its player's
      };
      return [...previousDrafts, rebuiltDraft];
    });
    return true;
  }, [removeToken]);

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
      mergeTokenImages,
    });
  }, [registerHandler, thisUserId, applyTokenBoard, applyRemoteDrag, applyGrabDenial, addToLog, mergeTokenImages]);

  const tokensForActiveMap = useMemo(
    () => (activeAssetId ? mapTokenState[activeAssetId] || [] : []),
    [mapTokenState, activeAssetId]
  );

  // The layer only ever renders the active board, so it only sees the
  // active board's holds — presence from other maps can't leak in.
  const heldTokensForActiveMap = useMemo(
    () => (activeAssetId ? heldTokens[activeAssetId] || {} : {}),
    [heldTokens, activeAssetId]
  );

  return {
    // state
    mapTokenState,
    setMapTokenState, // initial_state hydration
    tokenImages,
    setTokenImages, // initial_state hydration
    tokensForActiveMap,
    heldTokensForActiveMap,
    lastDenial,
    clearDenial,
    npcDrafts,
    // layer wiring
    attachTokenLayer,
    remoteDragFramesRef,
    // committed ops
    commitTokenPlace,
    commitTokenMove,
    configureToken,
    removeToken,
    // presence
    grabToken,
    streamTokenDrag,
    releaseToken,
    clearHoldsForUser,
    // carry flow
    beginCarry,
    cancelCarry,
    dropCarriedToken,
    // DM drafts
    createNpcDraft,
    duplicateNpcToken,
    toggleNpcDraftHidden,
    assignNpcDraft,
    removeNpcDraft,
    recallNpcToken,
  };
};
