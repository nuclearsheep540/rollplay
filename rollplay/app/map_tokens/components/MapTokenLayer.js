/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { useRenderTracker } from '@/app/shared/utils/renderTracker';
import {
  DRAG_FRAME_STALENESS_MS,
  DRAG_LERP_FACTOR,
  DRAG_STREAM_INTERVAL_MS,
  FALLBACK_TOKEN_COLOR,
  LIVE_DRAG_STREAMING,
  NPC_TOKEN_COLOR,
  tokenDiameterPx,
} from '../config';

/**
 * MapTokenLayer — the shared board's pieces (plan §3.4).
 *
 * A contentRef child beside GridOverlay/FogRegionStack: sized to the map
 * image's rendered box, inheriting the pan/zoom transform, positions in
 * rendered px = native px × renderScale. The wrapper is pointer-transparent
 * (panning between tokens still works); each disc captures its own events.
 *
 * Drag is the FogRegionStack model — pointer capture + refs on the hot
 * path, sub-pixel threshold, direct style mutation. Markers-only v1: grab
 * lifts, release commits; no mid-drag streaming. Grabs are optimistic — a
 * server denial (someone else's hand got there first) snaps the drag home.
 *
 * Color and name are derived at render, never stored (field-drift rule):
 * pc discs show the owner's character color (seat-palette fallback), npc
 * discs show DM-rose.
 */

const DRAG_THRESHOLD_PX = 3;

