/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheck } from '@fortawesome/free-solid-svg-icons'
import { formatPanelMessage, getNavigationTab } from '../config/eventConfig'
import { formatRelativeTime } from '../utils/formatTime'

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

  // Navigate to relevant tab + mark as read
  const handleNavigate = (notification) => {
    onNotificationClick(notification.id)
    const tab = getNavigationTab(notification.event_type)
    if (tab) {
      router.push(`/dashboard?tab=${tab}`)
    }
  }

  // Mark as read only (for checkmark button)
  const handleMarkAsRead = (e, notificationId) => {
    e.stopPropagation()
    onNotificationClick(notificationId)
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
            <div
              key={notification.id}
              className={`flex border-b border-slate-100 ${
                !notification.read ? 'bg-blue-50' : ''
              }`}
            >
              {/* Text content - clickable for navigation */}
              <button
                onClick={() => handleNavigate(notification)}
                className="flex-1 text-left p-4 hover:bg-slate-50 transition-colors"
              >
                <p className="text-sm text-slate-900">
                  {formatPanelMessage(notification)}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {formatRelativeTime(notification.created_at)}
                </p>
              </button>

              {/* Vertical separator + Checkmark CTA - only for unread items */}
              {!notification.read && (
                <div className="flex items-center border-l border-slate-200">
                  <button
                    onClick={(e) => handleMarkAsRead(e, notification.id)}
                    className="px-4 h-full flex items-center text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
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
