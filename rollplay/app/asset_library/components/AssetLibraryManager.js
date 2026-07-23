/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faUpload, faTrash, faEye, faPen, faTags, faShapes, faSliders,
  faStar, faTableCellsLarge, faList, faBolt, faFolder, faSquareCheck, faFlag,
} from '@fortawesome/free-solid-svg-icons'
import { useAssets } from '../hooks/useAssets'
import { useAssetCount } from '../hooks/useAssetCount'
import { useDeleteAsset } from '../hooks/useDeleteAsset'
import { useRenameAsset } from '../hooks/useRenameAsset'
import { useAssociateAsset } from '../hooks/useAssociateAsset'
import { useChangeAssetType } from '../hooks/useChangeAssetType'
import { useToggleFavorite } from '../hooks/useToggleFavorite'
import { useCollections } from '../hooks/useCollections'
import { useCreateCollection, useUpdateCollection, useDeleteCollection, useToggleCollectionMember } from '../hooks/useCollectionMutations'
import { useCampaigns } from '@/app/dashboard/hooks/useCampaigns'
import {
  EMPTY_FILTERS, hasActiveFilters, applyAssetFilters, aggregateTagCounts,
  filtersFromSmartCollection, sortAssets,
} from '../utils/assetFilters'
import LibraryRail from './LibraryRail'
import AssetFilterBar from './AssetFilterBar'
import SmartCollectionBuilder from './SmartCollectionBuilder'
import AssetGrid from './AssetGrid'
import AssetListView from './AssetListView'
import AssetUploadModal from './AssetUploadModal'
import AssetQuickLook from './AssetQuickLook'
import EditTagsModal from './EditTagsModal'
import ConfirmModal from '@/app/shared/components/ConfirmModal'
import Modal from '@/app/shared/components/Modal'
import FormField from '@/app/shared/components/FormField'
import { Button } from '@/app/dashboard/components/shared/Button'

const TYPE_TITLES = { map: 'Maps', music: 'Music', sfx: 'SFX', image: 'Images' }

/**
 * The library shell: navigation rail (types, favorites, campaigns) +
 * token filter bar + grid/list asset browser. Full-bleed inside the
 * dashboard tab via the layout's isChildExpanded escape hatch.
 */
