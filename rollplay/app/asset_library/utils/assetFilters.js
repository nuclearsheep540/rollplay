/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

/**
 * The library search contract - one implementation, used by browse
 * filtering and (PR 3) smart-collection matching:
 *
 * - types / campaigns: OR within the facet ("Map or Image")
 * - tags: AND - each added tag narrows the results
 * - text: case-insensitive substring match on filename
 * - facets combine with AND
 */

export const EMPTY_FILTERS = Object.freeze({
  types: [],
  tags: [],
  campaigns: [],
  text: '',
})

export function hasActiveFilters(filters) {
  return (
    filters.types.length > 0 ||
    filters.tags.length > 0 ||
    filters.campaigns.length > 0 ||
    Boolean(filters.text)
  )
}

export function applyAssetFilters(assets, filters) {
  const text = (filters.text || '').toLowerCase()

  return assets.filter((asset) => {
    if (filters.types.length > 0 && !filters.types.includes(asset.asset_type)) {
      return false
    }

    if (filters.campaigns.length > 0) {
      const campaignIds = asset.campaign_ids || []
      const matchesAny = filters.campaigns.some((campaignId) => campaignIds.includes(campaignId))
      if (!matchesAny) {
        return false
      }
    }

    const assetTags = asset.tags || []
    for (const tag of filters.tags) {
      if (!assetTags.includes(tag)) {
        return false
      }
    }

    if (text && !asset.filename.toLowerCase().includes(text)) {
      return false
    }

    return true
  })
}

/**
 * Convert a smart collection's stored filter document into the
 * frontend filter shape (they match by design; this just defends
 * against missing keys and drops the version field).
 */
export function filtersFromSmartCollection(collection) {
  const stored = collection?.filters || {}
  return {
    types: stored.types || [],
    tags: stored.tags || [],
    campaigns: stored.campaigns || [],
    text: stored.text || '',
  }
}

/** Frontend filters → the versioned document the backend stores. */
export function filtersToSmartPayload(filters) {
  return {
    version: 1,
    types: filters.types,
    tags: filters.tags,
    campaigns: filters.campaigns,
    text: filters.text,
  }
}

// Column accessors for list-view sorting
const SORT_ACCESSORS = {
  name: (asset) => (asset.filename || '').toLowerCase(),
  type: (asset) => asset.asset_type || '',
  size: (asset) => asset.file_size || 0,
  campaigns: (asset) => (asset.campaign_ids || []).length,
  added: (asset) => new Date(asset.created_at || 0).getTime(),
}

/**
 * Sort assets by a list column. sort is { key, dir: 'asc' | 'desc' }
 * or null for the default order (created_at desc from the backend).
 */
export function sortAssets(assets, sort) {
  if (!sort) return assets
  const accessor = SORT_ACCESSORS[sort.key]
  if (!accessor) return assets
  const direction = sort.dir === 'desc' ? -1 : 1
  return [...assets].sort((a, b) => {
    const left = accessor(a)
    const right = accessor(b)
    if (left < right) return -direction
    if (left > right) return direction
    return 0
  })
}

/**
 * Aggregate distinct tags with usage counts across the library -
 * feeds the filter bar's default suggestions ("your tags").
 * Sorted by count desc, then alphabetically.
 */
export function aggregateTagCounts(assets) {
  const counts = new Map()
  for (const asset of assets) {
    for (const tag of asset.tags || []) {
      counts.set(tag, (counts.get(tag) || 0) + 1)
    }
  }
  const entries = []
  for (const [tag, count] of counts.entries()) {
    entries.push({ tag, count })
  }
  entries.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
  return entries
}
