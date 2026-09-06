/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/app/shared/utils/authFetch'

/**
 * The campaign's game, as the dashboard drives it.
 *
 * Two verbs the GM sees — start and end — plus scheduling the next one.
 * There is no create: a campaign is born with its session and keeps it for
 * life, which is what carries token positions and the adventure log from one
 * game to the next. "Pause" survives only inside api-site, for the expiry
 * sweeper; nothing here should ever say it.
 */

/**
 * Start the campaign's game.
 */
export function useStartGame() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (sessionId) => {
      const response = await authFetch(`/api/sessions/${sessionId}/start`, {
        method: 'POST',
        credentials: 'include',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Failed to start the game')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
    },
  })
}

/**
 * End the running game. The session survives — everything on the board and in
 * the log comes back the next time it starts.
 */
export function useEndGame() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (sessionId) => {
      const response = await authFetch(`/api/sessions/${sessionId}/end`, {
        method: 'POST',
        credentials: 'include',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Failed to end the game')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
    },
  })
}

/**
 * Say when the next game is, or clear it by passing null.
 *
 * Purely communicative — nothing starts on the date and nobody is reminded. The
 * value is sent as an ISO instant so every player reads it in their own zone.
 */
export function useScheduleGame() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ sessionId, scheduledAt }) => {
      const response = await authFetch(`/api/sessions/${sessionId}/schedule`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ scheduled_at: scheduledAt }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Failed to save the schedule')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
    },
  })
}
