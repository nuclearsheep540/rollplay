/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useState, useEffect, useMemo } from 'react';
import { authFetch } from '@/app/shared/utils/authFetch';
import AssetPicker from './AssetPicker';
import ImageDisplayControls from './ImageDisplayControls';
import { ImageDisplay } from '@/app/map_management';
import { useUpdateImageConfig } from '../hooks/useUpdateImageConfig';

async function fetchAssetById(assetId) {
  const response = await authFetch(`/api/library/${assetId}`, { method: 'GET' });
  if (!response.ok) return null;
  return response.json();
}

export default function ImageConfigTool({ selectedAssetId, onAssetSelect }) {
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [loadingAsset, setLoadingAsset] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Local draft state for config editing
  const [displayMode, setDisplayMode] = useState('float');
  const [aspectRatio, setAspectRatio] = useState(null);

  const updateMutation = useUpdateImageConfig();

  // Fetch asset when URL-driven selectedAssetId changes
  useEffect(() => {
    if (!selectedAssetId) {
      setSelectedAsset(null);
      setSaveSuccess(false);
      updateMutation.reset();
      return;
    }

    if (selectedAsset?.id === selectedAssetId) return;

    let cancelled = false;

    async function loadAsset() {
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
      setDisplayMode(assetData.display_mode || 'float');
      setAspectRatio(assetData.aspect_ratio || null);
      setLoadingAsset(false);
    }

    loadAsset();
    return () => { cancelled = true; };
  }, [selectedAssetId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    if (!selectedAsset) return;
    setSaveSuccess(false);
    try {
      const updatedAsset = await updateMutation.mutateAsync({
        assetId: selectedAsset.id,
        imageConfig: {
          display_mode: displayMode,
          aspect_ratio: (displayMode === 'letterbox' || displayMode === 'cine') ? aspectRatio : null,
        },
      });
      setSelectedAsset(prev => ({ ...prev, ...updatedAsset }));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      // Error available via updateMutation.error
    }
  };

  // Build a preview activeImage object for ImageDisplay
  const previewImage = useMemo(() => {
    if (!selectedAsset) return null;
    return {
      file_path: selectedAsset.s3_url,
      filename: selectedAsset.filename,
      original_filename: selectedAsset.filename,
      display_mode: displayMode,
      aspect_ratio: (displayMode === 'letterbox' || displayMode === 'cine') ? aspectRatio : null,
    };
  }, [selectedAsset?.s3_url, selectedAsset?.filename, displayMode, aspectRatio]);

  // Track whether config has changed from saved state
  const hasChanges = selectedAsset && (
    displayMode !== (selectedAsset.display_mode || 'float')
    || aspectRatio !== (selectedAsset.aspect_ratio || null)
  );

  return (
    <div className="flex flex-col h-full">
      {loadingAsset ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-sm text-content-secondary">Loading image config...</div>
        </div>
      ) : selectedAsset ? (
        <div className="flex-1 min-h-0 flex gap-6">
          {/* Image Preview Area */}
          <div className="flex-1 min-w-0 relative rounded-sm overflow-hidden border border-border bg-surface-primary">
            <ImageDisplay activeImage={previewImage} />
          </div>

          {/* Controls Sidebar */}
          <div className="w-72 flex-shrink-0">
            <ImageDisplayControls
              displayMode={displayMode}
              aspectRatio={aspectRatio}
              onDisplayModeChange={setDisplayMode}
              onAspectRatioChange={setAspectRatio}
              onSave={handleSave}
              isSaving={updateMutation.isPending}
              saveSuccess={saveSuccess}
              hasChanges={hasChanges}
              error={updateMutation.error?.message}
            />
          </div>
        </div>
      ) : (
        <AssetPicker
          assetType="image"
          onSelect={(assetId) => onAssetSelect(assetId)}
        />
      )}
    </div>
  );
}
