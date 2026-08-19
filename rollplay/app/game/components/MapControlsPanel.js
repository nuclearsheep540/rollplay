/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import React, { useState, useEffect, useRef } from 'react';

import {
  DM_CHILD,
  DM_CHILD_LAST,
  DM_ARROW,
  ACTIVE_BACKGROUND,
} from '../../styles/constants';
import Switch from '@/app/shared/components/Switch';
import { FogPaintControls, RegionListPanel, RegionParamsEditor } from '@/app/fog_management';
import MapSelectionSection from './MapSelectionModal';

// Component to read actual image file dimensions
const ImageDimensions = ({ activeMap }) => {
  const [dimensions, setDimensions] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeMap?.map_config?.file_path) return;

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

    img.src = activeMap.map_config.file_path;
  }, [activeMap?.map_config?.file_path]);

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
  grid = null,
  sendMapLoad = null,
  sendMapClear = null,
  onTuningModeChange = null,
  fog = null,
  fogPaintMode = false,
  setFogPaintMode = null,
  fogPeekThrough = false,
  setFogPeekThrough = null,
  onFogUpdate = null,
  onFogClearBroadcast = null,
}) {
  const [isDimensionsExpanded, setIsDimensionsExpanded] = useState(false);
  const [isFogExpanded, setIsFogExpanded] = useState(false);

  // Store original server opacity when entering edit mode
  const [originalServerOpacity, setOriginalServerOpacity] = useState(null);

  // State for map selection inline section
  const [isMapExpanded, setIsMapExpanded] = useState(true);

  const gridColorInputRef = useRef(null);

  // Original offset before tuning (for cancel/restore)
  const [originalTuning, setOriginalTuning] = useState(null);

  // Live preview: push color/opacity changes to the grid overlay during edit mode
  // This updates the gridConfig state in GameContent so effectiveGridConfig merges colors
  useEffect(() => {
    if (!isDimensionsExpanded || !handleGridChange || !grid) return;

    const previewConfig = {
      grid_width: grid.gridCols,
      grid_height: grid.gridRows,
      grid_cell_size: grid.cellSize,
      // Preview only — always draws the lattice regardless of the saved
      // on/off state, so a DM tuning a switched-off grid has something to
      // align against. grid.effectiveGridConfig carries the real flag, and
      // that is what applyGrid persists.
      enabled: true,
      colors: {
        edit_mode:    { line_color: grid.gridColor, opacity: grid.gridOpacity, line_width: 1 },
        display_mode: { line_color: grid.gridColor, opacity: grid.gridOpacity, line_width: 1 },
      },
    };

    handleGridChange(previewConfig);
  }, [grid?.gridCols, grid?.gridRows, grid?.cellSize, grid?.gridOpacity, grid?.gridColor, isDimensionsExpanded, handleGridChange]);

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
          if (grid) grid.setGridColor(event.detail.color);
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
      if (originalServerOpacity !== null && grid) {
        grid.setGridOpacity(originalServerOpacity);
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

  // A grid can only be switched off once one exists — "off" with nothing
  // configured is just the map's default state, and Edit Grid is how you
  // create one.
  const savedGridConfig = activeMap?.map_config?.grid_config || null;
  const gridIsOn = savedGridConfig ? savedGridConfig.enabled !== false : false;

  /**
   * Flip the grid on or off. A real off, not a hide: lines, snapping, cell
   * labels and token sizing all stop together (tokens v4 decision 51). The
   * DM's tuned dimensions, offsets and cell size are kept, so switching back
   * on restores the same lattice rather than making them re-align it.
   */
  const toggleGrid = async () => {
    if (!activeMap || !savedGridConfig) return;
    const nextEnabled = !gridIsOn;
    if (grid) grid.setGridEnabled(nextEnabled);
    // Persist the new value explicitly rather than via effectiveGridConfig:
    // setState has not landed yet, so that object still holds the old flag.
    await applyGridConfig({ ...savedGridConfig, enabled: nextEnabled });
  };

  /**
   * Write a grid config to MongoDB (hot storage) as a complete map object;
   * ETL handles cold persistence at session end. Returns whether it landed.
   */
  const applyGridConfig = async (newGridConfig) => {
    if (!activeMap) return false;
    const { _id, ...mapWithoutId } = activeMap;
    const updatedMap = {
      ...mapWithoutId,
      map_config: { ...mapWithoutId.map_config, grid_config: newGridConfig },
    };

    try {
      const response = await fetch(`/api/game/${roomId}/map`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ map: updatedMap, updated_by: 'dm' })
      });

      if (!response.ok) {
        console.error('❌ Failed to apply grid:', await response.text());
        alert('Failed to apply grid configuration. Please try again.');
        return false;
      }

      // Optimistic local update: reflect the config immediately rather than
      // waiting for the WebSocket broadcast, which follows with the same value.
      if (setActiveMap) {
        setActiveMap(updatedMap);
      }
      return true;
    } catch (error) {
      console.error('❌ Error applying grid:', error);
      alert('Failed to apply grid configuration. Please try again.');
      return false;
    }
  };

  const applyGrid = async () => {
    if (!grid) return;
    if (!(await applyGridConfig(grid.effectiveGridConfig))) return;
    // Close the editor — display mode reads activeMap.grid_config directly,
    // which applyGridConfig just set, so the result shows immediately.
    setIsDimensionsExpanded(false);
    if (setGridEditMode) setGridEditMode(false);
    if (onTuningModeChange) onTuningModeChange(null);
    setOriginalServerOpacity(null);
    setOriginalTuning(null);
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
        {/* Grid on/off — only once a grid exists; before that "off" is just
            the map's default and Edit Grid is how you make one. A real off:
            lines, snapping, cell labels and token sizing stop together, and
            the DM's tuned dimensions/offsets are kept for switching back. */}
        {activeMap && savedGridConfig && (
          <div
            className={`${DM_CHILD} w-full flex items-center justify-between cursor-pointer`}
            onClick={toggleGrid}
            role="switch"
            aria-checked={gridIsOn}
            aria-label="Grid"
          >
            ▦ Grid
            <Switch checked={gridIsOn} />
          </div>
        )}

        {/* Grid Dimensions Controls */}
        <button
          className={`${DM_CHILD} ${isDimensionsExpanded ? ACTIVE_BACKGROUND : ''}`}
          onClick={() => {
            const newExpanded = !isDimensionsExpanded;
            setIsDimensionsExpanded(newExpanded);
            if (setGridEditMode) setGridEditMode(newExpanded);
            if (newExpanded) {
              if (originalServerOpacity === null && grid) setOriginalServerOpacity(grid.gridOpacity);
              if (grid) setOriginalTuning({ offsetX: grid.offset.x, offsetY: grid.offset.y });
              if (onTuningModeChange) onTuningModeChange('offset');
            } else {
              if (originalServerOpacity !== null && grid) {
                grid.setGridOpacity(originalServerOpacity);
              }
              setOriginalServerOpacity(null);
              if (originalTuning && grid) {
                grid.setOffset({ x: originalTuning.offsetX, y: originalTuning.offsetY });
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
        {isDimensionsExpanded && activeMap && grid && (
          <div className="ml-4 mb-6">
            <div className="mb-3">
              <label className="block text-xs text-gray-400 mb-1">
                Cell Size: {grid.cellSize}px · Grid: {grid.gridCols}×{grid.gridRows} cells
              </label>
              <input
                type="range"
                min="8"
                max="250"
                step="0.5"
                value={grid.cellSize}
                onChange={(e) => grid.setCellSize(parseFloat(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>Small (8px)</span>
                <span>Medium</span>
                <span>Large (250px)</span>
              </div>
            </div>

            <div className="mb-3">
              <label className="block text-xs text-gray-400 mb-1">
                Grid Opacity: {(grid.gridOpacity * 100).toFixed(0)}%
              </label>
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.1"
                value={grid.gridOpacity}
                onChange={(e) => {
                  grid.setGridOpacity(parseFloat(e.target.value));
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
                  value={grid.gridColor}
                  readOnly
                  style={{
                    color: 'transparent',
                    textIndent: '-9999px',
                    backgroundColor: grid.gridColor,
                    borderColor: grid.gridColor,
                  }}
                />
                <span className="text-xs text-gray-500">{grid.gridColor}</span>
              </div>
            </div>

            <div className="mb-3">
              <div className="text-xs text-gray-400 mb-1">
                Grid Offset: X {grid.offset.x}px / Y {grid.offset.y}px
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

      {/* Fog of War — collapsible, DM-only, requires an active map */}
      {fog && activeMap && (
        <>
          <button
            className={DM_CHILD}
            onClick={() => setIsFogExpanded(prev => !prev)}
            aria-expanded={isFogExpanded}
          >
            <div className="flex items-center justify-between">
              <span>☁️  Fog of War</span>
              <span className={DM_ARROW}>{isFogExpanded ? '▼' : '▶'}</span>
            </div>
          </button>
          {isFogExpanded && (
            <div className="ml-2 mr-2 mb-3 p-3 bg-rose-950/30 border border-rose-400/30 rounded space-y-3">
              <RegionListPanel
                regions={fog.regions}
                activeId={fog.activeId}
                maxRegions={fog.maxRegions}
                onSetActive={fog.setActiveRegion}
                onAddRegion={fog.addRegion}
                onDeleteRegion={fog.deleteRegion}
                onRenameRegion={(id, name) => fog.updateRegion(id, { name })}
                onToggleEnabled={fog.setRegionEnabled}
              />
              {fog.activeRegion && (
                <RegionParamsEditor
                  region={fog.activeRegion}
                  onChange={(field, value) =>
                    fog.updateRegion(fog.activeId, { [field]: value })
                  }
                />
              )}
              <div className="text-[11px] uppercase tracking-wider text-rose-200/70">
                {fog.mode === 'paint' ? 'Painting fog' : 'Revealing (erasing fog)'}
                {fog.activeRegion && (
                  <span className="ml-1.5 text-content-on-dark normal-case font-normal">
                    in <em>{fog.activeRegion.name}</em>
                  </span>
                )}
              </div>
              <label className="flex items-center gap-2 text-xs text-rose-100/90 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={fogPeekThrough}
                  onChange={(e) => setFogPeekThrough?.(e.target.checked)}
                  className="cursor-pointer"
                />
                <span>Peek through fog (DM only, 50% opacity)</span>
              </label>
              <FogPaintControls
                paintMode={fogPaintMode}
                onPaintModeToggle={setFogPaintMode}
                mode={fog.mode}
                onModeChange={fog.setMode}
                brushSize={fog.brushSize}
                onBrushSizeChange={fog.setBrushSize}
                isDirty={fog.isDirty}
                onClear={fog.clear}
                onFillAll={fog.fillAll}
                onUpdate={onFogUpdate}
                onResetToServer={() => {
                  // Reload all regions from the last-known server state via
                  // the multi-region hydrator — each engine's mask is
                  // restored from the asset's saved fog_config.
                  fog.loadFromConfig(activeMap?.map_config?.fog_config);
                }}
              />
              <div className="text-[10px] text-rose-200/60 mt-2">
                Click <em>Update fog</em> to broadcast your changes. Players
                see the new fog atomically — no flicker on the swap.
              </div>
              {onFogClearBroadcast && (
                <button
                  type="button"
                  onClick={onFogClearBroadcast}
                  className="mt-2 w-full text-xs rounded px-2 py-1.5 border bg-rose-900/30 border-rose-400/40 text-rose-200 hover:brightness-125"
                >
                  Clear &amp; broadcast (reveal map for everyone)
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
