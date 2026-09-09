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
export function useAuthenticatedEvents(userId, showToast, addPulseEvent) {
  const invalidation = useEventQueryInvalidation()

  // Any event the server flagged reaches the pulse, whatever its type — the
  // decision of what is pulse-worthy belongs to the event's factory, not to a
  // list of types maintained here.
  const pulse = (message) => {
    if (message.show_pulse && addPulseEvent && message.pulse_entry) {
      addPulseEvent(message.pulse_entry)
    }
  }

  const toast = (eventType, message, bodyFactory) => {
    if (!message.show_toast) return
    const config = getEventConfig(eventType)
    // toastMessage is usually a constant string, but an event whose wording
    // depends on its payload (a game that has a name, say) declares a function
    // instead. Resolving it here keeps that choice in the config rather than
    // making every caller pass a bodyFactory for the same reason.
    const body = bodyFactory
      ? bodyFactory(config, message.data)
      : typeof config.toastMessage === 'function'
        ? config.toastMessage(message.data)
        : config.toastMessage
    showToast({ type: config.toastType, message: body })
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

    // ── Presence events ──────────────────────────────────────────────
    // is_online is computed on read, so a refetch is what repaints the dots.
    friend_online: (m) => {
      invalidation.invalidateFriendships()
      toast('friend_online', m, (c, d) => c.panelMessage(d))
      pulse(m)
    },
    friend_offline: () => invalidation.invalidateFriendships(),

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
    // The SYSTEM take-down (expiry sweeper, admin CLI) — repaint only, never
    // a toast: from a player's side nothing happened.
    session_paused: () => {
      invalidation.invalidateCampaigns()
      invalidation.invalidateNotifications()
    },
    // The host said when the next game is (or cleared it). Non-hosts only.
    session_scheduled: (m) => {
      invalidation.invalidateCampaigns()
      invalidation.invalidateNotifications()
      // Same sentence in the toast and the feed — the date has to be rendered
      // from the payload either way, so there is nothing to say twice.
      toast('session_scheduled', m, (config, data) => config.panelMessage(data))
    },
    // The host pressed End game. Only non-hosts receive this.
    session_ended: (m) => {
      invalidation.invalidateCampaigns()
      invalidation.invalidateNotifications()
      toast('session_ended', m)
    },
    campaign_deleted: () => invalidation.invalidateCampaigns(),

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
