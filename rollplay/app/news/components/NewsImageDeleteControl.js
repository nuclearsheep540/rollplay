/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useState } from 'react'

import { useDeleteNewsImage } from '../hooks/useNews'

/**
 * Delete one image from the shared news directory.
 *
 * Two steps, always: S3 has no undo, and these images are shared across every
 * article, so removing one is never a local act. The server refuses while any
 * post still references it — this only relays that refusal, so the rule lives
 * in one place and the two surfaces using this control cannot disagree.
 *
 * Owns its own confirm state so the rail and the picker each get the behaviour
 * without reimplementing it.
 */
export default function NewsImageDeleteControl({ imageKey, onRefused }) {
  const [confirming, setConfirming] = useState(false)
  const deleteImage = useDeleteNewsImage()

  const filename = imageKey.split('/').pop()

  if (confirming) {
    return (
      <div className="news-picker-confirm">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onRefused?.(null)
            deleteImage.mutate(imageKey, {
              onSuccess: () => setConfirming(false),
              onError: (error) => {
                onRefused?.(error.message)
                setConfirming(false)
              },
            })
          }}
          className="news-picker-confirm-yes"
        >
          {deleteImage.isPending ? '…' : 'DELETE'}
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            setConfirming(false)
          }}
          className="news-picker-confirm-no"
        >
          KEEP
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={(event) => {
        // The tile underneath inserts the image; deleting must not also place it.
        event.stopPropagation()
        onRefused?.(null)
        setConfirming(true)
      }}
      className="news-picker-delete"
      aria-label={`Delete ${filename}`}
      title="Delete this image"
    >
      <svg viewBox="0 0 24 24">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  )
}
