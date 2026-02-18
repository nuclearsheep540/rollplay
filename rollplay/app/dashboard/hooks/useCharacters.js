/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { useQuery } from '@tanstack/react-query'
import { authFetch } from '@/app/shared/utils/authFetch'

/**
 * Query hook for fetching the current user's characters.
 *
 * Replaces: fetchCharacters() + characters state in CampaignManager
 *
 * @param {object} [options]
 * @param {boolean} [options.enabled=true] - Whether to run the query
 * @returns TanStack query with characters array
 */
export function useCharacters({ enabled = true } = {}) {
  return useQuery({
    queryKey: ['characters'],
    queryFn: async () => {
      const response = await authFetch('/api/characters/', {
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Failed to fetch characters')
      }

      const data = await response.json()
      return data || []
    },
    enabled,
  })
}
