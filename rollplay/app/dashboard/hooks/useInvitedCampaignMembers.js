/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { useQuery } from '@tanstack/react-query'
import { authFetch } from '@/app/shared/utils/authFetch'

/**
 * Query hook for fetching members of an invited campaign.
 *
 * Replaces: useEffect at lines 872-899 + invitedCampaignMembers/loadingInvitedMembers state
 *
 * Only fetches when a campaignId is provided (enabled by default when campaignId is truthy).
 *
 * @param {string|null} campaignId - The campaign ID to fetch members for
 * @returns TanStack query with members array
 */
export function useInvitedCampaignMembers(campaignId) {
  return useQuery({
    queryKey: ['campaigns', campaignId, 'members'],
    queryFn: async () => {
      const response = await authFetch(`/api/campaigns/${campaignId}/members`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Failed to fetch campaign members')
      }

      return response.json()
    },
    enabled: !!campaignId,
  })
}
