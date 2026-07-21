/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import React, { useMemo, useState } from 'react'
import { Combobox as HeadlessCombobox } from '@headlessui/react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faMagnifyingGlass, faXmark, faFlag } from '@fortawesome/free-solid-svg-icons'
import { hasActiveFilters, EMPTY_FILTERS } from '../utils/assetFilters'

const TYPE_LABELS = { map: 'Maps', music: 'Music', sfx: 'SFX', image: 'Images' }

// Full literal class names - Tailwind's scanner can't see interpolated ones
export const TYPE_SWATCH_CLASSES = {
  map: 'bg-asset-map',
  music: 'bg-asset-music',
  sfx: 'bg-asset-sfx',
  image: 'bg-asset-image',
}

const FACET_LABELS = { type: 'type', tag: 'tag', campaign: 'campaign', text: 'name' }

/**
 * Token combobox for the library - filters build up as removable chips.
 *
 * Focus the input to see the default suggestions (types with counts,
 * your aggregated tags, campaigns). Type to narrow; Enter adds a
 * "name contains" chip; Backspace with an empty input pops the last
 * chip. Selection semantics live in utils/assetFilters.js.
 */
export default function AssetFilterBar({
  filters,
  onFiltersChange,
  tagOptions = [],
  typeCounts = {},
  campaigns = [],
  placeholder = 'Filter by name, tag, type, or campaign…',
}) {
  const [query, setQuery] = useState('')

  const campaignTitle = (campaignId) =>
    campaigns.find((campaign) => campaign.id === campaignId)?.title || 'Unknown campaign'

  // Chips in facet order (types, tags, campaigns, text)
  const chips = useMemo(() => {
    const items = []
    for (const type of filters.types) {
      items.push({ facet: 'type', value: type, label: TYPE_LABELS[type] || type })
    }
    for (const tag of filters.tags) {
      items.push({ facet: 'tag', value: tag, label: tag })
    }
    for (const campaignId of filters.campaigns) {
      items.push({ facet: 'campaign', value: campaignId, label: campaignTitle(campaignId) })
    }
    if (filters.text) {
      items.push({ facet: 'text', value: filters.text, label: `“${filters.text}”` })
    }
    return items
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, campaigns])

  // Grouped suggestions, excluding already-active values
  const suggestions = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const groups = []

    if (normalized) {
      groups.push({
        label: null,
        options: [{ facet: 'text', value: normalized, label: `Name contains “${normalized}”` }],
      })
    }

    const types = Object.keys(TYPE_LABELS)
      .filter((type) => !filters.types.includes(type))
      .filter((type) => !normalized || TYPE_LABELS[type].toLowerCase().includes(normalized))
      .map((type) => ({ facet: 'type', value: type, label: TYPE_LABELS[type], count: typeCounts[type] || 0 }))
    if (types.length > 0) {
      groups.push({ label: 'Type', options: types })
    }

    const tags = tagOptions
      .filter(({ tag }) => !filters.tags.includes(tag))
      .filter(({ tag }) => !normalized || tag.includes(normalized))
      .slice(0, 8)
      .map(({ tag, count }) => ({ facet: 'tag', value: tag, label: tag, count }))
    if (tags.length > 0) {
      groups.push({ label: 'Your tags', options: tags })
    }

    const campaignOptions = campaigns
      .filter((campaign) => !filters.campaigns.includes(campaign.id))
      .filter((campaign) => !normalized || campaign.title.toLowerCase().includes(normalized))
      .map((campaign) => ({ facet: 'campaign', value: campaign.id, label: campaign.title }))
    if (campaignOptions.length > 0) {
      groups.push({ label: 'Campaign', options: campaignOptions })
    }

    return groups
  }, [query, filters, tagOptions, typeCounts, campaigns])

  const addFilter = (option) => {
    if (!option) return
    const next = { ...filters }
    if (option.facet === 'type') next.types = [...filters.types, option.value]
    if (option.facet === 'tag') next.tags = [...filters.tags, option.value]
    if (option.facet === 'campaign') next.campaigns = [...filters.campaigns, option.value]
    if (option.facet === 'text') next.text = option.value
    onFiltersChange(next)
    setQuery('')
  }

  const removeChip = (chip) => {
    const next = { ...filters }
    if (chip.facet === 'type') next.types = filters.types.filter((type) => type !== chip.value)
    if (chip.facet === 'tag') next.tags = filters.tags.filter((tag) => tag !== chip.value)
    if (chip.facet === 'campaign') next.campaigns = filters.campaigns.filter((id) => id !== chip.value)
    if (chip.facet === 'text') next.text = ''
    onFiltersChange(next)
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Backspace' && event.target.value === '' && chips.length > 0) {
      removeChip(chips[chips.length - 1])
    }
  }

  return (
    <HeadlessCombobox value={null} onChange={addFilter} immediate>
      <div className="relative">
        <div className="flex flex-wrap items-center gap-1.5 rounded-sm border border-border bg-surface-primary px-3 py-2 transition-colors focus-within:border-border-active">
          <FontAwesomeIcon icon={faMagnifyingGlass} className="text-xs text-content-secondary" />

          {chips.map((chip) => (
            <span
              key={`${chip.facet}:${chip.value}`}
              className="inline-flex items-center gap-1.5 rounded-sm bg-surface-panel py-1 pl-2 pr-1 text-xs text-content-on-dark"
            >
              <span className="text-[9px] uppercase tracking-widest text-content-secondary">
                {FACET_LABELS[chip.facet]}
              </span>
              {chip.label}
              <button
                onClick={() => removeChip(chip)}
                aria-label={`Remove ${FACET_LABELS[chip.facet]} filter ${chip.label}`}
                className="rounded-sm p-0.5 leading-none text-content-secondary hover:text-content-on-dark"
              >
                <FontAwesomeIcon icon={faXmark} className="text-[10px]" />
              </button>
            </span>
          ))}

          <HeadlessCombobox.Input
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            displayValue={() => ''}
            placeholder={chips.length === 0 ? placeholder : ''}
            className="min-w-[160px] flex-1 bg-transparent py-0.5 text-sm text-content-primary outline-none placeholder:text-content-secondary"
          />

          {hasActiveFilters(filters) && (
            <button
              onClick={() => onFiltersChange({ ...EMPTY_FILTERS })}
              className="rounded-sm px-1.5 py-0.5 text-xs text-content-secondary hover:text-content-primary"
            >
              Clear all
            </button>
          )}
        </div>

        <HeadlessCombobox.Options className="absolute z-30 mt-1.5 max-h-80 w-full max-w-xl overflow-y-auto rounded-sm border border-border bg-surface-panel p-1 shadow-xl">
          {suggestions.map((group, groupIndex) => (
            <React.Fragment key={group.label || `group-${groupIndex}`}>
              {group.label && (
                <div className="flex items-center gap-1.5 px-2.5 pb-1 pt-2.5 text-[9px] font-semibold uppercase tracking-widest text-content-on-dark">
                  {group.label === 'Campaign' && <FontAwesomeIcon icon={faFlag} className="text-[8px]" />}
                  {group.label}
                </div>
              )}
              {group.options.map((option) => (
                <HeadlessCombobox.Option
                  key={`${option.facet}:${option.value}`}
                  value={option}
                  className="flex cursor-pointer items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-sm text-content-on-dark data-[focus]:bg-surface-hover"
                >
                  {option.facet === 'type' && (
                    <span className={`h-1.5 w-1.5 rounded-[2px] ${TYPE_SWATCH_CLASSES[option.value]}`} />
                  )}
                  {option.facet === 'tag' && (
                    <span className="h-1.5 w-1.5 rounded-[2px] bg-border" />
                  )}
                  <span className="truncate">{option.label}</span>
                  {typeof option.count === 'number' && (
                    <span className="ml-auto text-xs tabular-nums text-content-secondary">{option.count}</span>
                  )}
                </HeadlessCombobox.Option>
              ))}
            </React.Fragment>
          ))}
          <div className="mt-1 border-t border-border-subtle px-2.5 py-2 text-[11px] text-content-secondary">
            Types and campaigns match <span className="font-semibold">any</span> selected value · multiple tags narrow the results
          </div>
        </HeadlessCombobox.Options>
      </div>
    </HeadlessCombobox>
  )
}
