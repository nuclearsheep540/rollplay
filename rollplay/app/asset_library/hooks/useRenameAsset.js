/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { useMutation, useQueryClient } from '@tanstack/react-query'

/**
 * Mutation hook for renaming a media asset.
 *
 * @returns TanStack mutation with mutate({ assetId, filename })
 */
export function useRenameAsset() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ assetId, filename }) => {
      const response = await fetch(`/api/library/${assetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ filename }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Failed to rename asset')
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] })
    },
  })
}
