/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Runtime character hooks for use inside an active game session.
 *
 * - useMyCharacterForCampaign: derive *this* user's character locked to the
 *   current campaign from /api/characters/me (the list is small enough to
 *   filter client-side; no separate endpoint needed).
 * - useRuntimePatch: PATCH /api/characters/{id}/runtime with optimistic
 *   updates and on-failure revert. Tracks lastError for toast surfacing.
 * - useLevelUpPreview / useApplyLevelUp: the wizard-modal pair from 4.4.
 */

import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { authFetch } from '@/app/shared/utils/authFetch'

const QK = {
  myCharacters: ['characters', 'me'],
  character: (id) => ['character', id],
  levelUp: (id) => ['character', id, 'level-up'],
  campaignParty: (id) => ['campaign', id, 'party'],
}

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

/**
 * Locate the current user's character for a given campaign.
 *
 * Returns `{ character, isLoading, ... }`. `character` is undefined when the
 * user hasn't selected one for this campaign yet — the Character tab should
 * just hide in that case rather than show an error.
 */
export function useMyCharacterForCampaign(campaignId) {
  const query = useQuery({
    queryKey: QK.myCharacters,
    queryFn: () => call('/api/characters/me'),
    enabled: Boolean(campaignId),
  })
  const character = useMemo(() => {
    if (!query.data || !campaignId) return undefined
    return query.data.find((c) => c.active_campaign === campaignId && !c.is_draft)
  }, [query.data, campaignId])
  return { ...query, character }
}

/**
 * Patch one or more runtime fields. Performs an optimistic cache write so the
 * sheet updates immediately; reverts to the server's previous payload on
 * error. The server returns the full character so the success path replaces
 * the optimistic value with the authoritative one (incl. derived stats).
 */
export function useRuntimePatch(characterId) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (updates) =>
      call(`/api/characters/${characterId}/runtime`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }),
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: QK.character(characterId) })
      await queryClient.cancelQueries({ queryKey: QK.myCharacters })
      const previousCharacter = queryClient.getQueryData(QK.character(characterId))
      const previousList = queryClient.getQueryData(QK.myCharacters)

      // Optimistic patch on both the singular and the list cache entries.
      if (previousCharacter) {
        queryClient.setQueryData(QK.character(characterId), {
          ...previousCharacter,
          ...updates,
        })
      }
      if (Array.isArray(previousList)) {
        queryClient.setQueryData(
          QK.myCharacters,
          previousList.map((c) =>
            c.id === characterId ? { ...c, ...updates } : c
          )
        )
      }
      return { previousCharacter, previousList }
    },
    onError: (_err, _vars, context) => {
      if (context?.previousCharacter !== undefined) {
        queryClient.setQueryData(QK.character(characterId), context.previousCharacter)
      }
      if (context?.previousList !== undefined) {
        queryClient.setQueryData(QK.myCharacters, context.previousList)
      }
    },
    onSuccess: (fresh) => {
      queryClient.setQueryData(QK.character(characterId), fresh)
      // Refresh the list cache from the server — derived fields may have shifted.
      queryClient.invalidateQueries({ queryKey: QK.myCharacters })
    },
  })
}

export function useLevelUpPreview(characterId, enabled = false) {
  return useQuery({
    queryKey: QK.levelUp(characterId),
    queryFn: () => call(`/api/characters/${characterId}/level-up`),
    enabled: Boolean(characterId) && enabled,
    // Always refetch when the modal opens — preview reflects current XP / level.
    staleTime: 0,
  })
}

/**
 * Read-only party view for the active campaign session — every finalised
 * character locked to this campaign. Backend gates on campaign membership
 * (DM + accepted players), so this works for both the DM SHEETS panel and
 * any future player-side party view.
 */
export function useCampaignParty(campaignId) {
  return useQuery({
    queryKey: QK.campaignParty(campaignId),
    queryFn: () => call(`/api/campaigns/${campaignId}/party`),
    enabled: Boolean(campaignId),
    // 15-second stale time — character state changes infrequently in-session,
    // and the user can re-open the tab to force a refetch via window focus.
    staleTime: 15_000,
  })
}

export function useApplyLevelUp(characterId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload) =>
      call(`/api/characters/${characterId}/level-up`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: (fresh) => {
      queryClient.setQueryData(QK.character(characterId), fresh)
      queryClient.invalidateQueries({ queryKey: QK.myCharacters })
      queryClient.invalidateQueries({ queryKey: QK.levelUp(characterId) })
    },
  })
}
