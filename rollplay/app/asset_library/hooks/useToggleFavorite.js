/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/app/shared/utils/authFetch'

/**
 * Mutation hook for the library favorite flag, with an optimistic
 * update so the star responds instantly.
 *
 * @returns TanStack mutation with mutate({ assetId, favorite })
 */
export function useToggleFavorite() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ assetId, favorite }) => {
      const response = await authFetch(`/api/library/${assetId}/favorite`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorite }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Failed to update favorite')
      }

      return response.json()
    },
    onMutate: async ({ assetId, favorite }) => {
      await queryClient.cancelQueries({ queryKey: ['assets'] })
      const previous = queryClient.getQueriesData({ queryKey: ['assets'] })

      queryClient.setQueriesData({ queryKey: ['assets'] }, (assets) => {
        if (!Array.isArray(assets)) return assets
        return assets.map((asset) =>
          asset.id === assetId ? { ...asset, favorite } : asset
        )
      })

      return { previous }
    },
    onError: (_error, _variables, mutationContext) => {
      for (const [queryKey, data] of mutationContext?.previous || []) {
        queryClient.setQueryData(queryKey, data)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] })
    },
  })
}
