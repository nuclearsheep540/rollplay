/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

/**
 * Character draft hooks — TanStack wrappers around /api/characters/draft/*.
 *
 * - useCharacterDraft(id): GET /api/characters/{id} (works for draft + finalised)
 * - useCreateDraft(): POST /api/characters/draft
 * - useUpdateDraft(id): PATCH /api/characters/draft/{id} — per-step payload
 * - useFinalizeDraft(id): POST /api/characters/draft/{id}/finalize
 * - useDiscardDraft(id): DELETE /api/characters/draft/{id}
 *
 * Every mutation invalidates the per-character query so subsequent reads
 * pick up the fresh server-derived state (derived stats, granted skills,
 * etc. recomputed on each PATCH).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/app/shared/utils/authFetch'

async function call(path, init = {}) {
  const response = await authFetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
    ...init,
  })
  if (response.status === 204) return null
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = body?.detail || `Request to ${path} failed (${response.status})`
    const err = new Error(message)
    err.status = response.status
    err.body = body
    throw err
  }
  return body
}

export function useCharacterDraft(characterId) {
  return useQuery({
    queryKey: ['character', characterId],
    queryFn: () => call(`/api/characters/${characterId}`),
    enabled: Boolean(characterId),
    // Don't refetch on every focus during the wizard — autosave is the source of truth.
    refetchOnWindowFocus: false,
  })
}

export function useMyCharacters() {
  return useQuery({
    queryKey: ['characters', 'me'],
    queryFn: () => call('/api/characters/me'),
  })
}

export function useCreateDraft() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ editionCode, name }) =>
      call('/api/characters/draft', {
        method: 'POST',
        body: JSON.stringify({ edition_code: editionCode, name }),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['character', data.id], data)
      // ['characters'] prefix-matches both roster caches: the dashboard's
      // ['characters'] and this slice's ['characters', 'me']. Invalidating
      // the longer key would miss the dashboard's.
      queryClient.invalidateQueries({ queryKey: ['characters'] })
    },
  })
}

export function useUpdateDraft(characterId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload) =>
      call(`/api/characters/draft/${characterId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['character', characterId], data)
    },
  })
}

export function useFinalizeDraft(characterId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      call(`/api/characters/draft/${characterId}/finalize`, { method: 'POST' }),
    onSuccess: (data) => {
      queryClient.setQueryData(['character', characterId], data)
      queryClient.invalidateQueries({ queryKey: ['characters'] })
    },
  })
}

export function useDiscardDraft(characterId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      call(`/api/characters/draft/${characterId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['character', characterId] })
      queryClient.invalidateQueries({ queryKey: ['characters'] })
    },
  })
}
