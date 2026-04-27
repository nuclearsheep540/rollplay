/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useEvents } from './useEvents'
import { useEventQueryInvalidation } from '../../dashboard/hooks/useEventQueryInvalidation'
import { getEventConfig } from '../config/eventConfig'

/**
 * Full WebSocket event handler config for authenticated users.
 *
 * Called from the shared authenticated layout so every authenticated
 * page inherits real-time friendship / campaign / session updates
 * without wiring `useEvents` individually. Handlers do two things per
 * event: invalidate the relevant TanStack Query caches (so the
 * notification bell + lists stay fresh) and fire a toast when the
 * server flagged `show_toast`.
 *
 * @param {string | undefined} userId - The authenticated user's id.
 *   When undefined, the WebSocket isn't opened.
 * @param {({type, message}) => void} showToast - Toast dispatcher from
 *   the caller's toast provider.
 */
export function useAuthenticatedEvents(userId, showToast) {
  const invalidation = useEventQueryInvalidation()

  const toast = (eventType, message, bodyFactory) => {
    if (!message.show_toast) return
    const config = getEventConfig(eventType)
    showToast({
      type: config.toastType,
      message: bodyFactory ? bodyFactory(config, message.data) : config.toastMessage,
    })
  }

  const handlers = {
    // ── Friend events ────────────────────────────────────────────────
    friend_request_received: (m) => {
      invalidation.invalidateFriendships()
      invalidation.invalidateNotifications()
      toast('friend_request_received', m)
    },
    friend_request_accepted: (m) => {
      invalidation.invalidateFriendships()
      invalidation.invalidateNotifications()
      toast('friend_request_accepted', m)
    },
    friend_request_declined: (m) => {
      invalidation.invalidateFriendships()
      invalidation.invalidateNotifications()
      toast('friend_request_declined', m)
    },
    friend_removed: (m) => {
      invalidation.invalidateFriendships()
      invalidation.invalidateNotifications()
      toast('friend_removed', m)
    },

    // ── Buzz events (fun notification, no state refresh) ─────────────
    friend_buzzed: (m) => toast('friend_buzzed', m, (c, d) => c.panelMessage(d)),
    buzz_sent: (m) => toast('buzz_sent', m, (c, d) => c.panelMessage(d)),

    // ── Campaign invite events ───────────────────────────────────────
    campaign_invite_received: (m) => {
      invalidation.invalidateCampaigns()
      toast('campaign_invite_received', m)
    },
    campaign_invite_sent: (m) => toast('campaign_invite_sent', m, (c, d) => c.panelMessage(d)),
    campaign_invite_accepted: (m) => {
      invalidation.invalidateCampaigns()
      toast('campaign_invite_accepted', m)
    },
    campaign_invite_declined: (m) => {
      invalidation.invalidateCampaigns()
      toast('campaign_invite_declined', m)
    },

    // ── Campaign membership events ───────────────────────────────────
    campaign_player_removed: (m) => {
      invalidation.invalidateCampaigns()
      toast('campaign_player_removed', m)
    },
    campaign_player_removed_confirmation: (m) =>
      toast('campaign_player_removed_confirmation', m, (c, d) => c.panelMessage(d)),
    campaign_player_left: (m) => {
      invalidation.invalidateCampaigns()
      toast('campaign_player_left', m, (c, d) => c.panelMessage(d))
    },
    campaign_player_left_confirmation: (m) => {
      invalidation.invalidateCampaigns()
      toast('campaign_player_left_confirmation', m)
    },
    campaign_invite_canceled: (m) => {
      invalidation.invalidateCampaigns()
      toast('campaign_invite_canceled', m)
    },
    campaign_invite_canceled_confirmation: (m) =>
      toast('campaign_invite_canceled_confirmation', m, (c, d) => c.panelMessage(d)),

    // ── Session lifecycle events ─────────────────────────────────────
    session_created: () => {
      invalidation.invalidateCampaigns()
      invalidation.invalidateNotifications()
    },
    session_started: (m) => {
      invalidation.invalidateCampaigns()
      invalidation.invalidateNotifications()
      toast('session_started', m)
    },
    session_paused: (m) => {
      invalidation.invalidateCampaigns()
      invalidation.invalidateNotifications()
      toast('session_paused', m)
    },
    session_finished: (m) => {
      invalidation.invalidateCampaigns()
      invalidation.invalidateNotifications()
      toast('session_finished', m)
    },
    campaign_deleted: () => invalidation.invalidateCampaigns(),

    // ── Legacy game event names (backward compatibility) ─────────────
    game_created: () => invalidation.invalidateCampaigns(),
    game_started: (m) => {
      invalidation.invalidateCampaigns()
      toast('game_started', m)
    },
    game_ended: (m) => {
      invalidation.invalidateCampaigns()
      toast('game_ended', m)
    },
    game_finished: () => invalidation.invalidateCampaigns(),

    // ── Character selection (silent — cache invalidation only) ───────
    campaign_character_selected: () => {
      invalidation.invalidateCampaigns()
      invalidation.invalidateNotifications()
    },
    campaign_character_released: () => {
      invalidation.invalidateCampaigns()
      invalidation.invalidateNotifications()
    },

    // ── Role change (silent) ─────────────────────────────────────────
    campaign_role_changed: () => invalidation.invalidateCampaigns(),
  }

  return useEvents(userId, handlers)
}
