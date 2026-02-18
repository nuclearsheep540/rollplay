/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { useQuery } from '@tanstack/react-query'
import { authFetch } from '@/app/shared/utils/authFetch'

/**
 * Query hook for fetching unread notifications.
 *
 * Replaces: fetchNotifications() in NotificationBell and AccountNotificationFeed
 *
 * Shared by NotificationBell and AccountNotificationFeed — TanStack deduplicates automatically.
 *
 * @param {string|null} userId - Current user ID (query is disabled when falsy)
 * @returns TanStack query with array of notification objects
 */
export function useNotifications(userId) {
  return useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: async () => {
      const response = await authFetch('/api/notifications/unread', {
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Failed to fetch notifications')
      }

      return response.json()
    },
    enabled: !!userId,
  })
}
