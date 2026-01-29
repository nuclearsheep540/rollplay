/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import React from 'react'
import { COLORS, THEME } from '@/app/styles/colorTheme'

/**
 * Individual asset card displaying thumbnail, metadata, and actions
 */
export default function AssetCard({ asset, onDelete }) {
  const isImage = asset.asset_type === 'map' || asset.asset_type === 'image'

  const getTypeStyle = (type) => {
    switch (type) {
      case 'map': return { backgroundColor: '#16a34a20', color: '#4ade80', borderColor: '#16a34a50' }
      case 'audio': return { backgroundColor: '#9333ea20', color: '#c084fc', borderColor: '#9333ea50' }
      case 'image': return { backgroundColor: '#3b82f620', color: '#60a5fa', borderColor: '#3b82f650' }
      default: return { backgroundColor: THEME.bgSecondary, color: THEME.textSecondary, borderColor: THEME.borderDefault }
    }
  }

  const getTypeIcon = (type) => {
    switch (type) {
      case 'map': return '🗺️'
      case 'audio': return '🎵'
      case 'image': return '🖼️'
      default: return '📁'
    }
  }

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

  const typeStyle = getTypeStyle(asset.asset_type)

  return (
    <div
      className="rounded-sm border overflow-hidden transition-all group"
      style={{
        backgroundColor: THEME.bgPanel,
        borderColor: THEME.borderDefault
      }}
    >
      {/* Thumbnail/Preview */}
      <div
        className="relative aspect-video flex items-center justify-center"
        style={{ backgroundColor: COLORS.onyx }}
      >
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
          <span className="text-4xl opacity-50">{getTypeIcon(asset.asset_type)}</span>
        </div>

        {/* Delete button overlay */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete(asset)
          }}
          className="absolute top-2 right-2 p-1.5 rounded-sm opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ backgroundColor: '#991b1b', color: COLORS.smoke }}
          title="Delete asset"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>

        {/* Type badge */}
        <span
          className="absolute bottom-2 left-2 px-2 py-0.5 rounded-sm text-xs font-medium border"
          style={typeStyle}
        >
          {asset.asset_type}
        </span>
      </div>

      {/* Metadata */}
      <div className="p-3">
        <h3
          className="text-sm font-medium truncate"
          style={{ color: THEME.textOnDark }}
          title={asset.filename}
        >
          {asset.filename}
        </h3>
        <div
          className="mt-1 flex items-center justify-between text-xs"
          style={{ color: THEME.textSecondary }}
        >
          <span>{formatFileSize(asset.file_size)}</span>
          <span>{formatDate(asset.created_at)}</span>
        </div>

        {/* Campaign associations */}
        {asset.campaign_ids && asset.campaign_ids.length > 0 && (
          <div className="mt-2 flex items-center gap-1">
            <span className="text-xs" style={{ color: THEME.textSecondary }}>
              {asset.campaign_ids.length} campaign{asset.campaign_ids.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
