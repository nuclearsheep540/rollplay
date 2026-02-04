/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useRouter } from 'next/navigation'
import TabNav from './TabNav'

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
    <nav className="flex-shrink-0 bg-surface-secondary">
      {mode === 'tabs' ? (
        <TabNav tabs={tabs} activeTab={activeTab} onTabChange={onTabChange} />
      ) : (
        <div className="flex items-center gap-2 py-4 px-6 border-b border-border-subtle text-base font-[family-name:var(--font-metamorphous)]">
          {breadcrumbs.map((crumb, index) => {
            const isLast = index === breadcrumbs.length - 1

            return (
              <span key={index} className="flex items-center gap-2">
                {index > 0 && (
                  <span className="text-content-secondary">/</span>
                )}
                {isLast ? (
                  <span className="text-content-on-dark">{crumb.label}</span>
                ) : (
                  <button
                    onClick={() => router.push(crumb.href)}
                    className="text-content-secondary hover:opacity-80 transition-opacity"
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
