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
  mapImageRef = null, // NEW: Reference to the actual map image element
  liveGridOpacity = null // NEW: Live grid opacity for real-time updates during edit mode
}) => {
  // Local state for editing (simplified - no more offset management)
  const svgRef = useRef(null);
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 });
  const [mapDimensions, setMapDimensions] = useState({ width: 0, height: 0 });

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

  // Watch for map image dimension changes (e.g., when UI scale changes panel layout)
  useEffect(() => {
    if (!mapImageRef?.current) return;

    const updateMapDimensions = () => {
      const mapElement = mapImageRef.current;
      if (mapElement) {
        const newDimensions = {
          width: mapElement.clientWidth,
          height: mapElement.clientHeight
        };
        setMapDimensions(prev => {
          // Only update if dimensions actually changed to avoid unnecessary re-renders
          if (prev.width !== newDimensions.width || prev.height !== newDimensions.height) {
            console.log('🎯 Map dimensions changed:', prev, '->', newDimensions);
            return newDimensions;
          }
          return prev;
        });
      }
    };

    // Initial measurement
    updateMapDimensions();

    // Use ResizeObserver to watch for size changes
    const resizeObserver = new ResizeObserver(updateMapDimensions);
    resizeObserver.observe(mapImageRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [mapImageRef, activeMap]); // Re-run when map changes

  // Calculate grid based on map image dimensions (1:1 square cells)
  const gridData = useMemo(() => {
    if (!gridConfig || !gridConfig.enabled || !activeMap || !mapImageRef?.current) return { lines: [], labels: [] };

    // Get the actual rendered image dimensions
    const mapElement = mapImageRef.current;
    const mapWidth = mapElement.clientWidth;  // Actual rendered width
    const mapHeight = mapElement.clientHeight; // Actual rendered height
    
    // Since grid overlay uses same positioning as map image (both centered),
    // we can position grid lines directly on the image coordinates
    const offsetX = 30; // Space for row labels on left  
    const offsetY = 20; // Space for column labels on top
    
    // Grid configuration (purely dimensional)
    const gridCols = gridConfig.grid_width || 8;
    const gridRows = gridConfig.grid_height || 12;
    
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

      // Column labels (A, B, C, etc.) - positioned above map
      if (showLabels && i < gridCols) {
        const letter = String.fromCharCode(65 + (i % 26)); // A-Z, then wraps
        const cellCenterX = x + (mapWidth / gridCols) / 2;
        labels.push({
          type: 'column',
          x: cellCenterX,
          y: offsetY - 10, // Above the map
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

      // Row labels (1, 2, 3, etc.) - positioned to the left of map
      if (showLabels && i < gridRows) {
        const cellCenterY = y + (mapHeight / gridRows) / 2;
        labels.push({
          type: 'row',
          x: offsetX - 20, // To the left of the map
          y: cellCenterY,
          text: (i + 1).toString(),
          key: `row-${i}`
        });
      }
    }

    console.log('🎯 Grid calculated:', {
      mapSize: `${mapWidth}×${mapHeight}`,
      trackedDimensions: `${mapDimensions.width}×${mapDimensions.height}`,
      gridDimensions: `${gridCols}×${gridRows}`,
      cellSize: `${(mapWidth/gridCols).toFixed(1)}×${(mapHeight/gridRows).toFixed(1)}`
    });

    return { lines, labels };
  }, [gridConfig, showLabels, activeMap, mapImageRef, windowSize, mapDimensions]);

  // Don't show grid if no config provided
  if (!gridConfig) {
    console.log('🎯 GridOverlay: No grid config provided - not rendering grid');
    return null;
  }

  console.log('🎯 GridOverlay received gridConfig:', gridConfig);
  const baseColors = isEditMode ? gridConfig.colors.edit_mode : gridConfig.colors.display_mode;
  
  // Use live grid opacity during edit mode for real-time updates
  const currentColors = {
    ...baseColors,
    opacity: (isEditMode && liveGridOpacity !== null) ? liveGridOpacity : baseColors.opacity
  };

  if (!gridConfig.enabled) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none',
        zIndex: isEditMode ? 20 : 5,
        overflow: 'visible'
      }}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${mapImageRef?.current ? mapImageRef.current.clientWidth + 60 : 800} ${mapImageRef?.current ? mapImageRef.current.clientHeight + 40 : 600}`}
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: mapImageRef?.current ? `${mapImageRef.current.clientWidth + 60}px` : '100%',
          height: mapImageRef?.current ? `${mapImageRef.current.clientHeight + 40}px` : '100%',
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
            Grid: {gridConfig.grid_width || 8}×{gridConfig.grid_height || 12} cells (Range: 2-50)
          </text>
        </g>
      )}
    </svg>
    </div>
  );
};

export default GridOverlay;