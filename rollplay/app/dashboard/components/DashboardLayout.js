/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

/**
 * Dashboard-specific shell - the main content area. The page chrome (site
 * header, app launcher, auth bootstrap, event subscription) lives in
 * `app/(authenticated)/layout.js`, which wraps every authenticated page.
 *
 * Bare `/dashboard` is Home. The tab bar was retired in favour of the app
 * launcher, so nothing here writes `?tab=` — the URLs still work and are
 * reached by explicit navigation only.
 */
export default function DashboardLayout({
  children,
  isChildExpanded = false,
  isChildFullBleed = false,
}) {
  return (
    // Flex container so children can fill remaining space
    <main
      id="dashboard-main"
      className={`flex-1 flex flex-col overflow-x-hidden overflow-y-auto overscroll-none ${
        isChildFullBleed ? '' : 'px-4 sm:px-8 md:px-10'
      } ${isChildExpanded || isChildFullBleed ? '' : 'pt-4 sm:pt-8 md:pt-10 pb-8'}`}
    >
      {children}
    </main>
  )
}
