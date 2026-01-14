/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { THEME, COLORS } from '@/app/styles/colorTheme'

/**
 * SiteHeader - Shared header component with the site logo
 *
 * Used across all authenticated pages. Accepts children for the right-side
 * navigation area (notifications, logout, etc).
 */
export default function SiteHeader({ children }) {
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

      {/* Right side nav area */}
      <nav className="flex items-center gap-8">
        {children}
      </nav>
    </header>
  )
}
