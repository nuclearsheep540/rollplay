/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/app/shared/utils/authFetch'
import { COLLECTIONS_QUERY_KEY } from './useCollections'

async function collectionRequest(url, options) {
  const response = await authFetch(url, options)
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.detail || 'Collection request failed')
  }
  if (response.status === 204) {
    return null
  }
  return response.json()
}

/**
 * Create a collection.
 * mutate({ name, kind: 'manual' | 'smart', filters? })
 * Smart filters use the shared search-contract shape:
 * { types, tags, campaigns, text } (campaigns as UUID strings).
 */
export function useCreateCollection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ name, kind, filters = null }) =>
      collectionRequest('/api/library/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, kind, filters }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: COLLECTIONS_QUERY_KEY }),
  })
}

/**
 * Rename a collection and/or replace a smart collection's filters.
 * mutate({ collectionId, name?, filters? })
 */
export function useUpdateCollection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ collectionId, name = null, filters = null }) =>
      collectionRequest(`/api/library/collections/${collectionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, filters }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: COLLECTIONS_QUERY_KEY }),
  })
}

/**
 * Delete a collection (assets inside are untouched).
 * mutate(collectionId)
 */
export function useDeleteCollection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (collectionId) =>
      collectionRequest(`/api/library/collections/${collectionId}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: COLLECTIONS_QUERY_KEY }),
  })
}

/**
 * Add or remove an asset from a manual collection.
 * mutate({ collectionId, assetId, member }) - member true adds, false removes.
 */
export function useToggleCollectionMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ collectionId, assetId, member }) =>
      collectionRequest(`/api/library/collections/${collectionId}/assets/${assetId}`, {
        method: member ? 'POST' : 'DELETE',
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: COLLECTIONS_QUERY_KEY }),
  })
}
