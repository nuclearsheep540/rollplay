/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPlus, faTrash } from '@fortawesome/free-solid-svg-icons'
import { useAssetLibrary } from '../hooks/useAssetLibrary'
import AssetGrid from './AssetGrid'
import AssetUploadModal from './AssetUploadModal'
import ConfirmModal from '@/app/shared/components/ConfirmModal'
import { COLORS, THEME } from '@/app/styles/colorTheme'
import { Button } from '@/app/dashboard/components/shared/Button'

// Top-level category filters
const CATEGORY_TABS = [
  { id: 'media', label: 'Media' },
  { id: 'objects', label: 'Objects' }
]

// Sub-filters per category
const SUB_FILTERS = {
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
  const [subFilter, setSubFilter] = useState('all')
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [deleteModal, setDeleteModal] = useState({ open: false, asset: null, isDeleting: false })

  // Fetch assets on mount and when filter changes
  useEffect(() => {
    // Only fetch media assets for now (objects will use different endpoints)
    if (category === 'media') {
      fetchAssets(subFilter === 'all' ? null : subFilter)
    }
  }, [category, subFilter, fetchAssets])

  // Reset sub-filter when category changes
  const handleCategoryChange = useCallback((newCategory) => {
    setCategory(newCategory)
    setSubFilter('all')
  }, [])

  const handleUpload = useCallback(async (file, assetType) => {
    await uploadAsset(file, assetType)
    // Refresh with current filter
    await fetchAssets(subFilter === 'all' ? null : subFilter)
  }, [uploadAsset, fetchAssets, subFilter])

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
  const filteredAssets = subFilter === 'all'
    ? assets
    : assets.filter(a => a.asset_type === subFilter)

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
        {category === 'media' && (
          <Button
            variant="primary"
            onClick={() => setUploadModalOpen(true)}
            className="flex items-center gap-2"
          >
            <FontAwesomeIcon icon={faPlus} />
            Upload Asset
          </Button>
        )}
      </div>

      {/* Category Tabs (Top Level) */}
      <div className="flex gap-2 mb-4">
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleCategoryChange(tab.id)}
            className="px-4 py-2 rounded-sm text-sm font-semibold border transition-all"
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

      {/* Sub-Filter Tabs */}
      <div className="flex gap-2 mb-6">
        {SUB_FILTERS[category].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSubFilter(tab.id)}
            className="px-3 py-1.5 rounded-sm text-xs font-medium border transition-all"
            style={{
              backgroundColor: subFilter === tab.id ? THEME.bgSecondary : 'transparent',
              color: subFilter === tab.id ? THEME.textOnDark : COLORS.graphite,
              borderColor: subFilter === tab.id ? THEME.borderActive : THEME.borderDefault
            }}
          >
            {tab.label}
          </button>
        ))}
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
        {category === 'media' ? (
          <AssetGrid
            assets={filteredAssets}
            loading={loading}
            onDeleteAsset={handleDeleteClick}
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
