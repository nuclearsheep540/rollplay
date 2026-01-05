/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

export default function NotificationPanel({ notifications, onNotificationClick, onMarkAllRead, onClose }) {
  const panelRef = useRef(null)
  const router = useRouter()

  // Close panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  // Format notification message with full details
  const formatNotificationMessage = (notification) => {
    const { event_type, data } = notification

    switch (event_type) {
      case 'friend_request_received':
        return `${data.requester_screen_name} sent you a friend request`

      case 'friend_request_accepted':
        return `${data.friend_screen_name} accepted your friend request`

      case 'campaign_invite_received':
        return `${data.host_screen_name} invited you to "${data.campaign_name}"`

      case 'campaign_invite_accepted':
        return `${data.player_screen_name} joined your campaign "${data.campaign_name}"`

      case 'campaign_player_removed':
        return `You were removed from campaign "${data.campaign_name}"`

      case 'game_started':
        return `${data.dm_screen_name} started game session "${data.game_name}"`

      case 'game_ended':
        return `Game session "${data.game_name}" ended`

      case 'game_finished':
        return `Campaign milestone: "${data.game_name}" completed!`

      default:
        return 'New notification'
    }
  }

  // Navigate to relevant tab based on notification type
  const getNavigationTab = (event_type) => {
    if (event_type.startsWith('friend_request')) return 'friends'
    if (event_type.startsWith('campaign')) return 'campaigns'
    if (event_type.startsWith('game')) return 'sessions'
    return null
  }

  const handleNotificationClick = (notification) => {
    // Mark as read
    onNotificationClick(notification.id)

    // Navigate to relevant tab
    const tab = getNavigationTab(notification.event_type)
    if (tab) {
      router.push(`/dashboard?tab=${tab}`)
      onClose()
    }
  }

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-12 w-96 bg-white rounded-lg shadow-xl border border-slate-200 z-50"
    >
      {/* Header */}
      <div className="p-4 border-b border-slate-200 flex justify-between items-center">
        <h3 className="font-semibold text-slate-900">Notifications</h3>
        {notifications.length > 0 && (
          <button
            onClick={onMarkAllRead}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            Mark all read
          </button>
        )}
      </div>

      {/* Notifications List */}
      <div className="max-h-96 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            No notifications
          </div>
        ) : (
          notifications.map((notification) => (
            <button
              key={notification.id}
              onClick={() => handleNotificationClick(notification)}
              className={`w-full text-left p-4 border-b border-slate-100 hover:bg-slate-50 transition-colors ${
                !notification.read ? 'bg-blue-50' : ''
              }`}
            >
              <p className="text-sm text-slate-900">
                {formatNotificationMessage(notification)}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {new Date(notification.created_at).toLocaleString()}
              </p>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
