/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '@/app/shared/utils/authFetch';

// TanStack hooks for DM preset CRUD. All four mutations invalidate the
// ['presets'] list query on success so every surface (Workshop editor
// and in-game dropdown) reflects changes immediately.

const PRESETS_KEY = ['presets'];

async function parseJsonOrThrow(response, fallbackMessage) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail || fallbackMessage);
  }
  return data;
}

export function useListPresets() {
  return useQuery({
    queryKey: PRESETS_KEY,
    queryFn: async () => {
      const response = await authFetch('/api/library/presets', { method: 'GET' });
      const data = await parseJsonOrThrow(response, 'Failed to load presets');
      return data.presets ?? [];
    },
  });
}

export function useCreatePreset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, slots = [] }) => {
      const response = await authFetch('/api/library/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, slots }),
      });
      return parseJsonOrThrow(response, 'Failed to create preset');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PRESETS_KEY }),
  });
}

export function useUpdatePreset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ presetId, name, slots }) => {
      const body = {};
      if (name !== undefined) body.name = name;
      if (slots !== undefined) body.slots = slots;
      const response = await authFetch(`/api/library/presets/${presetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return parseJsonOrThrow(response, 'Failed to update preset');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PRESETS_KEY }),
  });
}

export function useDeletePreset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (presetId) => {
      const response = await authFetch(`/api/library/presets/${presetId}`, {
        method: 'DELETE',
      });
      if (!response.ok && response.status !== 204) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to delete preset');
      }
      return presetId;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PRESETS_KEY }),
  });
}
