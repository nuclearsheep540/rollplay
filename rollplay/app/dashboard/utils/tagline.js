/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import dayjs from 'dayjs'
import { formatScheduledTime, isUpcoming } from '@/app/shared/utils/formatTime'
import { findCurrentSession } from './homeRanking'

/**
 * The greeting's flavour line. Four situations in priority order; each picks
 * its own voice (owner, player with a character, player without) and its own
 * lines. Never status — the hero card owns that. Client-side only: "today" is
 * the viewer's today.
 */
export function selectTagline({ user, heroCampaign, characters }) {
  const situation = describeSituation({ user, heroCampaign, characters })

  if (!situation.campaign) return noCampaign(situation)
  if (situation.gameToday) return gameToday(situation)
  if (situation.gameAhead) return gameAhead(situation)
  return betweenGames(situation)
}

function oneOf(lines) {
  return lines[Math.floor(Math.random() * lines.length)]
}

function describeSituation({ user, heroCampaign, characters }) {
  const name = user?.screen_name || user?.account_name || 'adventurer'

  if (!heroCampaign) {
    return { name, campaign: null, character: characters?.[0]?.character_name }
  }

  const session = findCurrentSession(heroCampaign)
  const roster = session?.roster || []
  const scheduled = isUpcoming(session?.scheduled_at)
  const gameToday = scheduled && dayjs(session.scheduled_at).isSame(dayjs(), 'day')

  return {
    name,
    campaign: heroCampaign.title,
    isOwner: heroCampaign.host_id === user?.id,
    hasPlayers: (heroCampaign.player_ids || []).length > 0,
    character: roster.find((entry) => entry.user_id === user?.id)?.character_name,
    partner: oneOf(roster.filter((entry) => entry.user_id !== user?.id && entry.character_name))?.character_name,
    gameToday,
    gameAhead: scheduled && !gameToday,
    when: scheduled ? formatScheduledTime(session.scheduled_at) : null,
  }
}

function noCampaign({ name, character }) {
  if (character) {
    return oneOf([
      `${character} waits in the tavern for a new adventure post to come up.`,
      `${character} is wondering when they next get to go out.`,
      `${character} has packed, unpacked, and packed again.`,
    ])
  }
  return oneOf([
    `The tavern keeps a seat warm for you, ${name}.`,
    'A new adventurer walks in, and the regulars welcome you warmly to the tavern.',
    `Welcome to the tavern, ${name}!`,
  ])
}

function gameToday({ name, campaign, character, isOwner }) {
  if (isOwner) {
    return oneOf([
      `You're running ${campaign} today, ${name}. Are the adventurers ready?`,
      `${campaign} meets today, bet the party can't wait!`,
      `Today the table is yours, ${name}. ${campaign} is ready to rock and roll.`,
    ])
  }
  if (character) {
    return oneOf([
      `${campaign} awaits you today, ${character}!`,
      `${character} has been ready for ${campaign} since dawn.`,
      `The table is set for ${campaign} today. Get yer boots on, ${character}!`,
    ])
  }
  return oneOf([
    `${campaign} gathers today. You should join with a character, ${name}.`,
    `${campaign} meets today, ${name}. Are you joining the party with a character?`,
  ])
}

function gameAhead({ name, campaign, character, isOwner, when }) {
  if (isOwner) {
    return oneOf([
      `${campaign} returns ${when}. The party will not know what hit them!`,
      `You have until ${when} to finish plotting ${campaign}.`,
      `${campaign} is on the calendar for ${when}. Maybe time enough to write one more twist?`,
    ])
  }
  if (character) {
    return oneOf([
      `${character} is counting the days until ${campaign}.`,
      `${campaign} continues ${when}. ${character} has plans until then.`,
      `${character} has a quiet stretch before ${campaign} takes them back.`,
    ])
  }
  return oneOf([
    `Next stop: ${campaign}, ${when}.`,
    `${campaign} continues ${when}, ${name}.`,
  ])
}

function betweenGames({ name, campaign, character, partner, isOwner, hasPlayers }) {
  if (character && partner) {
    return oneOf([
      `${character} and ${partner} are drinking flagons of ale at the tavern.`,
      `${partner} is telling the story of ${campaign} again. ${character} has heard it four times.`,
      `${character} and ${partner} are arguing about loot. Again.`,
      `${character} and ${partner} are discussing tactics. You're not confident in the plan.`,
    ])
  }
  if (character) {
    return oneOf([
      `${character} sharpens a blade by the fire.`,
      `${character} is haggling with the innkeeper over the price of a room.`,
      `${character} waits by the fire, listening for news of ${campaign}.`,
    ])
  }
  if (isOwner && !hasPlayers) {
    return oneOf([
      `${campaign} is taking shape. Nobody has seen it yet, ${name}.`,
      `Someone got word of ${campaign}. Talk in the tavern is it's going to be a hit!`,
      `${campaign} has no party yet. Is it an exclusive club?`,
      `I heard only the best adventurers will get to play ${campaign}.`,
    ])
  }
  if (isOwner) {
    return oneOf([
      `Your players are speculating about ${campaign}. I won't say who though.`,
      `Players talk of ${campaign}, and all the loot inside, ${name}.`,
      `${campaign} is quiet... Too quiet.`,
    ])
  }
  return oneOf([
    `The regulars at the tavern are trading rumours about ${campaign}.`,
    `Word of ${campaign} has reached the tavern, ${name}.`,
    `In ${campaign}, a place is always there for you in the party.`,
  ])
}
