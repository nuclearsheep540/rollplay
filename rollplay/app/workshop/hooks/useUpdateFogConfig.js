/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '@/app/shared/utils/authFetch';

/**
 * TanStack mutation for saving the fog regions list via
 * PATCH /api/library/{id}/fog.
 *
 * Expects an array of FogRegion dicts — one per region. Step-1
 * frontend passes a single-element list (the one mask the engine
 * holds); multi-region UI lands later. Pass `regions: null` (or `[]`)
 * to clear all fog server-side.
 */
export function useUpdateFogConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ assetId, regions }) => {
      // The endpoint accepts { regions: [...] | null }. Null clears all
      // fog; we send the regions list verbatim — the contract validates
      // each region's shape server-side.
      const body = { regions: regions && regions.length ? regions : null };

      const response = await authFetch(`/api/library/${assetId}/fog`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json().catch(() => ({}));

      if (response.status === 409) {
        throw new Error(data.detail || 'This map is currently in an active session. End the session first.');
      }

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to update fog mask');
      }

      return data;
    },
    onSuccess: () => {
      // Invalidate so Library + any open viewers refresh
      queryClient.invalidateQueries({ queryKey: ['assets'] });
    },
  });
}
