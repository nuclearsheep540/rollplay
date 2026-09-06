/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'

// Strict multi-format parsing for parseClockTime. Extending is idempotent, and
// this module is the app's one home for time helpers, so it happens here.
dayjs.extend(customParseFormat)

/**
 * Format timestamp for notification display (social-media style)
 * - Under 1 minute: "just now"
 * - Under 1 hour: "X minutes ago"
 * - Under 24 hours: "X hours ago"
 * - Yesterday: "Yesterday"
 * - Same year: "15 Jan"
 * - Different year: "15 Jan 2025"
 */
export function formatRelativeTime(timestamp) {
  const date = dayjs(timestamp)
  const now = dayjs()
  const diffMinutes = now.diff(date, 'minute')
  const diffHours = now.diff(date, 'hour')
  const diffDays = now.diff(date, 'day')

  // Under 1 minute
  if (diffMinutes < 1) {
    return 'just now'
  }

  // Under 1 hour
  if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`
  }

  // Under 24 hours
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`
  }

  // Yesterday (1 day ago)
  if (diffDays === 1) {
    return 'Yesterday'
  }

  // Same year - show "15 Jan"
  if (date.year() === now.year()) {
    return date.format('D MMM')
  }

  // Different year - show "15 Jan 2025"
  return date.format('D MMM YYYY')
}


/**
 * Format a scheduled game for display: "Thu 4 Sep, 20:00".
 *
 * Rendered in the VIEWER's timezone, not the server's and not the GM's. The
 * stored value is an instant, so a game the GM set for 20:00 in London shows as
 * 15:00 to a player in New York — which is the point: everyone reads the same
 * moment in their own clock.
 */
export function formatScheduledTime(timestamp) {
  return dayjs(timestamp).format('ddd D MMM, HH:mm')
}

/**
 * A schedule only counts while it is still ahead of us.
 *
 * A past value is never deleted — the record of what the GM said outlives the
 * date — so every reader has to decide whether to show it. This is that
 * decision, in one place.
 */
export function isUpcoming(timestamp) {
  return Boolean(timestamp) && dayjs(timestamp).isAfter(dayjs())
}


/**
 * The ways a person types a clock time. Tried in order, strictly — dayjs
 * refuses "24:00" and "20:60" the same way it refuses "abc".
 */
const TYPED_TIME_FORMATS = ['HH:mm', 'H:mm', 'H:m', 'HH.mm', 'H.mm', 'H.m', 'HH mm', 'HHmm', 'HH', 'H']

/**
 * Read a clock time the way a person types one, into "HH:mm" — or null.
 *
 * Accepts "20:05", "20.05", "2005", "20 05", "8:5", and a bare hour ("20").
 * Anything that is not a real time on a 24-hour clock is rejected rather than
 * guessed at; the caller decides what to fall back to.
 */
export function parseClockTime(text) {
  const parsed = dayjs(String(text ?? '').trim(), TYPED_TIME_FORMATS, true)
  return parsed.isValid() ? parsed.format('HH:mm') : null
}
