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
  gridConfig = null,
  showGrid = true,
  showGridLabels = true,
  onGridChange = null,
  mapImageEditMode = false,
  mapImageConfig = null,
  onMapImageChange = null
}) => {
  const [mapLoaded, setMapLoaded] = useState(false);
  const mapImageRef = useRef(null); // Reference to the map image element
  const containerRef = useRef(null); // Reference to the main container
  
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
    if (!mapImageEditMode && !isEditMode) return; // Only allow zoom in edit modes
    
    e.preventDefault();
    e.stopPropagation();
    
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const newScale = Math.max(0.1, Math.min(3.0, viewTransform.scale + delta));
    
    setViewTransform(prev => ({
      ...prev,
      scale: newScale
    }));
    
    console.log('🎯 Unified zoom:', newScale);
  }, [mapImageEditMode, isEditMode, viewTransform.scale]);

  // Unified pan handler for dragging the view
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const handleMouseDown = useCallback((e) => {
    if (!mapImageEditMode) return; // Only allow pan in map edit mode
    
    setIsDragging(true);
    setDragStart({
      x: e.clientX,
      y: e.clientY
    });
    
    e.preventDefault();
  }, [mapImageEditMode]);

  const handleMouseMove = useCallback((e) => {
    if (!isDragging || !mapImageEditMode) return;
    
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
  }, [isDragging, mapImageEditMode, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Global event listeners for dragging
  useEffect(() => {
    if (!isDragging) return;

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

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
    cursor: mapImageEditMode ? (isDragging ? 'grabbing' : 'grab') : 'default'
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
        onMouseDown={handleMouseDown}
      >
        <div style={contentTransform}>
          {/* Grid overlay with default settings */}
          {showGrid && (
            <GridOverlay 
              gridConfig={gridConfig}
              isEditMode={isEditMode}
              showLabels={showGridLabels}
              onGridChange={onGridChange}
              activeMap={null}
              mapImageConfig={null}
              mapImageRef={null}
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
      onMouseDown={handleMouseDown}
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

      {/* Transformed content container */}
      <div style={contentTransform}>
        {/* Simplified map image (no individual transforms) */}
        <div
          ref={mapImageRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundImage: activeMap?.file_path ? `url(${activeMap.file_path})` : 'none',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat'
          }}
        />

        {/* Grid overlay for active map */}
        {showGrid && (
          <GridOverlay 
            gridConfig={(() => {
              const finalConfig = gridConfig || activeMap.grid_config;
              console.log('🎯 MapDisplay GridOverlay - gridConfig prop:', gridConfig, 'activeMap.grid_config:', activeMap.grid_config, 'final:', finalConfig);
              return finalConfig;
            })()}
            isEditMode={isEditMode}
            showLabels={showGridLabels}
            onGridChange={onGridChange}
            activeMap={activeMap}
            mapImageRef={mapImageRef}
          />
        )}
      </div>

      {/* Future: Position markers will be added here */}
    </div>
  );
};

export default MapDisplay;