/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react';
import GridOverlay from './GridOverlay';

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
}) => {
  const [mapLoaded, setMapLoaded] = useState(false);
  const mapImageRef = useRef(null);
  const containerRef = useRef(null);

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

  // Handle map loading
  useEffect(() => {
    if (activeMap) {
      setMapLoaded(false);
      const timer = setTimeout(() => setMapLoaded(true), 100);
      return () => clearTimeout(timer);
    } else {
      setMapLoaded(false);
    }
  }, [activeMap]);

  // Zoom-to-point wheel handler — supports mouse scroll and trackpad pinch (ctrlKey)
  const handleWheel = useCallback((e) => {
    if (isMapLocked) return;
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
  }, [isMapLocked, applyTransform]);

  const handlePointerDown = useCallback((e) => {
    if (isMapLocked) return;
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    e.preventDefault();
  }, [isMapLocked]);

  const handlePointerMove = useCallback((e) => {
    if (isMapLocked || activePointers.current.size === 0) return;

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
  }, [isMapLocked, applyTransform]);

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
    cursor: !isMapLocked ? (isDragging ? 'grabbing' : 'grab') : 'default',
    touchAction: 'none'
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
        onWheel={handleWheel}
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
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      {!mapLoaded && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: '#9ca3af', fontSize: '14px', fontWeight: '500', zIndex: 20 }}>
          🗺️ Loading map...
        </div>
      )}

      {(isEditMode || mapImageEditMode) && mapLoaded && (
        <div style={{ position: 'absolute', top: '20px', left: '20px', background: 'rgba(0,0,0,0.8)', color: '#e0e0e0', padding: '8px 12px', borderRadius: '6px', fontSize: '12px', fontFamily: 'monospace', border: '1px solid rgba(255,255,255,0.2)', zIndex: 20 }}>
          📍 {activeMap.filename} • Scale: {viewTransform.scale.toFixed(1)}x
        </div>
      )}

      {/* Transformed content — map image and grid overlay pan/zoom together */}
      <div ref={contentRef} style={contentTransform}>
        <img
          ref={mapImageRef}
          src={activeMap?.file_path}
          alt={activeMap?.filename || 'Map'}
          style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto', objectFit: 'contain', pointerEvents: 'none' }}
          onLoad={() => {
            const img = mapImageRef.current;
            if (onImageLoad) onImageLoad({ naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight });
          }}
        />

        {showGrid && (
          <GridOverlay
            gridConfig={(isEditMode && gridConfig) ? gridConfig : (activeMap?.grid_config || null)}
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
