/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { useAssets } from '@/app/asset_library/hooks/useAssets';
import AssetCard from '@/app/asset_library/components/AssetCard';

export default function AssetPicker({ assetType, onSelect }) {
  const { data: assets = [], isLoading } = useAssets({ assetType });

  if (isLoading) {
    return <div className="text-sm text-content-secondary py-2">Loading assets...</div>;
  }

  if (assets.length === 0) {
    return (
      <div className="text-sm text-content-secondary py-4">
        No {assetType} assets found. Upload some in the Library tab.
      </div>
    );
  }

  return (
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
  );
}
