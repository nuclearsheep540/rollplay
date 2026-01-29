/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faUpload, faSquarePlus, faTrash } from '@fortawesome/free-solid-svg-icons'
import { useAssetLibrary } from '../hooks/useAssetLibrary'
import AssetGrid from './AssetGrid'
import AssetUploadModal from './AssetUploadModal'
import ConfirmModal from '@/app/shared/components/ConfirmModal'
import { COLORS, THEME } from '@/app/styles/colorTheme'
import { Button } from '@/app/dashboard/components/shared/Button'

// Top-level category filters
const CATEGORY_TABS = [
  { id: 'media', label: 'Media' },
  { id: 'objects', label: 'Objects' },
  { id: 'all', label: 'All' }
]

// Sub-filters per category
const SUB_FILTERS = {
  all: [
    { id: 'all', label: 'All' },
    { id: 'map', label: 'Maps' },
    { id: 'audio', label: 'Audio' },
    { id: 'image', label: 'Images' },
    { id: 'npc', label: 'NPCs' },
    { id: 'item', label: 'Items' }
  ],
  media: [
    { id: 'all', label: 'All' },
    { id: 'map', label: 'Maps' },
    { id: 'audio', label: 'Audio' },
    { id: 'image', label: 'Images' }
  ],
  objects: [
    { id: 'all', label: 'All' },
    { id: 'npc', label: 'NPCs' },
    { id: 'item', label: 'Items' }
  ]
}

/**
 * Main container for the asset library management interface
 */
