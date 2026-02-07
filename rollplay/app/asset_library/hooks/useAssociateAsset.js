/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/app/shared/utils/authFetch'

/**
 * Mutation hook for associating an asset with a campaign.
 *
 * @returns TanStack mutation with mutate({ assetId, campaignId, sessionId? })
 */
export function useAssociateAsset() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ assetId, campaignId, sessionId = null }) => {
      const body = { campaign_id: campaignId }
      if (sessionId) {
        body.session_id = sessionId
      }

      const response = await authFetch(`/api/library/${assetId}/associate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Failed to associate asset')
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] })
    },
  })
}
