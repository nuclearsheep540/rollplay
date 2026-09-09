/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useState } from 'react'

/**
 * One banner slot in the editor.
 *
 * A slot edits ONE surface at a time — the HOME CARD / ARTICLE toggle chooses
 * which, because a post carries different art for its card and its article.
 * The toggle switches which stored key this slot is showing and setting; it is
 * not a property of the image.
 *
 * Accepts a drag from the image rail, and reports the dropped S3 key.
 */
export default function NewsBannerSlot({
  label,
  surface,
  onSurfaceChange,
  imageUrl,
  onSet,
  onClear,
}) {
  const [isDropTarget, setIsDropTarget] = useState(false)

  const handleDrop = (event) => {
    event.preventDefault()
    setIsDropTarget(false)

    const key = event.dataTransfer.getData('text/news-image-key')
    if (key) {
      onSet(key)
    }
  }

  return (
    <div
      className={`news-banner-slot ${isDropTarget ? 'is-drop-target' : ''}`}
      onDragOver={(event) => {
        // Preventing default is what marks this a valid drop target — without
        // it the browser refuses the drop entirely.
        event.preventDefault()
        setIsDropTarget(true)
      }}
      onDragLeave={() => setIsDropTarget(false)}
      onDrop={handleDrop}
    >
      {imageUrl && !isDropTarget && (
        <div
          className="absolute inset-0"
          style={{ background: `url(${imageUrl}) center bottom / contain no-repeat` }}
        />
      )}

      <div className="news-slot-config">
        <button
          type="button"
          className={`news-cfg ${surface === 'home' ? 'is-on' : ''}`}
          onClick={() => onSurfaceChange('home')}
        >
          <span>HOME CARD</span>
        </button>
        <button
          type="button"
          className={`news-cfg ${surface === 'article' ? 'is-on' : ''}`}
          onClick={() => onSurfaceChange('article')}
        >
          <span>ARTICLE</span>
        </button>
      </div>

      {(!imageUrl || isDropTarget) && (
        <div className="news-drop-hint">
          {isDropTarget ? 'Drop to set this banner' : 'Drag a banner here · 21:9'}
        </div>
      )}

      <span className="news-slot-tag">{label} · 21:9</span>

      {imageUrl && (
        <div className="news-slot-tools">
          <button type="button" onClick={onClear}>REMOVE</button>
        </div>
      )}
    </div>
  )
}