export default function AssetLibraryManager({ user }) {
  const {
    assets,
    loading,
    error,
    uploading,
    uploadProgress,
    fetchAssets,
    uploadAsset,
    deleteAsset,
    clearError
  } = useAssetLibrary()

  const [category, setCategory] = useState('media')
  const [subFilter, setSubFilter] = useState(['all'])
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [deleteModal, setDeleteModal] = useState({ open: false, asset: null, isDeleting: false })
  const [gridScale, setGridScale] = useState(() => {
    if (typeof window !== 'undefined') {
      return parseInt(localStorage.getItem('assetGridScale')) || 2
    }
    return 2 // Default to level 2 (4 columns)
  })

  // Persist grid scale preference
  useEffect(() => {
    localStorage.setItem('assetGridScale', gridScale.toString())
  }, [gridScale])

  // Fetch assets on mount and when filter changes
  useEffect(() => {
    // Only fetch media assets for now (objects will use different endpoints)
    if (category === 'media' || category === 'all') {
      // When multi-select or 'all', fetch everything and filter client-side
      const fetchType = subFilter.includes('all') || subFilter.length > 1
        ? null
        : subFilter[0]
      fetchAssets(fetchType)
    }
  }, [category, subFilter, fetchAssets])

  // Reset sub-filter when category changes
  const handleCategoryChange = useCallback((newCategory) => {
    setCategory(newCategory)
    setSubFilter(['all'])
  }, [])

  const handleSubFilterChange = useCallback((filterId) => {
    if (category === 'all') {
      // Multi-select mode
      if (filterId === 'all') {
        setSubFilter(['all'])
      } else {
        setSubFilter(prev => {
          const withoutAll = prev.filter(f => f !== 'all')
          if (withoutAll.includes(filterId)) {
            const remaining = withoutAll.filter(f => f !== filterId)
            return remaining.length === 0 ? ['all'] : remaining
          } else {
            return [...withoutAll, filterId]
          }
        })
      }
    } else {
      // Single-select mode
      setSubFilter([filterId])
    }
  }, [category])

  const handleUpload = useCallback(async (file, assetType) => {
    await uploadAsset(file, assetType)
    // Refetch all to ensure new asset appears regardless of active filters
    await fetchAssets(null)
  }, [uploadAsset, fetchAssets])

  const handleDeleteClick = useCallback((asset) => {
    setDeleteModal({ open: true, asset, isDeleting: false })
  }, [])

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteModal.asset) return

    setDeleteModal(prev => ({ ...prev, isDeleting: true }))

    try {
      await deleteAsset(deleteModal.asset.id)
      setDeleteModal({ open: false, asset: null, isDeleting: false })
    } catch (err) {
      setDeleteModal(prev => ({ ...prev, isDeleting: false }))
    }
  }, [deleteModal.asset, deleteAsset])

  const handleDeleteCancel = useCallback(() => {
    if (!deleteModal.isDeleting) {
      setDeleteModal({ open: false, asset: null, isDeleting: false })
    }
  }, [deleteModal.isDeleting])

  // Filter assets based on selected filter (in case we fetched all)
  const filteredAssets = subFilter.includes('all')
    ? assets
    : assets.filter(a => subFilter.includes(a.asset_type))

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1
            className="text-4xl font-bold font-[family-name:var(--font-metamorphous)]"
            style={{ color: THEME.textBold }}
          >
            Asset Library
          </h1>
          <p className="mt-2" style={{ color: THEME.textPrimary }}>
            Manage your media assets and domain objects for game sessions
          </p>
        </div>
      </div>

      {/* Category Tabs (Top Level) + Grid Scale Slider */}
      <div className="flex items-center justify-between mb-4">
        {/* Left: Category Tabs */}
        <div className="flex gap-4">
          {CATEGORY_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleCategoryChange(tab.id)}
              className="px-5 py-2.5 rounded-sm text-sm font-semibold border transition-all"
              style={{
                backgroundColor: category === tab.id ? THEME.bgSecondary : 'transparent',
                color: category === tab.id ? THEME.textOnDark : COLORS.graphite,
                borderColor: category === tab.id ? THEME.borderActive : THEME.borderDefault
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Right: Grid Scale Slider */}
        <div className="flex items-start gap-3">
          <span className="text-xs mb-6" style={{ color: COLORS.graphite }}>Grid Size</span>
          <div className="flex flex-col items-center m-auto">
            <input
              type="range"
              min="1"
              max="4"
              step="1"
              value={gridScale}
              onChange={(e) => setGridScale(parseInt(e.target.value))}
              className="w-24 asset-grid-slider"
            />
            {/* Labeled tick marks - fixed width labels for even distribution */}
            <div className="flex justify-between w-32 mt-3">
              {['lg', 'm', 's', 'xs'].map((label) => (
                <span
                  key={label}
                  className="text-[10px]"
                  style={{
                    color: COLORS.graphite,
                  }}
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Sub-Filter Tabs */}
      <div className="flex gap-4 mb-4">
        {SUB_FILTERS[category].map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleSubFilterChange(tab.id)}
            className="px-4 py-2 rounded-sm text-sm font-medium border transition-all"
            style={{
              backgroundColor: subFilter.includes(tab.id) ? THEME.bgSecondary : 'transparent',
              color: subFilter.includes(tab.id) ? THEME.textOnDark : COLORS.graphite,
              borderColor: subFilter.includes(tab.id) ? THEME.borderActive : THEME.borderDefault
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 mb-6">
        <Button
          variant="primary"
          size="lg"
          className="!px-4 !py-2"
          onClick={() => setUploadModalOpen(true)}
        >
          <span style={{ color: COLORS.smoke }}>
            <FontAwesomeIcon icon={faUpload} className="mr-2" />
            Upload Asset
          </span>
        </Button>
        <Button
          variant="ghost"
          size="lg"
          className="!px-4 !py-2"
          onClick={() => {}}
        >
          <span style={{ color: COLORS.graphite }}>
            <FontAwesomeIcon icon={faSquarePlus} className="mr-2 text-xl" />
            Create Object
          </span>
        </Button>
      </div>

      {/* Error Message */}
      {error && (
        <div
          className="mb-4 p-3 rounded-sm border flex items-center justify-between"
          style={{ backgroundColor: '#991b1b', borderColor: '#dc2626' }}
        >
          <p style={{ color: '#fca5a5' }}>{error}</p>
          <button
            onClick={clearError}
            className="hover:opacity-80"
            style={{ color: '#fca5a5' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto">
        {category !== 'objects' ? (
          <AssetGrid
            assets={filteredAssets}
            loading={loading}
            onDeleteAsset={handleDeleteClick}
            columns={gridScale + 2}
          />
        ) : (
          /* Objects placeholder - NPCs and Items coming soon */
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="text-6xl mb-4 opacity-30">🧙</div>
            <h3 className="text-lg font-medium mb-2" style={{ color: THEME.textOnDark }}>
              Domain Objects Coming Soon
            </h3>
            <p className="max-w-sm" style={{ color: THEME.textSecondary }}>
              NPCs, Items, and other domain objects will be managed here in a future update.
            </p>
          </div>
        )}
      </div>

      {/* Upload Modal */}
      <AssetUploadModal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onUpload={handleUpload}
        uploading={uploading}
        uploadProgress={uploadProgress}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        show={deleteModal.open}
        title="Delete Asset"
        message={`Are you sure you want to delete "${deleteModal.asset?.filename}"?`}
        description="This will permanently remove the asset from S3 storage. This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
        isLoading={deleteModal.isDeleting}
        loadingText="Deleting..."
        icon={faTrash}
        variant="danger"
      />
    </div>
  )
}
