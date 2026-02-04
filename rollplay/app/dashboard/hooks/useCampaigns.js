/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { useQuery } from '@tanstack/react-query'

/**
 * Query hook for fetching campaigns with members and sessions.
 *
 * Replaces: fetchCampaigns() waterfall + fetchAllSessions() + related useState
 *
 * Returns { campaigns, invitedCampaigns } where campaigns include
 * embedded `members` and `sessions` arrays.
 *
 * @param {string} userId - Current user ID (used to separate joined vs invited)
 * @param {object} [options]
 * @param {boolean} [options.enabled=true] - Whether to run the query
 * @returns TanStack query with { campaigns, invitedCampaigns }
 */
export function useCampaigns(userId, { enabled = true } = {}) {
  return useQuery({
    queryKey: ['campaigns'],
    queryFn: async () => {
      // 1. Fetch all campaigns for this user
      const response = await fetch('/api/campaigns/', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Failed to load campaigns')
      }

      const campaignsData = await response.json()

      // 2. Separate into joined vs invited
      const joined = []
      const invited = []

      campaignsData.forEach((campaign) => {
        if (campaign.invited_player_ids?.includes(userId)) {
          invited.push(campaign)
        } else {
          joined.push(campaign)
        }
      })

      // 3. Fetch members for each joined campaign (parallel)
      const campaignsWithMembers = await Promise.all(
        joined.map(async (campaign) => {
          try {
            const membersResponse = await fetch(
              `/api/campaigns/${campaign.id}/members`,
              {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
              }
            )

            if (membersResponse.ok) {
              const members = await membersResponse.json()
              return { ...campaign, members }
            }
            return { ...campaign, members: [] }
          } catch {
            return { ...campaign, members: [] }
          }
        })
      )

      // 4. Fetch sessions for each joined campaign (parallel)
      const campaignsWithSessions = await Promise.all(
        campaignsWithMembers.map(async (campaign) => {
          try {
            const sessionsResponse = await fetch(
              `/api/sessions/campaign/${campaign.id}`,
              {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
              }
            )

            if (sessionsResponse.ok) {
              const sessionsData = await sessionsResponse.json()
              return { ...campaign, sessions: sessionsData.sessions || [] }
            }
            return { ...campaign, sessions: [] }
          } catch {
            return { ...campaign, sessions: [] }
          }
        })
      )

      return {
        campaigns: campaignsWithSessions,
        invitedCampaigns: invited,
      }
    },
    enabled: enabled && !!userId,
    staleTime: 60 * 1000,
  })
}
