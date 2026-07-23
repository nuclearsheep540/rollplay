/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import React from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faStar, faCheck } from '@fortawesome/free-solid-svg-icons'
import { faStar as faStarOutline } from '@fortawesome/free-regular-svg-icons'
import ContextMenu from '@/app/shared/components/ContextMenu'
import Badge from '@/app/shared/components/Badge'
import AudioWaveThumb from './AudioWaveThumb'

export function formatFileSize(bytes) {
  if (bytes == null) return 'Unknown size'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatDate(dateString) {
  if (!dateString) return ''
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

export function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return null
  const minutes = Math.floor(seconds / 60)
  const remainder = Math.round(seconds % 60)
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

/**
 * Individual asset card: thumbnail (image or pseudo-waveform), type
 * badge, favorite star, clickable tag chips, and metadata.
 *
 * Right-click for the full context menu (Quick Look, Rename, Edit
 * Tags, Change Type, Add to Campaign, Delete, ...).
 */
export default function AssetCard({
  asset,
  contextMenuItems,
  onClick,
  onToggleFavorite,
  onTagClick,
  activeTags = [],
  selectable = false,
  selected = false,
}) {
  const isImage = asset.asset_type === 'map' || asset.asset_type === 'image'
  const isAudio = asset.asset_type === 'music' || asset.asset_type === 'sfx'
  const duration = isAudio ? formatDuration(asset.duration_seconds) : null

  const handleFavoriteClick = (event) => {
    event.stopPropagation()
    onToggleFavorite?.(asset)
  }

  const handleTagClick = (event, tag) => {
    event.stopPropagation()
    onTagClick?.(tag)
  }

  return (
    <ContextMenu items={contextMenuItems}>
      <div
        onClick={onClick}
        className={`cursor-pointer rounded-sm border bg-surface-panel overflow-hidden transition-all ${
          selected ? 'border-border-active' : 'border-border'
        }`}
      >
        {/* Thumbnail/Preview */}
        <div className="relative aspect-video flex items-center justify-center bg-surface-elevated">
          {/* Selection indicator */}
          {selectable && (
            <span
              className={`absolute left-1.5 top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full border transition-colors ${
                selected
                  ? 'border-content-on-dark bg-content-on-dark text-surface-panel'
                  : 'border-content-on-dark/60 bg-overlay-light text-transparent'
              }`}
            >
              <FontAwesomeIcon icon={faCheck} className="text-[10px]" />
            </span>
          )}
          {isImage && asset.s3_url ? (
            <img
              src={asset.s3_url}
              alt={asset.filename}
              loading="lazy"
              className="w-full h-full object-cover"
              onError={(e) => {
                e.target.style.display = 'none'
                e.target.nextSibling.style.display = 'flex'
              }}
            />
          ) : null}

          {/* Waveform for audio; fallback block for failed images */}
          <div
            className={`${isImage && asset.s3_url ? 'hidden' : 'flex'} items-center justify-center w-full h-full`}
          >
            {isAudio ? (
              <AudioWaveThumb asset={asset} />
            ) : (
              <span className="text-4xl opacity-50">{'🖼️'}</span>
            )}
          </div>

          {/* Duration chip (audio) */}
          {duration && (
            <span className="absolute bottom-2 right-2 rounded-sm bg-overlay-light px-1.5 py-0.5 text-[10px] tabular-nums text-content-secondary">
              {duration}
            </span>
          )}

          {/* Favorite star - outline previews amber on hover; filled dims to hint removal */}
          <button
            onClick={handleFavoriteClick}
            aria-label={asset.favorite ? 'Remove from favorites' : 'Add to favorites'}
            className={`absolute top-1.5 right-1.5 rounded-sm bg-overlay-light p-1.5 leading-none transition-colors ${
              asset.favorite ? 'text-favorite hover:opacity-75' : 'text-content-on-dark hover:text-favorite'
            }`}
          >
            <FontAwesomeIcon icon={asset.favorite ? faStar : faStarOutline} className="text-sm" />
          </button>
        </div>

        {/* Metadata */}
        <div className="p-3">
          <div className="flex items-center justify-between gap-2">
            <h3
              className="min-w-0 flex-1 truncate text-sm font-medium text-content-on-dark"
              title={asset.filename}
            >
              {asset.filename}
            </h3>
            <Badge
              variant={asset.asset_type || 'default'}
              size="xs"
              className="shrink-0 uppercase tracking-wide"
            >
              {asset.asset_type}
            </Badge>
          </div>

          {/* Tag chips - click to toggle as a filter */}
          {asset.tags && asset.tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {asset.tags.map((tag) => (
                <button
                  key={tag}
                  onClick={(event) => handleTagClick(event, tag)}
                  className={`rounded-full px-2 py-0.5 text-[10px] transition-colors ${
                    activeTags.includes(tag)
                      ? 'bg-content-secondary text-content-primary'
                      : 'bg-surface-hover text-content-secondary hover:text-content-on-dark'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}

          <div className="mt-1.5 flex items-center justify-between text-xs text-content-secondary">
            <span>{formatFileSize(asset.file_size)}</span>
            <span>{formatDate(asset.created_at)}</span>
          </div>

          {/* Campaign associations */}
          {asset.campaign_ids && asset.campaign_ids.length > 0 && (
            <div className="mt-1.5 flex items-center gap-1">
              <span className="text-xs text-content-secondary">
                {asset.campaign_ids.length} campaign{asset.campaign_ids.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>
      </div>
    </ContextMenu>
  )
}
