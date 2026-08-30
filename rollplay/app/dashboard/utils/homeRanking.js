/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

/**
 * Home's campaign selection — which campaign is the hero, and which is the
 * one being built.
 *
 * A campaign reaches the hero through its SESSION, not through existing: with
 * nothing live-able there is no game to answer "is my game on?" and no honest
 * START target. Campaign creation currently always creates a session, so every
 * campaign qualifies today — the filter is the hook the create/publish flow
 * hangs off later.
 */

const SESSION_FINISHED = 'finished'
const SESSION_ACTIVE = 'active'

/** The campaign's live-able session: the first that hasn't been finished. */
export function findCurrentSession(campaign) {
  for (const session of campaign?.sessions || []) {
    if (session.status !== SESSION_FINISHED) {
      return session
    }
  }
  return null
}

export function isCampaignLive(campaign) {
  return findCurrentSession(campaign)?.status === SESSION_ACTIVE
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

/**
 * Rank rules in priority order. The scheduled slot (stage 3) inserts as
 * another block between live and last played.
 */
function compareHeroRank(first, second) {
  if (isCampaignLive(first) !== isCampaignLive(second)) {
    return isCampaignLive(first) ? -1 : 1
  }
  return lastPlayedOf(second) - lastPlayedOf(first)
}

/**
 * The single most relevant campaign, or null when the user has none that can
 * be played yet. Ranking picks the hero only — the Campaigns tab is the index.
 */
export function selectHeroCampaign(campaigns) {
  const eligible = []
  for (const campaign of campaigns || []) {
    if (findCurrentSession(campaign)) {
      eligible.push(campaign)
    }
  }

  if (eligible.length === 0) {
    return null
  }

  return eligible.sort(compareHeroRank)[0]
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
