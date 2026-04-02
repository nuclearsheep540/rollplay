/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useAssetDownload } from '@/app/shared/providers/AssetDownloadManager'

/**
 * Returns a background-image-ready URL for a campaign's hero image.
 *
 * - If the campaign has a hero_image_asset (S3-backed), downloads through
 *   AssetDownloadManager and returns a blob URL (cached by asset_id).
 * - If the campaign has a legacy hero_image (local preset path), returns it directly.
 * - Returns { url, ready } — `url` is suitable for CSS backgroundImage: `url(${url})`.
 */
export function useHeroImage(campaign) {
  const asset = campaign?.hero_image_asset
  const { blobUrl, ready: assetReady } = useAssetDownload(
    asset?.s3_url,
    asset?.file_size,
    asset?.asset_id
  )

  // S3-backed hero image
  if (asset?.asset_id) {
    return { url: assetReady ? blobUrl : null, ready: assetReady }
  }

  // Legacy preset path (local file, always ready)
  const preset = campaign?.hero_image
  return { url: preset || null, ready: true }
}
