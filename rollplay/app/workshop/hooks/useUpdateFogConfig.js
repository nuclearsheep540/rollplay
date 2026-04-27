/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '@/app/shared/utils/authFetch';

/**
 * TanStack mutation for saving the fog mask via PATCH /api/library/{id}/fog.
 *
 * Expects the serialised engine payload (matches FogConfig contract):
 *   { mask, mask_width, mask_height, version }
 *
 * Pass `fogConfig: null` to clear the saved fog.
 */
export function useUpdateFogConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ assetId, fogConfig }) => {
      // Sending null clears the fog server-side; the request body still
      // needs to be a valid object — we explicitly pass mask=null in
      // that case so the request payload is well-formed.
      const body = fogConfig
        ? { ...fogConfig }
        : { mask: null, mask_width: null, mask_height: null };

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
