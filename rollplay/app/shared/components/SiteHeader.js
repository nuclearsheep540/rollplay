/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import Link from 'next/link'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faHouse } from '@fortawesome/free-solid-svg-icons'
import { THEME, COLORS } from '@/app/styles/colorTheme'

/**
 * SiteHeader - Shared header component with the site logo
 *
 * Used across all authenticated pages. Accepts children for the right-side
 * navigation area (notifications, logout, etc).
 *
 * `showHome` (default `true`) renders the Home link as the first child
 * in the right-side nav. Set to `false` when the consumer wants to
 * render Home in a custom position among its own children (e.g. the
 * dashboard places a notification bell first and a separator before
 * Home).
 */
export default function SiteHeader({ children, showHome = true }) {
  return (
    <header
      className="flex-shrink-0 border-b py-4 px-4 sm:px-8 md:px-10 flex justify-between items-center"
      style={{ backgroundColor: COLORS.carbon, borderBottomColor: THEME.borderSubtle }}
    >
      {/* Logo */}
      <div
        className="text-2xl flex items-center font-[family-name:var(--font-inter)]"
        style={{ color: COLORS.smoke, fontWeight: 700 }}
      >
        <span>TABLETOP</span><span style={{ color: COLORS.silver }}>TAVERN</span>
      </div>

      {/* Right side nav area — Home is rendered here by default so every
          authenticated page gets it without page-level plumbing; the rest
          (notifications, logout, etc.) is passed in as children per-page.
          Callers can opt out via `showHome={false}` to inline Home
          wherever they need in their own children. */}
      <nav className="flex items-center gap-8">
        {showHome && (
          <Link
            href="/dashboard"
            aria-label="Home"
            title="Home"
            className="hover:opacity-80 transition-opacity"
            style={{ color: THEME.textSecondary }}
          >
            <FontAwesomeIcon icon={faHouse} className="h-7 w-7" />
          </Link>
        )}
        {children}
      </nav>
    </header>
  )
}
