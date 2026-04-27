/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowLeft, faHouse } from '@fortawesome/free-solid-svg-icons'
import MapGridTool from '@/app/workshop/components/MapGridTool'
import FogMaskTool from '@/app/workshop/components/FogMaskTool'

const SUBTOOLS = [
  { id: 'grid', label: 'Grid' },
  { id: 'fog', label: 'Fog of War' },
]

// Site chrome (header, auth gate, WebSocket subscription, Suspense for
// useSearchParams) is provided by the (authenticated) route group's
// layout — this page only owns its tool content + tool-header row.
export default function MapConfigPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const selectedAssetId = searchParams.get('asset_id')
  const subtool = SUBTOOLS.some(t => t.id === searchParams.get('tool'))
    ? searchParams.get('tool')
    : 'grid'

  // Capture the entry point once on mount (library vs workshop navigation)
  const entryFromRef = useRef(null)
  if (entryFromRef.current === null) {
    entryFromRef.current = searchParams.get('from') || 'workshop'
  }

  const backLabel = !selectedAssetId
    ? 'Workshop'
    : entryFromRef.current === 'library' ? 'Library' : 'Map Config'

  // URL is the source of truth for both asset and subtool selection.
  // Browser back/forward navigates between states naturally.
  const handleAssetSelect = (assetId) => {
    if (assetId) {
      router.push(`/workshop/map-config?asset_id=${assetId}&tool=${subtool}`)
    } else {
      router.push('/workshop/map-config')
    }
  }

  const handleSubtoolChange = (toolId) => {
    if (!selectedAssetId) return
    router.push(`/workshop/map-config?asset_id=${selectedAssetId}&tool=${toolId}`)
  }

  return (
    <main className="flex-1 flex flex-col min-h-0 px-4 sm:px-8 md:px-10 pt-6 pb-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold font-[family-name:var(--font-metamorphous)] text-content-bold">
            Map Config
          </h1>
          <p className="mt-1 text-sm text-content-primary">
            Configure grids, alignment, and fog of war for your maps
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

      {/* Subtool tabs only appear once a map has been picked — picking
          an asset is shared between the grid and fog tools, so the
          tabs only make sense in the per-asset detail view. */}
      {selectedAssetId && (
        <div className="mb-4 flex items-center gap-1 border-b border-border">
          {SUBTOOLS.map((t) => {
            const active = t.id === subtool
            return (
              <button
                key={t.id}
                onClick={() => handleSubtoolChange(t.id)}
                className={`px-4 py-2 text-sm font-medium rounded-t-sm border-b-2 transition-colors ${
                  active
                    ? 'border-border-active text-content-on-dark'
                    : 'border-transparent text-content-secondary hover:text-content-on-dark'
                }`}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      )}

      <div className="flex-1 min-h-0">
        {subtool === 'fog' ? (
          <FogMaskTool
            selectedAssetId={selectedAssetId}
            onAssetSelect={handleAssetSelect}
          />
        ) : (
          <MapGridTool
            selectedAssetId={selectedAssetId}
            onAssetSelect={handleAssetSelect}
          />
        )}
      </div>
    </main>
  )
}
