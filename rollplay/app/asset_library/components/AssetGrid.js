/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import React from 'react'
import { COLORS, THEME } from '@/app/styles/colorTheme'
import AssetCard from './AssetCard'

/**
 * Grid layout for displaying assets with loading and empty states
 */
export default function AssetGrid({ assets, loading, onDeleteAsset, columns = 4 }) {
  // Loading skeleton
  if (loading) {
    return (
      null
    )
  }

  // Empty state
  if (!assets || assets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="text-6xl mb-4 opacity-30">📁</div>
        <h3 className="text-lg font-medium mb-2" style={{ color: THEME.textOnDark }}>
          No assets yet
        </h3>
        <p className="max-w-sm" style={{ color: THEME.textSecondary }}>
          Upload maps, audio, or images to use in your game sessions. Click the "Upload Asset" button above to get started.
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
          onDelete={onDeleteAsset}
        />
      ))}
    </div>
  )
}
