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
  onGridChange = null, // Callback for when grid config changes
  activeMap = null, // NEW: Map data with dimensions
  mapImageConfig = null, // NEW: Map image positioning/scaling
  mapImageRef = null // NEW: Reference to the actual map image element
}) => {
  // Local state for editing (simplified - no more offset management)
  const svgRef = useRef(null);
  // Default grid configuration - pure dimensional grid anchored to map
  const defaultConfig = {
    grid_width: 8,      // Number of cells across map width
    grid_height: 12,    // Number of cells across map height
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

  // Use provided config or default (no more offset management needed)
  const config = gridConfig || defaultConfig;
  console.log('🎯 GridOverlay received gridConfig:', gridConfig, 'using config:', config);
  const currentColors = isEditMode ? config.colors.edit_mode : config.colors.display_mode;


  // Calculate grid based on container dimensions (1:1 square cells)
  const gridData = useMemo(() => {
    if (!config.enabled || !activeMap?.dimensions) return { lines: [], labels: [] };

    // Use container size (100% of parent) for grid calculation
    const containerWidth = typeof window !== 'undefined' ? window.innerWidth : 1920;
    const containerHeight = typeof window !== 'undefined' ? window.innerHeight : 1080;
    
    // Grid configuration (purely dimensional)
    const gridCols = config.grid_width || 8;
    const gridRows = config.grid_height || 12;
    
    // Calculate square cell size - use the smaller dimension to ensure cells fit
    // and maintain 1:1 aspect ratio (square cells)
    const cellSizeFromWidth = containerWidth / gridCols;
    const cellSizeFromHeight = containerHeight / gridRows;
    const cellSize = Math.min(cellSizeFromWidth, cellSizeFromHeight);
    
    // Calculate how many cells actually fit with square cells
    const actualCols = Math.floor(containerWidth / cellSize);
    const actualRows = Math.floor(containerHeight / cellSize);

    const lines = [];
    const labels = [];

    // Vertical lines (columns) - anchored to container origin
    for (let i = 0; i <= actualCols; i++) {
      const x = i * cellSize;
      lines.push({
        type: 'vertical',
        x1: x,
        y1: 0,
        x2: x,
        y2: actualRows * cellSize,
        key: `v-${i}`
      });

      // Column labels (A, B, C, etc.) - only for cell centers
      if (showLabels && i < actualCols) {
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

    // Horizontal lines (rows) - anchored to container origin
    for (let i = 0; i <= actualRows; i++) {
      const y = i * cellSize;
      lines.push({
        type: 'horizontal',
        x1: 0,
        y1: y,
        x2: actualCols * cellSize,
        y2: y,
        key: `h-${i}`
      });

      // Row labels (1, 2, 3, etc.) - only for cell centers
      if (showLabels && i < actualRows) {
        labels.push({
          type: 'row',
          x: 15,
          y: y + (cellSize / 2) + 4, // Center vertically + small offset
          text: (i + 1).toString(),
          key: `row-${i}`
        });
      }
    }

    console.log('🎯 Grid calculated - Container:', containerWidth, 'x', containerHeight, 
                'Requested grid:', gridCols, 'x', gridRows, 'Actual grid:', actualCols, 'x', actualRows, 
                'Square cell size:', cellSize.toFixed(1));

    return { lines, labels };
  }, [config, showLabels, activeMap]);

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
        pointerEvents: 'none', // Parent handles all interactions
        zIndex: isEditMode ? 20 : 5, // Higher z-index in edit mode
        overflow: 'visible',
        backgroundColor: 'transparent'
      }}
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
            🎯 Grid Edit Mode - Use DM controls to adjust cells
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
            Grid: {config.grid_width || 8}×{config.grid_height || 12} cells (Range: 2-50)
          </text>
        </g>
      )}
    </svg>
  );
};

export default GridOverlay;