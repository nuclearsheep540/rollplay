/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
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

/**
 * One scope of the news image store.
 *
 * `postId` null reads the shared directory; a post id reads that article's own
 * images. The two cache separately, so uploading into one scope never makes
 * the other refetch — and the editor's two tabs stay independent.
 */
export function useNewsImages(postId = null, { enabled = true } = {}) {
  return useQuery({
    queryKey: ['news', 'images', postId || 'shared'],
    queryFn: () =>
      requestJson(postId ? `/api/news/images/?post_id=${postId}` : '/api/news/images/'),
    enabled,
  })
}

/**
 * Every image an article can render, as a key → signed URL map.
 *
 * The editor works in URLs while the document stores keys, and a post can
 * reference both scopes at once, so resolving an image means asking both. Both
 * queries are the same ones the browser tabs use, so this costs no extra
 * request once the editor is open.
 */
export function useNewsImageUrlLookup(postId, { enabled = true } = {}) {
  const shared = useNewsImages(null, { enabled })
  const article = useNewsImages(postId, { enabled: enabled && Boolean(postId) })

  return useMemo(() => {
    const lookup = {}
    for (const image of [...(shared.data?.images || []), ...(article.data?.images || [])]) {
      lookup[image.key] = image.url
    }
    return lookup
  }, [shared.data, article.data])
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
    // Patch the cached post rather than invalidating it. A refetch would hand
    // back a post object with freshly signed banner and image URLs, so every
    // picture in the card and article would reload — a visible remount for
    // what is a two-field change. The server's response is authoritative for
    // both fields, so nothing is being guessed here.
    onSuccess: (result, postId) => {
      queryClient.setQueryData(['news', 'latest'], (current) =>
        current && current.id === postId
          ? { ...current, liked: result.liked, like_count: result.like_count }
          : current
      )
      queryClient.setQueryData(['news', 'post', postId], (current) =>
        current ? { ...current, liked: result.liked, like_count: result.like_count } : current
      )
    },
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
 * Remove an image, in either scope.
 *
 * Rejects with the server's explanation when posts still use it — the message
 * names them, so the caller can say which rather than just refusing.
 */
export function useDeleteNewsImage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (key) => {
      const response = await authFetch(`/api/news/images/?key=${encodeURIComponent(key)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })

      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(
          body?.detail?.posts?.length
            ? `Still used by: ${body.detail.posts.join(', ')}`
            : 'Could not delete this image'
        )
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['news', 'images'] }),
  })
}

/**
 * Move an image between scopes.
 *
 * `targetPostId` null promotes it to the shared directory; a post id claims it
 * for that article. The server refuses a claim while another article still
 * renders it, and its message names them.
 */
export function useMoveNewsImage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ key, targetPostId = null }) => {
      const response = await authFetch('/api/news/images/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ key, target_post_id: targetPostId }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(
          body?.detail?.posts?.length
            ? `Still used by: ${body.detail.posts.join(', ')}`
            : 'Could not move this image'
        )
      }

      return response.json()
    },
    // Both listings change — the image left one and joined the other — and so
    // does every post whose references were rewritten to follow it.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['news', 'images'] })
      queryClient.invalidateQueries({ queryKey: ['news', 'post'] })
      queryClient.invalidateQueries({ queryKey: ['news', 'latest'] })
    },
  })
}

/**
 * Upload an image into one scope of the news image store.
 *
 * Two steps, not three: presign, then PUT the bytes straight to S3. There is no
 * confirm call because news images have no MediaAsset row to create — they are
 * platform editorial media, deliberately outside the library.
 */
export function useUploadNewsImage() {
  const queryClient = useQueryClient()

  return useMutation({
    // The scope travels with the file: an image is shared or private from the
    // moment it lands, rather than being shared by default and discovered to
    // be so when someone tries to delete it.
    mutationFn: async ({ file, postId = null }) => {
      const { upload_url: uploadUrl, key } = await requestJson('/api/news/images/upload-url', {
        method: 'POST',
        body: JSON.stringify({ filename: file.name, content_type: file.type, post_id: postId }),
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
    onSuccess: (key, { postId }) =>
      queryClient.invalidateQueries({ queryKey: ['news', 'images', postId || 'shared'] }),
  })
}
