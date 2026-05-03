/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react';
import GridOverlay from './GridOverlay';
import { FogRegionStack, FogRegionLabels } from '@/app/fog_management';
import { useAssetDownload } from '@/app/shared/providers/AssetDownloadManager';

const clamp = (val, min, max) => Math.min(max, Math.max(min, val));

const MapDisplay = ({
  activeMap = null,
  isEditMode = false,
  className = "",
  showGrid = true,
  showGridLabels = true,
  onGridChange = null,
  mapImageEditMode = false,
  mapImageConfig = null,
  onMapImageChange = null,
  liveGridOpacity = null,
  gridConfig = null, // Preview grid config for edit mode
  isMapLocked = false,
  gridInspect = false,
  offsetX = 0,
  offsetY = 0,
  onImageLoad = null, // fires with { naturalWidth, naturalHeight } when map image loads
  fogPaintMode = false, // when true, fog layer captures pointer events for DM painting
  // Multi-region fog rendering. The stack renders N hide layers + 1
  // shared texture layer, with per-region opacity / feather / dilate
  // preserved through a union mask compositor.
  fogRegions = null,         // array of FogRegion dicts (id, name, enabled, role, params)
  fogGetEngine = null,       // (regionId) => FogEngine — typically from useFogRegions().getEngine
  fogActiveRegionId = null,  // region currently receiving paint events
  fogShowRegionLabels = false, // overlay region names at the centroid of each painted alpha (DM-only)
}) => {
  const mapImageRef = useRef(null);
  const containerRef = useRef(null);
  // Brush cursor lives as a SIBLING of the fog wrapper inside contentRef.
  // It still inherits the pan/zoom transform (so coords stay aligned with
  // the wrapper paint uses for screenToMask), but its compositing layer
  // is independent from the fog wrapper's — so fog repaints don't invalidate
  // it the way they did when the cursor was nested inside the wrapper.
  // FogRegionStack mutates this div's style on each pointer move via cursorRef.
  const fogCursorRef = useRef(null);
  // Mirrors FogRegionStack's stroke-active state. Read by the spacebar
  // pan-override listener so a press that arrives mid-stroke is ignored
  // entirely (no override, no flicker).
  const fogPaintingRef = useRef(false);
  // Photoshop-style spacebar override: while held, overlays release pointer
  // events and the map's pan handlers take over regardless of active tool.
  const [panOverride, setPanOverride] = useState(false);

  // Effective lock — the spacebar override beats `isMapLocked` so users
  // can pan even while a tool (e.g. fog paint) has locked the map. All
  // pan/wheel handlers and the cursor logic check this derived value.
  const effectiveLocked = isMapLocked && !panOverride;

  // Download map image through asset manager for progressive byte tracking
  const mc = activeMap?.map_config;
  const { blobUrl: mapBlobUrl, ready: mapLoaded } = useAssetDownload(mc?.file_path, mc?.file_size, mc?.asset_id);

  // Unified view state — ref is the source of truth for real-time DOM updates
  // during drag/pinch (bypasses React render cycle). React state syncs on drag end
  // so the non-dragging CSS transition can animate.
  const [viewTransform, setViewTransform] = useState({ x: 0, y: 0, scale: 1.0 });
  const viewRef = useRef({ x: 0, y: 0, scale: 1.0 });
  const contentRef = useRef(null);

  // Pointer tracking refs — no re-render needed for gesture state
  const activePointers = useRef(new Map()); // pointerId → { x, y }
  const lastPinch      = useRef(null);      // { dist, midX, midY }
  const [isDragging, setIsDragging] = useState(false); // cursor style only

  // Apply transform directly to DOM — no React render
  const applyTransform = useCallback(() => {
    if (!contentRef.current) return;
    const { x, y, scale } = viewRef.current;
    contentRef.current.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
  }, []);

  // Zoom-to-point wheel handler — supports mouse scroll and trackpad pinch (ctrlKey)
  const handleWheel = useCallback((e) => {
    if (effectiveLocked) return;
    e.preventDefault();
    const raw    = e.deltaMode === 1 ? e.deltaY * 20 : e.deltaY; // line mode → px
    const delta  = clamp(raw, -200, 200);
    const factor = 1 - delta / 1000; // ≈ 0.8–1.2 per event, smooth
    const rect   = e.currentTarget.getBoundingClientRect();
    const fx     = e.clientX - rect.left;
    const fy     = e.clientY - rect.top;
    const prev   = viewRef.current;
    const newScale = clamp(prev.scale * factor, 0.25, 5.0);
    const ratio    = newScale / prev.scale;
    const next = {
      scale: newScale,
      x: fx - ratio * (fx - prev.x),
      y: fy - ratio * (fy - prev.y),
    };
    viewRef.current = next;
    applyTransform();
    setViewTransform(next); // sync React state for info overlay
  }, [effectiveLocked, applyTransform]);

  // Attach wheel handler as non-passive native listener so preventDefault()
  // actually stops page scroll on Mac trackpads (React onWheel is passive).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // Spacebar = temporary grab/pan override (Photoshop convention). While
  // held, overlays release pointer events and the existing map pan
  // handlers receive them. Mid-stroke presses are ignored entirely so
  // the user can finish a paint stroke without the tool flipping under
  // them. Window blur clears the override to avoid stuck pan-mode after
  // alt-tabbing away.
  useEffect(() => {
    const isInputFocused = () => {
      const el = document.activeElement;
      if (!el) return false;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return true;
      if (el.getAttribute && el.getAttribute('contenteditable') === 'true') return true;
      return false;
    };
    const onKeyDown = (e) => {
      if (e.code !== 'Space') return;
      if (e.repeat) return;
      if (isInputFocused()) return;
      if (fogPaintingRef.current) return;
      e.preventDefault();
      setPanOverride(true);
    };
    const onKeyUp = (e) => {
      if (e.code !== 'Space') return;
      setPanOverride(false);
    };
    const onBlur = () => setPanOverride(false);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  // While override is on, the fog wrapper has pointer-events: none, so
  // pointerLeave never fires and the brush ring would stay stuck on
  // screen at its last position. Hide it explicitly on engage.
  useEffect(() => {
    if (panOverride && fogCursorRef.current) {
      fogCursorRef.current.style.display = 'none';
    }
  }, [panOverride]);

  const handlePointerDown = useCallback((e) => {
    if (effectiveLocked) return;
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    e.preventDefault();
  }, [effectiveLocked]);

  const handlePointerMove = useCallback((e) => {
    if (effectiveLocked || activePointers.current.size === 0) return;

    const prevPos = activePointers.current.get(e.pointerId);
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pointers = [...activePointers.current.values()];

    if (pointers.length === 1) {
      if (!prevPos) return;
      const dx = e.clientX - prevPos.x;
      const dy = e.clientY - prevPos.y;
      const prev = viewRef.current;
      viewRef.current = { ...prev, x: prev.x + dx, y: prev.y + dy };
      applyTransform();

    } else if (pointers.length === 2) {
      const [p1, p2] = pointers;
      const dist  = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const midX  = (p1.x + p2.x) / 2;
      const midY  = (p1.y + p2.y) / 2;

      if (lastPinch.current) {
        const factor = dist / lastPinch.current.dist;
        const panDX  = midX - lastPinch.current.midX;
        const panDY  = midY - lastPinch.current.midY;
        const rect   = containerRef.current.getBoundingClientRect();
        const fx     = midX - rect.left;
        const fy     = midY - rect.top;
        const prev   = viewRef.current;
        const newScale = clamp(prev.scale * factor, 0.25, 5.0);
        const ratio    = newScale / prev.scale;
        viewRef.current = {
          scale: newScale,
          x: fx - ratio * (fx - prev.x) + panDX,
          y: fy - ratio * (fy - prev.y) + panDY,
        };
        applyTransform();
      }
      lastPinch.current = { dist, midX, midY };
    }
  }, [effectiveLocked, applyTransform]);

  const handlePointerUp = useCallback((e) => {
    activePointers.current.delete(e.pointerId);
    if (activePointers.current.size < 2) lastPinch.current = null;
    if (activePointers.current.size === 0) {
      setIsDragging(false);
      setViewTransform(viewRef.current); // sync React state on drag end
    }
  }, []);

  const handlePointerCancel = useCallback((e) => {
    activePointers.current.delete(e.pointerId);
    if (activePointers.current.size < 2) lastPinch.current = null;
    if (activePointers.current.size === 0) {
      setIsDragging(false);
      setViewTransform(viewRef.current); // sync React state on drag end
    }
  }, []);

  const baseStyles = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    zIndex: 1,
    backgroundColor: '#1a1a2e',
    overflow: 'hidden',
    cursor: !effectiveLocked ? (isDragging ? 'grabbing' : 'grab') : 'default',
    touchAction: 'none',
    overscrollBehavior: 'contain'
  };

  const contentTransform = {
    transform: `translate3d(${viewTransform.x}px, ${viewTransform.y}px, 0) scale(${viewTransform.scale})`,
    transformOrigin: '0px 0px',   // required for zoom-to-point maths
    transition: isDragging ? 'none' : 'transform 0.1s ease-out',
    willChange: 'transform',
    width: '100%',
    height: '100%',
    position: 'relative'
  };

  if (!activeMap) {
    return (
      <div
        ref={containerRef}
        className={`map-display-background ${className}`}
        style={baseStyles}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        <div ref={contentRef} style={contentTransform}>
          {showGrid && (
            <GridOverlay
              gridConfig={(isEditMode && gridConfig) ? gridConfig : null}
              isEditMode={isEditMode}
              showLabels={showGridLabels}
              onGridChange={onGridChange}
              activeMap={null}
              mapImageRef={null}
              liveGridOpacity={liveGridOpacity}
              gridInspect={gridInspect}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`map-display-active ${className}`}
      style={{ ...baseStyles, opacity: mapLoaded ? 1 : 0.5 }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      {(isEditMode || mapImageEditMode) && mapLoaded && (
        <div style={{ position: 'absolute', top: '20px', left: '20px', background: 'rgba(0,0,0,0.8)', color: '#e0e0e0', padding: '8px 12px', borderRadius: '6px', fontSize: '12px', fontFamily: 'monospace', border: '1px solid rgba(255,255,255,0.2)', zIndex: 20 }}>
          📍 {activeMap.filename} • Scale: {viewTransform.scale.toFixed(1)}x
        </div>
      )}

      {/* Transformed content — map image, fog overlay, and grid pan/zoom together */}
      <div ref={contentRef} style={contentTransform}>
        <img
          ref={mapImageRef}
          src={mapBlobUrl}
          alt={activeMap?.map_config?.filename || 'Map'}
          style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto', objectFit: 'contain', pointerEvents: 'none' }}
          onLoad={() => {
            const img = mapImageRef.current;
            if (onImageLoad) onImageLoad({ naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight });
          }}
        />

        {/* Fog of war — sits between the map image and the grid.
            Prefer the multi-region stack when callers provide it;
            fall back to the legacy single-engine path otherwise so
            existing call sites that haven't migrated keep working. */}
        {mapLoaded && fogRegions && fogGetEngine && (
          <FogRegionStack
            regions={fogRegions}
            getEngine={fogGetEngine}
            activeRegionId={fogActiveRegionId}
            paintMode={fogPaintMode && !panOverride}
            mapImageRef={mapImageRef}
            cursorRef={fogCursorRef}
            paintingRef={fogPaintingRef}
          />
        )}

        {/* Brush cursor — sibling of the fog wrapper, inside contentRef.
            Inherits pan/zoom so its CSS coords share the wrapper's frame
            (cursor and paint can't drift). Has its own compositing layer
            via mix-blend-mode, independent of the fog wrapper's repaints.
            Hidden by default; FogRegionStack mutates style on pointer events. */}
        <div
          ref={fogCursorRef}
          aria-hidden="true"
          style={{
            position: 'absolute',
            display: 'none',
            pointerEvents: 'none',
            borderRadius: '50%',
            border: '1px solid rgba(255, 255, 255, 0.9)',
            boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.6)',
            mixBlendMode: 'difference',
            transform: 'translate(-50%, -50%)',
            zIndex: 26,
          }}
        />
        {mapLoaded && fogRegions && fogGetEngine && fogShowRegionLabels && (
          <FogRegionLabels
            regions={fogRegions}
            getEngine={fogGetEngine}
            mapImageRef={mapImageRef}
          />
        )}
        {showGrid && (
          <GridOverlay
            gridConfig={(isEditMode && gridConfig) ? gridConfig : (activeMap?.map_config?.grid_config || null)}
            isEditMode={isEditMode}
            showLabels={showGridLabels}
            onGridChange={onGridChange}
            activeMap={activeMap}
            mapImageRef={mapImageRef}
            liveGridOpacity={liveGridOpacity}
            gridInspect={gridInspect}
            offsetX={offsetX}
            offsetY={offsetY}
          />
        )}
      </div>

      {/* Future: Position markers will be added here */}
    </div>
  );
};

export default React.memo(MapDisplay);
