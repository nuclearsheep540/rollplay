/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/app/shared/utils/authFetch'

/**
 * Mutation hook for uploading assets via the 3-step presigned URL flow.
 *
 * Steps: get presigned URL → PUT to S3 → confirm with backend
 *
 * @returns {Object} TanStack mutation + `progress` (0-100)
 */
export function useUploadAsset() {
  const queryClient = useQueryClient()
  const [progress, setProgress] = useState(0)

  const mutation = useMutation({
    mutationFn: async ({ file, assetType, campaignId = null }) => {
      setProgress(0)

      // Step 1: Get presigned upload URL
      const uploadUrlParams = new URLSearchParams({
        filename: file.name,
        content_type: file.type,
        asset_type: assetType,
      })

      const uploadUrlResponse = await authFetch(`/api/library/upload-url?${uploadUrlParams}`, {
        method: 'GET',
      })

      if (!uploadUrlResponse.ok) {
        const errorData = await uploadUrlResponse.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Failed to get upload URL')
      }

      const { upload_url, key } = await uploadUrlResponse.json()
      setProgress(20)

      // Step 2: Upload file directly to S3
      const uploadResponse = await fetch(upload_url, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      })

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file to S3')
      }
      setProgress(70)

      // Step 3: Confirm upload with backend
      const confirmBody = {
        key,
        asset_type: assetType,
        file_size: file.size,
      }
      if (campaignId) {
        confirmBody.campaign_id = campaignId
      }

      const confirmResponse = await authFetch('/api/library/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(confirmBody),
      })

      if (!confirmResponse.ok) {
        const errorData = await confirmResponse.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Failed to confirm upload')
      }

      const newAsset = await confirmResponse.json()
      setProgress(100)
      return newAsset
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] })
    },
    onSettled: () => {
      setProgress(0)
    },
  })

  return { ...mutation, progress }
}
