/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

import FogHideLayer from './FogHideLayer';
import FogSharedTextureLayer from './FogSharedTextureLayer';

// Painter-mode knock-back. While paintMode is on the visible fog drops
// by this factor so the DM can see the map underneath their strokes.
// Applied to the wrapper so it dims hide + texture together.
const FOG_PAINTER_KNOCKBACK = 0.7;

/**
 * FogRegionStack — composites N fog regions into one shared canvas.
 *
 * Owns:
 *  - The pointer-event wrapper (sized to the map image). Routes paint
 *    events to the active region's engine.
 *  - The brush cursor lifecycle (positions/sizes a cursor div mounted
 *    by MapDisplay outside the pan/zoom transform).
 *
 * Renders:
 *  - One FogHideLayer per enabled region (per-region opacity, mask
 *    sourced from that region's engine).
 *  - One FogSharedTextureLayer (singleton — owns the GIF tiles and
 *    SVG filter; its mask is a union of all enabled regions' alphas
 *    weighted by per-region opacity).
 *
 * Per-region settings (opacity, hide_feather_px, texture_dilate_px)
 * are all preserved: hide layers apply opacity and feather directly;
 * the texture layer encodes opacity and dilate into the union mask
 * compositor.
 */
export default function FogRegionStack({
  regions = [],
  getEngine,
  activeRegionId = null,
  paintMode = false,
  mapImageRef,
  fogOpacity = 1.0,
  cursorRef = null,
  // Optional ref the parent reads to gate keyboard shortcuts (e.g. the
  // spacebar pan override skips entirely while a stroke is in flight).
  paintingRef = null,
}) {
  const wrapperRef = useRef(null);
  const isPaintingRef = useRef(false);
  const lastPointRef = useRef(null);
  const [imgDims, setImgDims] = useState({ w: 0, h: 0 });

  const activeEngine = activeRegionId ? getEngine?.(activeRegionId) : null;

  // Track image rendered size — wrapper must match the visible map so
  // pointer-event capture and cursor positioning use the right rect.
  useEffect(() => {
    const img = mapImageRef?.current;
    if (!img) return;
    const update = () => setImgDims({ w: img.clientWidth, h: img.clientHeight });
    update();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(update);
      ro.observe(img);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [mapImageRef]);

  const screenToMask = useCallback((clientX, clientY) => {
    const wrapper = wrapperRef.current;
    if (!wrapper || !activeEngine) return null;
    const rect = wrapper.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const xRatio = (clientX - rect.left) / rect.width;
    const yRatio = (clientY - rect.top) / rect.height;
    return {
      x: Math.max(0, Math.min(activeEngine.width, xRatio * activeEngine.width)),
      y: Math.max(0, Math.min(activeEngine.height, yRatio * activeEngine.height)),
    };
  }, [activeEngine]);

  // The cursor div lives as a sibling of this wrapper, inside contentRef,
  // so it inherits the same pan/zoom transform. Position is computed in
  // contentRef-local CSS pixels (cursor's offsetParent), with the parent
  // transform's scale factor derived from wrapper's bounding-rect-vs-
  // offsetWidth ratio. Size uses the wrapper's natural width too, so
  // both dimensions are pre-transform CSS pixels — the parent scale
  // applies uniformly at render time.
  //
  // Cursor and paint share wrapperRef + the same parent transform, so
  // they cannot drift relative to each other regardless of how contentRef
  // is panned/scaled.
  const updateBrushCursor = useCallback((clientX, clientY) => {
    const cursor = cursorRef?.current;
    const wrapper = wrapperRef.current;
    if (!cursor || !wrapper || !activeEngine) return;
    // parentNode (not offsetParent) — offsetParent returns null when
    // the cursor is `display: none`, which is its initial state. The
    // cursor's parentNode is contentRef (cursor is a sibling of the
    // fog wrapper, both children of contentRef).
    const op = cursor.parentNode;
    if (!op) return;
    const oprect = op.getBoundingClientRect();
    const wrapperRect = wrapper.getBoundingClientRect();
    const naturalW = wrapper.offsetWidth;
    if (wrapperRect.width === 0 || naturalW === 0 || activeEngine.width === 0) return;
    // Parent transform scale factor. wrapper's CSS width = naturalW;
    // its on-screen width = wrapperRect.width = naturalW × scale.
    const scale = wrapperRect.width / naturalW;
    const dia = activeEngine.brushSize * (naturalW / activeEngine.width);
    cursor.style.width = `${dia}px`;
    cursor.style.height = `${dia}px`;
    cursor.style.left = `${(clientX - oprect.left) / scale}px`;
    cursor.style.top = `${(clientY - oprect.top) / scale}px`;
    cursor.style.display = 'block';
  }, [activeEngine, cursorRef]);

  const hideBrushCursor = useCallback(() => {
    if (cursorRef?.current) cursorRef.current.style.display = 'none';
  }, [cursorRef]);

  // Mirror brush size changes from controls onto the cursor div, so
  // the user gets immediate visual feedback when dragging the size
  // slider (even before they next move the pointer).
  useEffect(() => {
    if (!activeEngine || !cursorRef) return;
    const onBrushChange = () => {
      const cursor = cursorRef.current;
      const wrapper = wrapperRef.current;
      if (!cursor || !wrapper || activeEngine.width === 0) return;
      const naturalW = wrapper.offsetWidth;
      if (naturalW === 0) return;
      const dia = activeEngine.brushSize * (naturalW / activeEngine.width);
      cursor.style.width = `${dia}px`;
      cursor.style.height = `${dia}px`;
    };
    activeEngine.on('brushchange', onBrushChange);
    return () => activeEngine.off('brushchange', onBrushChange);
  }, [activeEngine, cursorRef]);

  const handlePointerDown = useCallback((e) => {
    if (!paintMode || !activeEngine) return;
    e.preventDefault();
    e.stopPropagation();
    // Painting "claims" focus — blur any previously-focused control
    // (e.g. a region opacity slider) so subsequent keyboard shortcuts
    // (spacebar pan override, etc.) aren't gated by the input-focus guard.
    const active = document.activeElement;
    if (active && typeof active.blur === 'function'
        && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
      active.blur();
    }
    const point = screenToMask(e.clientX, e.clientY);
    if (!point) return;
    try { wrapperRef.current.setPointerCapture(e.pointerId); } catch {}
    activeEngine.beginStroke(activeEngine.mode);
    isPaintingRef.current = true;
    if (paintingRef) paintingRef.current = true;
    lastPointRef.current = point;
    activeEngine.paintStroke([point]);
  }, [paintMode, activeEngine, screenToMask, paintingRef]);

  const handlePointerMove = useCallback((e) => {
    if (!paintMode || !activeEngine) return;
    updateBrushCursor(e.clientX, e.clientY);
    if (!isPaintingRef.current) return;
    const point = screenToMask(e.clientX, e.clientY);
    if (!point) return;
    const last = lastPointRef.current;
    if (last && Math.hypot(point.x - last.x, point.y - last.y) < 0.5) return;
    activeEngine.paintStroke([last, point]);
    lastPointRef.current = point;
  }, [paintMode, activeEngine, screenToMask, updateBrushCursor]);

  const handlePointerUp = useCallback((e) => {
    if (!isPaintingRef.current) return;
    isPaintingRef.current = false;
    if (paintingRef) paintingRef.current = false;
    lastPointRef.current = null;
    try { wrapperRef.current.releasePointerCapture(e.pointerId); } catch {}
    if (activeEngine) activeEngine.endStroke();
  }, [activeEngine, paintingRef]);

  const handlePointerEnter = useCallback((e) => {
    if (!paintMode) return;
    updateBrushCursor(e.clientX, e.clientY);
  }, [paintMode, updateBrushCursor]);

  const handlePointerLeave = useCallback(() => {
    hideBrushCursor();
  }, [hideBrushCursor]);

  if (!regions.length || !getEngine) return null;

  // Single source of truth for "everything needed to render fog is in
  // place". Children are mounted only when ready holds, so each layer's
  // lifecycle is straightforward: mount with valid preconditions, prime
  // its mask once via useLayoutEffect, run normally. No transitional
  // mounted-but-not-really-ready states with refs that haven't attached.
  const ready = imgDims.w > 0 && imgDims.h > 0;
  const hasEnabledEngine = ready && regions.some((r) => r.enabled && !!getEngine(r.id));

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
        pointerEvents: paintMode && ready ? 'auto' : 'none',
        cursor: paintMode ? 'none' : 'default',
        touchAction: 'none',
        // Wrapper opacity = global fogOpacity × painter knock-back. Per-
        // region opacity is applied per-layer (hide layer directly, texture
        // layer via union mask weighting), so it's intentionally NOT in
        // this product.
        opacity: fogOpacity * (paintMode ? FOG_PAINTER_KNOCKBACK : 1),
        zIndex: 25,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      {ready && regions.map((region) => {
        if (!region.enabled) return null;
        const engine = getEngine(region.id);
        if (!engine) return null;
        return (
          <FogHideLayer
            key={region.id}
            engine={engine}
            hideFeatherPx={region.hide_feather_px}
            opacity={region.opacity}
          />
        );
      })}
      {hasEnabledEngine && (
        <FogSharedTextureLayer
          regions={regions}
          getEngine={getEngine}
          imgDims={imgDims}
        />
      )}
    </div>
  );
}
