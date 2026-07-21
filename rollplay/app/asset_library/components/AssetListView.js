/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import React from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faStar } from '@fortawesome/free-solid-svg-icons'
import { faStar as faStarOutline } from '@fortawesome/free-regular-svg-icons'
import ContextMenu from '@/app/shared/components/ContextMenu'
import Badge from '@/app/shared/components/Badge'
import AudioWaveThumb from './AudioWaveThumb'
import { formatFileSize, formatDate } from './AssetCard'

// Shared column template so the header and rows always line up.
const ROW_GRID = 'grid grid-cols-[4.5rem_minmax(0,2fr)_5.5rem_minmax(0,2fr)_5rem_6rem_6.5rem_2.5rem] items-center gap-3'

/**
 * Dense list view of assets - one row per asset with thumbnail, name,
 * type, tags, size, campaigns, date, and favorite star. Right-click a
 * row for the same context menu as the grid cards.
 */
export default function AssetListView({
  assets,
  getContextMenuItems,
  onAssetClick,
  onToggleFavorite,
  onTagClick,
  activeTags = [],
}) {
  return (
    <div className="overflow-x-auto rounded-sm border border-border-subtle">
      <div className="min-w-[760px]">
        {/* Header */}
        <div className={`${ROW_GRID} border-b border-border-subtle px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-content-secondary`}>
          <span />
          <span>Name</span>
          <span>Type</span>
          <span>Tags</span>
          <span>Size</span>
          <span>Campaigns</span>
          <span>Added</span>
          <span />
        </div>

        {/* Rows */}
        {assets.map((asset) => {
          const isImage = asset.asset_type === 'map' || asset.asset_type === 'image'
          return (
            <ContextMenu key={asset.id} items={getContextMenuItems(asset)}>
              <div
                onClick={() => onAssetClick?.(asset)}
                className={`${ROW_GRID} cursor-pointer border-b border-border-subtle px-3 py-2 last:border-b-0 hover:bg-border-subtle/40 transition-colors`}
              >
                {/* Mini thumbnail */}
                <div className="h-9 w-[4.5rem] overflow-hidden rounded-sm bg-surface-elevated">
                  {isImage && asset.s3_url ? (
                    <img src={asset.s3_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <AudioWaveThumb asset={asset} barCount={18} />
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
                    asset.favorite ? 'text-favorite' : 'text-content-secondary hover:text-content-primary'
                  }`}
                >
                  <FontAwesomeIcon icon={asset.favorite ? faStar : faStarOutline} className="text-xs" />
                </button>
              </div>
            </ContextMenu>
          )
        })}
      </div>
    </div>
  )
}
