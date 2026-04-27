/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import MapConfigTool from '@/app/workshop/components/MapConfigTool'

const VALID_TOOLS = ['move', 'grid', 'paint', 'erase']

// Site chrome (header, auth gate, WebSocket subscription, Suspense for
// useSearchParams) is provided by the (authenticated) route group's
// layout — this page is intentionally chrome-free so MapConfigTool's
// Photoshop-style top menu bar reads as the workspace's own chrome,
// matching the audio workstation pattern.
export default function MapConfigPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const selectedAssetId = searchParams.get('asset_id')
  const tool = VALID_TOOLS.includes(searchParams.get('tool'))
    ? searchParams.get('tool')
    : 'move'

  // Capture the entry point once on mount (library vs workshop navigation)
  const entryFromRef = useRef(null)
  if (entryFromRef.current === null) {
    entryFromRef.current = searchParams.get('from') || 'workshop'
  }

  const backLabel = !selectedAssetId
    ? 'Workshop'
    : entryFromRef.current === 'library' ? 'Library' : 'Map Config'

  // URL is the source of truth for both asset and tool selection.
  const handleAssetSelect = (assetId) => {
    if (assetId) {
      router.push(`/workshop/map-config?asset_id=${assetId}&tool=${tool}`)
    } else {
      router.push('/workshop/map-config')
    }
  }

  const handleToolChange = (toolId) => {
    if (!selectedAssetId) return
    router.push(`/workshop/map-config?asset_id=${selectedAssetId}&tool=${toolId}`)
  }

  const handleBack = () => router.back()

  return (
    <main className="flex-1 min-h-0">
      <MapConfigTool
        selectedAssetId={selectedAssetId}
        activeTool={tool}
        onAssetSelect={handleAssetSelect}
        onToolChange={handleToolChange}
        backLabel={backLabel}
        onBack={handleBack}
      />
    </main>
  )
}
