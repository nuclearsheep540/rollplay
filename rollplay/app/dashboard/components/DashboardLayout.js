/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faRightFromBracket } from '@fortawesome/free-solid-svg-icons'
import NotificationBell from '../../shared/components/NotificationBell'
import SiteHeader from '../../shared/components/SiteHeader'
import SubNav from '../../shared/components/SubNav'
import { THEME } from '@/app/styles/colorTheme'

export default function DashboardLayout({
  children,
  activeSection,
  setActiveSection,
  onLogout,
  user,
  refreshTrigger,
  toasts = [],
  onDismissToast,
  isChildExpanded = false
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Tab configuration - Campaigns, Characters, Library, and Account
  const tabs = [
    { id: 'campaigns', label: 'Campaigns' },
    { id: 'characters', label: 'Characters' },
    { id: 'library', label: 'Library' },
    { id: 'account', label: 'Account' }
  ]

  // Initialize activeSection from URL parameter - run only once on mount
  useEffect(() => {
    const tabParam = searchParams.get('tab')
    if (tabParam && ['characters', 'campaigns', 'library', 'account'].includes(tabParam)) {
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
    <div className="h-screen flex flex-col" style={{backgroundColor: THEME.bgPrimary, color: THEME.textPrimary}}>
      {/* Site Header */}
      <SiteHeader>
        <NotificationBell
          userId={user?.id}
          refreshTrigger={refreshTrigger}
          toasts={toasts}
          onDismissToast={onDismissToast}
        />
        <button
          onClick={onLogout}
          aria-label="Logout"
          style={{color: THEME.textSecondary}}
          className="hover:opacity-80 transition-opacity"
        >
          <FontAwesomeIcon icon={faRightFromBracket} className="h-7 w-7" />
        </button>
      </SiteHeader>

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
        className={`flex-1 flex flex-col pt-4 sm:pt-8 md:pt-10 px-4 sm:px-8 md:px-10 overflow-x-hidden overflow-y-auto ${isChildExpanded ? '' : 'pb-8'}`}
      >
        {children}
      </main>
    </div>
  )
}