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
  liveGridOpacity = null, // NEW: Live grid opacity for real-time updates during edit mode
  offsetX = 0, // Whole-grid X shift (image-native pixels)
  offsetY = 0, // Whole-grid Y shift (image-native pixels)
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

    // Fixed label offsets (space for row/column labels)
    const labelOffsetX = 30; // Space for row labels on left
    const labelOffsetY = 20; // Space for column labels on top

    // Scale factor: image-native pixels → rendered pixels
    const naturalWidth = mapImageRef.current?.naturalWidth || mapWidth;
    const renderScale = mapWidth / naturalWidth;

    // Convert image-space offset to rendered pixels
    const renderedOffsetX = offsetX * renderScale;
    const renderedOffsetY = offsetY * renderScale;

    // Grid configuration (purely dimensional)
    const gridCols = gridConfig.grid_width || 8;
    const gridRows = gridConfig.grid_height || 12;

    // Cell size is fixed from full map dimensions — offset only shifts the origin.
    const cellSize = Math.min(mapWidth / gridCols, mapHeight / gridRows);
    const gridSpanX = cellSize * gridCols;
    const gridSpanY = cellSize * gridRows;

    // Centre the base grid on the map, then apply offset as a pure shift.
    const baseStartX = labelOffsetX + (mapWidth - gridSpanX) / 2;
    const baseStartY = labelOffsetY + (mapHeight - gridSpanY) / 2;
    const originX = baseStartX + renderedOffsetX;
    const originY = baseStartY + renderedOffsetY;

    // Auto-extend: add extra cells in each direction so the grid always covers the full map.
    // leftGap > 0 means the map's left edge is uncovered (origin shifted right).
    const leftGap   = originX - labelOffsetX;
    const rightGap  = (labelOffsetX + mapWidth)  - (originX + gridSpanX);
    const topGap    = originY - labelOffsetY;
    const bottomGap = (labelOffsetY + mapHeight) - (originY + gridSpanY);

    const leftExt   = leftGap   > 0 ? Math.ceil(leftGap   / cellSize) : 0;
    const rightExt  = rightGap  > 0 ? Math.ceil(rightGap  / cellSize) : 0;
    const topExt    = topGap    > 0 ? Math.ceil(topGap    / cellSize) : 0;
    const bottomExt = bottomGap > 0 ? Math.ceil(bottomGap / cellSize) : 0;

    const renderCols = gridCols + leftExt + rightExt;
    const renderRows = gridRows + topExt  + bottomExt;
    const gridStartX = originX - leftExt * cellSize;
    const gridStartY = originY - topExt  * cellSize;

    // Clip bounds — lines must not render outside the map image
    const clipLeft   = labelOffsetX;
    const clipRight  = labelOffsetX + mapWidth;
    const clipTop    = labelOffsetY;
    const clipBottom = labelOffsetY + mapHeight;

    const lines = [];
    const labels = [];

    // Vertical lines (columns) — clipped to map height
    for (let i = 0; i <= renderCols; i++) {
      const x = gridStartX + i * cellSize;
      if (x < clipLeft || x > clipRight) continue; // outside map width
      lines.push({
        type: 'vertical',
        x1: x,
        y1: clipTop,
        x2: x,
        y2: clipBottom,
        key: `v-${i}`
      });

      // Column labels — fixed above map, unaffected by tuning
      if (showLabels && i < gridCols) {
        const letter = String.fromCharCode(65 + (i % 26));
        const cellCenterX = labelOffsetX + ((i + 0.5) * mapWidth) / gridCols;
        labels.push({
          type: 'column',
          x: cellCenterX,
          y: labelOffsetY - 15,
          text: letter,
          key: `col-${i}`
        });
      }
    }

    // Horizontal lines (rows) — clipped to map width
    for (let i = 0; i <= renderRows; i++) {
      const y = gridStartY + i * cellSize;
      if (y < clipTop || y > clipBottom) continue; // outside map height
      lines.push({
        type: 'horizontal',
        x1: clipLeft,
        y1: y,
        x2: clipRight,
        y2: y,
        key: `h-${i}`
      });

      // Row labels (1, 2, 3, etc.) - fixed position left of map, unaffected by tuning
      if (showLabels && i < gridRows) {
        const cellCenterY = labelOffsetY + ((i + 0.5) * mapHeight) / gridRows;
        labels.push({
          type: 'row',
          x: labelOffsetX - 15,
          y: cellCenterY,
          text: (i + 1).toString(),
          key: `row-${i}`
        });
      }
    }

    return { lines, labels };
  }, [gridConfig, showLabels, activeMap, mapImageRef, windowSize, mapDimensions, offsetX, offsetY]);

  // Don't show grid if no config provided
  if (!gridConfig) {
    return null;
  }

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
          opacity={1.0} // Labels always at 100% opacity, unaffected by grid opacity
          fontSize="12"
          fontFamily="monospace"
          fontWeight="500"
          textAnchor="middle"
          dominantBaseline="middle" // Use middle baseline for consistent spacing
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
            opacity={1.0} // Edit mode indicators always at 100% opacity
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
            opacity={1.0} // Edit mode indicators always at 100% opacity
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

export default React.memo(GridOverlay);