/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { useMutation, useQueryClient } from '@tanstack/react-query'

/**
 * Mutation hook for selecting a character for a campaign.
 * Replaces: raw fetch in CharacterSelectionModal
 */
export function useSelectCharacter() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ campaignId, characterId }) => {
      const response = await fetch(`/api/campaigns/${campaignId}/select-character`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ character_id: characterId }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Failed to select character')
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      queryClient.invalidateQueries({ queryKey: ['characters'] })
    },
  })
}

/**
 * Mutation hook for releasing a character from a campaign.
 * Replaces: handleReleaseCharacter() in CampaignManager
 */
export function useReleaseCharacter() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (campaignId) => {
      const response = await fetch(`/api/campaigns/${campaignId}/my-character`, {
        method: 'DELETE',
        credentials: 'include',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Failed to release character')
      }

      return campaignId
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      queryClient.invalidateQueries({ queryKey: ['characters'] })
    },
  })
}
