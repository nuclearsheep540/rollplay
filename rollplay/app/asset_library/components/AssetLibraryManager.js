/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faUpload, faSquarePlus, faTrash, faEye, faPen, faTag } from '@fortawesome/free-solid-svg-icons'
import { useAssets } from '../hooks/useAssets'
import { useUploadAsset } from '../hooks/useUploadAsset'
import { useDeleteAsset } from '../hooks/useDeleteAsset'
import { useRenameAsset } from '../hooks/useRenameAsset'
import { useAssociateAsset } from '../hooks/useAssociateAsset'
import { useChangeAssetType } from '../hooks/useChangeAssetType'
import { useCampaigns } from '@/app/dashboard/hooks/useCampaigns'
import AssetGrid from './AssetGrid'
import AssetUploadModal from './AssetUploadModal'
import AssetQuickLook from './AssetQuickLook'
import ConfirmModal from '@/app/shared/components/ConfirmModal'
import Modal from '@/app/shared/components/Modal'
import FormField from '@/app/shared/components/FormField'
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
  const [category, setCategory] = useState('media')
  const [subFilter, setSubFilter] = useState(['all'])
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [quickLookAsset, setQuickLookAsset] = useState(null)
  const [renameTarget, setRenameTarget] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef(null)
  const [gridScale, setGridScale] = useState(() => {
    if (typeof window !== 'undefined') {
      return parseInt(localStorage.getItem('assetGridScale')) || 2
    }
    return 2 // Default to level 2 (4 columns)
  })

  // Determine query filter from sub-filter state
  const queryAssetType = subFilter.includes('all') || subFilter.length > 1
    ? null
    : subFilter[0]

  // TanStack Query — auto-fetches on mount and when queryAssetType changes
  const {
    data: assets = [],
    isLoading: loading,
    error: queryError,
  } = useAssets({
    assetType: queryAssetType,
    enabled: category !== 'objects',
  })

  const uploadMutation = useUploadAsset()
  const deleteMutation = useDeleteAsset()
  const renameMutation = useRenameAsset()
  const associateMutation = useAssociateAsset()
  const changeTypeMutation = useChangeAssetType()

  // Campaigns for "Add to Campaign" sub-menu
  const { data: campaignData } = useCampaigns(user?.id)
  const campaigns = campaignData?.campaigns || []

  const error = queryError?.message || deleteMutation.error?.message || null

  // Persist grid scale preference
  useEffect(() => {
    localStorage.setItem('assetGridScale', gridScale.toString())
  }, [gridScale])

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
    await uploadMutation.mutateAsync({ file, assetType })
  }, [uploadMutation])

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

  // Build context menu items for each asset card
  const getContextMenuItems = useCallback((asset) => {
    const items = [
      {
        label: 'Quick Look',
        icon: <FontAwesomeIcon icon={faEye} className="text-xs" />,
        onClick: () => setQuickLookAsset(asset),
      },
      {
        label: 'Rename',
        icon: <FontAwesomeIcon icon={faPen} className="text-xs" />,
        onClick: () => {
          setRenameTarget(asset)
          setRenameValue(asset.filename)
        },
      },
    ]

    // Change Tag sub-menu (only for assets with valid alternative types)
    const isImageContent = asset.content_type?.startsWith('image/')
    if (isImageContent) {
      const tagOptions = ['map', 'image']
      items.push({
        label: 'Change Tag',
        icon: <FontAwesomeIcon icon={faTag} className="text-xs" />,
        subItems: tagOptions.map(type => ({
          label: type.charAt(0).toUpperCase() + type.slice(1),
          disabled: asset.asset_type === type,
          onClick: () => changeTypeMutation.mutate({ assetId: asset.id, assetType: type }),
        })),
      })
    }

    // Add to Campaign sub-menu (only campaigns the user owns)
    const ownedCampaigns = campaigns.filter(c => c.host_id === user?.id)
    if (ownedCampaigns.length > 0) {
      items.push({
        label: 'Add to Campaign',
        subItems: ownedCampaigns.map(campaign => ({
          label: campaign.title,
          disabled: asset.campaign_ids?.includes(campaign.id),
          onClick: () => associateMutation.mutate({ assetId: asset.id, campaignId: campaign.id }),
        })),
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
  }, [campaigns, associateMutation, changeTypeMutation])

  // Filter assets client-side when fetching all (multi-select or 'all' sub-filter)
  const filteredAssets = useMemo(() => {
    if (subFilter.includes('all')) return assets
    return assets.filter(a => subFilter.includes(a.asset_type))
  }, [assets, subFilter])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-4xl font-bold font-[family-name:var(--font-metamorphous)] text-content-bold">
            Asset Library
          </h1>
          <p className="mt-2 text-content-primary">
            Manage your media assets and domain objects for game sessions
          </p>
        </div>
      </div>

      {/* Category Tabs (Top Level) */}
      <div className="flex items-center mb-4">
        <div className="flex gap-4">
          {CATEGORY_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleCategoryChange(tab.id)}
              className={`px-5 py-2.5 rounded-sm text-sm font-semibold border transition-all ${
                category === tab.id
                  ? 'bg-surface-secondary text-content-on-dark border-border-active'
                  : 'bg-transparent text-content-secondary border-border'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sub-Filter Tabs */}
      <div className="flex gap-4 mb-4">
        {SUB_FILTERS[category].map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleSubFilterChange(tab.id)}
            className={`px-4 py-2 rounded-sm text-sm font-medium border transition-all ${
              subFilter.includes(tab.id)
                ? 'bg-surface-secondary text-content-on-dark border-border-active'
                : 'bg-transparent text-content-secondary border-border'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Action Buttons + Grid Scale Slider */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-3">
          <Button
            variant="primary"
            size="lg"
            className="!px-4 !py-2"
            onClick={() => setUploadModalOpen(true)}
          >
            <span className="text-content-on-dark">
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
            <span className="text-content-secondary">
              <FontAwesomeIcon icon={faSquarePlus} className="mr-2 text-xl" />
              Create Object
            </span>
          </Button>
        </div>

        {/* Grid Scale Slider */}
        <div className="flex items-start gap-3">
          <span className="text-xs mb-6 text-content-bold">Grid Size</span>
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
            <div className="flex justify-between w-32 mt-3">
              {['lg', 'm', 's', 'xs'].map((label) => (
                <span
                  key={label}
                  className="text-[10px] text-content-bold"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-3 rounded-sm border flex items-center justify-between bg-feedback-error/20 border-feedback-error">
          <p className="text-feedback-error">{error}</p>
          <button
            onClick={() => deleteMutation.reset()}
            className="text-feedback-error hover:opacity-80"
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
            getContextMenuItems={getContextMenuItems}
            columns={gridScale + 2}
          />
        ) : (
          /* Objects placeholder - NPCs and Items coming soon */
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="text-6xl mb-4 opacity-30">{'\uD83E\uDDD9'}</div>
            <h3 className="text-lg font-medium mb-2 text-content-on-dark">
              Domain Objects Coming Soon
            </h3>
            <p className="max-w-sm text-content-secondary">
              NPCs, Items, and other domain objects will be managed here in a future update.
            </p>
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {uploadModalOpen && (
        <AssetUploadModal
          isOpen={true}
          onClose={() => setUploadModalOpen(false)}
          onUpload={handleUpload}
          uploading={uploadMutation.isPending}
          uploadProgress={uploadMutation.progress}
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
