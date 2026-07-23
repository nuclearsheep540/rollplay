/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowLeft, faHouse } from '@fortawesome/free-solid-svg-icons'
import ImageConfigTool from '@/app/workshop/components/ImageConfigTool'

// Site chrome (header, auth gate, WebSocket subscription, Suspense for
// useSearchParams) is provided by the (authenticated) route group's
// layout — this page only owns its tool content + tool-header row.
export default function ImageConfigPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const selectedAssetId = searchParams.get('asset_id')

  // Entry point (library vs workshop) rides the URL and is carried
  // through every internal navigation, so it survives refresh and
  // deep links - no mount-time capture needed.
  const fromLibrary = searchParams.get('from') === 'library'

  const backLabel = !selectedAssetId
    ? 'Workshop'
    : fromLibrary ? 'Library' : 'Image Config'

  const handleAssetSelect = (assetId) => {
    if (assetId) {
      router.push(`/workshop/image-config?asset_id=${assetId}${fromLibrary ? '&from=library' : ''}`)
    } else {
      router.push('/workshop/image-config')
    }
  }

  // Explicit destinations instead of router.back(): history depth varies
  // with how the user got here (and back() leaves the app entirely on a
  // pasted link), so each state names the place its backLabel promises.
  const handleBack = () => {
    if (!selectedAssetId) {
      router.push('/dashboard?tab=workshop')
    } else if (fromLibrary) {
      router.push('/dashboard?tab=library')
    } else {
      router.push('/workshop/image-config')
    }
  }

  return (
    <main className="flex-1 flex flex-col min-h-0 px-4 sm:px-8 md:px-10 pt-6 pb-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold font-[family-name:var(--font-metamorphous)] text-content-bold">
            Image Config
          </h1>
          <p className="mt-1 text-sm text-content-primary">
            Configure display modes and cinematic effects for your images
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
            onClick={handleBack}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-sm border border-border text-content-primary hover:bg-surface-secondary hover:text-content-on-dark transition-colors"
          >
            <FontAwesomeIcon icon={faArrowLeft} className="text-xs" />
            <span>{backLabel}</span>
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <ImageConfigTool
          selectedAssetId={selectedAssetId}
          onAssetSelect={handleAssetSelect}
        />
      </div>
    </main>
  )
}
