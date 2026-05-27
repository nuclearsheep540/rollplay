/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

/**
 * Character avatar upload — the 3-step presigned-URL flow.
 *
 * 1. ``GET /api/characters/{id}/avatar/upload-url?filename=…&content_type=…``
 *    returns ``{ upload_url, key }`` — server has already generated the S3 key.
 * 2. ``PUT`` the file straight to S3 at ``upload_url`` (no auth header needed,
 *    the presigned URL carries the signature in its query string).
 * 3. ``POST /api/characters/{id}/avatar/confirm`` body ``{ key }`` — server
 *    validates the key prefix, stores it on the character, returns the
 *    refreshed sheet (with the new ``avatar_url`` presigned GET).
 *
 * The hook surfaces a single ``upload(file)`` async action plus
 * ``isPending`` / ``error`` flags so the caller can show a spinner.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'

import { authFetch } from '@/app/shared/utils/authFetch'

async function call(path, init = {}) {
  const response = await authFetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
    ...init,
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const err = new Error(body?.detail || `Request to ${path} failed (${response.status})`)
    err.status = response.status
    throw err
  }
  return body
}

async function putToS3(uploadUrl, file) {
  // S3 presigned URLs sign the Content-Type header, so we must send the
  // same one the upload-url endpoint was told about. Sending no body would
  // make S3 record a 0-byte object — pass the File object directly.
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  })
  if (!response.ok) {
    throw new Error(`S3 upload failed (${response.status})`)
  }
}

export function useUploadCharacterAvatar(characterId) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (file) => {
      if (!file) throw new Error('No file selected')
      if (!characterId) throw new Error('Character not yet created')

      // Step 1: ask the server for a presigned PUT URL + the S3 key.
      const qs = new URLSearchParams({
        filename: file.name,
        content_type: file.type || 'application/octet-stream',
      })
      const { upload_url, key } = await call(
        `/api/characters/${characterId}/avatar/upload-url?${qs}`,
      )

      // Step 2: PUT the file straight to S3. Goes via the presigned URL, not
      // our API — bytes never traverse the api-site container.
      await putToS3(upload_url, file)

      // Step 3: tell the server the upload landed; it persists the key and
      // returns the refreshed character (with the new avatar_url).
      const fresh = await call(
        `/api/characters/${characterId}/avatar/confirm`,
        { method: 'POST', body: JSON.stringify({ key }) },
      )
      return fresh
    },
    onSuccess: (fresh) => {
      // Drop into the per-character cache so the wizard re-renders with the
      // new avatar_url immediately. Also bust the "my characters" list so
      // the dashboard's character grid picks up the change.
      queryClient.setQueryData(['character', characterId], fresh)
      queryClient.invalidateQueries({ queryKey: ['characters', 'me'] })
      queryClient.invalidateQueries({ queryKey: ['characters'] })
    },
  })
}
