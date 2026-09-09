/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useMoveNewsImage } from '../hooks/useNews'

/**
 * Move one image between scopes.
 *
 * The arrow points the way the move goes, and which way that is depends only
 * on where you are looking at the image from: from an article's own images it
 * can be shared out; from the shared directory it can be claimed.
 *
 * One click, unlike delete. Neither direction destroys anything — promoting
 * rewrites every reference as it goes, and claiming is refused outright while
 * another article still renders the image — so there is nothing to confirm.
 * The two-step confirm is reserved for the operation S3 cannot undo.
 */
export default function NewsImageMoveControl({ imageKey, scope, postId, onRefused, onMoved }) {
  const moveImage = useMoveNewsImage()

  const promoting = scope === 'article'
  const label = promoting ? 'Share across articles' : 'Use only in this article'

  return (
    <button
      type="button"
      onClick={(event) => {
        // The tile underneath places the image; moving must not also place it.
        event.stopPropagation()
        onRefused?.(null)
        moveImage.mutate(
          { key: imageKey, targetPostId: promoting ? null : postId },
          {
            // The editor holds its own copy of the document, which the
            // server's rewrite cannot reach — so the new key is handed back
            // for it to apply the same change locally.
            onSuccess: (result) =>
              onMoved?.({ oldKey: imageKey, newKey: result.key, newUrl: result.url }),
            onError: (error) => onRefused?.(error.message),
          }
        )
      }}
      disabled={moveImage.isPending}
      className="news-picker-move"
      aria-label={label}
      title={label}
    >
      {promoting ? (
        /* Outward: this image becomes available to every article. */
        <svg viewBox="0 0 24 24">
          <path d="M12 19V5M12 5l-5 5M12 5l5 5" />
        </svg>
      ) : (
        /* Inward: this article takes the image for itself. */
        <svg viewBox="0 0 24 24">
          <path d="M12 5v14M12 19l-5-5M12 19l5-5" />
        </svg>
      )}
    </button>
  )
}
