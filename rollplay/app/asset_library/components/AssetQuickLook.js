/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faFileAudio, faXmark } from '@fortawesome/free-solid-svg-icons'
import Modal from '@/app/shared/components/Modal'
import Badge from '@/app/shared/components/Badge'

const BADGE_VARIANT = {
  map: 'success',
  audio: 'info',
  image: 'info',
}

/**
 * Quick Look preview modal for media assets.
 *
 * - Image/map assets: full-resolution image
 * - Audio assets: native audio player
 *
 * @param {Object} asset - The asset to preview
 * @param {boolean} open - Controls visibility
 * @param {Function} onClose - Called on close
 */
export default function AssetQuickLook({ asset, open, onClose }) {
  if (!asset) return null

  const isImage = asset.asset_type === 'map' || asset.asset_type === 'image'
  const isAudio = asset.asset_type === 'audio'

  return (
    <Modal open={open} onClose={onClose} size="2xl">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="text-lg font-semibold truncate">{asset.filename}</h2>
            <Badge variant={BADGE_VARIANT[asset.asset_type] || 'default'} size="xs">
              {asset.asset_type}
            </Badge>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-content-secondary hover:text-content-on-dark transition-colors flex-shrink-0"
          >
            <FontAwesomeIcon icon={faXmark} className="h-5 w-5" />
          </button>
        </div>

        {/* Preview */}
        <div className="rounded-sm overflow-hidden bg-surface-elevated">
          {isImage && asset.s3_url ? (
            <img
              src={asset.s3_url}
              alt={asset.filename}
              className="w-full h-auto max-h-[70vh] object-contain"
            />
          ) : isAudio && asset.s3_url ? (
            <div className="flex flex-col items-center justify-center py-16 gap-6">
              <FontAwesomeIcon icon={faFileAudio} className="h-16 w-16 text-content-secondary opacity-50" />
              <audio controls src={asset.s3_url} className="w-full max-w-md">
                Your browser does not support the audio element.
              </audio>
            </div>
          ) : (
            <div className="flex items-center justify-center py-16 text-content-secondary">
              No preview available
            </div>
          )}
        </div>

        {/* Metadata */}
        <div className="mt-4 flex items-center gap-4 text-xs text-content-secondary">
          {asset.file_size && (
            <span>{formatFileSize(asset.file_size)}</span>
          )}
          {asset.content_type && (
            <span>{asset.content_type}</span>
          )}
          {asset.created_at && (
            <span>{new Date(asset.created_at).toLocaleDateString()}</span>
          )}
        </div>
      </div>
    </Modal>
  )
}

function formatFileSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
