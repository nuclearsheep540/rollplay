/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useAssetLibrary } from '../hooks/useAssetLibrary'
import AssetGrid from './AssetGrid'
import AssetUploadModal from './AssetUploadModal'
import ConfirmModal from '@/app/shared/components/ConfirmModal'
import { faTrash } from '@fortawesome/free-solid-svg-icons'

const FILTER_TABS = [
  { id: 'all', label: 'All' },
  { id: 'map', label: 'Maps' },
  { id: 'audio', label: 'Audio' },
  { id: 'image', label: 'Images' }
]

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

  const [filter, setFilter] = useState('all')
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [deleteModal, setDeleteModal] = useState({ open: false, asset: null, isDeleting: false })

  // Fetch assets on mount and when filter changes
  useEffect(() => {
    fetchAssets(filter === 'all' ? null : filter)
  }, [filter, fetchAssets])

  const handleUpload = useCallback(async (file, assetType) => {
    await uploadAsset(file, assetType)
    // Refresh with current filter
    await fetchAssets(filter === 'all' ? null : filter)
  }, [uploadAsset, fetchAssets, filter])

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
  const filteredAssets = filter === 'all'
    ? assets
    : assets.filter(a => a.asset_type === filter)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-200">Asset Library</h1>
          <p className="text-slate-500 text-sm mt-1">
            Manage your maps, audio, and images for game sessions
          </p>
        </div>
        <button
          onClick={() => setUploadModalOpen(true)}
          className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-500 transition-colors flex items-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Upload Asset
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === tab.id
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/50'
                : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center justify-between">
          <p className="text-red-400 text-sm">{error}</p>
          <button
            onClick={clearError}
            className="text-red-400 hover:text-red-300"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Asset Grid */}
      <div className="flex-1 overflow-y-auto">
        <AssetGrid
          assets={filteredAssets}
          loading={loading}
          onDeleteAsset={handleDeleteClick}
        />
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
