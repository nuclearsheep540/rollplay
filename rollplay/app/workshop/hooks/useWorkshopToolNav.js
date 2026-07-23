/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useRouter, useSearchParams } from 'next/navigation'

/**
 * Entry-point-aware navigation for workshop tool pages.
 *
 * The library opens tools with `from=library`; the flag rides the URL and
 * is carried through every internal navigation — including clearing the
 * asset (File > Open Asset) — so it survives refresh and deep links.
 * "Back" pushes explicit destinations rather than router.back(): history
 * depth varies with how the user got here, and back() leaves the app
 * entirely on a pasted link.
 *
 * @param {string} basePath - the tool's route, e.g. '/workshop/map-config'
 * @param {string} toolLabel - back-button label for the in-tool picker state
 * @param {(assetId: string) => string} buildAssetQuery - query string for a
 *   selected asset, without the from suffix (default: asset_id only)
 */
export function useWorkshopToolNav(
  basePath,
  toolLabel,
  buildAssetQuery = (assetId) => `asset_id=${assetId}`,
) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const selectedAssetId = searchParams.get('asset_id')

  const fromLibrary = searchParams.get('from') === 'library'
  const fromSuffix = fromLibrary ? '&from=library' : ''

  const backLabel = fromLibrary
    ? 'Library'
    : selectedAssetId ? toolLabel : 'Workshop'

  const handleAssetSelect = (assetId) => {
    if (assetId) {
      router.push(`${basePath}?${buildAssetQuery(assetId)}${fromSuffix}`)
    } else {
      router.push(`${basePath}${fromLibrary ? '?from=library' : ''}`)
    }
  }

  const handleBack = () => {
    if (fromLibrary) {
      router.push('/dashboard?tab=library')
    } else if (selectedAssetId) {
      router.push(basePath)
    } else {
      router.push('/dashboard?tab=workshop')
    }
  }

  return { selectedAssetId, fromLibrary, fromSuffix, backLabel, handleAssetSelect, handleBack }
}
