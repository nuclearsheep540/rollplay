/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/app/shared/utils/authFetch'

/**
 * The campaign's games, as the dashboard drives them.
 *
 * Two verbs the GM sees — start and end — plus naming the night afterwards and
 * planning the next one. There is no create and no reset: a campaign is born
 * with its session and keeps it for life. Each game is its own thing, and
 * starting one seeds it from the last one, which is what carries token
 * positions and the adventure log from one evening to the next.
 */

/**
 * Start a game for the campaign's session.
 *
 * Returns the new game, whose id is the room id the client enters with.
 */
export function useStartGame() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (sessionId) => {
      const response = await authFetch('/api/games/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ session_id: sessionId }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Failed to start the game')
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
    },
  })
}

/**
 * End the running game, optionally recording what it was called and what
 * happened. Nothing is lost — the next game starts from where this one ends.
 *
 * Name and summary are always optional: a GM who just wants the game to stop
 * sends neither.
 */
export function useEndGame() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ gameId, name = null, summary = null }) => {
      const response = await authFetch(`/api/games/${gameId}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, summary }),
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
 * Rename a past game or rewrite its summary (host only).
 *
 * A field left out is unchanged; an empty string clears it.
 */
export function useUpdateGame() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ gameId, name = null, summary = null }) => {
      const response = await authFetch(`/api/games/${gameId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, summary }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Failed to save the game')
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
    },
  })
}

/**
 * Say when the next game is and what it is called, or clear both with nulls.
 *
 * Purely communicative — nothing starts on the date and nobody is reminded. The
 * date is sent as an ISO instant so every player reads it in their own zone;
 * the name is taken by the next Start and belongs to that game from then on.
 */
export function useScheduleGame() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ sessionId, scheduledAt, nextGameName = null }) => {
      const response = await authFetch(`/api/sessions/${sessionId}/schedule`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ scheduled_at: scheduledAt, next_game_name: nextGameName }),
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
