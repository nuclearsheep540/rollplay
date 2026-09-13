/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { authFetch } from '@/app/shared/utils/authFetch'

/** Every character this user owns, keepsakes included. */
export function useCharacters() {
  return useQuery({
    queryKey: ['characters'],
    queryFn: async () => {
      const response = await authFetch('/api/characters/me', { credentials: 'include' })
      if (!response.ok) throw new Error('Could not load your characters')
      return response.json()
    },
  })
}

export function useCharacter(characterId) {
  return useQuery({
    queryKey: ['character', characterId],
    enabled: !!characterId,
    queryFn: async () => {
      const response = await authFetch(`/api/characters/${characterId}`, { credentials: 'include' })
      if (!response.ok) throw new Error('Could not load this character')
      return response.json()
    },
  })
}

/** Creating a character against a session's config IS joining that party. */
export function useCreateCharacter() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ sessionId, values, avatarAssetId = null }) => {
      const response = await authFetch('/api/characters/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ session_id: sessionId, values, avatar_asset_id: avatarAssetId }),
      })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.detail || 'Could not create this character')
      }
      return response.json()
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['characters'] })
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      queryClient.invalidateQueries({ queryKey: ['sessions', variables.sessionId] })
    },
  })
}

export function useUpdateCharacterComponent(characterId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (value) => {
      const response = await authFetch(`/api/characters/${characterId}/components/${value.component_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ value }),
      })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.detail || 'Could not save that change')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['character', characterId] })
      queryClient.invalidateQueries({ queryKey: ['characters'] })
    },
  })
}

export function useSetCharacterAlive(characterId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (isAlive) => {
      const response = await authFetch(`/api/characters/${characterId}/alive`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ is_alive: isAlive }),
      })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.detail || 'Could not change that')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['character', characterId] })
      queryClient.invalidateQueries({ queryKey: ['characters'] })
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
    },
  })
}

/**
 * Leave the table for good. The character becomes a keepsake its owner keeps; it cannot
 * rejoin, and the player is free to build another straight away.
 */
export function useEjectCharacter() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (characterId) => {
      const response = await authFetch(`/api/characters/${characterId}/eject`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.detail || 'Could not eject this character')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['characters'] })
      queryClient.invalidateQueries({ queryKey: ['character'] })
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
    },
  })
}

export function useDeleteCharacter() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (characterId) => {
      const response = await authFetch(`/api/characters/${characterId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!response.ok && response.status !== 204) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.detail || 'Could not delete this character')
      }
      return true
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['characters'] })
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
    },
  })
}

/** One session, for the create form's header. */
export function useSession(sessionId) {
  return useQuery({
    queryKey: ['sessions', sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const response = await authFetch(`/api/sessions/${sessionId}`, { credentials: 'include' })
      if (!response.ok) throw new Error('Could not load the table')
      return response.json()
    },
  })
}
