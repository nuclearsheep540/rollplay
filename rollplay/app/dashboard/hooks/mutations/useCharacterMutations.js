/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/app/shared/utils/authFetch'

/**
 * Mutation hook for selecting a character for a campaign.
 * Replaces: raw fetch in CharacterSelectionModal
 */
export function useSelectCharacter() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ campaignId, characterId }) => {
      const response = await authFetch(`/api/campaigns/${campaignId}/select-character`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ character_id: characterId }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Failed to select character')
      }
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
      const response = await authFetch(`/api/campaigns/${campaignId}/my-character`, {
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


/**
 * Mutation hook for deleting a character.
 *
 * Backend splits delete by lifecycle: finalised characters go through
 * ``DELETE /api/characters/{id}`` (soft-delete, refuses if locked to a
 * campaign), drafts go through ``DELETE /api/characters/draft/{id}`` (hard
 * delete). Caller passes ``{ id, isDraft }`` so we hit the right endpoint;
 * also accepts a bare id for back-compat with finalised-only callers.
 */
export function useDeleteCharacter() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (arg) => {
      const characterId = typeof arg === 'object' ? arg.id : arg
      const isDraft = typeof arg === 'object' ? Boolean(arg.isDraft) : false
      const url = isDraft
        ? `/api/characters/draft/${characterId}`
        : `/api/characters/${characterId}`
      const response = await authFetch(url, {
        method: 'DELETE',
        credentials: 'include',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Failed to delete character')
      }

      return characterId
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      queryClient.invalidateQueries({ queryKey: ['characters'] })
    },
  })
}
