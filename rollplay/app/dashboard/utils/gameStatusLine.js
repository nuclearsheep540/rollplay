/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { formatRelativeTime, formatScheduledTime, isUpcoming } from '@/app/shared/utils/formatTime'
import { findCurrentSession } from './homeRanking'

/**
 * The one-line answer to "what is happening with this game?".
 *
 * Lives in one place because the hero and the campaign drawer must never
 * disagree about it. The rules, in order:
 *
 *   live                      → "Started 2 hours ago"
 *   idle, schedule ahead      → "Next game · Thu 4 Sep, 20:00"
 *   idle, schedule in the past→ falls through to the idle line
 *   idle, no schedule         → "No game running"
 *
 * A stale schedule is hidden rather than deleted: the GM's declaration is a
 * record, and the clock is not allowed to erase it — only the GM ending the
 * game does that.
 *
 * Times render in the viewer's own timezone, so call this client-side only
 * (the same reason the page clock does).
 */
export function gameStatusLine(campaign) {
  const session = findCurrentSession(campaign)

  switch (session?.status) {
    case 'active':
      return session.started_at
        ? `Started ${formatRelativeTime(session.started_at)}`
        : 'Game live'
    case 'starting':
      return 'Starting…'
    case 'stopping':
      return 'Ending…'
    default:
      break
  }

  if (isUpcoming(session?.scheduled_at)) {
    return `Next game · ${formatScheduledTime(session.scheduled_at)}`
  }

  return 'No game running'
}

/**
 * The soonest game still ahead of us across every campaign, or null.
 * Feeds the pulse's calm state, which names the next heartbeat rather than
 * admitting there is nothing to say.
 */
export function nextScheduledGame(campaigns) {
  let soonest = null

  for (const campaign of campaigns || []) {
    const session = findCurrentSession(campaign)
    if (!isUpcoming(session?.scheduled_at)) {
      continue
    }
    if (!soonest || new Date(session.scheduled_at) < new Date(soonest.scheduled_at)) {
      soonest = { campaign, scheduled_at: session.scheduled_at }
    }
  }

  return soonest
}
