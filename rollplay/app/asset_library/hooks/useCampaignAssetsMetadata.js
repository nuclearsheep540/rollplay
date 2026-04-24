/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { useQuery } from '@tanstack/react-query'
import { authFetch } from '@/app/shared/utils/authFetch'

/**
 * Query hook for fetching aggregated asset metadata for a campaign —
 * count and total file size across all assets associated with the
 * campaign. Returns `null` while disabled or the campaign id is
 * missing so consumers can render a "—" placeholder without branching
 * on loading state.
 *
 * @param {string|null} campaignId - Campaign to read metadata for
 * @param {Object} options
 * @param {boolean} options.enabled - Whether the query should execute
 */
export function useCampaignAssetsMetadata(campaignId, { enabled = true } = {}) {
  return useQuery({
    queryKey: ['assets', 'campaign-metadata', campaignId],
    queryFn: async () => {
      const response = await authFetch(`/api/library/campaigns/${campaignId}/metadata`, {
        method: 'GET',
      })
      if (!response.ok) {
        throw new Error('Failed to fetch campaign asset metadata')
      }
      return response.json()
    },
    enabled: enabled && !!campaignId,
  })
}
