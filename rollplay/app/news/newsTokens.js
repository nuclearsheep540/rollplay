/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

/**
 * Shared surface values for the news feature.
 *
 * Parchment is the noticeboard card's identity — the one light surface on a
 * page of dark plates. The full article deliberately does NOT use it: it reads
 * on the app's natural ground, so these two live here rather than being
 * assumed to travel together.
 */
export const PARCHMENT = '#FBF7EF'
export const PARCHMENT_BORDER = '#E5DECF'
export const GOLD_INK = '#9A7526'
export const INK = '#141210'

/** Dates render as the card's small caps line: "31 AUG 2026". */
export function formatNewsDate(value) {
  if (!value) return ''

  return new Date(value)
    .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    .toUpperCase()
}
