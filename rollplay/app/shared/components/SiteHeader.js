/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import Link from 'next/link'
import { THEME, COLORS } from '@/app/styles/colorTheme'

/**
 * SiteHeader - Shared header component with the site logo
 *
 * Used across all authenticated pages. The wordmark anchors the dashboard,
 * so there is no separate home icon. Accepts children for the right-side
 * navigation area (social panel, app launcher, user chip).
 */
export default function SiteHeader({ children }) {
  return (
    <header
      className="flex-shrink-0 border-b py-4 px-4 sm:px-8 md:px-10"
      style={{ backgroundColor: COLORS.carbon, borderBottomColor: THEME.borderSubtle }}
    >
      {/* Contents align to the dashboard's content frame (the TabNav's
          max-w-[1410px]) rather than the viewport edges, so on ultrawide
          monitors the nav cluster — and anything anchored to it, like the
          Social panel — stays adjacent to the actual content. */}
      <div className="mx-auto w-full max-w-[1410px] flex justify-between items-center">
        {/* Logo — the app's home anchor */}
        <Link
          href="/dashboard"
          aria-label="Home"
          title="Home"
          className="text-2xl flex items-center font-[family-name:var(--font-inter)] hover:opacity-80 transition-opacity"
          style={{ color: COLORS.smoke, fontWeight: 700 }}
        >
          <span>TABLETOP</span><span style={{ color: COLORS.silver }}>TAVERN</span>
        </Link>

        {/* Right side nav area — passed in per-page */}
        <nav className="flex items-center gap-8">
          {children}
        </nav>
      </div>
    </header>
  )
}
