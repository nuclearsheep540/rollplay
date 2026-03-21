/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Roboto_Mono } from 'next/font/google';

const gridFont = Roboto_Mono({ subsets: ['latin'], weight: ['600'] });

// Space reserved in SVG for coordinate labels (px)
const LABEL_OFFSET_X = 30; // left — row numbers
const LABEL_OFFSET_Y = 20; // top  — column letters

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a zero-based column index to an Excel-style label.
 * 0→A, 25→Z, 26→AA, 51→AZ, 52→BA, 701→ZZ, 702→AAA, …
 */
function colIndexToLabel(index) {
  let label = '';
  let n = index + 1; // work in 1-based space
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

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
  gridInspect = false,
  offsetX = 0, // Live offset in image-native pixels
  offsetY = 0,
}) => {
  const svgRef = useRef(null);

  // ── Dimension tracking ──────────────────────────────────────────────────────

  const [windowSize, setWindowSize]     = useState({ width: 0, height: 0 });
  const [mapDimensions, setMapDimensions] = useState({ width: 0, height: 0 });
  const [hoveredCell, setHoveredCell]   = useState(null); // { col, row } | null

  // Clear highlight immediately when inspect is toggled off
  useEffect(() => {
    if (!gridInspect) setHoveredCell(null);
  }, [gridInspect]);

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

    // Scale factor: image-native pixels (stored in offset_x/y and cell_size) → rendered pixels
    const renderScale = mapWidth / (el.naturalWidth || mapWidth);

    // Cell size: use stored absolute value if available (stable across col/row changes),
    // otherwise fall back to fitting the grid proportionally (backward compat for old configs)
    const cellSize = gridConfig.grid_cell_size
      ? gridConfig.grid_cell_size * renderScale
      : Math.min(mapWidth / gridCols, mapHeight / gridRows);

    // Top-left anchor: offset is the absolute position of cell (0,0) from the map edge.
    // Adding/removing cols or rows extends outward without shifting the origin.
    const originX = LABEL_OFFSET_X + offsetX * renderScale;
    const originY = LABEL_OFFSET_Y + offsetY * renderScale;

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

    for (let col = 0; col < gridCols; col++) {
      for (let row = 0; row < gridRows; row++) {
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
  }, [layout]);

  // ── Label derivation ────────────────────────────────────────────────────────
  //
  // Labels are derived directly from the visible cell set — each label position
  // is computed from the same origin + k*cellSize formula used for the cells.

  const { colLabels, rowLabels, labelFontSize } = useMemo(() => {
    if (!showLabels || !layout || cells.length === 0) {
      return { colLabels: [], rowLabels: [], labelFontSize: 10 };
    }
    const { cellSize, originX, originY } = layout;
    const seenCols = new Set();
    const seenRows = new Set();
    const colLabels = [];
    const rowLabels = [];

    // Single font size for all labels — derived from cell size so labels
    // scale with the grid. Upper-bounded by the tightest gutter constraint
    // (2 chars stacked in LABEL_OFFSET_Y = 20px max). Lower-bounded at 6px.
    // On mobile where cells are smaller, font naturally shrinks with them.
    const LABEL_FONT_SIZE = Math.max(6, Math.min(10, cellSize));

    // Fixed baseline: bottom character of every col label sits here.
    const colBaselineY = LABEL_OFFSET_Y / 2 + LABEL_FONT_SIZE / 2;

    for (const cell of cells) {
      if (!seenCols.has(cell.col)) {
        seenCols.add(cell.col);
        const text = colIndexToLabel(cell.col);
        // Last char sits at colBaselineY, preceding chars stack upward
        const startY = colBaselineY - (text.length - 1) * LABEL_FONT_SIZE;
        colLabels.push({
          key:      `col-${cell.col}`,
          chars:    text.split(''),
          textX:    originX + (cell.col + 0.5) * cellSize,
          textY:    startY,
        });
      }
      if (!seenRows.has(cell.row)) {
        seenRows.add(cell.row);
        const text = (cell.row + 1).toString();
        rowLabels.push({
          key:      `row-${cell.row}`,
          text,
          textX:    LABEL_OFFSET_X / 2,
          textY:    originY + (cell.row + 0.5) * cellSize,
        });
      }
    }

    return { colLabels, rowLabels, labelFontSize: LABEL_FONT_SIZE };
  }, [cells, showLabels, layout]);

  // ── Early exits ─────────────────────────────────────────────────────────────

  if (!gridConfig || !gridConfig.enabled) return null;

  // ── Color resolution ────────────────────────────────────────────────────────

  const DEFAULT_COLORS = { line_color: '#d1d5db', opacity: 0.2, line_width: 1 };
  const baseColors    = isEditMode
    ? (gridConfig.colors?.edit_mode    ?? DEFAULT_COLORS)
    : (gridConfig.colors?.display_mode ?? DEFAULT_COLORS);
  const currentColors = {
    ...baseColors,
    opacity: (isEditMode && liveGridOpacity !== null) ? liveGridOpacity : baseColors.opacity,
  };

  // ── SVG dimensions ──────────────────────────────────────────────────────────

  const svgWidth  = layout ? layout.mapWidth  + LABEL_OFFSET_X * 2 : 800;
  const svgHeight = layout ? layout.mapHeight + LABEL_OFFSET_Y * 2 : 600;

  const labelStyle = { userSelect: 'none', pointerEvents: 'none' };
  const LABEL_FONT = gridFont.style.fontFamily;


  // ── Hover handler ────────────────────────────────────────────────────────────
  // Converts mouse position to SVG space, then to a (col, row) cell address.
  // The outer div keeps pointerEvents:'none' so the map drag is unaffected;
  // the SVG itself is 'all' so it can receive mousemove without stopPropagation,
  // letting pointerDown still bubble to the map container for dragging.

  const handleSvgMouseMove = (e) => {
    if (!gridInspect) {
      if (hoveredCell) setHoveredCell(null);
      return;
    }
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
          const label = `${colIndexToLabel(col)}${row + 1}`;
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
                fontFamily={LABEL_FONT}
                fontWeight="600"
                textAnchor="middle"
                dominantBaseline="middle"
                style={labelStyle}
              >
                {label}
              </text>
            </g>
          );
        })()}

        {/* Column labels — vertical stacking via <tspan>, same rendering as row labels */}
        {colLabels.map(label => (
          <g key={label.key} style={labelStyle}>
            <text
              x={label.textX} y={label.textY}
              fill="#e5e7eb"
              fontSize={labelFontSize}
              fontFamily={LABEL_FONT}
              fontWeight="600"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {label.chars.map((char, i) => (
                <tspan key={i} x={label.textX} dy={i === 0 ? 0 : labelFontSize}>
                  {char}
                </tspan>
              ))}
            </text>
          </g>
        ))}

        {/* Row labels — horizontal, same font size as column labels */}
        {rowLabels.map(label => (
          <g key={label.key} style={labelStyle}>
            <text
              x={label.textX} y={label.textY}
              fill="#e5e7eb"
              fontSize={labelFontSize}
              fontFamily={LABEL_FONT}
              fontWeight="600"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {label.text}
            </text>
          </g>
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
