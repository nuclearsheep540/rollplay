/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { useState, useMemo, useCallback } from 'react';

const DEFAULT_CELL_SIZE = 64;
const DEFAULT_COLS = 10;
const DEFAULT_ROWS = 10;
const DEFAULT_OPACITY = 0.2;
const DEFAULT_COLOR = '#d1d5db';

/**
 * Shared hook for grid parameter state and preview computation.
 *
 * Used by both GameContent (in-game editing) and Workshop MapGridTool
 * (preparation-time editing). Owns no persistence logic — consumers
 * handle save via their own path (WebSocket/MongoDB or REST/PostgreSQL).
 */
export function useGridConfig() {
  const [cellSize, setCellSizeRaw] = useState(DEFAULT_CELL_SIZE);
  const [gridCols, setGridColsRaw] = useState(DEFAULT_COLS);
  const [gridRows, setGridRowsRaw] = useState(DEFAULT_ROWS);
  const [gridOpacity, setGridOpacity] = useState(DEFAULT_OPACITY);
  const [gridColor, setGridColor] = useState(DEFAULT_COLOR);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  // --- Actions with clamping ---

  const setCellSize = useCallback((value) => {
    setCellSizeRaw(Math.max(8, Math.min(100, value)));
  }, []);

  const adjustCellSize = useCallback((delta) => {
    setCellSizeRaw(prev => Math.max(8, Math.min(100, parseFloat((prev + delta).toFixed(1)))));
  }, []);

  const setGridCols = useCallback((value) => {
    setGridColsRaw(Math.max(2, value));
  }, []);

  const adjustGridCols = useCallback((delta) => {
    setGridColsRaw(prev => Math.max(2, prev + delta));
  }, []);

  const setGridRows = useCallback((value) => {
    setGridRowsRaw(Math.max(2, value));
  }, []);

  const adjustGridRows = useCallback((delta) => {
    setGridRowsRaw(prev => Math.max(2, prev + delta));
  }, []);

  const adjustOffset = useCallback((deltaX, deltaY) => {
    setOffset(prev => ({ x: prev.x + deltaX, y: prev.y + deltaY }));
  }, []);

  // --- Init from saved config ---

  /**
   * Hydrate state from a saved grid config. Handles two shapes:
   *
   * Nested (MongoDB/game):
   *   { grid_width, grid_height, grid_cell_size, offset_x, offset_y,
   *     colors: { display_mode: { line_color, opacity } } }
   *
   * Flat (REST API response):
   *   { grid_width, grid_height, grid_cell_size, grid_offset_x, grid_offset_y,
   *     grid_opacity, grid_line_color }
   *
   * If no grid_cell_size and naturalDimensions provided, computes a default.
   */
  const initFromConfig = useCallback((config, naturalDimensions) => {
    if (!config) {
      // Reset to defaults
      setCellSizeRaw(DEFAULT_CELL_SIZE);
      setGridColsRaw(DEFAULT_COLS);
      setGridRowsRaw(DEFAULT_ROWS);
      setGridOpacity(DEFAULT_OPACITY);
      setGridColor(DEFAULT_COLOR);
      setOffset({ x: 0, y: 0 });
      return;
    }

    const cols = config.grid_width || DEFAULT_COLS;
    const rows = config.grid_height || DEFAULT_ROWS;
    setGridColsRaw(cols);
    setGridRowsRaw(rows);

    // Detect shape by checking for nested `colors` property
    const isNested = !!config.colors;

    if (isNested) {
      // Nested shape (MongoDB/game)
      setOffset({ x: config.offset_x ?? 0, y: config.offset_y ?? 0 });
      const displayMode = config.colors?.display_mode;
      setGridOpacity(displayMode?.opacity ?? DEFAULT_OPACITY);
      setGridColor(displayMode?.line_color ?? DEFAULT_COLOR);
    } else {
      // Flat shape (REST API response)
      setOffset({ x: config.grid_offset_x ?? 0, y: config.grid_offset_y ?? 0 });
      setGridOpacity(config.grid_opacity ?? DEFAULT_OPACITY);
      setGridColor(config.grid_line_color ?? DEFAULT_COLOR);
    }

    // Cell size: use stored value, or compute from image dimensions
    if (config.grid_cell_size) {
      setCellSizeRaw(config.grid_cell_size);
    } else if (naturalDimensions) {
      const { naturalWidth, naturalHeight } = naturalDimensions;
      setCellSizeRaw(Math.max(8, Math.min(naturalWidth / cols, naturalHeight / rows)));
    } else {
      setCellSizeRaw(DEFAULT_CELL_SIZE);
    }
  }, []);

  // --- Derived: nested preview config for MapDisplay/GridOverlay ---

  const effectiveGridConfig = useMemo(() => ({
    grid_width: gridCols,
    grid_height: gridRows,
    grid_cell_size: cellSize,
    enabled: true,
    offset_x: offset.x,
    offset_y: offset.y,
    colors: {
      edit_mode:    { line_color: gridColor, opacity: gridOpacity, line_width: 1 },
      display_mode: { line_color: gridColor, opacity: gridOpacity, line_width: 1 },
    },
  }), [gridCols, gridRows, cellSize, offset, gridColor, gridOpacity]);

  // --- Derived: flat config for REST PATCH ---

  const toFlatConfig = () => ({
    grid_width: gridCols,
    grid_height: gridRows,
    grid_cell_size: cellSize,
    grid_opacity: gridOpacity,
    grid_offset_x: Math.round(offset.x),
    grid_offset_y: Math.round(offset.y),
    grid_line_color: gridColor,
  });

  return {
    // State
    cellSize,
    gridCols,
    gridRows,
    gridOpacity,
    gridColor,
    offset,

    // Actions
    setCellSize,
    adjustCellSize,
    setGridCols,
    adjustGridCols,
    setGridRows,
    adjustGridRows,
    setGridOpacity,
    setGridColor,
    adjustOffset,
    setOffset,

    // Init
    initFromConfig,

    // Derived
    effectiveGridConfig,
    toFlatConfig,
  };
}
