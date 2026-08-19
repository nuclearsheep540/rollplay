/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useAssetDownload } from '@/app/shared/providers/AssetDownloadManager'
import { useImageFocalPosition } from '@/app/shared/hooks/useImageFocalPosition'

// Shared fallback for "no avatar uploaded yet", and for the window before a
// download completes. Previously duplicated as a literal across all four
// avatar surfaces.
export const DEFAULT_AVATAR = '/heroes.png'

/**
 * useAvatarImage — a character avatar as a stable, background-image-ready URL.
 *
 * Deliberately mirrors ``dashboard/hooks/useHeroImage``: same
 * download-through-the-manager, same "blob URL suitable for CSS
 * ``backgroundImage``" contract. Avatars were the last S3-backed media type
 * still rendering raw presigned URLs; this brings them onto the convention.
 *
 * Why it exists: ``S3Service.generate_download_url`` re-signs on every call,
 * so an unchanged avatar arrives under a different URL string after every
 * campaigns refetch (session start/pause/finish, invite, remove player). The
 * browser sees an unfamiliar URL and re-downloads the image it already has.
 * Keying the blob cache on ``avatarAssetId`` — which does not change — is what
 * removes the reload.
 *
 * Returns ``{ imageUrl, focalPosition, ready }``:
 * - ``imageUrl`` is never null; it falls back to DEFAULT_AVATAR so the wedge
 *   never renders blank. The manager is all-or-nothing (no progressive paint),
 *   so without this the wedge would be empty until the download finished.
 * - ``focalPosition`` is a ``background-position`` string, or undefined while
 *   the probe is pending / when the avatar has no focal area — callers keep
 *   their ``bg-center`` class as the fallback.
 * - ``ready`` is true once there is something real to show, and true
 *   immediately when there is no avatar at all (nothing to wait for).
 */
export function useAvatarImage(avatarUrl, avatarAssetId, focalArea = null) {
  // fileSize is unknown on every avatar payload — the manager falls back to
  // Content-Length, then blob.size. Byte-progress is only consumed in the game
  // slice, so nothing on these surfaces reads it anyway.
  const { blobUrl, ready } = useAssetDownload(avatarUrl, undefined, avatarAssetId)

  const stableUrl = ready && blobUrl ? blobUrl : null

  // Feed the probe the STABLE url, not the presigned one. This hook resets its
  // dims whenever the url changes — correct for a genuinely new image, but a
  // re-signed url only *looks* new, and the reset made the wedge fall back to
  // bg-center and then jump back to the focal point on every refetch.
  const focalPosition = useImageFocalPosition(stableUrl, focalArea)

  // No avatar uploaded: the default image is local and always available, so
  // report ready rather than leaving callers waiting on a download that will
  // never start. Mirrors useHeroImage's legacy-preset branch.
  if (!avatarUrl) {
    return { imageUrl: DEFAULT_AVATAR, focalPosition: undefined, ready: true }
  }

  return { imageUrl: stableUrl || DEFAULT_AVATAR, focalPosition, ready }
}
