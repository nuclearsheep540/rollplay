/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import React from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faFileAudio } from '@fortawesome/free-solid-svg-icons'
import ContextMenu from '@/app/shared/components/ContextMenu'
import Badge from '@/app/shared/components/Badge'

const BADGE_VARIANT = {
  map: 'success',
  audio: 'info',
  image: 'info',
}

const TYPE_ICON = {
  map: '\uD83D\uDDFA\uFE0F',
  audio: '\uD83C\uDFB5',
  image: '\uD83D\uDDBC\uFE0F',
}

/**
 * Individual asset card displaying thumbnail, metadata, and context menu actions.
 *
 * Right-click for: Quick Look, Rename, Add to Campaign, Delete
 */
export default function AssetCard({ asset, contextMenuItems }) {
  const isImage = asset.asset_type === 'map' || asset.asset_type === 'image'

  const formatFileSize = (bytes) => {
    if (!bytes) return 'Unknown size'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatDate = (dateString) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  return (
    <ContextMenu items={contextMenuItems}>
      <div className="rounded-sm border border-border bg-surface-panel overflow-hidden transition-all">
        {/* Thumbnail/Preview */}
        <div className="relative aspect-video flex items-center justify-center bg-surface-elevated">
          {isImage && asset.s3_url ? (
            <img
              src={asset.s3_url}
              alt={asset.filename}
              className="w-full h-full object-cover"
              onError={(e) => {
                e.target.style.display = 'none'
                e.target.nextSibling.style.display = 'flex'
              }}
            />
          ) : null}

          {/* Fallback icon for audio or failed images */}
          <div
            className={`${isImage && asset.s3_url ? 'hidden' : 'flex'} items-center justify-center w-full h-full`}
          >
            {asset.asset_type === 'audio' ? (
              <FontAwesomeIcon icon={faFileAudio} className="w-1/3 h-auto opacity-50 text-content-secondary" />
            ) : (
              <span className="text-4xl opacity-50">{TYPE_ICON[asset.asset_type] || '\uD83D\uDCC1'}</span>
            )}
          </div>

          {/* Type badge */}
          <Badge
            variant={BADGE_VARIANT[asset.asset_type] || 'default'}
            size="md"
            className="absolute bottom-2 left-2"
          >
            {asset.asset_type}
          </Badge>
        </div>

        {/* Metadata */}
        <div className="p-3">
          <h3
            className="text-sm font-medium truncate text-content-on-dark"
            title={asset.filename}
          >
            {asset.filename}
          </h3>
          <div className="mt-1 flex items-center justify-between text-xs text-content-secondary">
            <span>{formatFileSize(asset.file_size)}</span>
            <span>{formatDate(asset.created_at)}</span>
          </div>

          {/* Campaign associations */}
          {asset.campaign_ids && asset.campaign_ids.length > 0 && (
            <div className="mt-2 flex items-center gap-1">
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
