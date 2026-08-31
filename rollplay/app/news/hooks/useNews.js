/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/app/shared/utils/authFetch'

/**
 * News queries and mutations.
 *
 * Home reads the latest published post; the editor reads and writes the whole
 * set. Both go through authFetch — every one of these endpoints is behind auth,
 * and the write endpoints are additionally admin-gated server-side.
 */

async function requestJson(url, options = {}) {
  const response = await authFetch(url, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...options,
  })

  if (!response.ok) {
    throw new Error(`News request failed: ${response.status}`)
  }

  // 204 responses (read receipts, deletes) carry no body.
  return response.status === 204 ? null : response.json()
}

/** The single post Home shows. Resolves to null when nothing is published. */
export function useLatestNews({ enabled = true } = {}) {
  return useQuery({
    queryKey: ['news', 'latest'],
    queryFn: () => requestJson('/api/news/latest'),
    enabled,
  })
}

/** Every post, for the editor index. Admin-only server-side. */
export function useNewsPosts({ enabled = true } = {}) {
  return useQuery({
    queryKey: ['news', 'all'],
    queryFn: () => requestJson('/api/news/'),
    enabled,
  })
}

/** One post by id, with signed banner and image URLs. */
export function useNewsPost(postId, { enabled = true } = {}) {
  return useQuery({
    queryKey: ['news', 'post', postId],
    queryFn: () => requestJson(`/api/news/${postId}`),
    enabled: enabled && Boolean(postId),
  })
}

/** The shared news image directory. */
export function useNewsImages({ enabled = true } = {}) {
  return useQuery({
    queryKey: ['news', 'images'],
    queryFn: () => requestJson('/api/news/images/'),
    enabled,
  })
}

export function useCreateNewsPost() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ title, authorName }) =>
      requestJson('/api/news/', {
        method: 'POST',
        body: JSON.stringify({ title, author_name: authorName }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['news'] }),
  })
}

export function useUpdateNewsPost() {
  const queryClient = useQueryClient()

  return useMutation({
    // `payload` is passed through as-is so a caller can send only what changed;
    // for banner slots the difference between omitting a key and sending null
    // is meaningful (leave alone vs clear), and rebuilding the object here
    // would erase that distinction.
    mutationFn: ({ postId, payload }) =>
      requestJson(`/api/news/${postId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    onSuccess: (post) => {
      queryClient.invalidateQueries({ queryKey: ['news', 'all'] })
      queryClient.invalidateQueries({ queryKey: ['news', 'latest'] })
      queryClient.setQueryData(['news', 'post', post.id], post)
    },
  })
}

export function usePublishNewsPost() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ postId, published = true }) =>
      requestJson(`/api/news/${postId}/publish`, {
        method: 'POST',
        body: JSON.stringify({ published }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['news'] }),
  })
}

export function useDeleteNewsPost() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (postId) => requestJson(`/api/news/${postId}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['news'] }),
  })
}

export function useToggleNewsLike() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (postId) => requestJson(`/api/news/${postId}/like`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['news', 'latest'] }),
  })
}

export function useMarkNewsRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (postId) => requestJson(`/api/news/${postId}/read`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['news', 'latest'] }),
  })
}

/**
 * Upload an image into the shared news image directory.
 *
 * Two steps, not three: presign, then PUT the bytes straight to S3. There is no
 * confirm call because news images have no MediaAsset row to create — they are
 * platform editorial media, deliberately outside the library.
 */
export function useUploadNewsImage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (file) => {
      const { upload_url: uploadUrl, key } = await requestJson('/api/news/images/upload-url', {
        method: 'POST',
        body: JSON.stringify({ filename: file.name, content_type: file.type }),
      })

      // Direct to S3 against a presigned URL — plain fetch is correct here.
      const upload = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      })

      if (!upload.ok) {
        throw new Error(`Image upload failed: ${upload.status}`)
      }

      return key
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['news', 'images'] }),
  })
}