export default function AssetLibraryManager({ user }) {
  const router = useRouter()

  // Rail selection: which slice of the library is the base list
  const [context, setContext] = useState({ kind: 'all', id: null })
  // Token filters applied on top of the rail context
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS })

  const [viewMode, setViewMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('assetLibraryViewMode') || 'grid'
    }
    return 'grid'
  })
  const [gridScale, setGridScale] = useState(() => {
    if (typeof window !== 'undefined') {
      return parseInt(localStorage.getItem('assetGridScale')) || 2
    }
    return 2
  })

  // Pagination (grid and list): page size from the toolbar, window
  // grows as the sentinel scrolls into view
  const [pageSize, setPageSize] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = parseInt(localStorage.getItem('assetPageSize'))
      if ([20, 50, 100].includes(stored)) return stored
    }
    return 20
  })
  const [visibleCount, setVisibleCount] = useState(pageSize)
  // List column sort: { key, dir } or null for default order
  const [listSort, setListSort] = useState(null)

  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [quickLookAsset, setQuickLookAsset] = useState(null)
  const [renameTarget, setRenameTarget] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [editTagsTarget, setEditTagsTarget] = useState(null)
  const renameInputRef = useRef(null)

  // Multi-select: toggled from the toolbar; clicking assets selects
  // them, right-clicking a selected asset offers bulk actions
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())

  // Page-level drop target: dropping files anywhere on the library
  // opens the upload modal pre-seeded with them
  const [dropActive, setDropActive] = useState(false)
  const [pendingDropFiles, setPendingDropFiles] = useState(null)
  const dragDepth = useRef(0)

  // Smart collection builder view - replaces the pane when non-null:
  // { editing: collection | null, prefill: filters | null }
  const [builder, setBuilder] = useState(null)
  // Manual collection management modals
  const [collectionModal, setCollectionModal] = useState(null) // { mode: 'create' | 'rename', collection? }
  const [collectionName, setCollectionName] = useState('')
  const [deleteCollectionTarget, setDeleteCollectionTarget] = useState(null)
  const collectionNameRef = useRef(null)

  useEffect(() => {
    localStorage.setItem('assetGridScale', gridScale.toString())
  }, [gridScale])

  useEffect(() => {
    localStorage.setItem('assetLibraryViewMode', viewMode)
  }, [viewMode])

  useEffect(() => {
    localStorage.setItem('assetPageSize', pageSize.toString())
  }, [pageSize])

  // Rewind the window whenever what's shown (or its order) changes
  useEffect(() => {
    setVisibleCount(pageSize)
  }, [pageSize, context, filters, viewMode, listSort])

  // Full library, filtered client-side (see utils/assetFilters.js)
  const {
    data: assets = [],
    isLoading: loading,
    error: queryError,
  } = useAssets()

  // Authoritative DB total - the list counter's denominator
  const { data: assetCount } = useAssetCount()

  const deleteMutation = useDeleteAsset()
  const renameMutation = useRenameAsset()
  const associateMutation = useAssociateAsset()
  const changeTypeMutation = useChangeAssetType()
  const favoriteMutation = useToggleFavorite()
  const createCollectionMutation = useCreateCollection()
  const updateCollectionMutation = useUpdateCollection()
  const deleteCollectionMutation = useDeleteCollection()
  const collectionMemberMutation = useToggleCollectionMember()

  const { data: collections = [] } = useCollections()

  const { data: campaignData } = useCampaigns(user?.id)
  const ownedCampaigns = useMemo(
    () => (campaignData?.campaigns || []).filter((campaign) => campaign.host_id === user?.id),
    [campaignData, user?.id]
  )

  const error = queryError?.message || deleteMutation.error?.message || null

  // ── Derived data for rail + filter bar ────────────────────────────
  const typeCounts = useMemo(() => {
    const counts = { map: 0, music: 0, sfx: 0, image: 0 }
    for (const asset of assets) {
      if (counts[asset.asset_type] !== undefined) counts[asset.asset_type] += 1
    }
    return counts
  }, [assets])

  const favoriteCount = useMemo(() => assets.filter((asset) => asset.favorite).length, [assets])

  const campaignCounts = useMemo(() => {
    const counts = {}
    for (const campaign of ownedCampaigns) {
      counts[campaign.id] = 0
    }
    for (const asset of assets) {
      for (const campaignId of asset.campaign_ids || []) {
        if (counts[campaignId] !== undefined) counts[campaignId] += 1
      }
    }
    return counts
  }, [assets, ownedCampaigns])

  const tagOptions = useMemo(() => aggregateTagCounts(assets), [assets])

  // Collections split for the rail - smart counts resolve the saved
  // filters against the cached library via the shared filter fn
  const smartCollections = useMemo(
    () => collections
      .filter((collection) => collection.kind === 'smart')
      .map((collection) => ({
        ...collection,
        count: applyAssetFilters(assets, filtersFromSmartCollection(collection)).length,
      })),
    [collections, assets]
  )
  const manualCollections = useMemo(
    () => collections
      .filter((collection) => collection.kind === 'manual')
      .map((collection) => ({ ...collection, count: (collection.asset_ids || []).length })),
    [collections]
  )

  const activeCollection = (context.kind === 'smart' || context.kind === 'collection')
    ? collections.find((collection) => collection.id === context.id)
    : null

  // ── Base list (rail context) + token filters on top ───────────────
  const baseAssets = useMemo(() => {
    if (context.kind === 'type') return assets.filter((asset) => asset.asset_type === context.id)
    if (context.kind === 'favorites') return assets.filter((asset) => asset.favorite)
    if (context.kind === 'campaign') {
      return assets.filter((asset) => (asset.campaign_ids || []).includes(context.id))
    }
    if (context.kind === 'collection') {
      const memberIds = activeCollection?.asset_ids || []
      return assets.filter((asset) => memberIds.includes(asset.id))
    }
    // 'smart' browses the whole library with the saved filters loaded
    // as live chips (set on navigate)
    return assets
  }, [assets, context, activeCollection])

  const visibleAssets = useMemo(
    () => applyAssetFilters(baseAssets, filters),
    [baseAssets, filters]
  )

  const activeCampaign = context.kind === 'campaign'
    ? ownedCampaigns.find((campaign) => campaign.id === context.id)
    : null

  const contextTitle = context.kind === 'type' ? TYPE_TITLES[context.id]
    : context.kind === 'favorites' ? 'Favorites'
    : context.kind === 'campaign' ? (activeCampaign?.title || 'Campaign')
    : (context.kind === 'smart' || context.kind === 'collection') ? (activeCollection?.name || 'Collection')
    : 'All Assets'

  const contextSubtitle = context.kind === 'favorites'
    ? 'Everything you starred, across every type'
    : context.kind === 'campaign'
      ? 'Every asset associated with this campaign - all types, regardless of tags'
      : context.kind === 'smart'
        ? 'Smart collection - assets matching saved filters, always up to date'
        : context.kind === 'collection'
          ? 'Manually managed - right-click any asset → Collections to add or remove'
          : null

  // ── Selection ──────────────────────────────────────────────────────
  const selectedAssets = useMemo(
    () => assets.filter((asset) => selectedIds.has(asset.id)),
    [assets, selectedIds]
  )

  const exitSelection = useCallback(() => {
    setSelectionMode(false)
    setSelectedIds(new Set())
  }, [])

  const toggleSelected = useCallback((asset) => {
    setSelectedIds((previous) => {
      const next = new Set(previous)
      if (next.has(asset.id)) {
        next.delete(asset.id)
      } else {
        next.add(asset.id)
      }
      return next
    })
  }, [])

  const handleAssetClick = useCallback((asset) => {
    if (selectionMode) {
      toggleSelected(asset)
    } else {
      setQuickLookAsset(asset)
    }
  }, [selectionMode, toggleSelected])

  // ── Handlers ───────────────────────────────────────────────────────
  const handleNavigate = useCallback((kind, id = null) => {
    setBuilder(null)
    exitSelection()
    setContext({ kind, id })
    if (kind === 'smart') {
      const collection = collections.find((existing) => existing.id === id)
      setFilters(collection ? filtersFromSmartCollection(collection) : { ...EMPTY_FILTERS })
    } else {
      setFilters({ ...EMPTY_FILTERS })
    }
  }, [collections, exitSelection])

  const handleCollectionModalSubmit = useCallback(async () => {
    const name = collectionName.trim()
    if (!name || !collectionModal) return
    try {
      if (collectionModal.mode === 'create') {
        const created = await createCollectionMutation.mutateAsync({ name, kind: 'manual' })
        setContext({ kind: 'collection', id: created.id })
        setFilters({ ...EMPTY_FILTERS })
      } else {
        await updateCollectionMutation.mutateAsync({
          collectionId: collectionModal.collection.id,
          name,
        })
      }
      setCollectionModal(null)
      setCollectionName('')
    } catch {
      // Error surfaces via the mutation state
    }
  }, [collectionName, collectionModal, createCollectionMutation, updateCollectionMutation])

  const handleDeleteCollection = useCallback(async () => {
    if (!deleteCollectionTarget) return
    try {
      await deleteCollectionMutation.mutateAsync(deleteCollectionTarget.id)
      setDeleteCollectionTarget(null)
      setContext({ kind: 'all', id: null })
      setFilters({ ...EMPTY_FILTERS })
    } catch {
      // Error surfaces via the mutation state
    }
  }, [deleteCollectionTarget, deleteCollectionMutation])

  const handleTagToggle = useCallback((tag) => {
    setFilters((previous) => ({
      ...previous,
      tags: previous.tags.includes(tag)
        ? previous.tags.filter((existing) => existing !== tag)
        : [...previous.tags, tag],
    }))
  }, [])

  const handleToggleFavorite = useCallback((asset) => {
    favoriteMutation.mutate({ assetId: asset.id, favorite: !asset.favorite })
  }, [favoriteMutation])

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return
    try {
      await deleteMutation.mutateAsync(deleteTarget.id)
      setDeleteTarget(null)
    } catch {
      // Error is available via deleteMutation.error
    }
  }, [deleteTarget, deleteMutation])

  const handleDeleteCancel = useCallback(() => {
    if (!deleteMutation.isPending) {
      setDeleteTarget(null)
    }
  }, [deleteMutation.isPending])

  const handleRenameSubmit = useCallback(async () => {
    if (!renameTarget || !renameValue.trim()) return
    try {
      await renameMutation.mutateAsync({ assetId: renameTarget.id, filename: renameValue.trim() })
      setRenameTarget(null)
      setRenameValue('')
    } catch {
      // Error is available via renameMutation.error
    }
  }, [renameTarget, renameValue, renameMutation])

  const handleRenameCancel = useCallback(() => {
    if (!renameMutation.isPending) {
      setRenameTarget(null)
      setRenameValue('')
    }
  }, [renameMutation.isPending])

  // Bulk executors - skip assets that already have the association so
  // repeats are harmless; mutations run concurrently and invalidations
  // coalesce in TanStack
  const bulkAddToCollection = useCallback((collection, targets) => {
    const missing = targets.filter((asset) => !(collection.asset_ids || []).includes(asset.id))
    return Promise.allSettled(missing.map((asset) =>
      collectionMemberMutation.mutateAsync({ collectionId: collection.id, assetId: asset.id, member: true })
    ))
  }, [collectionMemberMutation])

  const bulkAddToCampaign = useCallback((campaign, targets) => {
    const missing = targets.filter((asset) => !(asset.campaign_ids || []).includes(campaign.id))
    return Promise.allSettled(missing.map((asset) =>
      associateMutation.mutateAsync({ assetId: asset.id, campaignId: campaign.id })
    ))
  }, [associateMutation])

  // Build context menu items for each asset card/row
  const getContextMenuItems = useCallback((asset) => {
    // Bulk menu: selection active and the right-clicked asset is part of it
    if (selectionMode && selectedIds.size > 0 && selectedIds.has(asset.id)) {
      const count = selectedIds.size
      const targets = assets.filter((candidate) => selectedIds.has(candidate.id))
      const bulkItems = []

      if (manualCollections.length > 0) {
        bulkItems.push({
          label: `Add ${count} to Collection`,
          icon: <FontAwesomeIcon icon={faFolder} className="text-xs" />,
          subItems: manualCollections.map(collection => ({
            label: collection.name,
            onClick: () => bulkAddToCollection(collection, targets),
          })),
        })
      }

      if (ownedCampaigns.length > 0) {
        bulkItems.push({
          label: `Add ${count} to Campaign`,
          icon: <FontAwesomeIcon icon={faFlag} className="text-xs" />,
          subItems: ownedCampaigns.map(campaign => ({
            label: campaign.title,
            onClick: () => bulkAddToCampaign(campaign, targets),
          })),
        })
      }

      bulkItems.push({
        label: `Add Tags to ${count}`,
        icon: <FontAwesomeIcon icon={faTags} className="text-xs" />,
        onClick: () => setEditTagsTarget(targets),
      })

      bulkItems.push({ separator: true })
      bulkItems.push({
        label: 'Clear Selection',
        onClick: exitSelection,
      })

      return bulkItems
    }

    const items = [
      {
        label: 'Quick Look',
        icon: <FontAwesomeIcon icon={faEye} className="text-xs" />,
        onClick: () => setQuickLookAsset(asset),
      },
      {
        label: asset.favorite ? 'Unfavorite' : 'Favorite',
        icon: <FontAwesomeIcon icon={faStar} className="text-xs" />,
        onClick: () => handleToggleFavorite(asset),
      },
      {
        label: 'Rename',
        icon: <FontAwesomeIcon icon={faPen} className="text-xs" />,
        onClick: () => {
          setRenameTarget(asset)
          setRenameValue(asset.filename)
        },
      },
      {
        label: 'Edit Tags',
        icon: <FontAwesomeIcon icon={faTags} className="text-xs" />,
        onClick: () => setEditTagsTarget([asset]),
      },
    ]

    // Change Type sub-menu (only for assets with valid alternative types)
    const isImageContent = asset.content_type?.startsWith('image/')
    const isAudioContent = asset.content_type?.startsWith('audio/')
    if (isImageContent) {
      items.push({
        label: 'Change Type',
        icon: <FontAwesomeIcon icon={faShapes} className="text-xs" />,
        subItems: ['map', 'image'].map(type => ({
          label: type.charAt(0).toUpperCase() + type.slice(1),
          disabled: asset.asset_type === type,
          active: asset.asset_type === type,
          onClick: () => changeTypeMutation.mutate({ assetId: asset.id, assetType: type }),
        })),
      })
    } else if (isAudioContent) {
      items.push({
        label: 'Change Type',
        icon: <FontAwesomeIcon icon={faShapes} className="text-xs" />,
        subItems: ['music', 'sfx'].map(type => ({
          label: type.toUpperCase(),
          disabled: asset.asset_type === type,
          active: asset.asset_type === type,
          onClick: () => changeTypeMutation.mutate({ assetId: asset.id, assetType: type }),
        })),
      })
    }

    // Collections sub-menu - toggle membership in manual collections
    if (manualCollections.length > 0) {
      items.push({
        label: 'Collections',
        icon: <FontAwesomeIcon icon={faFolder} className="text-xs" />,
        subItems: manualCollections.map(collection => {
          const isMember = (collection.asset_ids || []).includes(asset.id)
          return {
            label: collection.name,
            active: isMember,
            onClick: () => collectionMemberMutation.mutate({
              collectionId: collection.id,
              assetId: asset.id,
              member: !isMember,
            }),
          }
        }),
      })
    }

    // Campaigns sub-menu - toggle association per campaign, mirroring
    // the Collections menu (only campaigns the user owns)
    if (ownedCampaigns.length > 0) {
      items.push({
        label: 'Campaigns',
        icon: <FontAwesomeIcon icon={faFlag} className="text-xs" />,
        subItems: ownedCampaigns.map(campaign => {
          const isMember = (asset.campaign_ids || []).includes(campaign.id)
          return {
            label: campaign.title,
            active: isMember,
            onClick: () => associateMutation.mutate({
              assetId: asset.id,
              campaignId: campaign.id,
              member: !isMember,
            }),
          }
        }),
      })
    }

    // Workshop bridge - asset-type-specific tools
    if (asset.asset_type === 'map') {
      items.push({
        label: 'Configure Map',
        icon: <FontAwesomeIcon icon={faSliders} className="text-xs" />,
        onClick: () => router.push(`/workshop/map-config?asset_id=${asset.id}&from=library`),
      })
    } else if (asset.asset_type === 'music') {
      items.push({
        label: 'Edit Loop Points',
        icon: <FontAwesomeIcon icon={faSliders} className="text-xs" />,
        onClick: () => router.push(`/workshop/audio-workstation?asset_id=${asset.id}&from=library`),
      })
    }

    items.push({ separator: true })
    items.push({
      label: 'Delete',
      icon: <FontAwesomeIcon icon={faTrash} className="text-xs" />,
      variant: 'danger',
      onClick: () => setDeleteTarget(asset),
    })

    return items
  }, [
    ownedCampaigns, manualCollections, associateMutation, changeTypeMutation,
    collectionMemberMutation, handleToggleFavorite, router,
    selectionMode, selectedIds, assets, bulkAddToCollection, bulkAddToCampaign, exitSelection,
  ])

  // ── Page-level drag-and-drop ───────────────────────────────────────
  const dragHasFiles = (event) =>
    Array.from(event.dataTransfer?.types || []).includes('Files')

  const handleDragEnter = (event) => {
    if (!dragHasFiles(event)) return
    event.preventDefault()
    dragDepth.current += 1
    setDropActive(true)
  }

  const handleDragOver = (event) => {
    if (!dragHasFiles(event)) return
    event.preventDefault()
  }

  const handleDragLeave = (event) => {
    if (!dragHasFiles(event)) return
    event.preventDefault()
    dragDepth.current -= 1
    if (dragDepth.current <= 0) {
      dragDepth.current = 0
      setDropActive(false)
    }
  }

  const handleDrop = (event) => {
    if (!dragHasFiles(event)) return
    event.preventDefault()
    dragDepth.current = 0
    setDropActive(false)
    const files = event.dataTransfer.files
    if (files?.length) {
      setPendingDropFiles(files)
      setUploadModalOpen(true)
    }
  }

  // Pagination window - list is column-sorted first, grid keeps the
  // default order; both slice to the same growing window
  const sortedListAssets = useMemo(
    () => sortAssets(visibleAssets, listSort),
    [visibleAssets, listSort]
  )
  const listAssets = useMemo(
    () => sortedListAssets.slice(0, visibleCount),
    [sortedListAssets, visibleCount]
  )
  const gridAssets = useMemo(
    () => visibleAssets.slice(0, visibleCount),
    [visibleAssets, visibleCount]
  )
  const hasMore = visibleCount < visibleAssets.length
  const handleLoadMore = useCallback(() => {
    setVisibleCount((count) => count + pageSize)
  }, [pageSize])

  // Cycle a column: asc, then desc, then back to default order
  const handleListSortChange = useCallback((key) => {
    setListSort((previous) => {
      if (previous?.key !== key) return { key, dir: 'asc' }
      if (previous.dir === 'asc') return { key, dir: 'desc' }
      return null
    })
  }, [])

  const filtersActive = hasActiveFilters(filters)

  // "{shown} of {total} assets" while the window is still growing -
  // total is the DB count for the plain library view, or the current
  // result-set size when a context/filter narrows it.
  const resultTotal = (context.kind === 'all' && !filtersActive)
    ? (assetCount ?? visibleAssets.length)
    : visibleAssets.length
  const shownCount = Math.min(visibleCount, visibleAssets.length)
  const resultText = shownCount < resultTotal
    ? `${shownCount} of ${resultTotal} asset${resultTotal !== 1 ? 's' : ''}`
    : `${resultTotal} asset${resultTotal !== 1 ? 's' : ''}`

  return (
    <div
      className="relative flex h-full min-h-0 flex-1"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drop-to-upload overlay */}
      {dropActive && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-overlay-light">
          <div className="rounded-sm border-2 border-dashed border-content-on-dark px-12 py-9 text-center">
            <FontAwesomeIcon icon={faUpload} className="mb-3 text-2xl text-content-on-dark" />
            <p className="text-lg font-semibold text-content-on-dark">Drop files to upload</p>
            <p className="mt-1 text-sm text-content-secondary">
              You&apos;ll set each file&apos;s type before anything uploads
            </p>
          </div>
        </div>
      )}

      {/* Navigation rail */}
      <LibraryRail
        context={context}
        onNavigate={handleNavigate}
        totalCount={assets.length}
        typeCounts={typeCounts}
        favoriteCount={favoriteCount}
        campaigns={ownedCampaigns}
        campaignCounts={campaignCounts}
        smartCollections={smartCollections}
        manualCollections={manualCollections}
        onNewSmartCollection={() => setBuilder({ editing: null, prefill: null })}
        onNewCollection={() => {
          setCollectionName('')
          setCollectionModal({ mode: 'create' })
        }}
      />

      {/* Smart collection builder - focused view, rail stays */}
      {builder ? (
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto px-5 py-5 md:px-8">
          <SmartCollectionBuilder
            editingCollection={builder.editing}
            prefillFilters={builder.prefill}
            assets={assets}
            tagOptions={tagOptions}
            typeCounts={typeCounts}
            campaigns={ownedCampaigns}
            onCancel={() => setBuilder(null)}
            onSaved={(collection) => {
              setBuilder(null)
              setContext({ kind: 'smart', id: collection.id })
              setFilters(filtersFromSmartCollection(collection))
            }}
            onDeleted={() => {
              setBuilder(null)
              setContext({ kind: 'all', id: null })
              setFilters({ ...EMPTY_FILTERS })
            }}
          />
        </div>
      ) : (
      <div className="flex min-w-0 flex-1 flex-col px-5 pt-5 md:px-8">
        <AssetFilterBar
          filters={filters}
          onFiltersChange={setFilters}
          tagOptions={tagOptions}
          typeCounts={typeCounts}
          campaigns={ownedCampaigns}
        />

        {/* Context header */}
        <div className="mt-5 flex flex-wrap items-end gap-3">
          <h1 className="flex items-center gap-2.5 text-2xl font-bold text-content-bold">
            {context.kind === 'smart' && (
              <FontAwesomeIcon icon={faBolt} className="text-lg text-content-secondary" />
            )}
            {context.kind === 'collection' && (
              <FontAwesomeIcon icon={faFolder} className="text-lg text-content-secondary" />
            )}
            {contextTitle}
          </h1>
          {contextSubtitle && (
            <span className="pb-1 text-sm text-content-secondary">{contextSubtitle}</span>
          )}
          {context.kind === 'smart' && activeCollection && (
            <button
              onClick={() => setBuilder({ editing: activeCollection, prefill: null })}
              className="ml-auto flex items-center gap-1.5 rounded-sm border border-border px-2.5 py-1.5 text-xs text-content-secondary transition-colors hover:border-border-active hover:text-content-primary"
            >
              <FontAwesomeIcon icon={faPen} className="text-[10px]" />
              Edit smart collection
            </button>
          )}
          {context.kind === 'collection' && activeCollection && (
            <span className="ml-auto flex items-center gap-2">
              <button
                onClick={() => {
                  setCollectionName(activeCollection.name)
                  setCollectionModal({ mode: 'rename', collection: activeCollection })
                }}
                className="flex items-center gap-1.5 rounded-sm border border-border px-2.5 py-1.5 text-xs text-content-secondary transition-colors hover:border-border-active hover:text-content-primary"
              >
                <FontAwesomeIcon icon={faPen} className="text-[10px]" />
                Rename
              </button>
              <button
                onClick={() => setDeleteCollectionTarget(activeCollection)}
                className="flex items-center gap-1.5 rounded-sm border border-border px-2.5 py-1.5 text-xs text-feedback-error transition-colors hover:border-feedback-error"
              >
                <FontAwesomeIcon icon={faTrash} className="text-[10px]" />
                Delete
              </button>
            </span>
          )}
        </div>

        {/* Toolbar */}
        <div className="mb-4 mt-2 flex flex-wrap items-center gap-3">
          <span className="text-sm tabular-nums text-content-secondary">{resultText}</span>

          {/* Multi-select controls */}
          {selectionMode ? (
            <span className="flex items-center gap-2">
              <span className="text-sm font-medium tabular-nums text-content-primary">
                {selectedIds.size} selected
              </span>
              <button
                onClick={() => setSelectedIds(new Set(visibleAssets.map((asset) => asset.id)))}
                className="rounded-sm border border-border px-2.5 py-1.5 text-xs text-content-secondary transition-colors hover:border-border-active hover:text-content-primary"
              >
                Select All
              </button>
              <button
                onClick={exitSelection}
                className="rounded-sm border border-border px-2.5 py-1.5 text-xs text-content-secondary transition-colors hover:border-border-active hover:text-content-primary"
              >
                Done
              </button>
            </span>
          ) : (
            <button
              onClick={() => setSelectionMode(true)}
              className="flex items-center gap-1.5 rounded-sm border border-border px-2.5 py-1.5 text-xs text-content-secondary transition-colors hover:border-border-active hover:text-content-primary"
            >
              <FontAwesomeIcon icon={faSquareCheck} className="text-[10px]" />
              Multi Select
            </button>
          )}

          <div className="flex-1" />

          {/* Save current filters as a smart collection */}
          {filtersActive && context.kind !== 'smart' && (
            <button
              onClick={() => setBuilder({ editing: null, prefill: filters })}
              className="flex items-center gap-1.5 rounded-sm border border-border px-3 py-2 text-xs font-medium text-content-primary transition-colors hover:border-border-active"
            >
              <FontAwesomeIcon icon={faBolt} className="text-[10px]" />
              Save as Smart Collection
            </button>
          )}

          {/* Grid size (grid only) + items per page (both views) */}
          {viewMode === 'grid' && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-content-secondary">Grid Size</span>
              <input
                type="range"
                min="1"
                max="4"
                step="1"
                value={gridScale}
                onChange={(e) => setGridScale(parseInt(e.target.value))}
                className="w-24 asset-grid-slider"
                aria-label="Grid size"
              />
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-xs text-content-secondary">Items per page</span>
            <div className="flex overflow-hidden rounded-sm border border-border">
              {[20, 50, 100].map((size) => (
                <button
                  key={size}
                  onClick={() => setPageSize(size)}
                  className={`px-2.5 py-1.5 text-xs tabular-nums transition-colors ${
                    pageSize === size
                      ? 'bg-surface-secondary text-content-on-dark'
                      : 'text-content-secondary hover:text-content-primary'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          {/* View toggle */}
          <div className="flex overflow-hidden rounded-sm border border-border">
            <button
              onClick={() => setViewMode('grid')}
              aria-label="Grid view"
              className={`px-2.5 py-1.5 text-xs transition-colors ${
                viewMode === 'grid'
                  ? 'bg-surface-secondary text-content-on-dark'
                  : 'text-content-secondary hover:text-content-primary'
              }`}
            >
              <FontAwesomeIcon icon={faTableCellsLarge} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              aria-label="List view"
              className={`px-2.5 py-1.5 text-xs transition-colors ${
                viewMode === 'list'
                  ? 'bg-surface-secondary text-content-on-dark'
                  : 'text-content-secondary hover:text-content-primary'
              }`}
            >
              <FontAwesomeIcon icon={faList} />
            </button>
          </div>

          <Button
            variant="primary"
            size="lg"
            className="!px-4 !py-2"
            onClick={() => setUploadModalOpen(true)}
          >
            <span className="text-content-on-dark">
              <FontAwesomeIcon icon={faUpload} className="mr-2" />
              Upload Assets
            </span>
          </Button>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 flex items-center justify-between rounded-sm border border-feedback-error bg-feedback-error/20 p-3">
            <p className="text-feedback-error">{error}</p>
            <button
              onClick={() => deleteMutation.reset()}
              className="text-feedback-error hover:opacity-80"
              aria-label="Dismiss error"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Content - the only scrolling region; negative margins keep the
            scrollbar at the pane edge while content stays aligned */}
        <div className="-mx-5 min-h-0 flex-1 overflow-y-auto px-5 pb-5 md:-mx-8 md:px-8">
          {loading ? (
            <div
              className="grid gap-4"
              style={{ gridTemplateColumns: `repeat(${7 - gridScale}, minmax(0, 1fr))` }}
            >
              {Array.from({ length: 8 }, (_, index) => (
                <div key={index} className="animate-pulse overflow-hidden rounded-sm border border-border-subtle">
                  <div className="aspect-video bg-border-subtle" />
                  <div className="space-y-2 p-3">
                    <div className="h-3 w-3/4 rounded bg-border-subtle" />
                    <div className="h-2.5 w-1/2 rounded bg-border-subtle" />
                  </div>
                </div>
              ))}
            </div>
          ) : assets.length > 0 && visibleAssets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <h3 className="mb-2 text-lg font-medium text-content-primary">
                {filtersActive ? 'No assets match these filters' : 'Nothing here yet'}
              </h3>
              <p className="max-w-sm text-content-secondary">
                {filtersActive
                  ? 'Try removing a filter, or upload something new.'
                  : context.kind === 'favorites'
                    ? 'Star an asset and it will show up here.'
                    : 'Assets you add to this view will show up here.'}
              </p>
              {filtersActive && (
                <button
                  onClick={() => setFilters({ ...EMPTY_FILTERS })}
                  className="mt-4 rounded-sm border border-border px-4 py-2 text-sm text-content-primary transition-colors hover:border-border-active"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : viewMode === 'list' && visibleAssets.length > 0 ? (
            <AssetListView
              assets={listAssets}
              getContextMenuItems={getContextMenuItems}
              onAssetClick={handleAssetClick}
              onToggleFavorite={handleToggleFavorite}
              onTagClick={handleTagToggle}
              activeTags={filters.tags}
              selectable={selectionMode}
              selectedIds={selectedIds}
              hasMore={hasMore}
              onLoadMore={handleLoadMore}
              sort={listSort}
              onSortChange={handleListSortChange}
            />
          ) : (
            <AssetGrid
              assets={gridAssets}
              loading={loading}
              getContextMenuItems={getContextMenuItems}
              onAssetClick={handleAssetClick}
              onToggleFavorite={handleToggleFavorite}
              onTagClick={handleTagToggle}
              activeTags={filters.tags}
              selectable={selectionMode}
              selectedIds={selectedIds}
              columns={7 - gridScale}
              hasMore={hasMore}
              onLoadMore={handleLoadMore}
            />
          )}
        </div>
      </div>
      )}

      {/* Upload Modal */}
      {uploadModalOpen && (
        <AssetUploadModal
          isOpen={true}
          initialFiles={pendingDropFiles}
          onClose={() => {
            setUploadModalOpen(false)
            setPendingDropFiles(null)
          }}
        />
      )}

      {/* Quick Look Modal */}
      {quickLookAsset && (
        <AssetQuickLook
          asset={quickLookAsset}
          open={true}
          onClose={() => setQuickLookAsset(null)}
        />
      )}

      {/* Edit Tags Modal (single asset or bulk add) */}
      {editTagsTarget && (
        <EditTagsModal
          assets={editTagsTarget}
          allTags={tagOptions}
          onClose={() => setEditTagsTarget(null)}
        />
      )}

      {/* Rename Modal */}
      {renameTarget && (
        <Modal open={true} onClose={handleRenameCancel} size="sm" initialFocus={renameInputRef}>
          <div className="p-6">
            <h2 className="text-lg font-semibold mb-4">Rename Asset</h2>
            <FormField label="Filename" id="rename-filename" error={renameMutation.error?.message}>
              <input
                ref={renameInputRef}
                id="rename-filename"
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRenameSubmit()}
                className="w-full px-3 py-2 rounded-sm border border-border bg-surface-elevated text-content-on-dark focus:outline-none focus:border-border-active"
              />
            </FormField>
            <div className="flex justify-end gap-3 mt-4">
              <Button variant="ghost" onClick={handleRenameCancel} disabled={renameMutation.isPending}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleRenameSubmit}
                disabled={!renameValue.trim() || renameMutation.isPending}
              >
                {renameMutation.isPending ? 'Renaming...' : 'Rename'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Create / Rename Collection Modal */}
      {collectionModal && (
        <Modal open={true} onClose={() => setCollectionModal(null)} size="sm" initialFocus={collectionNameRef}>
          <div className="p-6">
            <h2 className="text-lg font-semibold mb-4">
              {collectionModal.mode === 'create' ? 'New Collection' : 'Rename Collection'}
            </h2>
            <FormField
              label="Name"
              id="collection-name"
              error={createCollectionMutation.error?.message || updateCollectionMutation.error?.message}
            >
              <input
                ref={collectionNameRef}
                id="collection-name"
                type="text"
                value={collectionName}
                onChange={(e) => setCollectionName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCollectionModalSubmit()}
                placeholder="e.g. NPC Portraits"
                className="w-full px-3 py-2 rounded-sm border border-border bg-surface-elevated text-content-on-dark focus:outline-none focus:border-border-active placeholder:text-content-secondary"
              />
            </FormField>
            {collectionModal.mode === 'create' && (
              <p className="mt-2 text-xs text-content-secondary">
                Manually managed - add assets by right-clicking them and choosing Collections.
              </p>
            )}
            <div className="flex justify-end gap-3 mt-4">
              <Button variant="ghost" onClick={() => setCollectionModal(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleCollectionModalSubmit}
                disabled={!collectionName.trim() || createCollectionMutation.isPending || updateCollectionMutation.isPending}
              >
                {collectionModal.mode === 'create' ? 'Create Collection' : 'Rename'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Collection Confirmation */}
      {deleteCollectionTarget && (
        <ConfirmModal
          show={true}
          title="Delete Collection"
          message={`Delete "${deleteCollectionTarget.name}"?`}
          description="The collection goes away; the assets inside are untouched."
          confirmText="Delete"
          cancelText="Cancel"
          onConfirm={handleDeleteCollection}
          onCancel={() => !deleteCollectionMutation.isPending && setDeleteCollectionTarget(null)}
          isLoading={deleteCollectionMutation.isPending}
          loadingText="Deleting..."
          icon={faTrash}
          variant="danger"
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <ConfirmModal
          show={true}
          title="Delete Asset"
          message={`Are you sure you want to delete "${deleteTarget?.filename}"?`}
          description="This will permanently remove the asset. This action cannot be undone."
          confirmText="Delete"
          cancelText="Cancel"
          onConfirm={handleDeleteConfirm}
          onCancel={handleDeleteCancel}
          isLoading={deleteMutation.isPending}
          loadingText="Deleting..."
          icon={faTrash}
          variant="danger"
        />
      )}
    </div>
  )
}
