/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faRightFromBracket } from '@fortawesome/free-solid-svg-icons'
import SiteHeader from '@/app/shared/components/SiteHeader'
import NotificationBell from '@/app/shared/components/NotificationBell'
import { useAuth } from '@/app/dashboard/hooks/useAuth'
import { useToast } from '@/app/shared/hooks/useToast'
import AudioWorkstationTool from '../components/AudioWorkstationTool'
import { THEME } from '@/app/styles/colorTheme'

function AudioWorkstationContent() {
  const searchParams = useSearchParams()
  const selectedAssetId = searchParams.get('asset_id')

  const { user, loading, handleLogout } = useAuth()
  const { toasts, dismissToast } = useToast()

  if (!user || loading) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ backgroundColor: THEME.bgPrimary }}>
        <div style={{ color: THEME.textSecondary }}>Loading...</div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ backgroundColor: THEME.bgPrimary, color: THEME.textPrimary }}>
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

      <main className="flex-1 min-h-0">
        <AudioWorkstationTool
          initialAssetId={selectedAssetId}
        />
      </main>
    </div>
  )
}

export default function AudioWorkstationPage() {
  return (
    <Suspense fallback={
      <div className="h-screen flex items-center justify-center" style={{ backgroundColor: THEME.bgPrimary }}>
        <div style={{ color: THEME.textSecondary }}>Loading...</div>
      </div>
    }>
      <AudioWorkstationContent />
    </Suspense>
  )
}
