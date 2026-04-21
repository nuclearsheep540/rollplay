/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { TabGroup, TabList, Tab } from '@headlessui/react'
import { COLORS } from '@/app/styles/colorTheme'

// Active-tab highlight — thicker than the base rule (3 px vs 1 px)
// *and* lighter (graphite vs onyx), so it reads as a deliberate accent
// rather than a random brighter spot. Width is measured from the active
// label at runtime (see `measure()` below) so the highlight tracks the
// label's actual rendered width.
const HIGHLIGHT_THICKNESS = 3
const HIGHLIGHT_COLOR = COLORS.graphite

// Ornamentation tone — matches the page's primary dark text colour
// (onyx) so the nav reads as part of the type system rather than a
// decorative accent. Active state is filled; inactive is stroke-only
// with reduced opacity.
const INK = COLORS.onyx
// Matches the page background (`smoke`). Used as the diamond's fill in
// its inactive ("hollow") state so the diamond visually punches a gap
// in the rule running behind it.
const PAGE_BG = COLORS.smoke

/**
 * Accessible tab navigation built on Headless UI TabGroup — rendered as
 * a frieze: a thin onyx rule runs under the nav, fading at both ends,
 * with diamond pips piercing it and labels sitting above. The active
 * tab is marked by a graphite highlight that matches the label's width
 * and slides between positions on selection change.
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
  const activeIdx = selectedIndex === -1 ? 0 : selectedIndex

  // Refs + state for measuring the active label. `justify-around` with
  // unequal label widths doesn't give predictable geometric centres, so
  // we measure the DOM directly on mount, activeIdx change, and resize.
  const containerRef = useRef(null)
  const labelRefs = useRef([])
  const [highlight, setHighlight] = useState({ left: 0, width: 0 })

  useLayoutEffect(() => {
    function measure() {
      const container = containerRef.current
      const label = labelRefs.current[activeIdx]
      if (!container || !label) return
      const c = container.getBoundingClientRect()
      const l = label.getBoundingClientRect()
      setHighlight({ left: l.left - c.left, width: l.width })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [activeIdx])

  return (
    <div className="w-full">
      <TabGroup
        selectedIndex={selectedIndex === -1 ? 0 : selectedIndex}
        onChange={(index) => onTabChange(tabs[index].id)}
      >
        {/* Container is capped at 1410 px to match the dashboard's
            content frame — both the base rule and the highlight are
            positioned relative to this frame. */}
        <div
          ref={containerRef}
          className="relative mx-auto max-w-[1410px] pt-4 pb-6 px-6"
        >
          {/* Base rule — spans the container width (max 1410 px),
              faded at both ends so the terminals don't read as hard
              cuts. Sits behind the diamonds on the z-axis; each
              inactive diamond's page-bg fill covers the rule where it
              sits, creating the visual break. */}
          <div
            className="absolute h-[1px] pointer-events-none"
            style={{
              left: 0,
              right: 0,
              // pb-6 = 1.5rem; + 9 px lifts the line to the diamond
              // centre (18 px diamond, half = 9).
              bottom: 'calc(1.5rem + 9px)',
              backgroundColor: INK,
              maskImage:
                'linear-gradient(to right, transparent 0%, black 6%, black 94%, transparent 100%)',
              WebkitMaskImage:
                'linear-gradient(to right, transparent 0%, black 6%, black 94%, transparent 100%)',
            }}
          />

          {/* Active-tab highlight — positioned + sized from a runtime
              measurement of the active label. `left` and `width` both
              transition, so switching tabs produces a slide + stretch
              between positions. Soft-faded at the ends to echo the
              base rule's tapered terminals. */}
          <div
            aria-hidden="true"
            className="absolute pointer-events-none transition-[left,width] duration-300 ease-out"
            style={{
              left: `${highlight.left}px`,
              width: `${highlight.width}px`,
              bottom: `calc(1.5rem + 9.5px - ${HIGHLIGHT_THICKNESS / 2}px)`,
              height: `${HIGHLIGHT_THICKNESS}px`,
              backgroundColor: HIGHLIGHT_COLOR,
              maskImage:
                'linear-gradient(to right, transparent 0%, black 12%, black 88%, transparent 100%)',
              WebkitMaskImage:
                'linear-gradient(to right, transparent 0%, black 12%, black 88%, transparent 100%)',
            }}
          />

          <TabList className="relative flex items-end justify-around">
            {tabs.map((tab, i) => (
              <Tab
                key={tab.id}
                className="group relative z-10 flex flex-col items-center gap-3 outline-none cursor-pointer"
              >
                {({ selected, hover, focus }) => {
                  const isActiveLike = selected
                  return (
                    <>
                      {/* Label sits above the rule. Opacity steps are
                          tuned to read as assertive nav, not decoration:
                          0.75 inactive, 0.9 hover/focus, 1 active. */}
                      <span
                        ref={(el) => { labelRefs.current[i] = el }}
                        className="text-lg font-[family-name:var(--font-metamorphous)] uppercase tracking-[0.22em] transition-colors duration-200"
                        style={{
                          color: INK,
                          opacity: isActiveLike ? 1 : (hover || focus) ? 0.9 : 0.75,
                          // Metamorphous ships a single weight (400). To
                          // nudge the visual weight up without loading
                          // another font file, paint a thin stroke in the
                          // same ink — reads as a half-weight step toward
                          // semibold. Kept subtle (0.4 px) so letterforms
                          // don't lose their hand-drawn quality.
                          WebkitTextStroke: `0.4px ${INK}`,
                        }}
                      >
                        {tab.label}
                      </span>
                      {/* Diamond pip sits on the rule. Inactive:
                          stroke-only rhombus filled with page bg (covers
                          the rule underneath). Active: filled onyx with a
                          page-bg inner jewel-dot — reads as a carved
                          nail-head / stamped pip. Hover/focus gets a
                          subtle scale bump. */}
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
                          fill={isActiveLike ? INK : PAGE_BG}
                          stroke={INK}
                          strokeWidth="2"
                          strokeLinejoin="miter"
                        />
                        {isActiveLike && (
                          <circle cx="11" cy="11" r="1.8" fill={PAGE_BG} />
                        )}
                      </svg>
                    </>
                  )
                }}
              </Tab>
            ))}
          </TabList>
        </div>
      </TabGroup>
    </div>
  )
}
