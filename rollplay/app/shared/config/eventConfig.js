/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

/**
 * Centralized Event Configuration
 *
 * Single source of truth for all notification event metadata:
 * - Toast messages (short & vague to entice bell click)
 * - Panel messages (full templated details)
 * - Toast types (info/success/warning/error)
 * - Navigation tab routing
 */

export const EVENT_CONFIG = {
  'friend_request_received': {
    toastMessage: 'New friend request',
    panelMessage: (data) => `${data.requester_screen_name} sent you a friend request`,
    toastType: 'info',
    navigationTab: 'friends'
  },

  'friend_request_accepted': {
    toastMessage: 'Friend request accepted',
    panelMessage: (data) => `${data.friend_screen_name} accepted your friend request`,
    toastType: 'success',
    navigationTab: 'friends'
  },

  'friend_request_declined': {
    toastMessage: 'Friend request declined',
    panelMessage: (data) => `${data.declined_by_screen_name} declined your friend request`,
    toastType: 'info',
    navigationTab: 'friends'
  },

  'friend_removed': {
    toastMessage: 'Friend removed',
    panelMessage: (data) => `${data.removed_by_screen_name} removed you as a friend`,
    toastType: 'warning',
    navigationTab: 'friends'
  },

  'campaign_invite_received': {
    toastMessage: 'New campaign invite',
    panelMessage: (data) => `${data.host_screen_name} invited you to "${data.campaign_name}"`,
    toastType: 'info',
    navigationTab: 'campaigns'
  },

  'campaign_invite_accepted': {
    toastMessage: 'Player joined campaign',
    panelMessage: (data) => `${data.player_screen_name} joined your campaign "${data.campaign_name}"`,
    toastType: 'success',
    navigationTab: 'campaigns'
  },

  'campaign_invite_declined': {
    toastMessage: 'Campaign invite declined',
    panelMessage: (data) => `${data.player_screen_name} declined your invite to "${data.campaign_name}"`,
    toastType: 'info',
    navigationTab: 'campaigns'
  },

  'campaign_player_removed': {
    toastMessage: 'Removed from campaign',
    panelMessage: (data) => `You were removed from campaign "${data.campaign_name}"`,
    toastType: 'warning',
    navigationTab: 'campaigns'
  },

  'game_created': {
    toastMessage: null,  // Silent - no toast notification
    panelMessage: (data) => `${data.host_screen_name} created new session "${data.game_name}" in ${data.campaign_name}`,
    toastType: 'info',
    navigationTab: 'campaigns'
  },

  'game_started': {
    toastMessage: 'Game session started',
    panelMessage: (data) => `${data.dm_screen_name} started game session "${data.game_name}"`,
    toastType: 'success',
    navigationTab: 'sessions'
  },

  'game_ended': {
    toastMessage: null,  // Silent - no toast notification
    panelMessage: (data) => `Game session "${data.game_name}" was paused by ${data.ended_by_screen_name}`,
    toastType: 'info',
    navigationTab: 'campaigns'
  },

  'game_finished': {
    toastMessage: null,  // Silent - no toast notification
    panelMessage: (data) => `Campaign milestone: "${data.game_name}" completed!`,
    toastType: 'success',
    navigationTab: 'campaigns'
  }
}

/**
 * Get event configuration by event type
 * @param {string} eventType - The event type identifier
 * @returns {object|null} Event configuration or null if not found
 */
export function getEventConfig(eventType) {
  return EVENT_CONFIG[eventType] || null
}

/**
 * Format panel message for an event
 * @param {object} notification - Notification object with event_type and data
 * @returns {string} Formatted message
 */
export function formatPanelMessage(notification) {
  const config = EVENT_CONFIG[notification.event_type]
  if (!config) {
    return 'New notification'
  }
  return config.panelMessage(notification.data)
}

/**
 * Get navigation tab for an event type
 * @param {string} eventType - The event type identifier
 * @returns {string|null} Tab name or null
 */
export function getNavigationTab(eventType) {
  const config = EVENT_CONFIG[eventType]
  return config?.navigationTab || null
}
