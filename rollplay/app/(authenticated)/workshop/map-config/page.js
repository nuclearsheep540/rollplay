/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

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

  // Entry point (library vs workshop) rides the URL and is carried
  // through every internal navigation, so it survives refresh and
  // deep links - no mount-time capture needed.
  const fromLibrary = searchParams.get('from') === 'library'
  const fromSuffix = fromLibrary ? '&from=library' : ''

  const backLabel = !selectedAssetId
    ? 'Workshop'
    : fromLibrary ? 'Library' : 'Map Config'

  // URL is the source of truth for both asset and tool selection.
  const handleAssetSelect = (assetId) => {
    if (assetId) {
      router.push(`/workshop/map-config?asset_id=${assetId}&tool=${tool}${fromSuffix}`)
    } else {
      router.push('/workshop/map-config')
    }
  }

  // Tool changes are editor state, not navigation - replace keeps them
  // out of history so the browser back button skips the tool clicks too.
  const handleToolChange = (toolId) => {
    if (!selectedAssetId) return
    router.replace(`/workshop/map-config?asset_id=${selectedAssetId}&tool=${toolId}${fromSuffix}`)
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
      router.push('/workshop/map-config')
    }
  }

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
