/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import SubNav from '../../shared/components/SubNav'

/**
 * Dashboard-specific shell — just the tab nav + main content. The page
 * chrome (site header, auth bootstrap, event subscription) lives in
 * `app/(authenticated)/layout.js`, which wraps every authenticated page.
 */
export default function DashboardLayout({
  children,
  activeSection,
  setActiveSection,
  isChildExpanded = false,
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Tab configuration — visible nav items. Account isn't here any more:
  // it lives as an icon in the authenticated layout's header alongside
  // logout and notifications, since it's a user-profile surface rather
  // than a content tab. Market is the upcoming campaign-sharing feature.
  const tabs = [
    { id: 'campaigns', label: 'Campaigns' },
    { id: 'characters', label: 'Characters' },
    { id: 'library', label: 'Library' },
    { id: 'workshop', label: 'Workshop' },
    { id: 'market', label: 'Market' },
  ]

  // Valid `?tab=` values on the dashboard. Account lives at its own
  // `/account` route now, so it's not a dashboard tab.
  const VALID_TABS = ['characters', 'campaigns', 'library', 'workshop', 'market']

  // Initialize activeSection from URL parameter - run only once on mount
  useEffect(() => {
    const tabParam = searchParams.get('tab')
    if (tabParam && VALID_TABS.includes(tabParam)) {
      setActiveSection(tabParam)
    } else if (!tabParam) {
      // If no tab parameter, set default and update URL
      const current = new URLSearchParams(Array.from(searchParams.entries()))
      current.set('tab', 'campaigns')
      const search = current.toString()
      router.replace(`/dashboard?${search}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Intentionally empty - only run on mount

  const switchSection = (targetId) => {
    setActiveSection(targetId)

    // Update URL with tab parameter
    const current = new URLSearchParams(Array.from(searchParams.entries()))
    current.set('tab', targetId)
    const search = current.toString()
    const query = search ? `?${search}` : ''

    router.push(`/dashboard${query}`)
  }

  return (
    <>
      {/* Tab Navigation */}
      <SubNav
        mode="tabs"
        tabs={tabs}
        activeTab={activeSection}
        onTabChange={switchSection}
      />

      {/* Main Content Area - Flex container so children can fill remaining space */}
      <main
        id="dashboard-main"
        className={`flex-1 flex flex-col pt-4 sm:pt-8 md:pt-10 px-4 sm:px-8 md:px-10 overflow-x-hidden overflow-y-auto overscroll-none ${isChildExpanded ? '' : 'pb-8'}`}
      >
        {children}
      </main>
    </>
  )
}
