/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBell } from '@fortawesome/free-solid-svg-icons'
import NotificationPanel from './NotificationPanel'
import { ToastNotification } from './ToastNotification'
import { useNotifications } from '@/app/dashboard/hooks/useNotifications'
import { useMarkNotificationRead, useMarkAllNotificationsRead } from '@/app/dashboard/hooks/mutations/useNotificationMutations'

export default function NotificationBell({ userId, toasts = [], onDismissToast }) {
  const { data: notifications = [] } = useNotifications(userId)
  const unreadCount = notifications.filter(n => !n.read).length

  const markReadMutation = useMarkNotificationRead()
  const markAllReadMutation = useMarkAllNotificationsRead()

  const handleNotificationClick = async (notificationId) => {
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

  return (
    <div className="relative">
      {/* Toast notifications - positioned to the left of the bell, growing leftward */}
      {toasts.length > 0 && (
        <div className="absolute right-full top-1/2 -translate-y-1/2 mr-3 flex flex-row-reverse items-center">
          {toasts.map((toast) => (
            <ToastNotification
              key={toast.id}
              id={toast.id}
              type={toast.type}
              message={toast.message}
              duration={toast.duration}
              onDismiss={onDismissToast}
            />
          ))}
        </div>
      )}

      <Popover>
        <PopoverButton
          className="flex items-center text-content-secondary hover:opacity-80 transition-opacity"
          aria-label="Notifications"
        >
          <FontAwesomeIcon icon={faBell} className="h-7 w-7" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-feedback-error text-content-on-dark text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </PopoverButton>

        <PopoverPanel className="absolute right-0 top-12 z-50">
          {({ close }) => (
            <NotificationPanel
              notifications={notifications}
              onNotificationClick={handleNotificationClick}
              onMarkAllRead={handleMarkAllRead}
              onClose={close}
              userId={userId}
            />
          )}
        </PopoverPanel>
      </Popover>
    </div>
  )
}
