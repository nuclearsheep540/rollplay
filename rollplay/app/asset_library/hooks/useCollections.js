/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { useQuery } from '@tanstack/react-query'
import { authFetch } from '@/app/shared/utils/authFetch'

export const COLLECTIONS_QUERY_KEY = ['asset-collections']

/**
 * Query hook for the user's collections (manual and smart).
 *
 * @returns TanStack Query result with { data: Collection[], ... }
 */
export function useCollections() {
  return useQuery({
    queryKey: COLLECTIONS_QUERY_KEY,
    queryFn: async () => {
      const response = await authFetch('/api/library/collections', {
        method: 'GET',
      })

      if (!response.ok) {
        throw new Error('Failed to fetch collections')
      }

      const data = await response.json()
      return data.collections || []
    },
  })
}
