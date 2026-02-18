/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/app/shared/utils/authFetch'

/**
 * Mutation hook for creating a game session.
 * Replaces: createGame() in CampaignManager
 */
export function useCreateSession() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ campaignId, name, maxPlayers }) => {
      const gameData = {
        name: name?.trim() || 'Session 1',
        max_players: maxPlayers,
        campaign_id: `${campaignId}`,
      }

      const response = await authFetch(
        `/api/campaigns/sessions?campaign_id=${campaignId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(gameData),
        }
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Failed to create game')
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
    },
  })
}

/**
 * Mutation hook for starting a game session.
 * Replaces: startGame() in CampaignManager
 */
export function useStartSession() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (sessionId) => {
      const response = await authFetch(`/api/sessions/${sessionId}/start`, {
        method: 'POST',
        credentials: 'include',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Failed to start game')
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
    },
  })
}

/**
 * Mutation hook for pausing a game session.
 * Replaces: confirmPauseSession() in CampaignManager
 */
export function usePauseSession() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (sessionId) => {
      const response = await authFetch(`/api/sessions/${sessionId}/pause`, {
        method: 'POST',
        credentials: 'include',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Failed to pause session')
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
    },
  })
}

/**
 * Mutation hook for finishing a game session permanently.
 * Replaces: confirmFinishSession() in CampaignManager
 */
export function useFinishSession() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (sessionId) => {
      const response = await authFetch(`/api/sessions/${sessionId}/finish`, {
        method: 'POST',
        credentials: 'include',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Failed to finish session')
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
    },
  })
}

/**
 * Mutation hook for deleting a game session.
 * Replaces: deleteGame() in CampaignManager
 */
export function useDeleteSession() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (sessionId) => {
      const response = await authFetch(`/api/sessions/${sessionId}`, {
        method: 'DELETE',
        credentials: 'include',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Failed to delete game')
      }

      return sessionId
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
    },
  })
}
