/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useToggleNewsLike } from '../hooks/useNews'

/**
 * The like counter IS the control — it shows the value and takes the click.
 *
 * The count moves optimistically so the heart never lags the click; the
 * mutation's invalidation settles the real number a moment later.
 */
export default function LikeButton({ postId, likeCount = 1, liked = false, interactive = true }) {
  const toggleLike = useToggleNewsLike()

  // The server's count already carries the never-zero floor, so the optimistic
  // step is a plain ±1. It cannot fall below the floor: you can only remove a
  // like you gave, which means the count included yours to begin with.
  const pending = toggleLike.isPending
  const optimisticLiked = pending ? !liked : liked
  const optimisticCount = pending ? likeCount + (liked ? -1 : 1) : likeCount

  const handleClick = (event) => {
    event.stopPropagation()
    if (interactive && !pending) {
      toggleLike.mutate(postId)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!interactive}
      className="news-like-btn"
      aria-pressed={optimisticLiked}
      aria-label={optimisticLiked ? 'Unlike this post' : 'Like this post'}
    >
      <svg viewBox="0 0 24 24" className={optimisticLiked ? 'is-liked' : ''}>
        <path d="M12 20.5C12 20.5 4.5 15.4 4.5 10.1 4.5 7.4 6.5 5.5 8.8 5.5c1.4 0 2.6.7 3.2 1.9.6-1.2 1.8-1.9 3.2-1.9 2.3 0 4.3 1.9 4.3 4.6 0 5.3-7.5 10.4-7.5 10.4z" />
      </svg>
      <span>{optimisticCount}</span>
    </button>
  )
}
