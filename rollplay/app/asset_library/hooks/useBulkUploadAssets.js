/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { useState, useCallback, useMemo, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/app/shared/utils/authFetch'
import { detectAssetType, validateFileForType } from '../config/assetTypes'

let nextId = 0

/**
 * Hook for uploading multiple assets sequentially via the 3-step presigned URL flow.
 *
 * Manages a file queue with per-file asset type selection, validation, and status tracking.
 * Each file goes through: GET presigned URL → PUT to S3 → POST confirm.
 */
export function useBulkUploadAssets() {
  const queryClient = useQueryClient()
  const [queue, setQueue] = useState([])
  const [isUploading, setIsUploading] = useState(false)
  const queueRef = useRef(queue)
  queueRef.current = queue

  const addFiles = useCallback((files) => {
    const newItems = Array.from(files)
      .filter(file => file.size > 0)
      .map(file => {
        const detectedType = detectAssetType(file.type)
        return {
          id: `upload-${++nextId}`,
          file,
          assetType: detectedType || 'image',
          status: detectedType ? 'pending' : 'error',
          progress: 0,
          error: detectedType ? null : `Unsupported file type: ${file.type || 'unknown'}`,
        }
      })
    setQueue(prev => [...prev, ...newItems])
  }, [])

  const removeFile = useCallback((id) => {
    setQueue(prev => prev.filter(item => item.id !== id))
  }, [])

  const updateAssetType = useCallback((id, assetType) => {
    setQueue(prev => prev.map(item => {
      if (item.id !== id) return item
      const error = validateFileForType(item.file, assetType)
      return { ...item, assetType, error, status: error ? 'error' : 'pending' }
    }))
  }, [])

  const reset = useCallback(() => {
    setQueue([])
    setIsUploading(false)
  }, [])

  const updateItem = useCallback((id, updates) => {
    setQueue(prev => prev.map(item =>
      item.id === id ? { ...item, ...updates } : item
    ))
  }, [])

  const startUpload = useCallback(async () => {
    setIsUploading(true)

    // Snapshot the queue at the start — file data and assetType won't change during upload
    // because the UI disables the dropdowns while isUploading is true
    const items = [...queueRef.current]

    for (const item of items) {
      if (item.status === 'done') continue

      const validationError = validateFileForType(item.file, item.assetType)
      if (validationError) {
        updateItem(item.id, { status: 'error', progress: 0, error: validationError })
        continue
      }

      updateItem(item.id, { status: 'uploading', progress: 0, error: null })

      try {
        // Step 1: Get presigned upload URL
        const uploadUrlParams = new URLSearchParams({
          filename: item.file.name,
          content_type: item.file.type,
          asset_type: item.assetType,
        })

        const uploadUrlResponse = await authFetch(`/api/library/upload-url?${uploadUrlParams}`, {
          method: 'GET',
        })

        if (!uploadUrlResponse.ok) {
          const errorData = await uploadUrlResponse.json().catch(() => ({}))
          throw new Error(errorData.detail || 'Failed to get upload URL')
        }

        const { upload_url, key } = await uploadUrlResponse.json()
        updateItem(item.id, { progress: 20 })

        // Step 2: Upload file directly to S3
        const uploadResponse = await fetch(upload_url, {
          method: 'PUT',
          body: item.file,
          headers: { 'Content-Type': item.file.type },
        })

        if (!uploadResponse.ok) {
          throw new Error('Failed to upload file to S3')
        }
        updateItem(item.id, { progress: 70 })

        // Step 3: Confirm upload with backend
        const confirmResponse = await authFetch('/api/library/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key,
            asset_type: item.assetType,
            file_size: item.file.size,
          }),
        })

        if (!confirmResponse.ok) {
          const errorData = await confirmResponse.json().catch(() => ({}))
          throw new Error(errorData.detail || 'Failed to confirm upload')
        }

        updateItem(item.id, { status: 'done', progress: 100 })
      } catch (err) {
        updateItem(item.id, { status: 'error', progress: 0, error: err.message || 'Upload failed' })
      }
    }

    queryClient.invalidateQueries({ queryKey: ['assets'] })
    setIsUploading(false)
  }, [updateItem, queryClient])

  const completedCount = useMemo(() => queue.filter(i => i.status === 'done').length, [queue])
  const errorCount = useMemo(() => queue.filter(i => i.status === 'error').length, [queue])
  const hasValidationErrors = useMemo(() =>
    queue.some(item => item.status === 'error' || validateFileForType(item.file, item.assetType) !== null),
    [queue]
  )

  return {
    queue,
    isUploading,
    completedCount,
    errorCount,
    totalCount: queue.length,
    hasValidationErrors,
    addFiles,
    removeFile,
    updateAssetType,
    startUpload,
    reset,
  }
}
