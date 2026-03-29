/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useState, useEffect, useCallback, useMemo } from 'react';
import { authFetch } from '@/app/shared/utils/authFetch';
import AssetPicker from './AssetPicker';
import WorkshopGridControls from './WorkshopGridControls';
import { MapDisplay } from '@/app/map_management';
import { useGridConfig } from '@/app/map_management/hooks/useGridConfig';
import { useUpdateGridConfig } from '../hooks/useUpdateGridConfig';

/**
 * Fetch a single asset by ID with full type-specific fields.
 */
async function fetchAssetById(assetId) {
  const response = await authFetch(`/api/library/${assetId}`, { method: 'GET' });
  if (!response.ok) return null;
  return response.json();
}

export default function MapGridTool({ selectedAssetId, onAssetSelect }) {
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [loadingAsset, setLoadingAsset] = useState(false);
  const [naturalDimensions, setNaturalDimensions] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const grid = useGridConfig();
  const updateMutation = useUpdateGridConfig();

  // Fetch and init grid when the URL-driven selectedAssetId changes
  useEffect(() => {
    if (!selectedAssetId) {
      setSelectedAsset(null);
      setNaturalDimensions(null);
      setSaveSuccess(false);
      updateMutation.reset();
      return;
    }

    // Skip if we already have this asset loaded
    if (selectedAsset?.id === selectedAssetId) return;

    let cancelled = false;

    async function loadAsset() {
      setLoadingAsset(true);
      setNaturalDimensions(null);
      setSaveSuccess(false);
      updateMutation.reset();

      const assetData = await fetchAssetById(selectedAssetId);
      if (cancelled) return;

      if (!assetData) {
        setLoadingAsset(false);
        return;
      }

      setSelectedAsset(assetData);

      grid.initFromConfig({
        grid_width: assetData.grid_width,
        grid_height: assetData.grid_height,
        grid_cell_size: assetData.grid_cell_size,
        grid_offset_x: assetData.grid_offset_x,
        grid_offset_y: assetData.grid_offset_y,
        grid_opacity: assetData.grid_opacity,
        grid_line_color: assetData.grid_line_color,
      });

      setLoadingAsset(false);
    }

    loadAsset();
    return () => { cancelled = true; };
  }, [selectedAssetId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Recompute default cell size when natural dimensions arrive (if no stored value)
  useEffect(() => {
    if (!naturalDimensions || !selectedAsset) return;
    if (selectedAsset.grid_cell_size) return;
    grid.initFromConfig({
      grid_width: selectedAsset.grid_width,
      grid_height: selectedAsset.grid_height,
      grid_offset_x: selectedAsset.grid_offset_x,
      grid_offset_y: selectedAsset.grid_offset_y,
      grid_opacity: selectedAsset.grid_opacity,
      grid_line_color: selectedAsset.grid_line_color,
    }, naturalDimensions);
  }, [naturalDimensions]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = useCallback(async () => {
    if (!selectedAsset) return;
    setSaveSuccess(false);
    try {
      const updatedAsset = await updateMutation.mutateAsync({
        assetId: selectedAsset.id,
        gridConfig: grid.toFlatConfig(),
      });
      setSelectedAsset(prev => ({ ...prev, ...updatedAsset }));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      // Error is available via updateMutation.error
    }
  }, [selectedAsset, grid, updateMutation]);

  // Stable reference — only changes when the actual asset changes, not on every grid nudge.
  // Grid config is passed separately via the gridConfig prop.
  const activeMapForDisplay = useMemo(() => {
    if (!selectedAsset) return null;
    return { file_path: selectedAsset.s3_url };
  }, [selectedAsset?.s3_url]);

  return (
    <div className="flex flex-col h-full">
      {/* Map Preview + Controls (when asset selected) */}
      {loadingAsset ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-sm text-content-secondary">Loading map config...</div>
        </div>
      ) : selectedAsset ? (
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
        /* Asset grid — shows when no asset is selected */
        <AssetPicker
          assetType="map"
          onSelect={(assetId) => onAssetSelect(assetId)}
        />
      )}
    </div>
  );
}
