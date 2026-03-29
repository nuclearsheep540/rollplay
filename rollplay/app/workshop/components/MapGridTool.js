/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useState, useEffect, useCallback } from 'react';
import AssetPicker from './AssetPicker';
import WorkshopGridControls from './WorkshopGridControls';
import { MapDisplay } from '@/app/map_management';
import GridTuningOverlay from '@/app/map_management/components/GridTuningOverlay';
import { useGridConfig } from '@/app/map_management/hooks/useGridConfig';
import { useUpdateGridConfig } from '../hooks/useUpdateGridConfig';

export default function MapGridTool({ deepLinkAssetId, onDeepLinkConsumed }) {
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [naturalDimensions, setNaturalDimensions] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const grid = useGridConfig();
  const updateMutation = useUpdateGridConfig();

  // Handle deep-link: when an asset_id was passed via URL params
  // The AssetPicker will select it once assets load
  const [pendingDeepLinkId, setPendingDeepLinkId] = useState(deepLinkAssetId);

  useEffect(() => {
    if (deepLinkAssetId && onDeepLinkConsumed) {
      onDeepLinkConsumed();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Initialize grid state when an asset is selected
  useEffect(() => {
    if (!selectedAsset) return;
    grid.initFromConfig({
      grid_width: selectedAsset.grid_width,
      grid_height: selectedAsset.grid_height,
      grid_cell_size: selectedAsset.grid_cell_size,
      grid_offset_x: selectedAsset.grid_offset_x,
      grid_offset_y: selectedAsset.grid_offset_y,
      grid_opacity: selectedAsset.grid_opacity,
      grid_line_color: selectedAsset.grid_line_color,
    }, naturalDimensions);
  }, [selectedAsset?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Recompute default cell size when natural dimensions arrive (if no stored value)
  useEffect(() => {
    if (!naturalDimensions || !selectedAsset) return;
    if (selectedAsset.grid_cell_size) return; // already have a stored value
    grid.initFromConfig({
      grid_width: selectedAsset.grid_width,
      grid_height: selectedAsset.grid_height,
      grid_offset_x: selectedAsset.grid_offset_x,
      grid_offset_y: selectedAsset.grid_offset_y,
      grid_opacity: selectedAsset.grid_opacity,
      grid_line_color: selectedAsset.grid_line_color,
    }, naturalDimensions);
  }, [naturalDimensions]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAssetSelect = useCallback((asset) => {
    setSelectedAsset(asset);
    setNaturalDimensions(null);
    setSaveSuccess(false);
    updateMutation.reset();
    if (asset) setPendingDeepLinkId(null);
  }, [updateMutation]);

  const handleSave = useCallback(async () => {
    if (!selectedAsset) return;
    setSaveSuccess(false);
    try {
      await updateMutation.mutateAsync({
        assetId: selectedAsset.id,
        gridConfig: grid.toFlatConfig(),
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      // Error is available via updateMutation.error
    }
  }, [selectedAsset, grid, updateMutation]);

  // Build activeMap shape that MapDisplay expects
  const activeMapForDisplay = selectedAsset ? {
    file_path: selectedAsset.s3_url,
    grid_config: grid.effectiveGridConfig,
  } : null;

  return (
    <div className="flex flex-col h-full">
      {/* Asset Picker */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-content-on-dark mb-2">Select Map</label>
        <AssetPicker
          assetType="map"
          selectedAssetId={selectedAsset?.id || pendingDeepLinkId}
          onSelect={handleAssetSelect}
        />
      </div>

      {/* Map Preview + Controls */}
      {selectedAsset ? (
        <div className="flex-1 min-h-0 flex gap-6">
          {/* Map Preview Area */}
          <div className="flex-1 min-w-0 relative rounded-sm overflow-hidden border border-border bg-surface-primary">
            <MapDisplay
              activeMap={activeMapForDisplay}
              isEditMode={true}
              gridConfig={grid.effectiveGridConfig}
              liveGridOpacity={grid.gridOpacity}
              offsetX={grid.offset.x}
              offsetY={grid.offset.y}
              onImageLoad={setNaturalDimensions}
            />
            {/* D-pad overlay for offset/size tuning */}
            <GridTuningOverlay
              onOffsetXChange={(delta) => grid.adjustOffset(delta, 0)}
              onOffsetYChange={(delta) => grid.adjustOffset(0, delta)}
              onCellSizeChange={(delta) => grid.adjustCellSize(delta)}
              onColChange={(delta) => grid.adjustGridCols(delta)}
              onRowChange={(delta) => grid.adjustGridRows(delta)}
            />
          </div>

          {/* Grid Controls Sidebar */}
          <div className="w-72 flex-shrink-0">
            <WorkshopGridControls
              grid={grid}
              onSave={handleSave}
              isSaving={updateMutation.isPending}
              saveSuccess={saveSuccess}
              error={updateMutation.error?.message}
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center py-16 text-center">
          <div className="text-6xl mb-4 opacity-30">{'\uD83D\uDDFA\uFE0F'}</div>
          <h3 className="text-lg font-medium mb-2 text-content-on-dark">
            Select a Map
          </h3>
          <p className="max-w-sm text-content-secondary">
            Choose a map from your library to configure its grid overlay.
          </p>
        </div>
      )}
    </div>
  );
}
