/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '@/app/shared/utils/authFetch';

/**
 * TanStack mutation for saving the npc token baseline via
 * PATCH /api/library/{id}/tokens (tokens v2, decision 22).
 *
 * Two 409 shapes from the server:
 *  - plain-string detail: a campaign session is LIVE — hard block, surface
 *    the message inline like grid/fog do.
 *  - {code: "board_in_play"}: a paused session's board for this map is in
 *    play — the thrown error carries error.code so the panel can offer
 *    "save anyway" and retry with force=true (decision 26).
 */
export function useUpdateTokenConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ assetId, tokens, force = false }) => {
      const response = await authFetch(`/api/library/${assetId}/tokens`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens, force }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.status === 409) {
        if (data.detail?.code === 'board_in_play') {
          const inPlayError = new Error(
            data.detail.message || 'This board is in play in a paused session.');
          inPlayError.code = 'board_in_play';
          throw inPlayError;
        }
        throw new Error(data.detail || 'This map is currently in an active session. End the session first.');
      }

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to save token baseline');
      }

      return data;
    },
    onSuccess: () => {
      // Invalidate all asset queries so Library tab stays in sync
      queryClient.invalidateQueries({ queryKey: ['assets'] });
    },
  });
}
