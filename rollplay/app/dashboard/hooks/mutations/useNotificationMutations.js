/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/app/shared/utils/authFetch'

/**
 * Mutation hook for marking a single notification as read.
 * Replaces: handleNotificationClick/handleMarkAsRead in NotificationBell + AccountNotificationFeed
 */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (notificationId) => {
      const response = await authFetch(`/api/notifications/${notificationId}/read`, {
        method: 'POST',
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Failed to mark notification as read')
      }

      return notificationId
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread'] })
    },
  })
}

/**
 * Mutation hook for marking all notifications as read.
 * Replaces: handleMarkAllRead in NotificationBell + AccountNotificationFeed
 */
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const response = await authFetch('/api/notifications/read-all', {
        method: 'POST',
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Failed to mark all notifications as read')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread'] })
    },
  })
}
