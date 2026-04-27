/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useEffect, useMemo, useState } from 'react';
import { authFetch } from '@/app/shared/utils/authFetch';
import AssetPicker from './AssetPicker';
import { MapDisplay } from '@/app/map_management';
import { useFogEngine, FogPaintControls } from '@/app/fog_management';
import { useUpdateFogConfig } from '../hooks/useUpdateFogConfig';

async function fetchAssetById(assetId) {
  const response = await authFetch(`/api/library/${assetId}`, { method: 'GET' });
  if (!response.ok) return null;
  return response.json();
}

/**
 * FogMaskTool — workshop preparation tool for fog of war.
 *
 * Mirrors MapGridTool's shape: pick a map → preview it with FogCanvasLayer
 * mounted via MapDisplay → paint with FogPaintControls → PATCH /fog to
 * persist. Reuses the same FogEngine class and components as the in-game
 * DM panel — only the persistence path differs (REST vs WebSocket).
 */
export default function FogMaskTool({ selectedAssetId, onAssetSelect }) {
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [loadingAsset, setLoadingAsset] = useState(false);
  const [paintMode, setPaintMode] = useState(true); // workshop is for painting
  const [saveSuccess, setSaveSuccess] = useState(false);

  const fog = useFogEngine();
  const updateMutation = useUpdateFogConfig();

  // Load the asset and seed the engine with any persisted fog
  useEffect(() => {
    if (!selectedAssetId) {
      setSelectedAsset(null);
      setSaveSuccess(false);
      updateMutation.reset();
      return;
    }
    if (selectedAsset?.id === selectedAssetId) return;

    let cancelled = false;
    async function load() {
      setLoadingAsset(true);
      setSaveSuccess(false);
      updateMutation.reset();

      const assetData = await fetchAssetById(selectedAssetId);
      if (cancelled) return;

      if (!assetData) {
        setLoadingAsset(false);
        return;
      }
      setSelectedAsset(assetData);

      // Seed engine from persisted fog (if any). Spread-don't-reconstruct:
      // mask is the only field we touch directly; everything else just
      // round-trips through the engine.
      if (assetData.fog_config?.mask) {
        await fog.loadDataUrl(assetData.fog_config.mask);
      } else {
        await fog.loadDataUrl(null);
      }

      setLoadingAsset(false);
    }
    load();
    return () => { cancelled = true; };
  }, [selectedAssetId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    if (!selectedAsset || !fog.engine) return;
    setSaveSuccess(false);
    try {
      const updatedAsset = await updateMutation.mutateAsync({
        assetId: selectedAsset.id,
        fogConfig: fog.serialize(),
      });
      setSelectedAsset(prev => ({ ...prev, ...updatedAsset }));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      // surfaced via updateMutation.error
    }
  };

  const handleResetToServer = async () => {
    const remoteMask = selectedAsset?.fog_config?.mask;
    await fog.loadDataUrl(remoteMask || null);
  };

  // Stable reference — only changes when the actual asset identity/url
  // changes, not on every brush stroke. Mirror MapGridTool's pattern.
  const activeMapForDisplay = useMemo(() => {
    if (!selectedAsset) return null;
    return {
      filename: selectedAsset.filename,
      map_config: {
        file_path: selectedAsset.s3_url,
        file_size: selectedAsset.file_size,
        asset_id: selectedAsset.id,
        filename: selectedAsset.filename,
      },
    };
  }, [selectedAsset?.s3_url, selectedAsset?.file_size, selectedAsset?.id, selectedAsset?.filename]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col h-full">
      {loadingAsset ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-sm text-content-secondary">Loading fog mask...</div>
        </div>
      ) : selectedAsset ? (
        <div className="flex-1 min-h-0 flex gap-6">
          {/* Preview area — MapDisplay hosts the fog canvas overlay */}
          <div className="flex-1 min-w-0 relative rounded-sm overflow-hidden border border-border bg-surface-primary">
            <MapDisplay
              activeMap={activeMapForDisplay}
              showGrid={false}
              isMapLocked={paintMode}
              fogEngine={fog.engine}
              fogPaintMode={paintMode}
            />
          </div>

          {/* Controls sidebar */}
          <div className="w-72 flex-shrink-0">
            <div className="p-4 bg-surface-secondary border border-border rounded-sm">
              <h3 className="text-sm font-semibold text-content-on-dark mb-3">Fog of War</h3>
              <FogPaintControls
                paintMode={paintMode}
                onPaintModeToggle={setPaintMode}
                mode={fog.mode}
                onModeChange={fog.setMode}
                brushSize={fog.brushSize}
                onBrushSizeChange={fog.setBrushSize}
                isDirty={fog.isDirty}
                onClear={fog.clear}
                onFillAll={fog.fillAll}
                onUpdate={handleSave}
                onResetToServer={handleResetToServer}
                disabled={updateMutation.isPending}
              />

              {saveSuccess && (
                <div className="mt-3 text-xs text-emerald-300">
                  ✓ Fog mask saved to map asset.
                </div>
              )}
              {updateMutation.error && (
                <div className="mt-3 text-xs text-rose-300">
                  {updateMutation.error.message}
                </div>
              )}
              <p className="mt-4 text-[11px] text-content-secondary">
                Painted fog persists on this map and is restored on the next
                live session. While a session is active, edit fog in-game from
                the DM map panel instead.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <AssetPicker
          assetType="map"
          onSelect={(assetId) => onAssetSelect(assetId)}
        />
      )}
    </div>
  );
}
