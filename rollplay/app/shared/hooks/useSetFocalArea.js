/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '@/app/shared/utils/authFetch';

/**
 * TanStack mutation for PATCH /api/library/{id}/focal-area (tokens v2,
 * decision 27). Sets one purpose-keyed focal square on an image asset;
 * area=null clears that purpose. The crop belongs to the image, so every
 * consumer (workshop tokens, character avatars) shares the result. No
 * active-session 409 handling: the endpoint has no session guard (v3,
 * decision 34) — crops snapshot at session start and land next session.
 */
export function useSetFocalArea() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ assetId, purpose, area }) => {
      const response = await authFetch(`/api/library/${assetId}/focal-area`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purpose, area }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to save focal area');
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
    },
  });
}
