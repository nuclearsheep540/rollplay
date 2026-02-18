/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { useQuery } from '@tanstack/react-query'
import { authFetch } from '@/app/shared/utils/authFetch'

/**
 * Query hook for fetching friendships (accepted friends + incoming requests).
 *
 * Replaces: fetchFriends() in FriendsWidget and FriendsManager
 *
 * Shared by FriendsWidget and FriendsManager — TanStack deduplicates automatically.
 *
 * @param {object} [options]
 * @param {boolean} [options.enabled=true] - Whether to run the query
 * @returns TanStack query with { accepted: [], incoming_requests: [] }
 */
export function useFriendships({ enabled = true } = {}) {
  return useQuery({
    queryKey: ['friendships'],
    queryFn: async () => {
      const response = await authFetch('/api/friendships/', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Failed to fetch friendships')
      }

      return response.json()
    },
    enabled,
  })
}
