/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import React, { useMemo, useState, useRef, useCallback, useEffect } from 'react';

const GridOverlay = ({ 
  gridConfig = null,
  isEditMode = false,
  containerWidth = '100%',
  containerHeight = '100%',
  showLabels = true,
  onGridChange = null // Callback for when grid config changes
}) => {
  // Local state for editing
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [tempOffset, setTempOffset] = useState({ x: 0, y: 0 });
  const svgRef = useRef(null);
  // Default grid configuration
  const defaultConfig = {
    cell_size: 50,      // 50px cells by default
    offset_x: 0,        // No offset
    offset_y: 0,        // No offset
    enabled: true,
    colors: {
      edit_mode: {
        line_color: "#ffffff",
        opacity: 0.4,
        line_width: 1
      },
      display_mode: {
        line_color: "#ffffff", 
        opacity: 0.2,
        line_width: 1
      }
    }
  };

  // Use provided config or default, applying temporary offsets in edit mode
  const config = gridConfig || defaultConfig;
  const currentColors = isEditMode ? config.colors.edit_mode : config.colors.display_mode;
  
  // Apply temporary offsets during dragging
  const effectiveConfig = {
    ...config,
    offset_x: config.offset_x + (isDragging ? tempOffset.x : 0),
    offset_y: config.offset_y + (isDragging ? tempOffset.y : 0)
  };

  // Mouse event handlers for grid dragging
  const handleMouseDown = useCallback((e) => {
    if (!isEditMode) return;
    
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    setIsDragging(true);
    setDragStart({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
    setTempOffset({ x: 0, y: 0 });
    
    e.preventDefault();
  }, [isEditMode]);

  const handleMouseMove = useCallback((e) => {
    if (!isDragging || !isEditMode) return;
    
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;
    
    setTempOffset({
      x: currentX - dragStart.x,
      y: currentY - dragStart.y
    });
  }, [isDragging, isEditMode, dragStart]);

  const handleMouseUp = useCallback(() => {
    if (!isDragging || !isEditMode) return;
    
    // Apply the temporary offset to the actual config
    if (onGridChange && (tempOffset.x !== 0 || tempOffset.y !== 0)) {
      const newConfig = {
        ...config,
        offset_x: config.offset_x + tempOffset.x,
        offset_y: config.offset_y + tempOffset.y
      };
      onGridChange(newConfig);
    }
    
    setIsDragging(false);
    setTempOffset({ x: 0, y: 0 });
  }, [isDragging, isEditMode, tempOffset, config, onGridChange]);

  // Mouse wheel handler for grid scaling
  const handleWheel = useCallback((e) => {
    if (!isEditMode) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    // Scroll up = zoom in = larger cells = fewer cells
    // Scroll down = zoom out = smaller cells = more cells
    const delta = e.deltaY > 0 ? -2 : 2; // Smaller increments for smoother scaling
    const newCellSize = Math.max(4, Math.min(120, config.cell_size + delta));
    
    if (onGridChange && newCellSize !== config.cell_size) {
      const newConfig = {
        ...config,
        cell_size: newCellSize
      };
      onGridChange(newConfig);
    }
  }, [isEditMode, config, onGridChange]);

  // Add global event listeners for mouse events when in edit mode
  useEffect(() => {
    if (!isEditMode) return;

    const handleGlobalMouseMove = (e) => handleMouseMove(e);
    const handleGlobalMouseUp = (e) => handleMouseUp(e);
    const handleGlobalWheel = (e) => handleWheel(e);

    // Add global listeners
    document.addEventListener('mousemove', handleGlobalMouseMove);
    document.addEventListener('mouseup', handleGlobalMouseUp);
    document.addEventListener('wheel', handleGlobalWheel, { passive: false });

    // Cleanup on unmount or when edit mode changes
    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
      document.removeEventListener('wheel', handleGlobalWheel);
    };
  }, [isEditMode, handleMouseMove, handleMouseUp, handleWheel]);

  // Calculate grid dimensions and lines
  const gridData = useMemo(() => {
    if (!effectiveConfig.enabled) return { lines: [], labels: [] };

    // For now, calculate based on viewport - will be dynamic later
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1920;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 1080;
    
    const cellSize = effectiveConfig.cell_size;
    const offsetX = effectiveConfig.offset_x;
    const offsetY = effectiveConfig.offset_y;

    // Calculate how many lines we need to fill the viewport
    const numVerticalLines = Math.ceil(viewportWidth / cellSize) + 2;
    const numHorizontalLines = Math.ceil(viewportHeight / cellSize) + 2;

    const lines = [];
    const labels = [];

    // Vertical lines (columns)
    for (let i = 0; i < numVerticalLines; i++) {
      const x = (i * cellSize) + offsetX;
      lines.push({
        type: 'vertical',
        x1: x,
        y1: 0,
        x2: x,
        y2: viewportHeight,
        key: `v-${i}`
      });

      // Column labels (A, B, C, etc.)
      if (showLabels && x >= 0 && x < viewportWidth) {
        const letter = String.fromCharCode(65 + (i % 26)); // A-Z, then wraps
        labels.push({
          type: 'column',
          x: x + (cellSize / 2),
          y: 20,
          text: letter,
          key: `col-${i}`
        });
      }
    }

    // Horizontal lines (rows)
    for (let i = 0; i < numHorizontalLines; i++) {
      const y = (i * cellSize) + offsetY;
      lines.push({
        type: 'horizontal',
        x1: 0,
        y1: y,
        x2: viewportWidth,
        y2: y,
        key: `h-${i}`
      });

      // Row labels (1, 2, 3, etc.)
      if (showLabels && y >= 0 && y < viewportHeight) {
        labels.push({
          type: 'row',
          x: 15,
          y: y + (cellSize / 2) + 4, // Center vertically + small offset
          text: (i + 1).toString(),
          key: `row-${i}`
        });
      }
    }

    return { lines, labels };
  }, [effectiveConfig, showLabels]);

  if (!config.enabled) return null;

  return (
    <svg
      ref={svgRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: isEditMode ? 'auto' : 'none', // Allow interaction in edit mode
        zIndex: isEditMode ? 20 : 5, // Higher z-index in edit mode
        overflow: 'visible',
        cursor: isEditMode ? (isDragging ? 'grabbing' : 'grab') : 'default'
      }}
      onMouseDown={handleMouseDown}
      onMouseLeave={handleMouseUp} // Stop dragging if mouse leaves SVG
    >
      {/* Grid lines */}
      {gridData.lines.map(line => (
        <line
          key={line.key}
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          stroke={currentColors.line_color}
          strokeWidth={currentColors.line_width}
          opacity={currentColors.opacity}
          vectorEffect="non-scaling-stroke" // Keeps line width consistent
        />
      ))}

      {/* Grid labels */}
      {showLabels && gridData.labels.map(label => (
        <text
          key={label.key}
          x={label.x}
          y={label.y}
          fill={currentColors.line_color}
          opacity={Math.min(currentColors.opacity * 2, 1)} // Labels slightly more visible
          fontSize="12"
          fontFamily="monospace"
          fontWeight="500"
          textAnchor="middle"
          dominantBaseline={label.type === 'row' ? 'middle' : 'hanging'}
          style={{
            userSelect: 'none',
            pointerEvents: 'none'
          }}
        >
          {label.text}
        </text>
      ))}

      {/* Edit mode indicator */}
      {isEditMode && (
        <g>
          <text
            x="50%"
            y="50"
            fill={currentColors.line_color}
            opacity={Math.min(currentColors.opacity * 2, 1)}
            fontSize="14"
            fontFamily="system-ui"
            fontWeight="600"
            textAnchor="middle"
            style={{
              userSelect: 'none',
              pointerEvents: 'none'
            }}
          >
            🎯 Grid Edit Mode - Drag to position, scroll to resize
          </text>
          <text
            x="50%"
            y="75"
            fill={currentColors.line_color}
            opacity={Math.min(currentColors.opacity * 2, 1)}
            fontSize="12"
            fontFamily="monospace"
            fontWeight="500"
            textAnchor="middle"
            style={{
              userSelect: 'none',
              pointerEvents: 'none'
            }}
          >
            Cell Size: {effectiveConfig.cell_size}px (Range: 4px - 120px)
          </text>
        </g>
      )}
    </svg>
  );
};

export default GridOverlay;