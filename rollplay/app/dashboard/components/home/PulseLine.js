/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useRouter } from 'next/navigation'
import { useMemo } from 'react'

import { useFriendships } from '@/app/dashboard/hooks/useFriendships'
import { useAuthenticated } from '@/app/shared/providers/AuthenticatedContext'
import { getEventConfig } from '@/app/shared/config/eventConfig'
import { findCurrentSession } from '@/app/dashboard/utils/homeRanking'
import { COLORS } from '@/app/styles/colorTheme'
import { SKEW_BOX, SKEW_LABEL } from '@/app/styles/plateGeometry'

// The dial, not a set of modes: busy-ness is continuous, and every visible
// property interpolates along it. Weights say what MATTERS, not what counts —
// a live session outweighs any number of idle friends.
const WEIGHT_LIVE_SESSION = 6
const WEIGHT_ONLINE_FRIEND = 1

// Breath period at rest and flat out. The score maps between them, so the page
// visibly quickens as the tavern fills.
const BREATH_CALM_SECONDS = 4
const BREATH_BUSY_SECONDS = 0.9
const SCORE_AT_FULL_TILT = 10

// Coins are a glance, not a census — past this the line would crowd the page.
const MAX_COINS = 5

/**
 * The pulse — a line, not a region; a dimmer, not a switch.
 *
 * Three sources, each the right shape for what it carries: friends and live
 * sessions come from queries the client already holds (a now-state, so a
 * snapshot is correct), while the ticker is fed by socket events the server
 * flagged for the pulse (a happening, so a stream is correct).
 *
 * The campaigns come from Home rather than a refetch, and they are the user's
 * own memberships — which is how the privacy rule, never show a session the
 * user isn't in, is guaranteed structurally rather than remembered.
 *
 * A live session is CONTENT, not a state: it pins a gold pill carrying its own
 * Join and raises the activity floor, while the ticker keeps flowing behind it.
 */
export default function PulseLine({ campaigns = [], onOpenSocial }) {
  const router = useRouter()
  const { pulseEvents } = useAuthenticated()
  const { data: friendshipData } = useFriendships()

  const friends = useMemo(() => friendshipData?.accepted || [], [friendshipData])
  const onlineFriends = useMemo(() => friends.filter((friend) => friend.is_online), [friends])

  const liveCampaign = useMemo(() => {
    for (const campaign of campaigns) {
      const session = findCurrentSession(campaign)
      if (session?.status === 'active') {
        return { campaign, session }
      }
    }
    return null
  }, [campaigns])

  // Events arrive from the server, flagged by whichever factory raised them —
  // the pulse renders what it is told rather than inferring activity from
  // query data, so a silent event (a friend returning from a refresh) simply
  // never gets here.
  const events = useMemo(
    () =>
      pulseEvents.map((event, index) => ({
        id: event.id,
        text: getEventConfig(event.event_type)?.panelMessage(event.data) || '',
        opacity: 1 - index * 0.28,
      })),
    [pulseEvents]
  )

  const score =
    (liveCampaign ? WEIGHT_LIVE_SESSION : 0) + onlineFriends.length * WEIGHT_ONLINE_FRIEND
  const intensity = Math.min(score / SCORE_AT_FULL_TILT, 1)
  const breathSeconds =
    BREATH_CALM_SECONDS - (BREATH_CALM_SECONDS - BREATH_BUSY_SECONDS) * intensity

  const coins = onlineFriends.slice(0, MAX_COINS)
  const overflowCoins = onlineFriends.length - coins.length

  return (
    <div className="flex items-center gap-3.5 pl-1" style={{ minHeight: 34 }}>
      {/* The source: everything emits from here, so it is clamped hard left. */}
      <div
        className="home-breathe h-2.5 w-2.5 flex-none rounded-full"
        style={{
          backgroundColor: COLORS.gold,
          '--breath': `${breathSeconds}s`,
          '--breathe-glow': `rgba(217, 164, 65, ${0.35 + 0.35 * intensity})`,
        }}
      />

      {coins.length > 0 && (
        <button
          type="button"
          onClick={onOpenSocial}
          className="flex flex-none items-center pl-1"
          title={`${onlineFriends.length} online`}
        >
          {coins.map((friend, index) => (
            <span
              key={friend.friend_id}
              className="pulse-coin"
              style={{
                backgroundColor: friend.friend_color || COLORS.graphite,
                marginLeft: index === 0 ? 0 : -8,
                zIndex: MAX_COINS - index,
              }}
              title={friend.friend_screen_name || 'A friend'}
            >
              {(friend.friend_screen_name || '?').charAt(0).toUpperCase()}
            </span>
          ))}
          {overflowCoins > 0 && (
            <span className="pulse-coin pulse-coin-more" style={{ marginLeft: -8 }}>
              +{overflowCoins}
            </span>
          )}
        </button>
      )}

      {liveCampaign && (
        <span className="pulse-pill pulse-pill-live" style={{ transform: SKEW_BOX }}>
          <span className="inline-block" style={{ transform: SKEW_LABEL }}>
            {liveCampaign.campaign.title} is live
          </span>
          <button
            type="button"
            onClick={() => router.push(`/game?room_id=${liveCampaign.session.id}`)}
            className="pulse-join"
            style={{ transform: SKEW_LABEL }}
          >
            JOIN
          </button>
        </span>
      )}

      {events.map((event) => (
        <span
          key={event.id}
          className="pulse-pill"
          style={{ transform: SKEW_BOX, opacity: event.opacity }}
        >
          <span className="inline-block" style={{ transform: SKEW_LABEL }}>
            {event.text}
          </span>
        </span>
      ))}

      {/* Calm is championed: the line always says something, and what it says
          at rest is serene rather than empty. */}
      {!liveCampaign && events.length === 0 && (
        <span className="pulse-pill" style={{ transform: SKEW_BOX }}>
          <span className="inline-block" style={{ transform: SKEW_LABEL }}>
            All is quiet in the tavern...
          </span>
        </span>
      )}

      <div
        className="h-px flex-1"
        style={{ background: 'linear-gradient(90deg, #D5CFC5, rgba(213, 207, 197, 0))' }}
      />
    </div>
  )
}
