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
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 });

  // Listen for window resize to recalculate grid positioning
  useEffect(() => {
    const updateWindowSize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };

    updateWindowSize(); // Initial size
    window.addEventListener('resize', updateWindowSize);

    return () => window.removeEventListener('resize', updateWindowSize);
  }, []);
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


  // Calculate grid based on map image dimensions (1:1 square cells)
  const gridData = useMemo(() => {
    if (!config.enabled || !activeMap || !mapImageRef?.current) return { lines: [], labels: [] };

    // Get the actual rendered image dimensions
    const mapElement = mapImageRef.current;
    const mapWidth = mapElement.clientWidth;  // Actual rendered width
    const mapHeight = mapElement.clientHeight; // Actual rendered height
    
    // Since the SVG container is now sized exactly to match the image,
    // we can use coordinates relative to the SVG (0,0 = image top-left)
    const offsetX = 0;
    const offsetY = 0;
    
    // Grid configuration (purely dimensional)
    const gridCols = config.grid_width || 8;
    const gridRows = config.grid_height || 12;
    
    // Option 1: Exact grid dimensions (may result in non-square cells)
    // const cellWidth = mapWidth / gridCols;
    // const cellHeight = mapHeight / gridRows;
    
    // Option 2: Square cells (may not show exact requested dimensions)
    const cellSize = Math.min(mapWidth / gridCols, mapHeight / gridRows);
    const actualCols = gridCols; // Use requested dimensions
    const actualRows = gridRows; // Use requested dimensions

    const lines = [];
    const labels = [];

    // Vertical lines (columns) - positioned relative to image location
    for (let i = 0; i <= gridCols; i++) {
      const x = offsetX + (i * mapWidth) / gridCols; // Distribute evenly across map width
      lines.push({
        type: 'vertical',
        x1: x,
        y1: offsetY,
        x2: x,
        y2: offsetY + mapHeight, // Full map height
        key: `v-${i}`
      });

      // Column labels (A, B, C, etc.) - only for cell interiors
      if (showLabels && i < gridCols) {
        const letter = String.fromCharCode(65 + (i % 26)); // A-Z, then wraps
        const cellCenterX = x + (mapWidth / gridCols) / 2;
        labels.push({
          type: 'column',
          x: cellCenterX,
          y: offsetY + 20,
          text: letter,
          key: `col-${i}`
        });
      }
    }

    // Horizontal lines (rows) - positioned relative to image location
    for (let i = 0; i <= gridRows; i++) {
      const y = offsetY + (i * mapHeight) / gridRows; // Distribute evenly across map height
      lines.push({
        type: 'horizontal',
        x1: offsetX,
        y1: y,
        x2: offsetX + mapWidth, // Full map width
        y2: y,
        key: `h-${i}`
      });

      // Row labels (1, 2, 3, etc.) - only for cell interiors
      if (showLabels && i < gridRows) {
        const cellCenterY = y + (mapHeight / gridRows) / 2 + 4;
        labels.push({
          type: 'row',
          x: offsetX + 15,
          y: cellCenterY,
          text: (i + 1).toString(),
          key: `row-${i}`
        });
      }
    }

    console.log('🎯 Grid calculated - Map size:', mapWidth, 'x', mapHeight, 
                'Grid dimensions:', gridCols, 'x', gridRows,
                'Cell size:', (mapWidth/gridCols).toFixed(1), 'x', (mapHeight/gridRows).toFixed(1));

    return { lines, labels };
  }, [config, showLabels, activeMap, mapImageRef, windowSize]);

  if (!config.enabled) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: mapImageRef?.current ? `${mapImageRef.current.clientWidth}px` : '100%',
        height: mapImageRef?.current ? `${mapImageRef.current.clientHeight}px` : '100%',
        pointerEvents: 'none',
        zIndex: isEditMode ? 20 : 5,
        overflow: 'visible'
      }}
    >
      <svg
        ref={svgRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
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
    </div>
  );
};

export default GridOverlay;