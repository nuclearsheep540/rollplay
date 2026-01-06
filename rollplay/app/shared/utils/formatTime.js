/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import dayjs from 'dayjs'

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
