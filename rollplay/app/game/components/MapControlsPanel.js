/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import React, { useState, useEffect, useRef } from 'react';

import {
  DM_CHILD,
  DM_CHILD_LAST,
  DM_ARROW,
  ACTIVE_BACKGROUND,
} from '../../styles/constants';
import MapSelectionSection from './MapSelectionModal';

// Component to read actual image file dimensions
const ImageDimensions = ({ activeMap }) => {
  const [dimensions, setDimensions] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeMap?.file_path) return;

    setLoading(true);
    const img = new Image();

    img.onload = () => {
      setDimensions({
        width: img.naturalWidth,
        height: img.naturalHeight
      });
      setLoading(false);
      console.log('📏 Actual image dimensions:', img.naturalWidth, 'x', img.naturalHeight);
    };

    img.onerror = () => {
      setDimensions(null);
      setLoading(false);
      console.warn('📏 Failed to load image for dimensions');
    };

    img.src = activeMap.file_path;
  }, [activeMap?.file_path]);

  if (loading) return <span>Reading image dimensions...</span>;
  if (!dimensions) return <span>Unable to read image dimensions</span>;

  // Determine orientation
  const isPortrait = dimensions.height > dimensions.width;
  const isSquare = dimensions.width === dimensions.height;
  const orientation = isSquare ? 'square' : (isPortrait ? 'portrait' : 'landscape');

  return (
    <span>
      Image: {dimensions.width}w × {dimensions.height}h px ({orientation})
    </span>
  );
};

