/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCloudArrowUp } from '@fortawesome/free-solid-svg-icons';
import { useAssets } from '@/app/asset_library/hooks/useAssets';
import { useUploadAsset } from '@/app/asset_library/hooks/useUploadAsset';
import AssetCard from '@/app/asset_library/components/AssetCard';

// Content-type gate — mirrors the backend's valid set in MusicAsset.create.
const MUSIC_MIME_TYPES = new Set(['audio/mpeg', 'audio/wav', 'audio/ogg']);

export default function AssetPicker({ assetType, onSelect }) {
  const { data: assets = [], isLoading } = useAssets({ assetType });
  const uploadMutation = useUploadAsset();
  const fileInputRef = useRef(null);
  const [uploadError, setUploadError] = useState(null);

  const isMusic = assetType === 'music';
  const uploading = uploadMutation.isPending;

  const handlePickFile = () => {
    if (uploading) return;
    setUploadError(null);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    // Reset the input so selecting the same file again still triggers onChange
    event.target.value = '';
    if (!file) return;

    if (isMusic && !MUSIC_MIME_TYPES.has(file.type)) {
      setUploadError(`Unsupported file type: ${file.type || 'unknown'}. Use mp3, wav, or ogg.`);
      return;
    }

    try {
      const newAsset = await uploadMutation.mutateAsync({ file, assetType });
      // Auto-select the freshly-uploaded asset for the slot this picker was opened for
      if (newAsset?.id) onSelect(newAsset.id);
    } catch (err) {
      setUploadError(err?.message || 'Upload failed');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Upload controls — music-only, single-file */}
      {isMusic && (
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handlePickFile}
            disabled={uploading}
            className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-sm border border-border text-content-secondary hover:border-border-active hover:text-content-on-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <FontAwesomeIcon icon={faCloudArrowUp} className="text-[11px]" />
            {uploading ? `Uploading… ${uploadMutation.progress}%` : 'Click to upload'}
          </button>
          <span className="text-[10px] uppercase tracking-wider text-content-secondary">
            mp3, wav, or ogg — auto-assigned to this channel
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/mpeg,audio/wav,audio/ogg,.mp3,.wav,.ogg"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      )}

      {uploadError && (
        <div className="text-xs text-feedback-error">{uploadError}</div>
      )}

      {isLoading ? (
        <div className="text-sm text-content-secondary py-2">Loading assets...</div>
      ) : assets.length === 0 ? (
        <div className="text-sm text-content-secondary py-4">
          No {assetType} assets found.{isMusic ? ' Upload one above.' : ' Upload some in the Library tab.'}
        </div>
      ) : (
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}
        >
          {assets.map((asset) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              contextMenuItems={[]}
              onClick={() => onSelect(asset.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
