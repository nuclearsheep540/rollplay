/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

/**
 * Character avatar mutation — points the character at a library MediaAsset.
 *
 * PATCH /api/characters/{id}/avatar body ``{ asset_id }``. Pass null to clear.
 * The actual upload happens through the asset library's 3-step flow
 * (see ``useUploadAsset``); this hook just persists the chosen reference.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'

import { authFetch } from '@/app/shared/utils/authFetch'

export function useSetCharacterAvatar(characterId) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (assetId) => {
      if (!characterId) throw new Error('Character not yet created')
      const response = await authFetch(`/api/characters/${characterId}/avatar`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset_id: assetId ?? null }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(body?.detail || `Failed to set avatar (${response.status})`)
      }
      return body
    },
    onSuccess: (fresh) => {
      queryClient.setQueryData(['character', characterId], fresh)
      queryClient.invalidateQueries({ queryKey: ['characters'] })
    },
  })
}
