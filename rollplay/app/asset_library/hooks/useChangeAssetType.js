/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/app/shared/utils/authFetch'

/**
 * Mutation hook for changing a media asset's type tag.
 *
 * @returns TanStack mutation with mutate({ assetId, assetType })
 */
export function useChangeAssetType() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ assetId, assetType }) => {
      const response = await authFetch(`/api/library/${assetId}/type`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset_type: assetType }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Failed to change asset type')
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] })
    },
  })
}
