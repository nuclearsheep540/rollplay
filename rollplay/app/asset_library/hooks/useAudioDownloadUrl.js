/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { authFetch } from '@/app/shared/utils/authFetch'

/**
 * Fetches a fresh presigned download URL for a media asset.
 * Used when a previously issued S3 URL has expired during a long game session.
 *
 * @param {string} assetId - The media asset ID
 * @returns {Promise<string>} Fresh presigned download URL
 */
export async function fetchDownloadUrl(assetId) {
  const response = await authFetch(`/api/library/${assetId}/download-url`, {
    method: 'GET',
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch download URL for asset ${assetId}`)
  }

  const data = await response.json()
  return data.download_url
}
