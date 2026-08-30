/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import SubNav from '../../shared/components/SubNav'

/**
 * Dashboard-specific shell - just the tab nav + main content. The page
 * chrome (site header, auth bootstrap, event subscription) lives in
 * `app/(authenticated)/layout.js`, which wraps every authenticated page.
 *
 * Bare `/dashboard` is Home: no tab is written to the URL and no tab
 * renders as active. Tab URLs are reached by explicit navigation only.
 */
export default function DashboardLayout({
  children,
  activeSection,
  setActiveSection,
  isChildExpanded = false,
  isChildFullBleed = false,
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Tab configuration - visible nav items. Account isn't here any more:
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
        className={`flex-1 flex flex-col overflow-x-hidden overflow-y-auto overscroll-none ${
          isChildFullBleed ? '' : 'px-4 sm:px-8 md:px-10'
        } ${isChildExpanded || isChildFullBleed ? '' : 'pt-4 sm:pt-8 md:pt-10 pb-8'}`}
      >
        {children}
      </main>
    </>
  )
}
