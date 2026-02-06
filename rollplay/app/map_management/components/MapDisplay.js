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
  gridConfig = null // Preview grid config for edit mode
}) => {
  const [mapLoaded, setMapLoaded] = useState(false);
  const mapImageRef = useRef(null); // Reference to the map image element
  const containerRef = useRef(null); // Reference to the main container
  
  // Map interaction state - available to all players
  const [isMapLocked, setIsMapLocked] = useState(false); // Default to locked
  
  // Unified view state (replaces separate map/grid zoom)
  const [viewTransform, setViewTransform] = useState({
    x: 0,        // Pan X
    y: 0,        // Pan Y 
    scale: 1.0   // Unified zoom level
  });

  // Handle map loading
  useEffect(() => {
    if (activeMap) {
      setMapLoaded(false);
      // Simulate map loading - will be replaced with actual image loading
      const timer = setTimeout(() => setMapLoaded(true), 100);
      return () => clearTimeout(timer);
    } else {
      setMapLoaded(false);
    }
  }, [activeMap]);

  // Unified zoom handler for the entire view
  const handleWheel = useCallback((e) => {
    if (isMapLocked) return; // Only allow zoom when map is unlocked
    
    e.preventDefault();
    e.stopPropagation();
    
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const newScale = Math.max(0.1, Math.min(3.0, viewTransform.scale + delta));
    
    setViewTransform(prev => ({
      ...prev,
      scale: newScale
    }));
    
    console.log('🎯 Unified zoom:', newScale);
  }, [isMapLocked, viewTransform.scale]);

  // Unified pan handler for dragging the view
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const handlePointerDown = useCallback((e) => {
    if (isMapLocked) return;

    setIsDragging(true);
    setDragStart({
      x: e.clientX,
      y: e.clientY
    });

    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }, [isMapLocked]);

  const handlePointerMove = useCallback((e) => {
    if (!isDragging || isMapLocked) return;

    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;

    setViewTransform(prev => ({
      ...prev,
      x: prev.x + deltaX,
      y: prev.y + deltaY
    }));

    setDragStart({
      x: e.clientX,
      y: e.clientY
    });
  }, [isDragging, isMapLocked, dragStart]);

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Base styles for the map container
  const baseStyles = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    zIndex: 1, // Behind initiative tracker but above base background
    backgroundColor: '#1a1a2e', // Fallback background
    overflow: 'hidden', // Clip zoomed content
    cursor: !isMapLocked ? (isDragging ? 'grabbing' : 'grab') : 'default',
    touchAction: 'none' // Prevent browser default touch gestures (pan/zoom)
  };

  // Unified transform styles for the content
  const contentTransform = {
    transform: `translate3d(${viewTransform.x}px, ${viewTransform.y}px, 0) scale(${viewTransform.scale})`,
    transformOrigin: 'center',
    transition: isDragging ? 'none' : 'transform 0.1s ease-out',
    width: '100%',
    height: '100%',
    position: 'relative'
  };

  // If no active map, show default background with grid
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
      >
        <div style={contentTransform}>
          {/* Grid overlay with default settings (atomic approach) */}
          {showGrid && (
            <GridOverlay
              gridConfig={(isEditMode && gridConfig) ? gridConfig : (activeMap?.grid_config || null)}
              isEditMode={isEditMode}
              showLabels={showGridLabels}
              onGridChange={onGridChange}
              activeMap={activeMap}
              mapImageConfig={activeMap?.map_image_config || null}
              mapImageRef={null}
              liveGridOpacity={liveGridOpacity}
            />
          )}
        </div>
      </div>
    );
  }

  // Render active map with unified transform
  return (
    <div 
      ref={containerRef}
      className={`map-display-active ${className}`}
      style={{
        ...baseStyles,
        opacity: mapLoaded ? 1 : 0.5
      }}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Loading overlay (not transformed) */}
      {!mapLoaded && (
        <div 
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: '#9ca3af',
            fontSize: '14px',
            fontWeight: '500',
            zIndex: 20
          }}
        >
          🗺️ Loading map...
        </div>
      )}

      {/* Map info overlay (not transformed) */}
      {(isEditMode || mapImageEditMode) && mapLoaded && (
        <div 
          style={{
            position: 'absolute',
            top: '20px',
            left: '20px',
            background: 'rgba(0, 0, 0, 0.8)',
            color: '#e0e0e0',
            padding: '8px 12px',
            borderRadius: '6px',
            fontSize: '12px',
            fontFamily: 'monospace',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            zIndex: 20
          }}
        >
          📍 {activeMap.filename} • Scale: {viewTransform.scale.toFixed(1)}x
        </div>
      )}

      {/* Lock Map Toggle - Available to all players */}
      {activeMap && mapLoaded && (
        <button
          onClick={() => setIsMapLocked(!isMapLocked)}
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            background: isMapLocked ? 'rgba(139, 69, 19, 0.9)' : 'rgba(34, 139, 34, 0.9)', // Brown when locked, green when unlocked
            color: '#ffffff',
            border: '2px solid rgba(255, 255, 255, 0.3)',
            borderRadius: '8px',
            padding: '10px 16px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            zIndex: 25,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
            fontFamily: 'system-ui'
          }}
        >
          <span style={{ fontSize: '16px' }}>
            {isMapLocked ? '🔒' : '🔓'}
          </span>
          <span>
            {isMapLocked ? 'Unlock Map' : 'Lock Map'}
          </span>
        </button>
      )}

      {/* Transformed content container */}
      <div style={contentTransform}>
        {/* Map image with true aspect ratio */}
        <img
          ref={mapImageRef}
          src={activeMap?.file_path}
          alt={activeMap?.filename || 'Map'}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            maxWidth: '100%',
            maxHeight: '100%',
            width: 'auto',
            height: 'auto',
            objectFit: 'contain', // Preserves aspect ratio, shows full image
            pointerEvents: 'none'
          }}
          onLoad={() => {
            // Force grid recalculation when image loads
            const img = mapImageRef.current;
            console.log('🗺️ Image loaded:', {
              natural: `${img.naturalWidth}×${img.naturalHeight}`,
              rendered: `${img.clientWidth}×${img.clientHeight}`,
              aspectRatio: (img.naturalWidth / img.naturalHeight).toFixed(2)
            });
          }}
        />

        {/* Grid overlay for active map - atomic approach - now properly coupled inside transform container */}
        {showGrid && (
          <GridOverlay
            gridConfig={(isEditMode && gridConfig) ? gridConfig : (activeMap?.grid_config || null)}
            isEditMode={isEditMode}
            showLabels={showGridLabels}
            onGridChange={onGridChange}
            activeMap={activeMap}
            mapImageRef={mapImageRef}
            liveGridOpacity={liveGridOpacity}
          />
        )}
      </div>

      {/* Future: Position markers will be added here */}
    </div>
  );
};

export default React.memo(MapDisplay);