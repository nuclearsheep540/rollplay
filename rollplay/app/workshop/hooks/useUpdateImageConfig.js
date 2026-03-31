/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '@/app/shared/utils/authFetch';

/**
 * TanStack mutation for saving image config via PATCH /api/library/{id}/image-config.
 *
 * Accepts: { display_mode, aspect_ratio, cine_config }
 */
export function useUpdateImageConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ assetId, imageConfig }) => {
      const response = await authFetch(`/api/library/${assetId}/image-config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(imageConfig),
      });

      const data = await response.json().catch(() => ({}));

      if (response.status === 409) {
        throw new Error(data.detail || 'This image is currently in an active session. End the session first.');
      }

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to update image configuration');
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
    },
  });
}
