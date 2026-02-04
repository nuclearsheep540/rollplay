/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useRouter } from 'next/navigation'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheck } from '@fortawesome/free-solid-svg-icons'
import { formatPanelMessage, getNavigationTab } from '../config/eventConfig'
import { formatRelativeTime } from '../utils/formatTime'

export default function NotificationPanel({ notifications, onNotificationClick, onMarkAllRead, onClose, userId }) {
  const router = useRouter()

  // Navigate to relevant tab + mark as read + close panel
  const handleNavigate = (notification) => {
    onNotificationClick(notification.id)
    onClose() // Close the panel when clicking a notification
    const tab = getNavigationTab(notification.event_type)
    if (tab) {
      // Build URL with campaign context for campaign-related notifications
      if (tab === 'campaigns' && notification.data?.campaign_id) {
        if (notification.event_type === 'campaign_invite_received') {
          // Campaign invite - use invite_campaign_id for stale invite validation
          router.push(`/dashboard?tab=${tab}&invite_campaign_id=${notification.data.campaign_id}`)
        } else {
          // Other campaign notifications - expand the campaign drawer
          router.push(`/dashboard?tab=${tab}&expand_campaign_id=${notification.data.campaign_id}`)
        }
      } else {
        router.push(`/dashboard?tab=${tab}`)
      }
    }
  }

  // Mark as read only (for checkmark button)
  const handleMarkAsRead = (e, notificationId) => {
    e.stopPropagation()
    onNotificationClick(notificationId)
  }

  return (
    <div className="w-96 bg-surface-secondary rounded-lg shadow-xl border border-border">
      {/* Header */}
      <div className="p-4 border-b border-border flex justify-between items-center">
        <h3 className="font-semibold text-content-on-dark">Notifications</h3>
        {notifications.length > 0 && (
          <button
            onClick={onMarkAllRead}
            className="text-sm text-feedback-info hover:opacity-80"
          >
            Mark all read
          </button>
        )}
      </div>

      {/* Notifications List */}
      <div className="max-h-96 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="p-8 text-center text-content-secondary">
            No notifications
          </div>
        ) : (
          notifications.map((notification) => (
            <div
              key={notification.id}
              className={`flex border-b border-border-subtle ${
                !notification.read ? 'bg-feedback-info/10' : ''
              }`}
            >
              {/* Text content - clickable for navigation */}
              <button
                onClick={() => handleNavigate(notification)}
                className="flex-1 text-left p-4 hover:bg-interactive-hover/20 transition-colors"
              >
                <p className="text-sm text-content-on-dark">
                  {formatPanelMessage(notification, userId)}
                </p>
                <p className="text-xs text-content-secondary mt-1">
                  {formatRelativeTime(notification.created_at)}
                </p>
              </button>

              {/* Vertical separator + Checkmark CTA - only for unread items */}
              {!notification.read && (
                <div className="flex items-center">
                  <button
                    onClick={(e) => handleMarkAsRead(e, notification.id)}
                    className="px-4 h-full flex items-center text-content-secondary hover:text-feedback-success hover:bg-feedback-success/10 transition-colors"
                    aria-label="Mark as read"
                  >
                    <FontAwesomeIcon icon={faCheck} className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