export default function MapTokenLayer({
  mapImageRef,
  tokens = [],
  heldTokens = {},
  lastDenial = null,
  playerMetadata = {},
  playerSeatMap = {},
  displayNameMap = {},
  thisUserId,
  gridConfig = null,
  attachTokenLayer,
  grabToken,
  streamTokenDrag,
  releaseToken,
  commitTokenMove,
  clearDenial,
  remoteDragFramesRef = null,
}) {
  useRenderTracker('MapTokenLayer');
  const wrapperRef = useRef(null);
  const [imgDims, setImgDims] = useState({ w: 0, h: 0 });
  const [naturalDims, setNaturalDims] = useState({ w: 0, h: 0 });
  // Re-render trigger for drag start/end only — pointer moves stay in refs.
  const [draggingTokenId, setDraggingTokenId] = useState(null);
  // { tokenId, token, element, renderScale, startClientX/Y, startLeft/Top,
  //   currentLeft/Top, moved, lastFrameSentAtMs } — single source of truth
  // for the in-flight drag (survives re-renders).
  const dragRef = useRef(null);
  // token_id → element, for the remote lerp loop's direct style writes.
  const tokenElementsRef = useRef({});

  // Track rendered + natural image size (fog wrapper pattern).
  useEffect(() => {
    const imageElement = mapImageRef?.current;
    if (!imageElement) return;
    const update = () => {
      setImgDims({ w: imageElement.clientWidth, h: imageElement.clientHeight });
      setNaturalDims({ w: imageElement.naturalWidth, h: imageElement.naturalHeight });
    };
    update();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(update);
      observer.observe(imageElement);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [mapImageRef]);

  // Register wrapper + natural size with the hook so chip drops can convert
  // screen points without reaching into this component.
  useEffect(() => {
    if (attachTokenLayer) {
      attachTokenLayer(wrapperRef.current, naturalDims.w, naturalDims.h);
    }
    return () => {
      if (attachTokenLayer) attachTokenLayer(null, 0, 0);
    };
  }, [attachTokenLayer, naturalDims.w, naturalDims.h]);

  const renderScale = naturalDims.w > 0 ? imgDims.w / naturalDims.w : 0;

  /**
   * Finish the in-flight drag. Outcomes:
   *  - 'commit'  — pointerup: release the hold, then lane-1 commit (moved)
   *                or just release (grab-and-put-back)
   *  - 'putback' — pointercancel: hold was granted but the gesture died;
   *                release at the committed position, never commit a move
   *  - 'denied'  — server refused the grab; no hold to release
   *
   * Always resets the element's inline style to the pre-drag position:
   * direct mutations bypass React, and on non-commit paths the committed
   * values match React's last-rendered ones, so the reconciler would skip
   * the write and leave the disc stranded where the pointer dropped it.
   * On commit the optimistic state lands in the same tick, so React paints
   * the new position before this reset is visible.
   */
  const endDrag = useCallback((outcome) => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDraggingTokenId(null);
    if (!drag) return;

    if (drag.element) {
      drag.element.style.left = `${drag.startLeft}px`;
      drag.element.style.top = `${drag.startTop}px`;
    }

    if (outcome === 'commit' && drag.moved && renderScale > 0) {
      const nativeX = drag.currentLeft / renderScale;
      const nativeY = drag.currentTop / renderScale;
      // Release first, then the lane-1 commit settles position (plan §3.2).
      releaseToken(drag.tokenId, nativeX, nativeY);
      commitTokenMove(drag.token, nativeX, nativeY);
    } else if (outcome === 'commit' || outcome === 'putback') {
      // Hold was granted but nothing (or nothing valid) to commit.
      releaseToken(drag.tokenId, drag.token.x, drag.token.y);
    }
    // 'denied': the server never granted the hold — nothing to release.
  }, [renderScale, releaseToken, commitTokenMove]);

  // Server denied our grab — first hand was someone else's. Snap home,
  // then consume the denial so it can never cancel a later legitimate drag.
  useEffect(() => {
    if (!lastDenial) return;
    const drag = dragRef.current;
    if (drag && drag.tokenId === lastDenial.tokenId) {
      endDrag('denied');
    }
    if (clearDenial) clearDenial();
  }, [lastDenial, endDrag, clearDenial]);

  const handleTokenPointerDown = useCallback((event, token) => {
    if (event.button !== 0) return;
    if (dragRef.current) return; // one drag at a time — a second pointer must not hijack the ref
    if (heldTokens[token.id]) return; // someone's hand is on it — server would deny anyway
    event.preventDefault();
    event.stopPropagation(); // token drag, not map pan (coexistence contract)

    const wrapper = wrapperRef.current;
    if (!wrapper || renderScale <= 0) return;

    const startLeft = token.x * renderScale;
    const startTop = token.y * renderScale;
    dragRef.current = {
      tokenId: token.id,
      token,
      element: event.currentTarget,
      renderScale,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startLeft,
      startTop,
      currentLeft: startLeft,
      currentTop: startTop,
      moved: false,
      lastFrameSentAtMs: 0,
    };
    setDraggingTokenId(token.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    grabToken(token.id); // optimistic — denial snaps back
  }, [heldTokens, renderScale, grabToken]);

  const handleTokenPointerMove = useCallback((event) => {
    const drag = dragRef.current;
    if (!drag || drag.element !== event.currentTarget) return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    // Screen deltas → wrapper-local CSS px via the parent transform's scale
    // (fog cursor pattern: on-screen width ÷ layout width).
    const wrapperRect = wrapper.getBoundingClientRect();
    const parentScale = wrapper.offsetWidth > 0 ? wrapperRect.width / wrapper.offsetWidth : 1;
    const deltaX = (event.clientX - drag.startClientX) / parentScale;
    const deltaY = (event.clientY - drag.startClientY) / parentScale;

    if (!drag.moved && Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD_PX) return;
    drag.moved = true;
    drag.currentLeft = drag.startLeft + deltaX;
    drag.currentTop = drag.startTop + deltaY;

    drag.element.style.left = `${drag.currentLeft}px`;
    drag.element.style.top = `${drag.currentTop}px`;

    // Live-drag streaming (v1.1): relay a throttled frame so remote hands
    // glide instead of teleporting on commit. Presence only — the lane-1
    // commit at release is still what settles position.
    if (LIVE_DRAG_STREAMING && streamTokenDrag && drag.renderScale > 0) {
      const nowMs = Date.now();
      if (nowMs - (drag.lastFrameSentAtMs || 0) >= DRAG_STREAM_INTERVAL_MS) {
        drag.lastFrameSentAtMs = nowMs;
        streamTokenDrag(
          drag.tokenId,
          drag.currentLeft / drag.renderScale,
          drag.currentTop / drag.renderScale
        );
      }
    }
  }, [streamTokenDrag]);

  const handleTokenPointerUp = useCallback((event) => {
    const drag = dragRef.current;
    if (!drag || drag.element !== event.currentTarget) return;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
    endDrag('commit');
  }, [endDrag]);

  const handleTokenPointerCancel = useCallback((event) => {
    const drag = dragRef.current;
    if (!drag || drag.element !== event.currentTarget) return;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
    // The gesture died (capture lost, OS gesture, tab switch) — never
    // commit a position the user didn't deliberately drop.
    endDrag('putback');
  }, [endDrag]);

  // Removal lives on the token's chip ("return" CTA) — right-click removal
  // was dropped 2026-07-21: the OS context menu wins that gesture.

  // Remote lerp loop (v1.1 live-drag): while any remote hand holds a token,
  // an rAF loop steers its disc toward the latest relayed frame — direct
  // style writes on the hot path, zero React re-renders per frame. With no
  // fresh frame (markers-only sender, or stream gap > staleness) the target
  // is the committed position, so this also degrades gracefully.
  useEffect(() => {
    if (!LIVE_DRAG_STREAMING || !remoteDragFramesRef) return;
    const heldTokenIds = Object.keys(heldTokens);
    if (!heldTokenIds.length || renderScale <= 0) return;

    const committedByTokenId = {};
    tokens.forEach((token) => {
      committedByTokenId[token.id] = { left: token.x * renderScale, top: token.y * renderScale };
    });

    const lerpPositions = {};
    let frameHandle = null;

    const animate = () => {
      const nowMs = Date.now();
      heldTokenIds.forEach((tokenId) => {
        const element = tokenElementsRef.current[tokenId];
        const committed = committedByTokenId[tokenId];
        if (!element || !committed) return;

        const frame = remoteDragFramesRef.current[tokenId];
        const frameFresh = frame && nowMs - frame.atMs <= DRAG_FRAME_STALENESS_MS;
        const target = frameFresh
          ? { left: frame.x * renderScale, top: frame.y * renderScale }
          : committed;

        // Seed from the element's current inline style so effect restarts
        // (board commits elsewhere) don't visibly snap the disc.
        let current = lerpPositions[tokenId];
        if (!current) {
          const styleLeft = parseFloat(element.style.left);
          const styleTop = parseFloat(element.style.top);
          current = Number.isFinite(styleLeft) && Number.isFinite(styleTop)
            ? { left: styleLeft, top: styleTop }
            : { ...committed };
          lerpPositions[tokenId] = current;
        }

        current.left += (target.left - current.left) * DRAG_LERP_FACTOR;
        current.top += (target.top - current.top) * DRAG_LERP_FACTOR;
        element.style.left = `${current.left}px`;
        element.style.top = `${current.top}px`;
      });
      frameHandle = requestAnimationFrame(animate);
    };
    frameHandle = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameHandle);
      // Direct mutations bypass React; on release the committed values may
      // match React's last-rendered ones (diff skips the write), so put the
      // steered discs back by hand.
      heldTokenIds.forEach((tokenId) => {
        const element = tokenElementsRef.current[tokenId];
        const committed = committedByTokenId[tokenId];
        if (element && committed) {
          element.style.left = `${committed.left}px`;
          element.style.top = `${committed.top}px`;
        }
      });
    };
  }, [heldTokens, tokens, renderScale, remoteDragFramesRef]);

  // Wrapper stays mounted even with nothing to draw — chip drops need its
  // rect. Discs render only once the image is laid out.
  const canRenderTokens = renderScale > 0 && imgDims.w > 0;

  // Last-moved renders on top (decision 13: stacking is allowed and always
  // separable). DOM order is stacking order inside the wrapper.
  const orderedTokens = canRenderTokens
    ? [...tokens].sort((tokenA, tokenB) =>
        String(tokenA.updated_at || '').localeCompare(String(tokenB.updated_at || '')))
    : [];

  return (
    <div
      ref={wrapperRef}
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: imgDims.w || 0,
        height: imgDims.h || 0,
        pointerEvents: 'none', // wrapper is transparent; discs opt in
        zIndex: 35, // tokens clear everything — fog 25, grid 28 (plan §3.4)
      }}
    >
      {orderedTokens.map((token) => {
        const isPc = token.kind === 'pc';
        const ownerMetadata = isPc ? playerMetadata[token.owner_user_id] : null;
        const discColor = isPc
          ? (ownerMetadata?.color
              || playerSeatMap[token.owner_user_id]?.seatColor
              || FALLBACK_TOKEN_COLOR)
          : NPC_TOKEN_COLOR;
        const tokenName = isPc
          ? (ownerMetadata?.character_name || token.label || 'Unknown Adventurer')
          : (token.label || 'NPC');

        const hold = heldTokens[token.id];
        const holderName = hold
          ? (displayNameMap[hold.holderUserId] || 'someone') : null;
        const isDragging = draggingTokenId === token.id;
        const drag = isDragging ? dragRef.current : null;
        const diameter = tokenDiameterPx(token.footprint, gridConfig, naturalDims.w, naturalDims.h)
          * renderScale;
        const left = drag ? drag.currentLeft : token.x * renderScale;
        const top = drag ? drag.currentTop : token.y * renderScale;
        const lifted = !!hold || isDragging;

        return (
          <div
            key={token.id}
            ref={(element) => {
              if (element) {
                tokenElementsRef.current[token.id] = element;
              } else {
                delete tokenElementsRef.current[token.id];
              }
            }}
            className="absolute cursor-grab"
            style={{
              left: `${left}px`,
              top: `${top}px`,
              width: `${diameter}px`,
              height: `${diameter}px`,
              transform: `translate(-50%, -50%)${lifted ? ' scale(1.08)' : ''}`,
              zIndex: isDragging ? 3 : (hold ? 2 : 1),
              // A held token refuses local grabs (the server would deny;
              // don't even reach for it).
              pointerEvents: hold ? 'none' : 'auto',
              touchAction: 'none',
            }}
            onPointerDown={(event) => handleTokenPointerDown(event, token)}
            onPointerMove={handleTokenPointerMove}
            onPointerUp={handleTokenPointerUp}
            onPointerCancel={handleTokenPointerCancel}
          >
            {/* Disc — dynamic color stays inline; decoration is Tailwind */}
            <div
              className={`w-full h-full rounded-full border-2 border-black/55 opacity-90 ${
                lifted ? 'shadow-xl shadow-black/50' : 'shadow-md shadow-black/40'
              }`}
              style={{ backgroundColor: discColor }}
            />

            {/* Held-by nameplate — the social-correction signal (plan §3.5) */}
            {hold && (
              <div
                className="absolute bottom-full left-1/2 px-2 py-0.5 rounded bg-black/70 text-white text-xs whitespace-nowrap pointer-events-none"
                style={{ transform: 'translate(-50%, -4px)' }}
              >
                ✋ held by {holderName}
              </div>
            )}

            {/* Name subtitle on a 50%-opacity backing (product decision 3) */}
            <div
              className="absolute top-full left-1/2 px-1.5 rounded bg-black/50 text-white text-xs whitespace-nowrap pointer-events-none"
              style={{ transform: 'translate(-50%, 3px)' }}
            >
              {tokenName}
            </div>
          </div>
        );
      })}
    </div>
  );
}
