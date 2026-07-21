/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import React, { useMemo, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBolt, faChevronLeft } from '@fortawesome/free-solid-svg-icons'
import { Button } from '@/app/dashboard/components/shared/Button'
import AssetFilterBar from './AssetFilterBar'
import AssetGrid from './AssetGrid'
import {
  EMPTY_FILTERS,
  hasActiveFilters,
  applyAssetFilters,
  filtersFromSmartCollection,
  filtersToSmartPayload,
} from '../utils/assetFilters'
import { useCreateCollection, useUpdateCollection, useDeleteCollection } from '../hooks/useCollectionMutations'

/**
 * Focused in-library view for creating or editing a smart collection.
 * A smart collection is a saved set of filters - the same filter bar
 * as browse, plus a name and a live preview of what currently matches.
 */
export default function SmartCollectionBuilder({
  editingCollection = null,
  prefillFilters = null,
  assets,
  tagOptions,
  typeCounts,
  campaigns,
  onCancel,
  onSaved,
  onDeleted,
}) {
  const isEditing = Boolean(editingCollection)
  const [name, setName] = useState(editingCollection?.name || '')
  const [filters, setFilters] = useState(() =>
    isEditing
      ? filtersFromSmartCollection(editingCollection)
      : { ...EMPTY_FILTERS, ...(prefillFilters || {}) }
  )
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const createMutation = useCreateCollection()
  const updateMutation = useUpdateCollection()
  const deleteMutation = useDeleteCollection()

  const matches = useMemo(() => applyAssetFilters(assets, filters), [assets, filters])
  const canSave = name.trim().length > 0 && hasActiveFilters(filters)
  const pending = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending
  const error = createMutation.error?.message || updateMutation.error?.message || deleteMutation.error?.message

  const handleSave = async () => {
    try {
      if (isEditing) {
        const collection = await updateMutation.mutateAsync({
          collectionId: editingCollection.id,
          name: name.trim(),
          filters: filtersToSmartPayload(filters),
        })
        onSaved(collection)
      } else {
        const collection = await createMutation.mutateAsync({
          name: name.trim(),
          kind: 'smart',
          filters: filtersToSmartPayload(filters),
        })
        onSaved(collection)
      }
    } catch {
      // Error surfaces via the mutation state
    }
  }

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(editingCollection.id)
      onDeleted()
    } catch {
      // Error surfaces via the mutation state
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <button
        onClick={onCancel}
        className="mb-4 flex items-center gap-2 text-sm text-content-secondary transition-colors hover:text-content-primary"
      >
        <FontAwesomeIcon icon={faChevronLeft} className="text-xs" />
        Back to Library
      </button>

      <h1 className="flex items-center gap-2.5 text-2xl font-bold text-content-bold">
        <FontAwesomeIcon icon={faBolt} className="text-lg text-content-secondary" />
        {isEditing ? 'Edit Smart Collection' : 'New Smart Collection'}
      </h1>
      <p className="mb-6 mt-1 max-w-xl text-sm text-content-secondary">
        A smart collection is a saved set of filters. Assets that match are always
        included - upload a new map with a matching tag and it appears here automatically.
      </p>

      <label
        htmlFor="smart-collection-name"
        className="mb-1.5 block text-[10px] font-semibold uppercase tracking-widest text-content-secondary"
      >
        Name
      </label>
      <input
        id="smart-collection-name"
        type="text"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="e.g. Sea Session"
        autoFocus
        className="mb-5 w-full rounded-sm border border-border bg-surface-primary px-3.5 py-2.5 text-lg font-semibold text-content-primary outline-none transition-colors placeholder:font-normal placeholder:text-content-secondary focus:border-border-active"
      />

      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-widest text-content-secondary">
        Filters
      </label>
      <AssetFilterBar
        filters={filters}
        onFiltersChange={setFilters}
        tagOptions={tagOptions}
        typeCounts={typeCounts}
        campaigns={campaigns}
        placeholder="Add a type, tag, campaign, or name filter…"
      />

      <div className="mt-4 flex items-center gap-2.5 text-sm font-semibold tabular-nums text-content-primary">
        <span className="h-2 w-2 rounded-full bg-asset-map" />
        {matches.length} asset{matches.length !== 1 ? 's' : ''} currently match
        <span className="font-normal text-content-secondary">- updates live as your library grows</span>
      </div>

      {error && (
        <p className="mt-3 text-sm text-feedback-error">{error}</p>
      )}

      <div className="mt-5 flex items-center gap-3">
        <Button variant="primary" onClick={handleSave} disabled={!canSave || pending}>
          {pending ? 'Saving…' : isEditing ? 'Save Changes' : 'Create Smart Collection'}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        {isEditing && (
          <button
            onClick={() => (confirmingDelete ? handleDelete() : setConfirmingDelete(true))}
            disabled={pending}
            className="ml-auto text-sm text-feedback-error transition-opacity hover:opacity-80"
          >
            {confirmingDelete ? 'Click again to confirm delete' : 'Delete smart collection'}
          </button>
        )}
      </div>

      <div className="mb-3 mt-8 text-[10px] font-semibold uppercase tracking-widest text-content-secondary">
        Matching assets
      </div>
      {matches.length > 0 ? (
        <AssetGrid
          assets={matches}
          loading={false}
          getContextMenuItems={() => []}
          columns={4}
        />
      ) : (
        <div className="rounded-sm border border-dashed border-border px-5 py-12 text-center text-sm text-content-secondary">
          {hasActiveFilters(filters)
            ? 'Nothing matches yet - adjust the filters above.'
            : 'Add at least one filter to see live results.'}
        </div>
      )}
    </div>
  )
}
