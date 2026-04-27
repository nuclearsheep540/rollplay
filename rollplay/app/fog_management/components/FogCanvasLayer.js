/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * FogCanvasLayer — mounts the FogEngine canvas into the DOM, sized
 * to overlay the map image.
 *
 * Used in two contexts:
 *  - Game runtime: positioned inside MapDisplay's transformed content
 *    wrapper, between the <img> and <GridOverlay>. Inherits pan/zoom
 *    from the parent transform.
 *  - Workshop: same component, mounted in the FogMaskTool preview.
 *
 * When `paintMode` is true, pointer events are captured and translated
 * into mask-space coords (0..mask.width) for the engine. When false,
 * the layer is pointer-transparent so map pan/zoom works normally.
 */
export default function FogCanvasLayer({
  engine,
  mapImageRef,
  paintMode = false,
  fogOpacity = 1.0,
}) {
  const wrapperRef = useRef(null);
  const isPaintingRef = useRef(false);
  const lastPointRef = useRef(null);
  const [imgDims, setImgDims] = useState({ w: 0, h: 0 });

  // Track image rendered size — fog overlay must match the visible map
  useEffect(() => {
    const img = mapImageRef?.current;
    if (!img) return;
    const update = () => setImgDims({ w: img.clientWidth, h: img.clientHeight });
    update();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(update);
      ro.observe(img);
      return () => ro.disconnect();
    } else {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
  }, [mapImageRef]);

  // Mount the engine's canvas element into our wrapper. The canvas
  // never gets re-mounted across React re-renders — that's the
  // no-flicker guarantee.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!engine || !wrapper) return;
    const canvas = engine.canvas;
    if (!canvas) return;

    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.style.imageRendering = 'auto';
    // Initial opacity applied by the live-opacity effect below — kept in
    // its own effect so opacity changes don't re-run the mount/unmount.
    wrapper.appendChild(canvas);

    return () => {
      if (canvas.parentNode === wrapper) {
        wrapper.removeChild(canvas);
      }
    };
  }, [engine]);

  // Live opacity adjustments don't need a remount
  useEffect(() => {
    if (engine?.canvas) engine.canvas.style.opacity = String(fogOpacity);
  }, [engine, fogOpacity]);

  const screenToMask = useCallback((clientX, clientY) => {
    const wrapper = wrapperRef.current;
    if (!wrapper || !engine) return null;
    const rect = wrapper.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const xRatio = (clientX - rect.left) / rect.width;
    const yRatio = (clientY - rect.top) / rect.height;
    return {
      x: Math.max(0, Math.min(engine.width, xRatio * engine.width)),
      y: Math.max(0, Math.min(engine.height, yRatio * engine.height)),
    };
  }, [engine]);

  const handlePointerDown = useCallback((e) => {
    if (!paintMode || !engine) return;
    e.preventDefault();
    e.stopPropagation();
    const point = screenToMask(e.clientX, e.clientY);
    if (!point) return;
    try { wrapperRef.current.setPointerCapture(e.pointerId); } catch {}
    // Open a stroke on the engine BEFORE the first dab — the engine
    // captures a "before" snapshot here that pairs with the snapshot
    // taken on endStroke. The undo system listens for `strokeend`.
    engine.beginStroke(engine.mode); // 'paint' or 'erase' as the kind hint
    isPaintingRef.current = true;
    lastPointRef.current = point;
    engine.paintStroke([point]);
  }, [paintMode, engine, screenToMask]);

  const handlePointerMove = useCallback((e) => {
    if (!paintMode || !engine || !isPaintingRef.current) return;
    const point = screenToMask(e.clientX, e.clientY);
    if (!point) return;
    const last = lastPointRef.current;
    if (last && Math.hypot(point.x - last.x, point.y - last.y) < 0.5) return;
    engine.paintStroke([last, point]);
    lastPointRef.current = point;
  }, [paintMode, engine, screenToMask]);

  const handlePointerUp = useCallback((e) => {
    if (!isPaintingRef.current) return;
    isPaintingRef.current = false;
    lastPointRef.current = null;
    try { wrapperRef.current.releasePointerCapture(e.pointerId); } catch {}
    if (engine) engine.endStroke(); // emits 'strokeend' for the undo subscriber
  }, [engine]);

  // Render the wrapper unconditionally — even at 0×0 — so the ref is
  // attached on first render and the mount-canvas effect can append the
  // engine canvas immediately. Conditionally returning null here would
  // strand the canvas off-DOM forever, because the [engine] mount effect
  // doesn't re-run when imgDims later become non-zero.
  const ready = imgDims.w > 0 && imgDims.h > 0;

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
        cursor: paintMode ? 'crosshair' : 'default',
        // touch-action:none is what flips React's onPointerDown listener
        // from passive to active so e.preventDefault() actually works
        // and the browser doesn't try to scroll/pan during a paint stroke.
        touchAction: 'none',
        // Sit above GridOverlay (z=5 / z=20 in edit mode). The grid
        // SVG has pointerEvents:'all' for hover-cell info and would
        // otherwise eat clicks meant for fog painting. The wrapper's
        // own pointerEvents flips to 'none' when paintMode is off, so
        // grid hover still works in non-paint contexts. The fog canvas
        // is mostly transparent so the grid remains visible underneath.
        zIndex: 25,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    />
  );
}
