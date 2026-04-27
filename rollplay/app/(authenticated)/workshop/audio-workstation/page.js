/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useSearchParams } from 'next/navigation'
import AudioWorkstationTool from '@/app/workshop/components/AudioWorkstationTool'

// Site chrome (header, auth gate, WebSocket subscription, Suspense for
// useSearchParams) is provided by the (authenticated) route group's
// layout — this page only owns its tool content.
export default function AudioWorkstationPage() {
  const searchParams = useSearchParams()
  const selectedAssetId = searchParams.get('asset_id')

  return (
    <main className="flex-1 min-h-0">
      <AudioWorkstationTool initialAssetId={selectedAssetId} />
    </main>
  )
}
