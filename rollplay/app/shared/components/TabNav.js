/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { TabGroup, TabList, Tab } from '@headlessui/react'

// Gilded ornamentation colors — warm gold tuned to read cleanly on the
// page's light cream background. Active state is the richer fill tone;
// inactive state uses the stroke tone plus reduced opacity.
const GOLD = '#b08a3e'
// Matches the page's `surface-primary` token (smoke / #F7F4F3). Used as
// the diamond's fill in its inactive ("hollow") state so the diamond
// visually punches a gap in the track line running behind it.
const PAGE_BG = '#F7F4F3'

/**
 * Accessible tab navigation built on Headless UI TabGroup — rendered as
 * a gilded-diamond ornament strip. Five diamonds sit on a horizontal
 * track line that fades at both ends. Active diamond is filled and
 * scaled up; inactive diamonds are hollow (stroke only).
 *
 * Provides: role="tablist" / role="tab", arrow key navigation,
 * aria-selected on active tab.
 *
 * @param {Array<{id: string, label: string}>} tabs - Tab definitions
 * @param {string} activeTab - Currently active tab id
 * @param {Function} onTabChange - Called with tab id on selection
 */
export default function TabNav({ tabs, activeTab, onTabChange }) {
  const selectedIndex = tabs.findIndex((t) => t.id === activeTab)

  return (
    <TabGroup
      selectedIndex={selectedIndex === -1 ? 0 : selectedIndex}
      onChange={(index) => onTabChange(tabs[index].id)}
    >
      <TabList className="relative flex items-end justify-around mx-auto max-w-[760px] pt-8 pb-10 px-6">
        {/* Horizontal track line running underneath the nav items,
            centred through the diamonds. A plain div with a gradient
            background renders this cleanly — the gradient fades both
            ends into transparent, mimicking a hand-ornamented stroke.
            (A single SVG line was previously inconsistent about how
            it resolved `100%` width across browsers.) Sits behind the
            diamonds on the z-axis; each diamond's fill colour (page
            bg) covers the line where it sits, creating the break. */}
        <div
          className="absolute left-6 right-6 h-[1px] pointer-events-none"
          style={{
            // pb-10 = 2.5rem bottom padding; + 9 px lifts the line to
            // the diamond's vertical centre (18 px diamond, half = 9).
            bottom: 'calc(2.5rem + 9px)',
            background: `linear-gradient(to right, transparent, ${GOLD} 6%, ${GOLD} 94%, transparent)`,
          }}
        />

        {tabs.map((tab) => (
          <Tab
            key={tab.id}
            className="group relative z-10 flex flex-col items-center gap-3 outline-none cursor-pointer"
          >
            {({ selected, hover, focus }) => {
              const isActiveLike = selected
              return (
                <>
                  {/* Label sits above the track line. */}
                  <span
                    className="text-sm font-[family-name:var(--font-metamorphous)] uppercase tracking-[0.2em] transition-colors duration-200"
                    style={{
                      color: GOLD,
                      opacity: isActiveLike ? 1 : (hover || focus) ? 0.85 : 0.55,
                    }}
                  >
                    {tab.label}
                  </span>
                  {/* Diamond pip sits on the track line. Inactive:
                      stroke-only rhombus filled with page bg (covers
                      the line underneath). Active: filled gold + scaled
                      ~1.35×. Hover/focus gets a subtle scale bump. */}
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 22 22"
                    className="transition-transform duration-200 ease-out"
                    style={{
                      transform: isActiveLike
                        ? 'scale(1.35)'
                        : (hover || focus) ? 'scale(1.1)' : 'scale(1)',
                    }}
                  >
                    <polygon
                      points="11,1.5 20.5,11 11,20.5 1.5,11"
                      fill={isActiveLike ? GOLD : PAGE_BG}
                      stroke={GOLD}
                      strokeWidth="1.5"
                      strokeLinejoin="miter"
                    />
                  </svg>
                </>
              )
            }}
          </Tab>
        ))}
      </TabList>
    </TabGroup>
  )
}
