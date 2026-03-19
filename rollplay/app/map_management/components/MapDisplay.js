/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react';
import GridOverlay from './GridOverlay';

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
  offsetX = 0,
  offsetY = 0,
  colTrim = 0,
  rowTrim = 0,
  onImageLoad = null, // fires with { naturalWidth, naturalHeight } when map image loads
}) => {
  const [mapLoaded, setMapLoaded] = useState(false);
  const mapImageRef = useRef(null);
  const containerRef = useRef(null);

  // Unified view state (replaces separate map/grid zoom)
  const [viewTransform, setViewTransform] = useState({
    x: 0,
    y: 0,
    scale: 1.0
  });

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

  // Unified zoom handler
  const handleWheel = useCallback((e) => {
    if (isMapLocked) return;
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const newScale = Math.max(0.1, Math.min(3.0, viewTransform.scale + delta));
    setViewTransform(prev => ({ ...prev, scale: newScale }));
  }, [isMapLocked, viewTransform.scale]);

  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const handlePointerDown = useCallback((e) => {
    if (isMapLocked) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }, [isMapLocked]);

  const handlePointerMove = useCallback((e) => {
    if (!isDragging || isMapLocked) return;
    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;
    setViewTransform(prev => ({ ...prev, x: prev.x + deltaX, y: prev.y + deltaY }));
    setDragStart({ x: e.clientX, y: e.clientY });
  }, [isDragging, isMapLocked, dragStart]);

  const handlePointerUp = useCallback((e) => {
    setIsDragging(false);
    if (e?.currentTarget && e?.pointerId !== undefined) {
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    }
  }, []);

  const handlePointerCancel = useCallback((e) => {
    setIsDragging(false);
    if (e?.currentTarget && e?.pointerId !== undefined) {
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already released */ }
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
    transformOrigin: 'center',
    transition: isDragging ? 'none' : 'transform 0.1s ease-out',
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
        <div style={contentTransform}>
          {showGrid && (
            <GridOverlay
              gridConfig={(isEditMode && gridConfig) ? gridConfig : null}
              isEditMode={isEditMode}
              showLabels={showGridLabels}
              onGridChange={onGridChange}
              activeMap={null}
              mapImageRef={null}
              liveGridOpacity={liveGridOpacity}
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
      <div style={contentTransform}>
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
            offsetX={offsetX}
            offsetY={offsetY}
            colTrim={colTrim}
            rowTrim={rowTrim}
          />
        )}
      </div>

      {/* Future: Position markers will be added here */}
    </div>
  );
};

export default React.memo(MapDisplay);
