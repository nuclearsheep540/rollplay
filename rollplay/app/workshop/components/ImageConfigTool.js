/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useState, useEffect, useMemo, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExpand } from '@fortawesome/free-solid-svg-icons';
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
  const [imagePositionX, setImagePositionX] = useState(null);
  const [imagePositionY, setImagePositionY] = useState(null);
  const [cineConfig, setCineConfig] = useState(null);

  const [fullscreenPreview, setFullscreenPreview] = useState(false);
  const updateMutation = useUpdateImageConfig();

  const handleFullscreenClose = useCallback(() => setFullscreenPreview(false), []);

  // Close fullscreen preview on Escape key
  useEffect(() => {
    if (!fullscreenPreview) return;
    const handleKeyDown = (e) => { if (e.key === 'Escape') setFullscreenPreview(false); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fullscreenPreview]);

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
      setImagePositionX(assetData.image_position_x ?? null);
      setImagePositionY(assetData.image_position_y ?? null);
      setCineConfig(assetData.cine_config || null);
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
          image_position_x: imagePositionX,
          image_position_y: imagePositionY,
          cine_config: cineConfig,
        },
      });
      setSelectedAsset(prev => ({ ...prev, ...updatedAsset }));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      // Error available via updateMutation.error
    }
  };

  // Build a preview activeImage object for ImageDisplay (nested shape)
  const previewImage = useMemo(() => {
    if (!selectedAsset) return null;
    return {
      image_config: {
        file_path: selectedAsset.s3_url,
        filename: selectedAsset.filename,
        original_filename: selectedAsset.filename,
        display_mode: cineConfig ? 'cine' : displayMode,
        aspect_ratio: (displayMode === 'letterbox' || displayMode === 'cine') ? aspectRatio : null,
        image_position_x: imagePositionX,
        image_position_y: imagePositionY,
        cine_config: cineConfig,
      },
    };
  }, [selectedAsset?.s3_url, selectedAsset?.filename, displayMode, aspectRatio, imagePositionX, imagePositionY, cineConfig]);

  // Track whether config has changed from saved state
  const hasChanges = selectedAsset && (
    displayMode !== (selectedAsset.display_mode || 'float')
    || aspectRatio !== (selectedAsset.aspect_ratio || null)
    || imagePositionX !== (selectedAsset.image_position_x ?? null)
    || imagePositionY !== (selectedAsset.image_position_y ?? null)
    || JSON.stringify(cineConfig) !== JSON.stringify(selectedAsset.cine_config || null)
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
          <div className="flex-1 min-w-0 relative rounded-sm overflow-hidden border border-border bg-surface-primary group">
            <ImageDisplay activeImage={previewImage} />
            <button
              onClick={() => setFullscreenPreview(true)}
              className="absolute top-2 right-2 z-20 p-2 rounded bg-black/50 text-white/70 hover:text-white hover:bg-black/70 transition-opacity opacity-0 group-hover:opacity-100"
              title="Fullscreen preview"
            >
              <FontAwesomeIcon icon={faExpand} className="text-sm" />
            </button>
          </div>

          {/* Fullscreen Preview Overlay — click anywhere to close */}
          {fullscreenPreview && (
            <div
              onClick={handleFullscreenClose}
              className="fixed inset-0 z-50 bg-black cursor-pointer"
            >
              <ImageDisplay activeImage={previewImage} />
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/40 text-xs pointer-events-none">
                Click anywhere to close
              </div>
            </div>
          )}

          {/* Controls Sidebar */}
          <div className="w-72 flex-shrink-0 overflow-y-auto">
            <ImageDisplayControls
              displayMode={displayMode}
              aspectRatio={aspectRatio}
              imagePositionX={imagePositionX}
              imagePositionY={imagePositionY}
              cineConfig={cineConfig}
              onDisplayModeChange={setDisplayMode}
              onAspectRatioChange={setAspectRatio}
              onImagePositionChange={(x, y) => { setImagePositionX(x); setImagePositionY(y); }}
              onCineConfigChange={setCineConfig}
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
