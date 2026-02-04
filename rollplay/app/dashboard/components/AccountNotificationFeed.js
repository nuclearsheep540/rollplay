/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useRouter } from 'next/navigation'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheck, faBell } from '@fortawesome/free-solid-svg-icons'
import { THEME, COLORS } from '@/app/styles/colorTheme'
import { formatPanelMessage, getNavigationTab } from '@/app/shared/config/eventConfig'
import { formatRelativeTime } from '@/app/shared/utils/formatTime'
import { useNotifications } from '../hooks/useNotifications'
import { useMarkNotificationRead, useMarkAllNotificationsRead } from '../hooks/mutations/useNotificationMutations'

export default function AccountNotificationFeed({ userId }) {
  const router = useRouter()

  const { data: notifications = [], isLoading: loading } = useNotifications(userId)
  const markReadMutation = useMarkNotificationRead()
  const markAllReadMutation = useMarkAllNotificationsRead()

  const handleNotificationClick = async (notification) => {
    try {
      await markReadMutation.mutateAsync(notification.id)

      // Navigate to relevant tab
      const tab = getNavigationTab(notification.event_type)
      if (tab) {
        let url = `/dashboard?tab=${tab}`
        if (tab === 'campaigns' && notification.data?.campaign_id) {
          url += `&expand_campaign_id=${notification.data.campaign_id}`
        }
        router.push(url)
      }
    } catch (error) {
      console.error('Failed to mark notification as read:', error)
    }
  }

  const handleMarkAsRead = async (e, notificationId) => {
    e.stopPropagation()
    try {
      await markReadMutation.mutateAsync(notificationId)
    } catch (error) {
      console.error('Failed to mark notification as read:', error)
    }
  }

  const handleMarkAllRead = async () => {
    try {
      await markAllReadMutation.mutateAsync()
    } catch (error) {
      console.error('Failed to mark all as read:', error)
    }
  }

  const unreadCount = notifications.filter(n => !n.read).length

  if (loading) {
    return (
      <div
        className="p-6 rounded-sm border h-fit"
        style={{backgroundColor: THEME.bgPanel, borderColor: THEME.borderSubtle}}
      >
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 mr-3" style={{borderColor: THEME.borderActive}}></div>
          <span style={{color: THEME.textSecondary}}>Loading notifications...</span>
        </div>
      </div>
    )
  }

  return (
    <div
      className="p-6 rounded-sm border flex flex-col"
      style={{backgroundColor: THEME.bgPanel, borderColor: THEME.borderSubtle}}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2
            className="text-xl font-semibold font-[family-name:var(--font-metamorphous)]"
            style={{color: THEME.textOnDark}}
          >
            Recent Activity
          </h2>
          {unreadCount > 0 && (
            <span
              className="px-2 py-0.5 text-xs font-semibold rounded-full"
              style={{backgroundColor: '#dc2626', color: 'white'}}
            >
              {unreadCount}
            </span>
          )}
        </div>
        {notifications.length > 0 && unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            className="text-sm hover:opacity-80 transition-opacity"
            style={{color: THEME.textAccent}}
          >
            Mark all read
          </button>
        )}
      </div>

      {/* Notifications List */}
      <div
        className="flex-1 overflow-y-auto"
        style={{scrollbarWidth: 'none', msOverflowStyle: 'none'}}
      >
        {notifications.length === 0 ? (
          <div className="py-8 text-center">
            <FontAwesomeIcon
              icon={faBell}
              className="text-4xl mb-3 opacity-30"
              style={{color: THEME.textSecondary}}
            />
            <p style={{color: THEME.textSecondary}}>No notifications yet</p>
          </div>
        ) : (
          notifications.slice(0, 20).map((notification) => (
            <div
              key={notification.id}
              className="flex"
              style={{
                backgroundColor: !notification.read ? `${COLORS.onyx}` : 'transparent'
              }}
            >
              {/* Text content - clickable for navigation */}
              <button
                onClick={() => handleNotificationClick(notification)}
                className="flex-1 text-left py-2 hover:opacity-80 transition-opacity"
              >
                <p className="text-sm" style={{color: THEME.textOnDark}}>
                  {formatPanelMessage(notification, userId)}
                </p>
                <p className="text-xs mt-0.5" style={{color: THEME.textSecondary}}>
                  {formatRelativeTime(notification.created_at)}
                </p>
              </button>

              {/* Checkmark CTA - only for unread items */}
              {!notification.read && (
                <div className="flex items-center">
                  <button
                    onClick={(e) => handleMarkAsRead(e, notification.id)}
                    className="px-2 h-full flex items-center hover:opacity-80 transition-opacity"
                    style={{color: THEME.textSecondary}}
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

      {/* Show count if more than 20 */}
      {notifications.length > 20 && (
        <p className="text-xs text-center mt-3" style={{color: THEME.textSecondary}}>
          Showing 20 of {notifications.length} notifications
        </p>
      )}
    </div>
  )
}
