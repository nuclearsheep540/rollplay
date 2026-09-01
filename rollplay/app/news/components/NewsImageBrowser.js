/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useRef, useState } from 'react'

import { COLORS } from '@/app/styles/colorTheme'
import NewsImageDeleteControl from './NewsImageDeleteControl'
import NewsImageMoveControl from './NewsImageMoveControl'
import { useNewsImages, useUploadNewsImage } from '../hooks/useNews'

/**
 * The news image store, scoped.
 *
 * Two tabs, because an image is one of two things: art meant to be reused
 * across articles (SHARED), or art belonging to the one article being written
 * (THIS ARTICLE). The scope is chosen at upload rather than discovered at
 * delete time — that choice is the whole point of the split.
 *
 * THIS ARTICLE is the default. A one-off illustration is the common case, and
 * defaulting to shared is how the flat directory filled up with images only
 * ever used once; making the narrow scope the path of least resistance and the
 * library something you promote INTO matches how the two are actually used.
 *
 * One component, two surfaces: the rail beside the writing surface and the
 * modal picker both need identical tab, upload, delete and move behaviour, and
 * differ only in how densely they lay tiles out and what a click does.
 */

export const GRID_CLASS = {
  2: 'grid-cols-2',
  4: 'grid-cols-4',
}

const TABS = [
  { id: 'article', label: 'THIS ARTICLE' },
  { id: 'shared', label: 'SHARED' },
]

const SCOPE_NOTE = {
  article: 'Only this article can use these. They are deleted with it.',
  shared: 'Any article can use these. Deleting one is refused while a post still does.',
}

export default function NewsImageBrowser({
  postId,
  columns = 2,
  draggable = false,
  scrollWithin = false,
  onSelect,
  onUploaded,
  onMoved,
}) {
  const fileInputRef = useRef(null)
  const [scope, setScope] = useState('article')

  // Why the last delete or move was refused, if it was. The server names the
  // articles still using the image, and that is worth showing rather than a
  // bare failure. Cleared whenever the author does something new.
  const [refusal, setRefusal] = useState(null)

  const scopedPostId = scope === 'article' ? postId : null
  const { data, isLoading, refetch } = useNewsImages(scopedPostId)
  const uploadImage = useUploadNewsImage()

  const images = data?.images || []

  const handleFileChosen = async (event) => {
    const file = event.target.files?.[0]
    // Cleared immediately so choosing the same file twice still fires a change.
    event.target.value = ''
    if (!file) return

    setRefusal(null)
    const key = await uploadImage.mutateAsync({ file, postId: scopedPostId })

    if (!onUploaded) return

    // Only the server can sign the new key, so refetch before handing it over
    // rather than passing a URL the browser cannot load yet.
    const { data: refreshed } = await refetch()
    onUploaded({ key, url: refreshed?.images?.find((image) => image.key === key)?.url })
  }

  return (
    <div>
      <div className="news-scope-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setScope(tab.id)
              setRefusal(null)
            }}
            className={`news-scope-tab ${scope === tab.id ? 'is-active' : ''}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <p className="news-scope-note">{SCOPE_NOTE[scope]}</p>

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploadImage.isPending}
        className="news-upload-tile"
      >
        <svg viewBox="0 0 24 24">
          <path d="M12 5v14M5 12h14" />
        </svg>
        <span>
          {uploadImage.isPending
            ? 'UPLOADING…'
            : scope === 'article'
              ? 'UPLOAD TO THIS ARTICLE'
              : 'UPLOAD TO SHARED'}
        </span>
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChosen}
        className="hidden"
      />

      {isLoading && (
        <p className="mt-3.5 text-[11.5px]" style={{ color: COLORS.silver }}>
          Loading images…
        </p>
      )}

      {!isLoading && images.length === 0 && (
        <p className="mt-3.5 text-[11.5px] leading-relaxed" style={{ color: COLORS.silver }}>
          {scope === 'article'
            ? 'Nothing here yet — upload art only this article uses, or take one from SHARED.'
            : 'Nothing shared yet — upload here, or promote an article’s own image.'}
        </p>
      )}

      {refusal && (
        <p className="mt-3.5 text-[11.5px] leading-relaxed" style={{ color: '#D08A8A' }}>
          {refusal}
        </p>
      )}

      {/* The rail caps the grid and scrolls it internally so a large library
          never pushes the rail taller than the screen. The modal has its own
          scroll region, so capping there would nest two of them. */}
      <div
        className={`mt-3.5 grid gap-2.5 ${GRID_CLASS[columns]} ${scrollWithin ? 'news-rail-grid' : ''}`}
      >
        {images.map((image) => (
          <div key={image.key} className="news-picker-cell">
            <button
              type="button"
              draggable={draggable}
              onDragStart={(event) => {
                // The key, not the URL: banners store keys, and a signed URL
                // would be stale by the time anything read it back.
                event.dataTransfer.setData('text/news-image-key', image.key)
                event.dataTransfer.effectAllowed = 'copy'
              }}
              onClick={() => onSelect?.(image)}
              className={`news-picker-tile ${draggable ? 'is-draggable' : ''}`}
              title={image.key.split('/').pop()}
            >
              <span
                className="news-picker-thumb"
                style={{ backgroundImage: `url(${image.url})` }}
              />
              <span className="news-picker-name">{image.key.split('/').pop()}</span>
            </button>

            <NewsImageMoveControl
              imageKey={image.key}
              scope={scope}
              postId={postId}
              onRefused={setRefusal}
              onMoved={onMoved}
            />
            <NewsImageDeleteControl imageKey={image.key} onRefused={setRefusal} />
          </div>
        ))}
      </div>
    </div>
  )
}
