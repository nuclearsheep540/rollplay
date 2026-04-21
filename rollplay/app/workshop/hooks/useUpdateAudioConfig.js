/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '@/app/shared/utils/authFetch';

/**
 * TanStack mutation for saving audio config via PATCH /api/library/{id}/audio-config.
 *
 * Sends loop point, BPM, and loop mode fields:
 *   { loop_start, loop_end, bpm, loop_mode }
 */
export function useUpdateAudioConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ assetId, audioConfig }) => {
      const response = await authFetch(`/api/library/${assetId}/audio-config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(audioConfig),
      });

      const data = await response.json().catch(() => ({}));

      if (response.status === 409) {
        throw new Error(data.detail || 'This track is currently in an active session. End the session first.');
      }

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to update audio configuration');
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
    },
  });
}
