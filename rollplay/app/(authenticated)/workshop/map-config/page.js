/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import MapConfigTool from '@/app/workshop/components/MapConfigTool'
import { useWorkshopToolNav } from '@/app/workshop/hooks/useWorkshopToolNav'

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

  // URL is the source of truth for asset, tool, and entry point — the
  // shared hook owns the from=library threading and back destinations.
  const { fromSuffix, backLabel, handleAssetSelect, handleBack } = useWorkshopToolNav(
    '/workshop/map-config',
    'Map Config',
    (assetId) => `asset_id=${assetId}&tool=${tool}`,
  )

  // Tool changes are editor state, not navigation - replace keeps them
  // out of history so the browser back button skips the tool clicks too.
  const handleToolChange = (toolId) => {
    if (!selectedAssetId) return
    router.replace(`/workshop/map-config?asset_id=${selectedAssetId}&tool=${toolId}${fromSuffix}`)
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
