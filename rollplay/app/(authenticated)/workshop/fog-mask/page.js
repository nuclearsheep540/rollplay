/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowLeft, faHouse } from '@fortawesome/free-solid-svg-icons'
import FogMaskTool from '@/app/workshop/components/FogMaskTool'

// Site chrome is provided by the (authenticated) route group's layout —
// this page only owns its tool content + tool-header row.
export default function FogMaskPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const selectedAssetId = searchParams.get('asset_id')

  const entryFromRef = useRef(null)
  if (entryFromRef.current === null) {
    entryFromRef.current = searchParams.get('from') || 'workshop'
  }

  const backLabel = !selectedAssetId
    ? 'Workshop'
    : entryFromRef.current === 'library' ? 'Library' : 'Fog Mask'

  const handleAssetSelect = (assetId) => {
    if (assetId) {
      router.push(`/workshop/fog-mask?asset_id=${assetId}`)
    } else {
      router.push('/workshop/fog-mask')
    }
  }

  return (
    <main className="flex-1 flex flex-col min-h-0 px-4 sm:px-8 md:px-10 pt-6 pb-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold font-[family-name:var(--font-metamorphous)] text-content-bold">
            Fog Mask
          </h1>
          <p className="mt-1 text-sm text-content-primary">
            Paint and reveal fog of war for your maps
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedAssetId && (
            <button
              onClick={() => router.push('/dashboard')}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-sm border border-border text-content-primary hover:bg-surface-secondary hover:text-content-on-dark transition-colors"
            >
              <FontAwesomeIcon icon={faHouse} className="text-xs" />
              <span>Dashboard</span>
            </button>
          )}
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-sm border border-border text-content-primary hover:bg-surface-secondary hover:text-content-on-dark transition-colors"
          >
            <FontAwesomeIcon icon={faArrowLeft} className="text-xs" />
            <span>{backLabel}</span>
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <FogMaskTool
          selectedAssetId={selectedAssetId}
          onAssetSelect={handleAssetSelect}
        />
      </div>
    </main>
  )
}
