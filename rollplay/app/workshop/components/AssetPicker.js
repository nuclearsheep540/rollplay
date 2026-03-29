/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { useEffect, useRef } from 'react';
import { useAssets } from '@/app/asset_library/hooks/useAssets';

export default function AssetPicker({ assetType, selectedAssetId, onSelect }) {
  const { data: assets = [], isLoading } = useAssets({ assetType });
  const autoSelectedRef = useRef(null);

  // Auto-select: when assets load and a selectedAssetId is present (deep-link),
  // push the full asset object to the parent so it can initialize properly.
  useEffect(() => {
    if (!selectedAssetId || assets.length === 0) return;
    if (autoSelectedRef.current === selectedAssetId) return; // already fired
    const match = assets.find(a => a.id === selectedAssetId);
    if (match) {
      autoSelectedRef.current = selectedAssetId;
      onSelect(match);
    }
  }, [selectedAssetId, assets]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) {
    return <div className="text-sm text-content-secondary py-2">Loading assets...</div>;
  }

  if (assets.length === 0) {
    return (
      <div className="text-sm text-content-secondary py-2">
        No {assetType} assets found. Upload some in the Library tab.
      </div>
    );
  }

  const selected = assets.find(a => a.id === selectedAssetId);

  // Compact selected state with change button
  if (selected) {
    return (
      <div className="flex items-center gap-3 py-2">
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-content-on-dark truncate block">
            {selected.filename}
          </span>
          <span className="text-xs text-content-secondary capitalize">{selected.asset_type}</span>
        </div>
        <button
          onClick={() => {
            autoSelectedRef.current = null;
            onSelect(null);
          }}
          className="px-3 py-1 text-xs rounded-sm border border-border text-content-secondary hover:text-content-on-dark hover:border-border-active transition-all"
        >
          Change
        </button>
      </div>
    );
  }

  // Asset list for selection
  return (
    <div className="max-h-48 overflow-y-auto space-y-1 bg-surface-secondary rounded-sm p-2">
      {assets.map((asset) => (
        <button
          key={asset.id}
          onClick={() => onSelect(asset)}
          className="w-full text-left px-3 py-2 rounded-sm text-sm hover:bg-surface-elevated transition-colors flex items-center gap-2"
        >
          <span className="truncate text-content-on-dark">{asset.filename}</span>
        </button>
      ))}
    </div>
  );
}
