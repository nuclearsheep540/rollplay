/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '@/app/shared/utils/authFetch';

/**
 * TanStack mutation for saving grid config via PATCH /api/library/{id}/grid.
 *
 * Expects the flat config shape from grid.toFlatConfig():
 *   { grid_width, grid_height, grid_cell_size, grid_opacity, grid_offset_x, grid_offset_y, grid_line_color }
 */
export function useUpdateGridConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ assetId, gridConfig }) => {
      const response = await authFetch(`/api/library/${assetId}/grid`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gridConfig),
      });

      if (response.status === 409) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || 'This map is currently in an active session. End the session first.');
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to update grid configuration');
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate all asset queries so Library tab stays in sync
      queryClient.invalidateQueries({ queryKey: ['assets'] });
    },
  });
}
