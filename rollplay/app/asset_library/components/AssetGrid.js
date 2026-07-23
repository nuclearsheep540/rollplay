/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import React from 'react'
import AssetCard from './AssetCard'
import { useLoadMoreSentinel } from '../hooks/useLoadMoreSentinel'

/**
 * Grid layout for displaying assets with empty state.
 *
 * Lazy pagination: when hasMore is set, a full-width sentinel below the
 * cards calls onLoadMore as it nears the scroll container's edge, so the
 * next page is revealed before the user hits the bottom.
 */
export default function AssetGrid({
  assets,
  getContextMenuItems,
  onAssetClick,
  onToggleFavorite,
  onTagClick,
  activeTags = [],
  selectable = false,
  selectedIds = null,
  columns = 4,
  hasMore = false,
  onLoadMore = null,
  scrollRootRef = null,
}) {
  const sentinelRef = useLoadMoreSentinel({
    assets, hasMore, onLoadMore, scrollRootRef, rootMargin: '400px',
  })

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
          onToggleFavorite={onToggleFavorite}
          onTagClick={onTagClick}
          activeTags={activeTags}
          selectable={selectable}
          selected={selectedIds?.has(asset.id) || false}
        />
      ))}
      {hasMore && (
        <div ref={sentinelRef} className="col-span-full h-px" aria-hidden="true" />
      )}
    </div>
  )
}
