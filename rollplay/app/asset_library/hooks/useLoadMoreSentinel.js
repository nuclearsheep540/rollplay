/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { useEffect, useRef } from 'react'

/**
 * IntersectionObserver wiring for load-more sentinels, shared by the
 * grid and list views. Returns the ref to attach to the sentinel element.
 *
 * The observer is recreated whenever `assets` changes identity. That is
 * deliberate and load-bearing: IntersectionObserver only fires on
 * intersection *changes*, so when a newly appended page doesn't push the
 * sentinel out of view, it's the recreation's initial observation that
 * fires the next load and keeps the fill-the-viewport cascade going.
 *
 * `scrollRootRef` must point at the scroll container the sentinel lives
 * in. Passing it as the observer root is what makes rootMargin preload
 * work — with the default viewport root, ancestor overflow clips are NOT
 * expanded by rootMargin, so the sentinel would only ever intersect at
 * the hard bottom of the container.
 */
export function useLoadMoreSentinel({ assets, hasMore, onLoadMore, scrollRootRef = null, rootMargin = '0px' }) {
  const sentinelRef = useRef(null)

  useEffect(() => {
    if (!hasMore || !onLoadMore || !sentinelRef.current) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onLoadMore()
        }
      },
      { root: scrollRootRef?.current ?? null, rootMargin }
    )
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [assets, hasMore, onLoadMore, scrollRootRef, rootMargin])

  return sentinelRef
}
