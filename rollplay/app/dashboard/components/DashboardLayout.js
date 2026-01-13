/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faUser,
  faRightFromBracket
} from '@fortawesome/free-solid-svg-icons'
import NotificationBell from '../../shared/components/NotificationBell'
import { THEME, STYLES } from '@/app/styles/colorTheme'

export default function DashboardLayout({
  children,
  activeSection,
  setActiveSection,
  onLogout,
  user,
  refreshTrigger,
  toasts = [],
  onDismissToast
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Tab configuration - Only Campaigns and Characters (no icons)
  const tabs = [
    { id: 'campaigns', label: 'Campaigns' },
    { id: 'characters', label: 'Characters' }
  ]

  // Initialize activeSection from URL parameter - run only once on mount
  useEffect(() => {
    const tabParam = searchParams.get('tab')
    if (tabParam && ['characters', 'campaigns'].includes(tabParam)) {
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
    <div className="h-screen flex flex-col overflow-hidden" style={{backgroundColor: THEME.bgPrimary, color: THEME.textPrimary}}>
      {/* Top Header - Fixed */}
      <header className="flex-shrink-0 border-b p-4 flex justify-between items-center"
              style={{backgroundColor: THEME.bgSecondary, borderBottomColor: THEME.borderSubtle}}>
        <div className="text-2xl flex items-center font-[family-name:var(--font-new-rocker)]"
             style={{color: THEME.textAccent}}>
          <span>Tabletop Tavern</span>
        </div>
        <nav className="flex items-center gap-6">
          <NotificationBell
            userId={user?.id}
            refreshTrigger={refreshTrigger}
            toasts={toasts}
            onDismissToast={onDismissToast}
          />
          <button
            onClick={() => switchSection('profile')}
            aria-label="Profile"
            style={{color: THEME.textSecondary}}
            className="hover:opacity-80 transition-opacity"
          >
            <FontAwesomeIcon icon={faUser} className="h-6 w-6" />
          </button>
          <button
            onClick={onLogout}
            aria-label="Logout"
            style={{color: THEME.textSecondary}}
            className="hover:opacity-80 transition-opacity"
          >
            <FontAwesomeIcon icon={faRightFromBracket} className="h-6 w-6" />
          </button>
        </nav>
      </header>

      {/* Horizontal Tab Bar - NEW */}
      <nav className="flex-shrink-0 border-b"
           style={{backgroundColor: THEME.bgSecondary, borderBottomColor: THEME.borderSubtle}}>
        <div className="flex">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => switchSection(tab.id)}
              className="flex-1 py-4 px-6 border-b-2 transition-all duration-200 font-[family-name:var(--font-metamorphous)] text-base"
              style={activeSection === tab.id ? STYLES.tabActive : STYLES.tabInactive}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Main Content Area - Full Width, Scrollable */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-8 md:p-10 pb-64">
        {children}
      </main>
    </div>
  )
}