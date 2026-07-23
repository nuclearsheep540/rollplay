/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/app/shared/utils/authFetch'

/**
 * Mutation hook for an asset's campaign association.
 *
 * @returns TanStack mutation with mutate({ assetId, campaignId, member })
 *   - member true (the default) associates, false removes the association
 */
export function useAssociateAsset() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ assetId, campaignId, member = true }) => {
      const body = { campaign_id: campaignId }

      const response = await authFetch(`/api/library/${assetId}/${member ? 'associate' : 'disassociate'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || (member
          ? 'Failed to associate asset'
          : 'Failed to remove asset from campaign'))
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] })
    },
  })
}
