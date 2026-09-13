/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useAssetDownload } from '@/app/shared/providers/AssetDownloadManager'
import { useImageFocalPosition } from '@/app/shared/hooks/useImageFocalPosition'

/**
 * Returns a background-image-ready URL for a campaign's hero image.
 *
 * - If the campaign has a hero_image_asset (S3-backed), downloads through
 *   AssetDownloadManager and returns a blob URL (cached by asset_id).
 * - If the campaign has a legacy hero_image (local preset path), returns it directly.
 * - Returns { url, ready, focalPosition } — `url` is suitable for CSS backgroundImage:
 *   `url(${url})`; `focalPosition` is a background-position string pointing the cover-fit
 *   at the host's chosen card region, or undefined so the caller's bg-center stands.
 */
export function useHeroImage(campaign) {
  const asset = campaign?.hero_image_asset
  const { blobUrl, ready: assetReady } = useAssetDownload(
    asset?.s3_url,
    asset?.file_size,
    asset?.asset_id
  )

  // Probed on the stable blob url, not the re-signed one, for the reason useAvatarImage
  // gives: a re-signed url only looks new, and a reset would bounce the card to bg-center
  // and back on every refetch.
  const focalPosition = useImageFocalPosition(
    assetReady && blobUrl ? blobUrl : null,
    asset?.card_focal_area || null
  )

  // S3-backed hero image
  if (asset?.asset_id) {
    return { url: assetReady ? blobUrl : null, ready: assetReady, focalPosition }
  }

  // Legacy preset path (local file, always ready). Presets are static files with no
  // asset row, so they can carry no focal region.
  const preset = campaign?.hero_image
  return { url: preset || null, ready: true, focalPosition: undefined }
}
