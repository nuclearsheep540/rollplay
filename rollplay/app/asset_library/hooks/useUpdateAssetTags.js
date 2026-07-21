/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/app/shared/utils/authFetch'

/**
 * Mutation hook for replacing an asset's user tags (atomic full-replace).
 *
 * @returns TanStack mutation with mutate({ assetId, tags })
 */
export function useUpdateAssetTags() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ assetId, tags }) => {
      const response = await authFetch(`/api/library/${assetId}/tags`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Failed to update tags')
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] })
    },
  })
}
