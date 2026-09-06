/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { formatRelativeTime, formatScheduledTime, isUpcoming } from '@/app/shared/utils/formatTime'
import { findCurrentSession, findOpenGame } from './homeRanking'

/**
 * The one-line answer to "what is happening with this game?".
 *
 * Lives in one place because the hero and the campaign drawer must never
 * disagree about it. The rules, in order:
 *
 *   live, named               → "The Siege of Kraghammer · Started 2 hours ago"
 *   live, unnamed             → "Started 2 hours ago"
 *   idle, date ahead + name   → "Next game · The Siege · Thu 4 Sep, 20:00"
 *   idle, date ahead          → "Next game · Thu 4 Sep, 20:00"
 *   idle, name only           → "Next game · The Siege of Kraghammer"
 *   idle, date in the past    → falls through to the idle line
 *   idle, nothing planned     → "No game running"
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
  const game = findOpenGame(campaign)

  switch (game?.status) {
    case 'active': {
      const started = game.started_at
        ? `Started ${formatRelativeTime(game.started_at)}`
        : 'Game live'
      return game.name ? `${game.name} · ${started}` : started
    }
    case 'starting':
      return 'Starting…'
    case 'ending':
      return 'Ending…'
    default:
      break
  }

  // The plan for the next game: either half alone is worth saying.
  const plannedName = session?.next_game_name
  if (isUpcoming(session?.scheduled_at)) {
    const when = formatScheduledTime(session.scheduled_at)
    return plannedName ? `Next game · ${plannedName} · ${when}` : `Next game · ${when}`
  }
  if (plannedName) {
    return `Next game · ${plannedName}`
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
