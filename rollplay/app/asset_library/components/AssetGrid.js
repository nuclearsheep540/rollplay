/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import React from 'react'
import AssetCard from './AssetCard'

/**
 * Grid layout for displaying assets with empty state
 */
export default function AssetGrid({ assets, loading, getContextMenuItems, onAssetClick, columns = 4 }) {
  if (loading) {
    return null
  }

  // Empty state
  if (!assets || assets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="text-6xl mb-4 opacity-30">{'\uD83D\uDCC1'}</div>
        <h3 className="text-lg font-medium mb-2 text-content-on-dark">
          No assets yet
        </h3>
        <p className="max-w-sm text-content-secondary">
          Upload maps, audio, or images to use in your game sessions. Click the &quot;Upload Asset&quot; button above to get started.
        </p>
      </div>
    )
  }

  // Asset grid
  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {assets.map((asset) => (
        <AssetCard
          key={asset.id}
          asset={asset}
          contextMenuItems={getContextMenuItems(asset)}
          onClick={() => onAssetClick?.(asset)}
        />
      ))}
    </div>
  )
}
