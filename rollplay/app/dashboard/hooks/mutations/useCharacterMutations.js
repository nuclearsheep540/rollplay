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

/**
 * Mutation hook for creating a character (clone flow).
 * Replaces: raw POST fetch in CharacterEditPanel
 */
export function useCreateCharacter() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (characterData) => {
      const response = await fetch('/api/characters/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(characterData),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw errorData
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
 * Mutation hook for updating an existing character.
 * Replaces: raw PUT fetch in CharacterEditPanel
 */
export function useUpdateCharacter() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ characterId, characterData }) => {
      const response = await fetch(`/api/characters/${characterId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(characterData),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw errorData
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
 * Mutation hook for deleting a character.
 * Replaces: raw fetch in CharacterManager
 */
export function useDeleteCharacter() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (characterId) => {
      const response = await fetch(`/api/characters/${characterId}`, {
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
