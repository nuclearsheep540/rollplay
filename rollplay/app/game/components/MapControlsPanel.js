/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import React, { useState, useEffect, useMemo } from 'react';
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
}) {
  // Grid size slider (cells on shorter image edge - always produces square cells)
  const [gridSize, setGridSize] = useState(10);
  const [isDimensionsExpanded, setIsDimensionsExpanded] = useState(true);

  // Image dimensions for auto-calculating square grid
  const [imageDimensions, setImageDimensions] = useState(null);

  // Store original server opacity when entering edit mode
  const [originalServerOpacity, setOriginalServerOpacity] = useState(null);

  // State for map selection inline section
  const [isMapExpanded, setIsMapExpanded] = useState(true);

  // Load image dimensions when map changes
  useEffect(() => {
    if (!activeMap?.file_path) {
      setImageDimensions(null);
      return;
    }

    const img = new Image();
    img.onload = () => {
      setImageDimensions({
        width: img.naturalWidth,
        height: img.naturalHeight
      });
      console.log('📏 Loaded image dimensions:', img.naturalWidth, 'x', img.naturalHeight);
    };
    img.onerror = () => {
      setImageDimensions(null);
      console.warn('📏 Failed to load image for grid calculation');
    };
    img.src = activeMap.file_path;
  }, [activeMap?.file_path]);

  // Calculate grid dimensions to ensure square cells
  const calculatedGrid = useMemo(() => {
    if (!imageDimensions) return { width: gridSize, height: gridSize };

    const { width: imgW, height: imgH } = imageDimensions;
    const isLandscape = imgW >= imgH;

    if (isLandscape) {
      // Height is shorter edge
      const gridHeight = gridSize;
      const gridWidth = Math.round(gridSize * imgW / imgH);
      return { width: gridWidth, height: gridHeight };
    } else {
      // Width is shorter edge
      const gridWidth = gridSize;
      const gridHeight = Math.round(gridSize * imgH / imgW);
      return { width: gridWidth, height: gridHeight };
    }
  }, [imageDimensions, gridSize]);

  // Sync slider with loaded grid config
  useEffect(() => {
    const gridConfig = activeMap?.grid_config;

    if (gridConfig && imageDimensions) {
      // Calculate what gridSize would produce this config
      const { width: imgW, height: imgH } = imageDimensions;
      const isLandscape = imgW >= imgH;

      // Extract the shorter dimension as the gridSize
      const newSize = isLandscape ? gridConfig.grid_height : gridConfig.grid_width;
      setGridSize(newSize || 10);

      // Extract opacity from grid config (try both edit and display mode)
      const editOpacity = gridConfig.colors?.edit_mode?.opacity;
      const displayOpacity = gridConfig.colors?.display_mode?.opacity;
      const configOpacity = editOpacity || displayOpacity || 0.2;
      if (setLiveGridOpacity) {
        setLiveGridOpacity(configOpacity);
      }

      console.log('🎯 Synced slider with atomic map grid config:', {
        gridSize: newSize,
        opacity: configOpacity,
        filename: activeMap.filename
      });
    } else if (!activeMap || activeMap.grid_config === null) {
      // Reset to defaults when no map or no grid config
      setGridSize(10);
      if (setLiveGridOpacity) {
        setLiveGridOpacity(0.2);
      }
      console.log('🎯 Reset slider to defaults (no active map or grid config)');
    }
  }, [activeMap, imageDimensions]);

  // Live preview: update grid overlay when dimensions or opacity change during edit mode
  useEffect(() => {
    if (!isDimensionsExpanded || !handleGridChange) return;

    const previewConfig = {
      grid_width: calculatedGrid.width,
      grid_height: calculatedGrid.height,
      enabled: true,
      colors: {
        edit_mode: {
          line_color: "#d1d5db",
          opacity: liveGridOpacity,
          line_width: 1
        },
        display_mode: {
          line_color: "#d1d5db",
          opacity: liveGridOpacity,
          line_width: 1
        }
      }
    };

    handleGridChange(previewConfig);
    console.log('🎯 Live preview updated:', previewConfig);
  }, [calculatedGrid, liveGridOpacity, isDimensionsExpanded, handleGridChange]);

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

  // Create grid configuration from dimensions (pure dimensional grid)
  const createGridFromDimensions = (gridWidth, gridHeight) => {
    return {
      grid_width: gridWidth,
      grid_height: gridHeight,
      enabled: true,
      colors: {
        edit_mode: {
          line_color: "#d1d5db",
          opacity: liveGridOpacity,
          line_width: 1
        },
        display_mode: {
          line_color: "#d1d5db",
          opacity: liveGridOpacity,
          line_width: 1
        }
      }
    };
  };

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

  // Apply grid dimensions to current map via HTTP API (server authoritative)
  const applyGridDimensions = async () => {
    if (!activeMap) {
      console.error('🎯 Cannot apply grid - no active map');
      return;
    }

    console.log('🎯 Applying grid dimensions via HTTP API - activeMap:', activeMap);
    console.log('🎯 activeMap.filename:', activeMap.filename);

    const newGridConfig = createGridFromDimensions(
      calculatedGrid.width,
      calculatedGrid.height
    );

    console.log('🎯 Created new grid config (square cells):', newGridConfig);

    try {
      // Send COMPLETE updated map via HTTP API (atomic)
      // Remove MongoDB _id field to avoid immutable field error
      const { _id, ...mapWithoutId } = activeMap;
      const updatedMap = {
        ...mapWithoutId,
        grid_config: newGridConfig
      };

      const response = await fetch(`/api/game/${roomId}/map`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          map: updatedMap,
          updated_by: 'dm'
        })
      });

      if (response.ok) {
        const result = await response.json();
        console.log('🎯 ✅ Grid config updated successfully via HTTP API:', result);

        // Also persist grid config to MapAsset in PostgreSQL for cross-session reuse
        if (activeMap.asset_id) {
          try {
            const assetResponse = await fetch(`/api/library/assets/${activeMap.asset_id}/grid`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
              },
              credentials: 'include',
              body: JSON.stringify({
                grid_width: calculatedGrid.width,
                grid_height: calculatedGrid.height,
                grid_opacity: liveGridOpacity
              })
            });

            if (assetResponse.ok) {
              console.log('🎯 ✅ Grid config persisted to MapAsset in PostgreSQL');
            } else {
              console.warn('🎯 ⚠️ Failed to persist grid config to MapAsset:', await assetResponse.text());
            }
          } catch (assetError) {
            console.warn('🎯 ⚠️ Error persisting grid config to MapAsset:', assetError);
          }
        }
      } else {
        const error = await response.text();
        console.error('🎯 ❌ Failed to update grid config via HTTP API:', error);
        alert('Failed to update grid configuration. Please try again.');
      }
    } catch (error) {
      console.error('🎯 ❌ Error updating grid config via HTTP API:', error);
      alert('Failed to update grid configuration. Please try again.');
    }

    console.log('🎯 Applied grid dimensions:', calculatedGrid, 'resulting config:', newGridConfig);
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col scrollbar-thin scrollbar-track-white/5 scrollbar-thumb-purple-500/30 hover:scrollbar-thumb-purple-500/50">
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
            if (setGridEditMode) {
              setGridEditMode(newExpanded);
            }
            if (newExpanded && originalServerOpacity === null) {
              setOriginalServerOpacity(liveGridOpacity);
            } else if (!newExpanded && originalServerOpacity !== null) {
              if (setLiveGridOpacity) {
                setLiveGridOpacity(originalServerOpacity);
              }
              setOriginalServerOpacity(null);
            }
          }}
          disabled={!activeMap}
        >
          <span className={`${DM_ARROW} transform transition-transform ${isDimensionsExpanded ? 'rotate-180' : ''}`}>
            ▼
          </span>
          📐 {isDimensionsExpanded ? 'Exit Grid Edit' : 'Edit Grid'}
        </button>

        {/* Grid Size Slider (expandable) */}
        {isDimensionsExpanded && activeMap && (
          <div className="ml-4 mb-6">
            <div className="mb-3">
              <label className="block text-xs text-gray-400 mb-1">
                Grid Size: {calculatedGrid.width}×{calculatedGrid.height} cells (square)
              </label>
              <input
                type="range"
                min="4"
                max="40"
                step="1"
                value={gridSize}
                onChange={(e) => setGridSize(parseInt(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>Large (4)</span>
                <span>Medium</span>
                <span>Small (40)</span>
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

            <button
              className={DM_CHILD_LAST}
              onClick={applyGridDimensions}
            >
              ✨ Apply {calculatedGrid.width}×{calculatedGrid.height} Grid
            </button>

            {activeMap && (
              <div className="text-xs text-gray-400 mt-2">
                <ImageDimensions activeMap={activeMap} />
              </div>
            )}
          </div>
        )}
    </div>
  );
}
