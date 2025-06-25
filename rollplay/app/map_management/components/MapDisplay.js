/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import React, { useState, useEffect } from 'react';
import GridOverlay from './GridOverlay';

const MapDisplay = ({ 
  activeMap = null,
  isEditMode = false,
  className = "",
  gridConfig = null,
  showGrid = true,
  showGridLabels = true,
  onGridChange = null
}) => {
  const [mapLoaded, setMapLoaded] = useState(false);

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

  // Base styles for the map container
  const baseStyles = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '120vw',
    height: '120vh',
    zIndex: 1, // Behind panels but above base background
    backgroundColor: '#1a1a2e', // Fallback background
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    transition: 'opacity 0.3s ease'
  };

  // If no active map, show default background with grid
  if (!activeMap) {
    return (
      <div 
        className={`map-display-background ${className}`}
        style={{
          ...baseStyles,
        }}
      >
        {/* Grid overlay with default settings */}
        {showGrid && (
          <GridOverlay 
            gridConfig={gridConfig}
            isEditMode={isEditMode}
            showLabels={showGridLabels}
            onGridChange={onGridChange}
          />
        )}
      </div>
    );
  }

  // Render active map
  return (
    <div 
      className={`map-display-active ${className}`}
      style={{
        ...baseStyles,
        backgroundImage: activeMap.file_path ? `url(${activeMap.file_path})` : 'none',
        opacity: mapLoaded ? 1 : 0.5
      }}
    >
      {/* Loading overlay */}
      {!mapLoaded && (
        <div 
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: '#9ca3af',
            fontSize: '14px',
            fontWeight: '500'
          }}
        >
          🗺️ Loading map...
        </div>
      )}

      {/* Map info overlay (only visible in edit mode) */}
      {isEditMode && mapLoaded && (
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
            zIndex: 10
          }}
        >
          📍 {activeMap.filename} • {activeMap.dimensions?.width || '?'} × {activeMap.dimensions?.height || '?'}
        </div>
      )}

      {/* Grid overlay for active map */}
      {showGrid && (
        <GridOverlay 
          gridConfig={gridConfig || activeMap.grid_config}
          isEditMode={isEditMode}
          showLabels={showGridLabels}
        />
      )}

      {/* Future: Position markers will be added here */}
    </div>
  );
};

export default MapDisplay;