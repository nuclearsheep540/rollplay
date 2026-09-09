/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

/**
 * Home's campaign selection — which campaign is the hero, and which is the
 * one being built.
 *
 * Every campaign carries exactly one session, for life, so every campaign the
 * user belongs to can hero. The ranking decides which one, not whether.
 */

const GAME_ACTIVE = 'active'

/**
 * The campaign's session — it has exactly one, created with the campaign and
 * never replaced. Null means the data is wrong, not that the campaign is
 * unplayable.
 */
export function findCurrentSession(campaign) {
  return campaign?.sessions?.[0] ?? null
}

/**
 * The game running at this campaign's table, or null when nothing is.
 *
 * Liveness is the presence of an open game, never a field on the session — the
 * backend answers it the same way, so the two cannot disagree.
 */
export function findOpenGame(campaign) {
  return findCurrentSession(campaign)?.game ?? null
}

/**
 * How many games have been played here in total.
 *
 * Not the length of `session.games` — that is a capped slice, because a
 * campaign gains a game per evening for life and the server sends only the
 * latest few. Anything that numbers or counts games reads this instead, or it
 * restarts the numbering at the cap.
 */
export function countPlayedGames(campaign) {
  return findCurrentSession(campaign)?.games_played ?? 0
}

export function isCampaignLive(campaign) {
  return findOpenGame(campaign)?.status === GAME_ACTIVE
}

// Never played sorts last rather than being excluded — the campaign is still
// playable, it just has no history to rank on.
function lastPlayedOf(campaign) {
  return campaign.last_played_at ? new Date(campaign.last_played_at).getTime() : 0
}

// The hero ranks on play; the build card ranks on edits. Two questions, two fields.
function lastEditedOf(campaign) {
  return new Date(campaign.updated_at).getTime()
}

// A game the GM has declared, if it is still ahead of us. A past declaration
// ranks as none — it is history, not a plan.
function upcomingScheduleOf(campaign) {
  const scheduledAt = findCurrentSession(campaign)?.scheduled_at
  if (!scheduledAt) {
    return 0
  }
  const when = new Date(scheduledAt).getTime()
  return when > Date.now() ? when : 0
}

/**
 * Rank rules in priority order: live, then the soonest game still to come,
 * then whatever was played most recently.
 */
function compareHeroRank(first, second) {
  if (isCampaignLive(first) !== isCampaignLive(second)) {
    return isCampaignLive(first) ? -1 : 1
  }

  const firstScheduled = upcomingScheduleOf(first)
  const secondScheduled = upcomingScheduleOf(second)
  if (Boolean(firstScheduled) !== Boolean(secondScheduled)) {
    return firstScheduled ? -1 : 1
  }
  if (firstScheduled && secondScheduled && firstScheduled !== secondScheduled) {
    return firstScheduled - secondScheduled  // soonest first
  }

  return lastPlayedOf(second) - lastPlayedOf(first)
}

/**
 * The single most relevant campaign, or null when the user has none at all.
 * Ranking picks the hero only — the Campaigns tab is the index.
 */
export function selectHeroCampaign(campaigns) {
  if (!campaigns?.length) {
    return null
  }

  return [...campaigns].sort(compareHeroRank)[0]
}

/**
 * The user's most recently edited owned campaign. Null means they own none,
 * and the card renders its create-campaign variant instead.
 */
export function selectWorkingOnCampaign(campaigns, userId) {
  let mostRecent = null
  for (const campaign of campaigns || []) {
    if (campaign.host_id !== userId) {
      continue
    }
    if (!mostRecent || lastEditedOf(campaign) > lastEditedOf(mostRecent)) {
      mostRecent = campaign
    }
  }
  return mostRecent
}
