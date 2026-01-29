/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import React from 'react'
import { COLORS, THEME } from '@/app/styles/colorTheme'
import AssetCard from './AssetCard'

/**
 * Grid layout for displaying assets with loading and empty states
 */
export default function AssetGrid({ assets, loading, onDeleteAsset }) {
  // Loading skeleton
  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className="rounded-sm border overflow-hidden animate-pulse"
            style={{ backgroundColor: THEME.bgPanel, borderColor: THEME.borderDefault }}
          >
            <div className="aspect-video" style={{ backgroundColor: COLORS.onyx }} />
            <div className="p-3 space-y-2">
              <div className="h-4 rounded-sm w-3/4" style={{ backgroundColor: COLORS.graphite }} />
              <div className="h-3 rounded-sm w-1/2" style={{ backgroundColor: COLORS.graphite }} />
            </div>
          </div>
        ))}
      </div>
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
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
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
