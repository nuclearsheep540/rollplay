/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { useQuery } from '@tanstack/react-query'
import { authFetch } from '@/app/shared/utils/authFetch'

/**
 * Authoritative asset total from the backend (bare SQL COUNT).
 *
 * Keyed under ['assets', 'count'] on purpose: every asset mutation
 * already invalidates the ['assets'] prefix, so the count refetches
 * automatically after uploads, deletes, etc.
 */
export function useAssetCount() {
  return useQuery({
    queryKey: ['assets', 'count'],
    queryFn: async () => {
      const response = await authFetch('/api/library/count', {
        method: 'GET',
      })

      if (!response.ok) {
        throw new Error('Failed to count assets')
      }

      const data = await response.json()
      return data.total ?? 0
    },
  })
}
