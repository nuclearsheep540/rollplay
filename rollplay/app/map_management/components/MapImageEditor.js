/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import React, { useState, useRef, useCallback, useEffect } from 'react';

const MapImageEditor = ({ 
  activeMap = null,
  isEditMode = false,
  mapImageConfig = null,
  onMapImageChange = null,
  imageRef = null // NEW: External ref to pass to the image element
}) => {
  // Local state for editing
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [currentTransform, setCurrentTransform] = useState({ x: 0, y: 0, scale: 1.0 });
  const containerRef = useRef(null);
  const internalImageRef = useRef(null); // Internal ref for transforms
  const rafRef = useRef(null);
  
  // Use external ref if provided, otherwise use internal ref
  const actualImageRef = imageRef || internalImageRef;

  // Default map image configuration
  const defaultConfig = {
    offset_x: 0,       // Image position offset
    offset_y: 0,       // Image position offset
    view_zoom: 1.0,    // Viewport zoom level (0.1 to 3.0) - like camera zoom
    rotation: 0        // Image rotation (future feature)
  };

  // Use provided config or default
  const config = mapImageConfig || defaultConfig;
  
  // Initialize transform from config
  useEffect(() => {
    setCurrentTransform({
      x: config.offset_x || 0,
      y: config.offset_y || 0,
      scale: config.view_zoom || 1.0
    });
  }, [config.offset_x, config.offset_y, config.view_zoom]);

  // Apply transform to DOM element using RAF for 60fps updates
  const applyTransform = useCallback((transform) => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
    
    rafRef.current = requestAnimationFrame(() => {
      if (actualImageRef.current) {
        const transformString = `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`;
        actualImageRef.current.style.transform = transformString;
        console.log('🗺️ Applied transform:', transformString);
      }
    });
  }, []);

  // Update DOM transform whenever currentTransform changes
  useEffect(() => {
    applyTransform(currentTransform);
  }, [currentTransform, applyTransform]);

  // Mouse event handlers for map image dragging
  const handleMouseDown = useCallback((e) => {
    if (!isEditMode || !activeMap) return;
    
    console.log('🗺️ Map image drag started');
    setIsDragging(true);
    setDragStart({
      x: e.clientX,
      y: e.clientY
    });
    setTempOffset({ x: 0, y: 0 });
    
    e.preventDefault();
    e.stopPropagation();
  }, [isEditMode, activeMap]);

  const handleMouseMove = useCallback((e) => {
    if (!isDragging || !isEditMode) return;
    
    const currentX = e.clientX;
    const currentY = e.clientY;
    
    // Calculate mouse movement since drag start
    const deltaX = currentX - dragStart.x;
    const deltaY = currentY - dragStart.y;
    
    // Apply movement directly to transform (1:1 mouse movement)
    const newTransform = {
      x: config.offset_x + deltaX,
      y: config.offset_y + deltaY,
      scale: currentTransform.scale
    };
    
    // Update transform immediately for 60fps feedback
    setCurrentTransform(newTransform);
  }, [isDragging, isEditMode, dragStart, config.offset_x, config.offset_y, currentTransform.scale]);

  const handleMouseUp = useCallback(() => {
    if (!isDragging || !isEditMode) return;
    
    console.log('🗺️ Map image drag ended, final transform:', currentTransform);
    
    // Save the final transform to config
    if (onMapImageChange) {
      const finalConfig = {
        ...config,
        offset_x: currentTransform.x,
        offset_y: currentTransform.y,
        view_zoom: currentTransform.scale
      };
      onMapImageChange(finalConfig);
    }
    
    setIsDragging(false);
  }, [isDragging, isEditMode, currentTransform, config, onMapImageChange]);

  // Mouse wheel handler for map image scaling
  const handleWheel = useCallback((e) => {
    if (!isEditMode || !activeMap) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    // Scroll up = zoom in = larger scale
    // Scroll down = zoom out = smaller scale
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const newScale = Math.max(0.1, Math.min(3.0, currentTransform.scale + delta));
    
    const newTransform = {
      ...currentTransform,
      scale: newScale
    };
    
    // Update transform immediately
    setCurrentTransform(newTransform);
    
    // Save to config
    if (onMapImageChange) {
      const newConfig = {
        ...config,
        offset_x: newTransform.x,
        offset_y: newTransform.y,
        view_zoom: newScale
      };
      onMapImageChange(newConfig);
    }
  }, [isEditMode, activeMap, currentTransform, config, onMapImageChange]);

  // Add global event listeners for dragging and wheel when in edit mode
  useEffect(() => {
    if (!isEditMode || !isDragging) return;

    console.log('🗺️ Setting up global drag listeners for map image');

    const handleGlobalMouseMove = (e) => handleMouseMove(e);
    const handleGlobalMouseUp = (e) => handleMouseUp(e);

    document.addEventListener('mousemove', handleGlobalMouseMove);
    document.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
      console.log('🗺️ Cleaning up global drag listeners for map image');
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isEditMode, isDragging, handleMouseMove, handleMouseUp]);

  // Add global wheel listener for edit mode
  useEffect(() => {
    if (!isEditMode || !activeMap) return;

    console.log('🗺️ Setting up global wheel listener for map image');

    const handleGlobalWheel = (e) => handleWheel(e);
    document.addEventListener('wheel', handleGlobalWheel, { passive: false });

    return () => {
      console.log('🗺️ Cleaning up global wheel listener for map image');
      document.removeEventListener('wheel', handleGlobalWheel);
    };
  }, [isEditMode, activeMap, handleWheel]);

  if (!activeMap) return null;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: isEditMode ? 'auto' : 'none',
        zIndex: isEditMode ? 15 : 1, // Above map but below grid in edit mode
        cursor: isEditMode ? (isDragging ? 'grabbing' : 'grab') : 'default',
        backgroundColor: isEditMode ? 'rgba(0, 255, 0, 0.1)' : 'transparent', // Debug: green tint in edit mode
        overflow: 'hidden'
      }}
      onMouseDown={handleMouseDown}
      onMouseLeave={handleMouseUp}
    >
      {/* The actual image element that gets transformed */}
      <div
        ref={actualImageRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundImage: activeMap?.file_path ? `url(${activeMap.file_path})` : 'none',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          transformOrigin: 'center',
          // Initial transform will be applied via applyTransform
          transform: 'translate3d(0px, 0px, 0) scale(1)',
          pointerEvents: 'none' // Let container handle events
        }}
      />
      {/* Edit mode indicator */}
      {isEditMode && (
        <div 
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            background: 'rgba(0, 0, 0, 0.8)',
            color: '#e0e0e0',
            padding: '12px 16px',
            borderRadius: '6px',
            fontSize: '14px',
            fontFamily: 'system-ui',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            zIndex: 25,
            pointerEvents: 'none'
          }}
        >
          <div style={{ fontWeight: '600', marginBottom: '4px' }}>
            🎯 Map Edit Mode
          </div>
          <div style={{ fontSize: '12px', fontFamily: 'monospace' }}>
            View Zoom: {currentTransform.scale.toFixed(1)}x (Range: 0.1x - 3.0x)
          </div>
          <div style={{ fontSize: '11px', opacity: 0.8, marginTop: '4px' }}>
            Drag to position • Scroll to zoom view
          </div>
        </div>
      )}
    </div>
  );
};

export default MapImageEditor;