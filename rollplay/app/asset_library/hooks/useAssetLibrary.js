/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { useState, useCallback } from 'react'

/**
 * @deprecated Use the individual TanStack Query hooks instead:
 *   - useAssets()          from './useAssets'
 *   - useUploadAsset()     from './useUploadAsset'
 *   - useDeleteAsset()     from './useDeleteAsset'
 *   - useAssociateAsset()  from './useAssociateAsset'
 *
 * This hook will be removed in a future cleanup pass.
 */
export function useAssetLibrary() {
  const [assets, setAssets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)

  /**
   * Fetch assets from the API
   * @param {string|null} assetType - Optional filter: 'map', 'audio', 'image'
   */
  const fetchAssets = useCallback(async (assetType = null) => {
    try {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams()
      if (assetType && assetType !== 'all') {
        params.append('asset_type', assetType)
      }

      const url = `/api/library/${params.toString() ? '?' + params.toString() : ''}`
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include'
      })

      if (!response.ok) {
        throw new Error('Failed to fetch assets')
      }

      const data = await response.json()
      setAssets(data.assets || [])
    } catch (err) {
      console.error('Error fetching assets:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * Upload a file to S3 via presigned URL
   * @param {File} file - The file to upload
   * @param {string} assetType - Asset type: 'map', 'audio', 'image'
   * @param {string|null} campaignId - Optional campaign to associate with
   * @returns {Object} The created asset
   */
  const uploadAsset = useCallback(async (file, assetType, campaignId = null) => {
    try {
      setUploading(true)
      setUploadProgress(0)
      setError(null)

      // Step 1: Get presigned upload URL
      const uploadUrlParams = new URLSearchParams({
        filename: file.name,
        content_type: file.type,
        asset_type: assetType
      })

      const uploadUrlResponse = await fetch(`/api/library/upload-url?${uploadUrlParams}`, {
        method: 'GET',
        credentials: 'include'
      })

      if (!uploadUrlResponse.ok) {
        const errorData = await uploadUrlResponse.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Failed to get upload URL')
      }

      const { upload_url, key } = await uploadUrlResponse.json()
      setUploadProgress(20)

      // Step 2: Upload file directly to S3
      const uploadResponse = await fetch(upload_url, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type
        }
      })

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file to S3')
      }
      setUploadProgress(70)

      // Step 3: Confirm upload with backend
      const confirmBody = {
        key,
        asset_type: assetType,
        file_size: file.size
      }

      if (campaignId) {
        confirmBody.campaign_id = campaignId
      }

      const confirmResponse = await fetch('/api/library/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(confirmBody)
      })

      if (!confirmResponse.ok) {
        const errorData = await confirmResponse.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Failed to confirm upload')
      }

      const newAsset = await confirmResponse.json()
      setUploadProgress(100)

      // Add new asset to state
      setAssets(prev => [newAsset, ...prev])

      return newAsset
    } catch (err) {
      console.error('Error uploading asset:', err)
      setError(err.message)
      throw err
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }, [])

  /**
   * Delete an asset
   * @param {string} assetId - The asset ID to delete
   */
  const deleteAsset = useCallback(async (assetId) => {
    try {
      setError(null)

      const response = await fetch(`/api/library/${assetId}`, {
        method: 'DELETE',
        credentials: 'include'
      })

      if (!response.ok && response.status !== 204) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Failed to delete asset')
      }

      // Remove from state
      setAssets(prev => prev.filter(a => a.id !== assetId))

      return true
    } catch (err) {
      console.error('Error deleting asset:', err)
      setError(err.message)
      throw err
    }
  }, [])

  /**
   * Associate an asset with a campaign
   * @param {string} assetId - The asset ID
   * @param {string} campaignId - The campaign ID to associate with
   * @param {string|null} sessionId - Optional session ID
   */
  const associateWithCampaign = useCallback(async (assetId, campaignId, sessionId = null) => {
    try {
      setError(null)

      const body = { campaign_id: campaignId }
      if (sessionId) {
        body.session_id = sessionId
      }

      const response = await fetch(`/api/library/${assetId}/associate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(body)
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Failed to associate asset')
      }

      const updatedAsset = await response.json()

      // Update in state
      setAssets(prev => prev.map(a => a.id === assetId ? updatedAsset : a))

      return updatedAsset
    } catch (err) {
      console.error('Error associating asset:', err)
      setError(err.message)
      throw err
    }
  }, [])

  return {
    assets,
    loading,
    error,
    uploading,
    uploadProgress,
    fetchAssets,
    uploadAsset,
    deleteAsset,
    associateWithCampaign,
    clearError: () => setError(null)
  }
}

export default useAssetLibrary