export default function MapControlsPanel({
  roomId,
  campaignId = null,
  activeMap = null,
  setActiveMap = null,
  gridEditMode = false,
  setGridEditMode = null,
  handleGridChange = null,
  liveGridOpacity = 0.2,
  setLiveGridOpacity = null,
  sendMapLoad = null,
  sendMapClear = null,
  liveTuning = { offsetX: 0, offsetY: 0 },
  onTuningModeChange = null,
  onOffsetChange = null,
  cellSize = 64,
  onCellSizeChange = null,
  liveGridCols = 10,
  liveGridRows = 10,
}) {
  const [isDimensionsExpanded, setIsDimensionsExpanded] = useState(false);

  // Store original server opacity when entering edit mode
  const [originalServerOpacity, setOriginalServerOpacity] = useState(null);

  // State for map selection inline section
  const [isMapExpanded, setIsMapExpanded] = useState(true);

  // Grid colour state
  const [liveGridColor, setLiveGridColor] = useState('#d1d5db');
  const gridColorInputRef = useRef(null);

  // Original offset before tuning (for cancel/restore)
  const [originalTuning, setOriginalTuning] = useState(null);

  // Sync opacity and colour from the loaded grid config
  useEffect(() => {
    const gc = activeMap?.grid_config;
    if (gc) {
      const editOpacity    = gc.colors?.edit_mode?.opacity;
      const displayOpacity = gc.colors?.display_mode?.opacity;
      if (setLiveGridOpacity) setLiveGridOpacity(editOpacity || displayOpacity || 0.2);
      setLiveGridColor(gc.colors?.display_mode?.line_color || '#d1d5db');
    } else if (!activeMap || activeMap.grid_config === null) {
      if (setLiveGridOpacity) setLiveGridOpacity(0.2);
    }
  }, [activeMap]);

  // Live preview: push color/opacity changes to the grid overlay during edit mode
  useEffect(() => {
    if (!isDimensionsExpanded || !handleGridChange) return;

    const previewConfig = {
      grid_width: liveGridCols,
      grid_height: liveGridRows,
      grid_cell_size: cellSize,
      enabled: true,
      colors: {
        edit_mode:    { line_color: liveGridColor, opacity: liveGridOpacity, line_width: 1 },
        display_mode: { line_color: liveGridColor, opacity: liveGridOpacity, line_width: 1 },
      },
    };

    handleGridChange(previewConfig);
  }, [liveGridCols, liveGridRows, cellSize, liveGridOpacity, liveGridColor, isDimensionsExpanded, handleGridChange]);

  // Initialize Coloris for grid colour picker when Edit Grid section is expanded
  useEffect(() => {
    if (!isDimensionsExpanded) return;

    let cleanup = null;

    const initColoris = async () => {
      try {
        const { default: Coloris } = await import('@melloware/coloris');
        Coloris.init();
        Coloris({
          el: '.grid-color-input',
          wrap: false,
          theme: 'polaroid',
          themeMode: 'dark',
          alpha: false,
          format: 'hex',
          clearButton: false,
          closeButton: true,
          closeLabel: 'Close',
        });

        const handleGridColorPick = (event) => {
          setLiveGridColor(event.detail.color);
        };

        document.addEventListener('coloris:pick', handleGridColorPick);
        cleanup = () => document.removeEventListener('coloris:pick', handleGridColorPick);
      } catch (error) {
        console.error('Failed to initialize Coloris for grid colour:', error);
      }
    };

    initColoris();
    return () => { if (cleanup) cleanup(); };
  }, [isDimensionsExpanded]);

  // Sync local state when parent's gridEditMode changes externally (e.g., tab navigation)
  useEffect(() => {
    if (!gridEditMode && isDimensionsExpanded) {
      setIsDimensionsExpanded(false);
      // Also restore original opacity if it was stored
      if (originalServerOpacity !== null && setLiveGridOpacity) {
        setLiveGridOpacity(originalServerOpacity);
        setOriginalServerOpacity(null);
      }
      console.log('📐 Grid edit mode synced from parent (exited externally)');
    }
  }, [gridEditMode]);

  // Handle map selection from modal
  const handleMapSelection = (mapData) => {
    console.log('🗺️ Map selected:', mapData);

    if (sendMapLoad) {
      sendMapLoad(mapData);
      console.log('🗺️ Selected map load sent via WebSocket:', mapData);
    } else {
      // Fallback to local state if WebSocket not available
      if (setActiveMap) {
        setActiveMap(mapData);
        console.log('🗺️ Selected map loaded locally (WebSocket unavailable):', mapData);
      }
    }
  };

  // Apply grid settings to MongoDB (hot storage). ETL handles cold persistence at session end.
  const applyGrid = async () => {
    if (!activeMap) return;

    const colors = {
      edit_mode:    { line_color: liveGridColor, opacity: liveGridOpacity, line_width: 1 },
      display_mode: { line_color: liveGridColor, opacity: liveGridOpacity, line_width: 1 },
    };

    const newGridConfig = {
      grid_width:  Math.max(2, liveGridCols),
      grid_height: Math.max(2, liveGridRows),
      grid_cell_size: Math.max(8, cellSize),
      enabled: true,
      offset_x: liveTuning.offsetX,
      offset_y: liveTuning.offsetY,
      colors,
    };

    const { _id, ...mapWithoutId } = activeMap;
    const updatedMap = { ...mapWithoutId, grid_config: newGridConfig };

    try {
      const response = await fetch(`/api/game/${roomId}/map`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ map: updatedMap, updated_by: 'dm' })
      });

      if (response.ok) {
        // Optimistic local update: reflect the trimmed config immediately so the
        // grid shows the correct result when the panel closes, without waiting for
        // the WebSocket broadcast. The broadcast will follow and set the same value.
        if (setActiveMap) {
          setActiveMap({ ...mapWithoutId, grid_config: newGridConfig });
        }

        // Close the panel — display mode uses activeMap.grid_config directly,
        // which we just set above, so the correct trimmed grid shows immediately.
        setIsDimensionsExpanded(false);
        if (setGridEditMode) setGridEditMode(false);
        if (onTuningModeChange) onTuningModeChange(null);
        setOriginalServerOpacity(null);
        setOriginalTuning(null);
      } else {
        const error = await response.text();
        console.error('❌ Failed to apply grid:', error);
        alert('Failed to apply grid configuration. Please try again.');
      }
    } catch (error) {
      console.error('❌ Error applying grid:', error);
      alert('Failed to apply grid configuration. Please try again.');
    }
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col">
      <button
        className={`${DM_CHILD} ${isMapExpanded ? ACTIVE_BACKGROUND : ''}`}
        onClick={() => setIsMapExpanded(!isMapExpanded)}
      >
        <span className={`${DM_ARROW} transform transition-transform ${isMapExpanded ? 'rotate-180' : ''}`}>
          ▼
        </span>
        📁 {isMapExpanded ? 'Hide Maps' : 'Load Map'}
      </button>
        <MapSelectionSection
          isExpanded={isMapExpanded}
          onSelectMap={handleMapSelection}
          roomId={roomId}
          campaignId={campaignId}
          currentMap={activeMap}
        />
        {activeMap && (
          <button
            className={`${DM_CHILD} ${ACTIVE_BACKGROUND}`}
            onClick={() => {
              if (sendMapClear) {
                sendMapClear();
                console.log('🗺️ Map clear sent via WebSocket');
              } else {
                if (setActiveMap) {
                  setActiveMap(null);
                  console.log('🗺️ Map cleared locally (WebSocket unavailable)');
                }
              }
            }}
          >
            🗑️ Clear Map
          </button>
        )}
        {/* Grid Dimensions Controls */}
        <button
          className={`${DM_CHILD} ${isDimensionsExpanded ? ACTIVE_BACKGROUND : ''}`}
          onClick={() => {
            const newExpanded = !isDimensionsExpanded;
            setIsDimensionsExpanded(newExpanded);
            if (setGridEditMode) setGridEditMode(newExpanded);
            if (newExpanded) {
              if (originalServerOpacity === null) setOriginalServerOpacity(liveGridOpacity);
              setOriginalTuning({ ...liveTuning });
              if (onTuningModeChange) onTuningModeChange('offset');
            } else {
              if (originalServerOpacity !== null && setLiveGridOpacity) {
                setLiveGridOpacity(originalServerOpacity);
              }
              setOriginalServerOpacity(null);
              if (originalTuning && onOffsetChange) {
                onOffsetChange(originalTuning.offsetX, originalTuning.offsetY);
              }
              if (onTuningModeChange) onTuningModeChange(null);
              setOriginalTuning(null);
            }
          }}
          disabled={!activeMap}
        >
          <span className={`${DM_ARROW} transform transition-transform ${isDimensionsExpanded ? 'rotate-180' : ''}`}>
            ▼
          </span>
          📐 {isDimensionsExpanded ? 'Exit Grid Edit' : 'Edit Grid'}
        </button>

        {/* Grid controls (expandable) */}
        {isDimensionsExpanded && activeMap && (
          <div className="ml-4 mb-6">
            <div className="mb-3">
              <label className="block text-xs text-gray-400 mb-1">
                Cell Size: {cellSize}px · Grid: {liveGridCols}×{liveGridRows} cells
              </label>
              <input
                type="range"
                min="8"
                max="100"
                step="0.5"
                value={cellSize}
                onChange={(e) => { if (onCellSizeChange) onCellSizeChange(parseFloat(e.target.value) - cellSize); }}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>Small (8px)</span>
                <span>Medium</span>
                <span>Large (100px)</span>
              </div>
            </div>

            <div className="mb-3">
              <label className="block text-xs text-gray-400 mb-1">
                Grid Opacity: {(liveGridOpacity * 100).toFixed(0)}%
              </label>
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.1"
                value={liveGridOpacity}
                onChange={(e) => {
                  const newOpacity = parseFloat(e.target.value);
                  if (setLiveGridOpacity) {
                    setLiveGridOpacity(newOpacity);
                  }
                  if (setGridEditMode) {
                    setGridEditMode(true);
                  }
                }}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>10%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
            </div>

            <div className="mb-3">
              <label className="block text-xs text-gray-400 mb-1">
                Grid Colour
              </label>
              <div className="flex items-center gap-2">
                <input
                  ref={gridColorInputRef}
                  type="text"
                  className="grid-color-input w-8 h-8 rounded border-2 cursor-pointer"
                  value={liveGridColor}
                  readOnly
                  style={{
                    color: 'transparent',
                    textIndent: '-9999px',
                    backgroundColor: liveGridColor,
                    borderColor: liveGridColor,
                  }}
                />
                <span className="text-xs text-gray-500">{liveGridColor}</span>
              </div>
            </div>

            <div className="mb-3">
              <div className="text-xs text-gray-400 mb-1">
                Grid Offset: X {liveTuning.offsetX}px / Y {liveTuning.offsetY}px
              </div>
              <div className="text-xs text-gray-500">
                Use the on-map D-pad to nudge the grid position.
              </div>
            </div>

            <button
              className={DM_CHILD_LAST}
              onClick={applyGrid}
            >
              ✨ Apply Grid Changes
            </button>

            <div className="text-xs text-gray-400 mt-2">
              <ImageDimensions activeMap={activeMap} />
            </div>
          </div>
        )}
    </div>
  );
}
