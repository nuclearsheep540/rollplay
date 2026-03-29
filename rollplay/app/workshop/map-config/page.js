/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowLeft, faRightFromBracket } from '@fortawesome/free-solid-svg-icons'
import SiteHeader from '@/app/shared/components/SiteHeader'
import NotificationBell from '@/app/shared/components/NotificationBell'
import { useAuth } from '@/app/dashboard/hooks/useAuth'
import { useToast } from '@/app/shared/hooks/useToast'
import MapGridTool from '../components/MapGridTool'
import { THEME } from '@/app/styles/colorTheme'

function MapConfigContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const selectedAssetId = searchParams.get('asset_id')

  const { user, loading, handleLogout } = useAuth()
  const { toasts, dismissToast } = useToast()

  // URL is the source of truth for asset selection.
  // Browser back/forward navigates between states naturally.
  const handleAssetSelect = (assetId) => {
    if (assetId) {
      router.push(`/workshop/map-config?asset_id=${assetId}`)
    } else {
      router.push('/workshop/map-config')
    }
  }

  if (!user || loading) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ backgroundColor: THEME.bgPrimary }}>
        <div style={{ color: THEME.textSecondary }}>Loading...</div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col" style={{ backgroundColor: THEME.bgPrimary, color: THEME.textPrimary }}>
      {/* Site Header — same as dashboard, no SubNav */}
      <SiteHeader>
        <NotificationBell
          userId={user?.id}
          toasts={toasts}
          onDismissToast={dismissToast}
        />
        <button
          onClick={handleLogout}
          aria-label="Logout"
          style={{ color: THEME.textSecondary }}
          className="hover:opacity-80 transition-opacity"
        >
          <FontAwesomeIcon icon={faRightFromBracket} className="h-7 w-7" />
        </button>
      </SiteHeader>

      {/* Tool content — full remaining viewport */}
      <main className="flex-1 flex flex-col min-h-0 px-4 sm:px-8 md:px-10 pt-6 pb-4">
        {/* Tool header with back button */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold font-[family-name:var(--font-metamorphous)] text-content-bold">
              Map Config
            </h1>
            <p className="mt-1 text-sm text-content-primary">
              Configure grid overlays and alignment for your maps
            </p>
          </div>
          <button
            onClick={() => router.push('/dashboard?tab=workshop')}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-sm border border-border text-content-primary hover:bg-surface-secondary hover:text-content-on-dark transition-colors"
          >
            <FontAwesomeIcon icon={faArrowLeft} className="text-xs" />
            <span>Workshop</span>
          </button>
        </div>

        {/* Map Grid Tool — fills remaining space */}
        <div className="flex-1 min-h-0">
          <MapGridTool
            selectedAssetId={selectedAssetId}
            onAssetSelect={handleAssetSelect}
          />
        </div>
      </main>
    </div>
  )
}

export default function MapConfigPage() {
  return (
    <Suspense fallback={
      <div className="h-screen flex items-center justify-center" style={{ backgroundColor: THEME.bgPrimary }}>
        <div style={{ color: THEME.textSecondary }}>Loading...</div>
      </div>
    }>
      <MapConfigContent />
    </Suspense>
  )
}
