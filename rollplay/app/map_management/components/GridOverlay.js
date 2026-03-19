/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import React, { useMemo, useState, useRef, useEffect } from 'react';

// Space reserved in SVG for coordinate labels (px)
const LABEL_OFFSET_X = 30; // left — row numbers
const LABEL_OFFSET_Y = 20; // top  — column letters

// ─── Grid math helpers (exported for future placement/token features) ─────────

/**
 * Given a logical (col, row) address and a computed layout, return the pixel
 * bounds of that cell in SVG space.
 */
export function cellBounds(col, row, layout) {
  return {
    x1: layout.originX + col       * layout.cellSize,
    y1: layout.originY + row       * layout.cellSize,
    x2: layout.originX + (col + 1) * layout.cellSize,
    y2: layout.originY + (row + 1) * layout.cellSize,
  };
}

/**
 * Given a pixel coordinate in SVG space and a computed layout, return the
 * logical (col, row) of the cell under that point, or null if outside the grid.
 */
export function cellAtPoint(px, py, layout) {
  const col = Math.floor((px - layout.originX) / layout.cellSize);
  const row = Math.floor((py - layout.originY) / layout.cellSize);
  if (col >= 0 && col < layout.gridCols && row >= 0 && row < layout.gridRows) {
    return { col, row };
  }
  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────

const GridOverlay = ({
  gridConfig = null,
  isEditMode = false,
  showLabels = true,
  activeMap = null,
  mapImageRef = null,
  liveGridOpacity = null,
  offsetX = 0, // Live offset in image-native pixels
  offsetY = 0,
  colTrim = 0, // Reduce drawn columns from the right edge (negative = trim, positive = restore)
  rowTrim = 0, // Reduce drawn rows from the bottom edge
}) => {
  const svgRef = useRef(null);

  // ── Dimension tracking ──────────────────────────────────────────────────────

  const [windowSize, setWindowSize]     = useState({ width: 0, height: 0 });
  const [mapDimensions, setMapDimensions] = useState({ width: 0, height: 0 });
  const [hoveredCell, setHoveredCell]   = useState(null); // { col, row } | null

  // Rerender when the browser window resizes
  useEffect(() => {
    const update = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Rerender when the map image element itself resizes (e.g. panel opens/closes)
  useEffect(() => {
    if (!mapImageRef?.current) return;
    const update = () => {
      const el = mapImageRef.current;
      if (!el) return;
      setMapDimensions(prev => {
        const next = { width: el.clientWidth, height: el.clientHeight };
        return (prev.width !== next.width || prev.height !== next.height) ? next : prev;
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(mapImageRef.current);
    return () => observer.disconnect();
  }, [mapImageRef, activeMap]);

  // ── Layout computation ──────────────────────────────────────────────────────
  //
  // Derives all positional constants from the current rendered map dimensions
  // and grid configuration. Everything downstream depends on this object.

  const layout = useMemo(() => {
    if (!gridConfig?.enabled || !activeMap || !mapImageRef?.current) return null;

    const el        = mapImageRef.current;
    const mapWidth  = el.clientWidth;
    const mapHeight = el.clientHeight;
    if (!mapWidth || !mapHeight) return null;

    const gridCols = gridConfig.grid_width  || 8;
    const gridRows = gridConfig.grid_height || 12;

    // Scale factor: image-native pixels (stored in offset_x/y) → rendered pixels
    const renderScale = mapWidth / (el.naturalWidth || mapWidth);

    // Square cells — size constrained by whichever map dimension is tighter
    const cellSize = Math.min(mapWidth / gridCols, mapHeight / gridRows);

    // Center the grid on the map, then shift by the live offset
    const originX = LABEL_OFFSET_X + (mapWidth  - cellSize * gridCols) / 2 + offsetX * renderScale;
    const originY = LABEL_OFFSET_Y + (mapHeight - cellSize * gridRows) / 2 + offsetY * renderScale;

    return {
      cellSize,
      originX,
      originY,
      gridCols,
      gridRows,
      mapWidth,
      mapHeight,
      mapBounds: {
        left:   LABEL_OFFSET_X,
        right:  LABEL_OFFSET_X + mapWidth,
        top:    LABEL_OFFSET_Y,
        bottom: LABEL_OFFSET_Y + mapHeight,
      },
    };
  }, [gridConfig, activeMap, mapImageRef, windowSize, mapDimensions, offsetX, offsetY]);

  // ── Cell generation ─────────────────────────────────────────────────────────
  //
  // A cell is included only if BOTH of its edges are fully within the map
  // bounds. Partial cells are never rendered — visibility is a boolean per cell.

  const cells = useMemo(() => {
    if (!layout) return [];
    const { cellSize, originX, originY, gridCols, gridRows, mapBounds } = layout;
    const result = [];

    // Trim removes cells from the right/bottom edges only.
    // cellSize and originX/Y are always based on the full untrimmed gridCols/gridRows
    // so the top-left anchor stays fixed regardless of trim.
    const drawnCols = Math.max(2, gridCols + colTrim);
    const drawnRows = Math.max(2, gridRows + rowTrim);

    for (let col = 0; col < drawnCols; col++) {
      for (let row = 0; row < drawnRows; row++) {
        const x1 = originX + col       * cellSize;
        const x2 = originX + (col + 1) * cellSize;
        const y1 = originY + row       * cellSize;
        const y2 = originY + (row + 1) * cellSize;

        if (x1 >= mapBounds.left  && x2 <= mapBounds.right &&
            y1 >= mapBounds.top   && y2 <= mapBounds.bottom) {
          result.push({ col, row, x1, y1, x2, y2 });
        }
      }
    }

    return result;
  }, [layout, colTrim, rowTrim]);

  // ── Label derivation ────────────────────────────────────────────────────────
  //
  // Labels are derived directly from the visible cell set — each label position
  // is computed from the same origin + k*cellSize formula used for the cells.

  const { colLabels, rowLabels } = useMemo(() => {
    if (!showLabels || !layout || cells.length === 0) {
      return { colLabels: [], rowLabels: [] };
    }
    const { cellSize, originX, originY } = layout;
    const seenCols = new Set();
    const seenRows = new Set();
    const colLabels = [];
    const rowLabels = [];

    for (const cell of cells) {
      if (!seenCols.has(cell.col)) {
        seenCols.add(cell.col);
        colLabels.push({
          key:  `col-${cell.col}`,
          text: String.fromCharCode(65 + (cell.col % 26)),
          x:    originX + (cell.col + 0.5) * cellSize, // actual cell center
          y:    LABEL_OFFSET_Y - 15,
        });
      }
      if (!seenRows.has(cell.row)) {
        seenRows.add(cell.row);
        rowLabels.push({
          key:  `row-${cell.row}`,
          text: (cell.row + 1).toString(),
          x:    LABEL_OFFSET_X - 15,
          y:    originY + (cell.row + 0.5) * cellSize, // actual cell center
        });
      }
    }

    return { colLabels, rowLabels };
  }, [cells, showLabels, layout]);

  // ── Early exits ─────────────────────────────────────────────────────────────

  if (!gridConfig || !gridConfig.enabled) return null;

  // ── Color resolution ────────────────────────────────────────────────────────

  const baseColors    = isEditMode ? gridConfig.colors.edit_mode : gridConfig.colors.display_mode;
  const currentColors = {
    ...baseColors,
    opacity: (isEditMode && liveGridOpacity !== null) ? liveGridOpacity : baseColors.opacity,
  };

  // ── SVG dimensions ──────────────────────────────────────────────────────────

  const svgWidth  = layout ? layout.mapWidth  + LABEL_OFFSET_X * 2 : 800;
  const svgHeight = layout ? layout.mapHeight + LABEL_OFFSET_Y * 2 : 600;

  const labelStyle = { userSelect: 'none', pointerEvents: 'none' };

  // ── Hover handler ────────────────────────────────────────────────────────────
  // Converts mouse position to SVG space, then to a (col, row) cell address.
  // The outer div keeps pointerEvents:'none' so the map drag is unaffected;
  // the SVG itself is 'all' so it can receive mousemove without stopPropagation,
  // letting pointerDown still bubble to the map container for dragging.

  const handleSvgMouseMove = (e) => {
    const svgEl = svgRef.current;
    if (!svgEl || !layout) return;
    const pt = svgEl.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const { x, y } = pt.matrixTransform(svgEl.getScreenCTM().inverse());
    setHoveredCell(cellAtPoint(x, y, layout));
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        pointerEvents: 'none',
        zIndex: isEditMode ? 20 : 5,
        overflow: 'visible',
      }}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width:  `${svgWidth}px`,
          height: `${svgHeight}px`,
          pointerEvents: 'all',
          overflow: 'visible',
          backgroundColor: 'transparent',
          cursor: hoveredCell ? 'crosshair' : 'default',
        }}
        onMouseMove={handleSvgMouseMove}
        onMouseLeave={() => setHoveredCell(null)}
        onPointerDown={() => setHoveredCell(null)}
      >
        {/* Grid cells — each cell is a rect, visibility determined by layout */}
        {cells.map(cell => (
          <rect
            key={`cell-${cell.col}-${cell.row}`}
            x={cell.x1}
            y={cell.y1}
            width={cell.x2  - cell.x1}
            height={cell.y2 - cell.y1}
            fill="none"
            stroke={currentColors.line_color}
            strokeWidth={currentColors.line_width}
            opacity={currentColors.opacity}
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/* Hover highlight — rendered above grid lines, below labels */}
        {hoveredCell && layout && (() => {
          const { col, row } = hoveredCell;
          const x1  = layout.originX + col * layout.cellSize;
          const y1  = layout.originY + row * layout.cellSize;
          const cx  = x1 + layout.cellSize / 2;
          const label = `${String.fromCharCode(65 + (col % 26))}${row + 1}`;
          const badgeWidth = label.length * 8 + 10;
          return (
            <g pointerEvents="none">
              <rect
                x={x1} y={y1}
                width={layout.cellSize} height={layout.cellSize}
                fill={currentColors.line_color}
                fillOpacity={0.4}
                stroke="none"
              />
              <rect
                x={cx - badgeWidth / 2} y={y1 - 18}
                width={badgeWidth} height={16}
                rx={3}
                fill="rgba(0,0,0,0.72)"
              />
              <text
                x={cx} y={y1 - 10}
                fill="#fff"
                fontSize="11"
                fontFamily="monospace"
                fontWeight="700"
                textAnchor="middle"
                dominantBaseline="middle"
                style={labelStyle}
              >
                {label}
              </text>
            </g>
          );
        })()}

        {/* Column labels — one per visible column, x = actual cell center */}
        {colLabels.map(label => (
          <text
            key={label.key}
            x={label.x}
            y={label.y}
            fill={currentColors.line_color}
            opacity={1.0}
            fontSize="12"
            fontFamily="monospace"
            fontWeight="500"
            textAnchor="middle"
            dominantBaseline="middle"
            style={labelStyle}
          >
            {label.text}
          </text>
        ))}

        {/* Row labels — one per visible row, y = actual cell center */}
        {rowLabels.map(label => (
          <text
            key={label.key}
            x={label.x}
            y={label.y}
            fill={currentColors.line_color}
            opacity={1.0}
            fontSize="12"
            fontFamily="monospace"
            fontWeight="500"
            textAnchor="middle"
            dominantBaseline="middle"
            style={labelStyle}
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
              opacity={1.0}
              fontSize="14"
              fontFamily="system-ui"
              fontWeight="600"
              textAnchor="middle"
              style={labelStyle}
            >
              🎯 Grid Edit Mode - Use DM controls to adjust cells
            </text>
            <text
              x="50%"
              y="75"
              fill={currentColors.line_color}
              opacity={1.0}
              fontSize="12"
              fontFamily="monospace"
              fontWeight="500"
              textAnchor="middle"
              style={labelStyle}
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
