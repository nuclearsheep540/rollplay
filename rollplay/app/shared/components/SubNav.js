/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useRouter } from 'next/navigation'
import { THEME, STYLES, COLORS } from '@/app/styles/colorTheme'

/**
 * SubNav - Secondary navigation bar below the site header
 *
 * Can render either:
 * - Tabs mode: Horizontal tab buttons (for dashboard)
 * - Breadcrumb mode: Navigation breadcrumbs (for sub-pages)
 */
export default function SubNav({
  mode = 'tabs',
  // Tab mode props
  tabs = [],
  activeTab = '',
  onTabChange,
  // Breadcrumb mode props
  breadcrumbs = []
}) {
  const router = useRouter()

  return (
    <nav
      className="flex-shrink-0 border-b"
      style={{ backgroundColor: COLORS.carbon, borderBottomColor: THEME.borderSubtle }}
    >
      {mode === 'tabs' ? (
        <div className="flex">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => onTabChange?.(tab.id)}
              className="flex-1 py-4 px-6 border-b-2 transition-all duration-200 font-[family-name:var(--font-metamorphous)] text-base"
              style={activeTab === tab.id ? STYLES.tabActive : STYLES.tabInactive}
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 py-4 px-6 border-b-2 border-transparent text-base font-[family-name:var(--font-metamorphous)]">
          {breadcrumbs.map((crumb, index) => {
            const isLast = index === breadcrumbs.length - 1

            return (
              <span key={index} className="flex items-center gap-2">
                {index > 0 && (
                  <span style={{ color: THEME.textSecondary }}>/</span>
                )}
                {isLast ? (
                  <span style={{ color: THEME.textOnDark }}>{crumb.label}</span>
                ) : (
                  <button
                    onClick={() => router.push(crumb.href)}
                    className="hover:opacity-80 transition-opacity"
                    style={{ color: THEME.textSecondary }}
                  >
                    {crumb.label}
                  </button>
                )}
              </span>
            )
          })}
        </div>
      )}
    </nav>
  )
}
