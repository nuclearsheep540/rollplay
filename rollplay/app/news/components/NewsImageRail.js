/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useRef } from 'react'

import { COLORS } from '@/app/styles/colorTheme'
import { useNewsImages, useUploadNewsImage } from '../hooks/useNews'

/**
 * The shared image directory, as a rail beside the writing surface.
 *
 * One directory for every post, deliberately: art gets reused across posts, so
 * a per-post upload list would mean re-uploading the same mascot each time.
 *
 * Two ways to place an image, matching the two things images are for here:
 * click inserts at the cursor (in-content illustration), drag onto a banner
 * slot sets that banner (frame art). Drag uses pointer-agnostic HTML5 DnD —
 * desktop-first, as the app is.
 */
export default function NewsImageRail({ onInsert }) {
  const fileInputRef = useRef(null)
  const { data, isLoading } = useNewsImages()
  const uploadImage = useUploadNewsImage()

  const images = data?.images || []

  const handleFileChosen = (event) => {
    const file = event.target.files?.[0]
    if (file) {
      uploadImage.mutate(file)
    }
    // Clear the input so choosing the same file twice still fires a change.
    event.target.value = ''
  }

  return (
    <aside
      className="w-[290px] flex-none rounded-[10px] p-[18px]"
      style={{ backgroundColor: COLORS.carbon, border: '1px solid #3A352F' }}
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: COLORS.gold }}>
        Images
      </div>
      <div className="mt-1 mb-3.5 font-mono text-[11px]" style={{ color: COLORS.silver }}>
        news_media/images/
      </div>

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploadImage.isPending}
        className="news-upload-tile"
      >
        <svg viewBox="0 0 24 24">
          <path d="M12 5v14M5 12h14" />
        </svg>
        <span>{uploadImage.isPending ? 'UPLOADING…' : 'UPLOAD'}</span>
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChosen}
        className="hidden"
      />

      {isLoading && (
        <p className="mt-4 text-[11.5px]" style={{ color: COLORS.silver }}>
          Loading images…
        </p>
      )}

      <div className="mt-3.5 grid grid-cols-2 gap-2.5">
        {images.map((image) => (
          <button
            key={image.key}
            type="button"
            draggable
            onDragStart={(event) => {
              // The key, not the URL: banners store keys, and the signed URL
              // would be stale by the time anything read it back.
              event.dataTransfer.setData('text/news-image-key', image.key)
              event.dataTransfer.effectAllowed = 'copy'
            }}
            onClick={() => onInsert?.(image.key)}
            className="news-thumb"
            title={image.key.split('/').pop()}
          >
            <span
              className="news-thumb-tile"
              style={{ backgroundImage: `url(${image.url})` }}
            />
            <span className="news-thumb-name">{image.key.split('/').pop()}</span>
          </button>
        ))}
      </div>

      <p className="mt-4 text-[11.5px] leading-relaxed" style={{ color: COLORS.silver }}>
        Shared across posts — click to insert at the cursor, or drag onto a banner slot to set it.
      </p>
    </aside>
  )
}
