/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import React, { useEffect, useRef } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faStar, faCheck, faSort, faSortUp, faSortDown } from '@fortawesome/free-solid-svg-icons'
import { faStar as faStarOutline } from '@fortawesome/free-regular-svg-icons'
import ContextMenu from '@/app/shared/components/ContextMenu'
import Badge from '@/app/shared/components/Badge'
import AudioWaveThumb from './AudioWaveThumb'
import { formatFileSize, formatDate } from './AssetCard'

// Shared column template so the header and rows always line up.
const ROW_GRID = 'grid grid-cols-[4.5rem_minmax(0,2fr)_5.5rem_minmax(0,2fr)_5rem_6rem_6.5rem_2.5rem] items-center gap-3'

// Header columns; sortKey null = not sortable (thumb, tags, star)
const COLUMNS = [
  { sortKey: null, label: '' },
  { sortKey: 'name', label: 'Name' },
  { sortKey: 'type', label: 'Type' },
  { sortKey: null, label: 'Tags' },
  { sortKey: 'size', label: 'Size' },
  { sortKey: 'campaigns', label: 'Campaigns' },
  { sortKey: 'added', label: 'Added' },
  { sortKey: null, label: '' },
]

function sortIcon(sort, sortKey) {
  if (sort?.key !== sortKey) return faSort
  return sort.dir === 'asc' ? faSortUp : faSortDown
}

/**
 * Dense list view of assets - one row per asset with thumbnail, name,
 * type, tags, size, campaigns, date, and favorite star. Right-click a
 * row for the same context menu as the grid cards.
 *
 * Lazy pagination: when hasMore is set, an IntersectionObserver on the
 * third-from-last row calls onLoadMore as it scrolls into view, so the
 * next page is revealed before the user hits the bottom.
 */
export default function AssetListView({
  assets,
  getContextMenuItems,
  onAssetClick,
  onToggleFavorite,
  onTagClick,
  activeTags = [],
  selectable = false,
  selectedIds = null,
  hasMore = false,
  onLoadMore = null,
  sort = null,
  onSortChange = null,
}) {
  const sentinelRef = useRef(null)
  const sentinelIndex = Math.max(0, assets.length - 3)

  useEffect(() => {
    if (!hasMore || !onLoadMore || !sentinelRef.current) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onLoadMore()
        }
      },
      { rootMargin: '100px' }
    )
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [assets, hasMore, onLoadMore])

  return (
    <div className="overflow-x-auto rounded-sm border border-border-subtle">
      <div className="min-w-[760px]">
        {/* Header - sortable columns cycle asc / desc / default */}
        <div className={`${ROW_GRID} border-b border-border-subtle px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-content-secondary`}>
          {COLUMNS.map((column, index) =>
            column.sortKey && onSortChange ? (
              <button
                key={column.sortKey}
                onClick={() => onSortChange(column.sortKey)}
                className={`flex items-center gap-1.5 text-left uppercase tracking-widest transition-colors hover:text-content-primary ${
                  sort?.key === column.sortKey ? 'text-content-primary' : ''
                }`}
              >
                {column.label}
                <FontAwesomeIcon
                  icon={sortIcon(sort, column.sortKey)}
                  className={sort?.key === column.sortKey ? '' : 'opacity-40'}
                />
              </button>
            ) : (
              <span key={column.label || `col-${index}`}>{column.label}</span>
            )
          )}
        </div>

        {/* Rows */}
        {assets.map((asset, index) => {
          const isImage = asset.asset_type === 'map' || asset.asset_type === 'image'
          const selected = selectedIds?.has(asset.id) || false
          return (
            <ContextMenu key={asset.id} items={getContextMenuItems(asset)}>
              <div
                ref={hasMore && index === sentinelIndex ? sentinelRef : null}
                onClick={() => onAssetClick?.(asset)}
                className={`${ROW_GRID} cursor-pointer border-b border-border-subtle px-3 py-2 last:border-b-0 transition-colors ${
                  selected ? 'bg-border-subtle/60' : 'hover:bg-border-subtle/40'
                }`}
              >
                {/* Mini thumbnail */}
                <div className="relative h-9 w-[4.5rem] overflow-hidden rounded-sm bg-surface-elevated">
                  {isImage && asset.s3_url ? (
                    <img src={asset.s3_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <AudioWaveThumb asset={asset} barCount={18} />
                  )}
                  {selectable && (
                    <span
                      className={`absolute left-1 top-1 flex h-4 w-4 items-center justify-center rounded-full border transition-colors ${
                        selected
                          ? 'border-content-on-dark bg-content-on-dark text-surface-panel'
                          : 'border-content-on-dark/60 bg-overlay-light text-transparent'
                      }`}
                    >
                      <FontAwesomeIcon icon={faCheck} className="text-[8px]" />
                    </span>
                  )}
                </div>

                <span className="truncate text-sm font-medium text-content-primary" title={asset.filename}>
                  {asset.filename}
                </span>

                <span>
                  <Badge variant={asset.asset_type || 'default'} size="xs" className="uppercase tracking-wide">
                    {asset.asset_type}
                  </Badge>
                </span>

                <span className="flex flex-wrap gap-1">
                  {(asset.tags || []).map((tag) => (
                    <button
                      key={tag}
                      onClick={(event) => {
                        event.stopPropagation()
                        onTagClick?.(tag)
                      }}
                      className={`rounded-full px-2 py-0.5 text-[10px] transition-colors ${
                        activeTags.includes(tag)
                          ? 'bg-content-primary text-content-on-dark'
                          : 'bg-border-subtle text-content-primary/70 hover:text-content-primary'
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </span>

                <span className="text-xs tabular-nums text-content-secondary">
                  {formatFileSize(asset.file_size)}
                </span>

                <span className="text-xs tabular-nums text-content-secondary">
                  {asset.campaign_ids?.length || '-'}
                </span>

                <span className="text-xs tabular-nums text-content-secondary">
                  {formatDate(asset.created_at)}
                </span>

                <button
                  onClick={(event) => {
                    event.stopPropagation()
                    onToggleFavorite?.(asset)
                  }}
                  aria-label={asset.favorite ? 'Remove from favorites' : 'Add to favorites'}
                  className={`justify-self-end p-1 leading-none transition-colors ${
                    asset.favorite ? 'text-favorite hover:opacity-75' : 'text-content-primary hover:text-favorite'
                  }`}
                >
                  <FontAwesomeIcon icon={asset.favorite ? faStar : faStarOutline} className="text-sm" />
                </button>
              </div>
            </ContextMenu>
          )
        })}
      </div>
    </div>
  )
}
