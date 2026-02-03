/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'

/**
 * Bridge between WebSocket events and TanStack Query cache.
 *
 * Replaces: refreshTrigger pattern for campaign events + updateGameState() + campaignUpdateHandlers
 *
 * Returns stable invalidation functions that WebSocket event handlers
 * can call instead of incrementing refreshTrigger.
 *
 * @returns {{ invalidateCampaigns: () => void, invalidateCharacters: () => void }}
 */
export function useEventQueryInvalidation() {
  const queryClient = useQueryClient()

  return useMemo(
    () => ({
      invalidateCampaigns: () =>
        queryClient.invalidateQueries({ queryKey: ['campaigns'] }),
      invalidateCharacters: () =>
        queryClient.invalidateQueries({ queryKey: ['characters'] }),
    }),
    [queryClient]
  )
}
