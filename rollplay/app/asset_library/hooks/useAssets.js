/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { useQuery } from '@tanstack/react-query'

/**
 * Query hook for fetching assets from the library.
 *
 * @param {Object} options
 * @param {string|null} options.assetType - Filter by type: 'map', 'audio', 'image', or null for all
 * @param {string|null} options.campaignId - Filter by campaign association
 * @param {boolean} options.enabled - Whether the query should execute (default: true)
 * @returns TanStack Query result with { data: Asset[], isLoading, error, ... }
 */
export function useAssets({ assetType = null, campaignId = null, enabled = true } = {}) {
  return useQuery({
    queryKey: buildAssetQueryKey({ assetType, campaignId }),
    queryFn: async () => {
      const params = new URLSearchParams()
      if (assetType && assetType !== 'all') {
        params.append('asset_type', assetType)
      }
      if (campaignId) {
        params.append('campaign_id', campaignId)
      }

      const url = `/api/library/${params.toString() ? '?' + params.toString() : ''}`
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Failed to fetch assets')
      }

      const data = await response.json()
      return data.assets || []
    },
    enabled,
  })
}

/**
 * Builds a consistent query key for asset queries.
 * Structure: ['assets'] or ['assets', { type, campaignId }]
 * Invalidating ['assets'] will invalidate all asset queries regardless of filters.
 */
export function buildAssetQueryKey({ assetType = null, campaignId = null } = {}) {
  const filters = {}
  if (assetType && assetType !== 'all') filters.type = assetType
  if (campaignId) filters.campaignId = campaignId

  return Object.keys(filters).length > 0
    ? ['assets', filters]
    : ['assets']
}
