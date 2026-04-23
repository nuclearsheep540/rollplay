/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { TabGroup, TabList, Tab } from '@headlessui/react'
import { COLORS } from '@/app/styles/colorTheme'

// Active-tab highlight — thicker than the base rule (3 px vs 2 px)
// and painted as a gold-to-ink gradient, so the centre glows against
// the otherwise monochrome onyx palette and the ends blend back into
// the base rule. Width is measured from the active label at runtime
// (see `measure()` below) so the highlight tracks the label's actual
// rendered width.
const HIGHLIGHT_THICKNESS = 3
// Warm ornamental gold — matches the tone we used when the nav had a
// gilded character. Flanked by the onyx ink at each end so the
// highlight "fades into" the base rule.
const HIGHLIGHT_GOLD = '#b08a3e'

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
    // `overflow-x-hidden` contains the 100 vw dark panel bleed so it
    // can't spawn a page-level horizontal scrollbar.
    <div className="w-full overflow-x-hidden">
      <TabGroup
        selectedIndex={selectedIndex === -1 ? 0 : selectedIndex}
        onChange={(index) => onTabChange(tabs[index].id)}
      >
        {/* Container is capped at 1410 px to match the dashboard's
            content frame — the highlight bar's measurement + the
            labels are positioned relative to this frame. The dark
            panel underneath bleeds past it to the viewport edges. */}
        <div
          ref={containerRef}
          // `z-10` raises the whole nav above sibling elements in the
          // page (notably the expanded campaign tile below) so the
          // diamond pips — which overhang the panel's bottom edge and
          // intentionally overlap the tile — paint on top of the
          // tile's hero rather than being covered by it.
          className="relative z-10 mx-auto max-w-[1410px] pt-4 px-6"
        >
          {/* Dark nav panel — bleeds full viewport. Bottom edge sits
              at the container's outer bottom, which is also where the
              main content area begins below. That sharp bottom edge
              replaces the old onyx rule as the divider between the
              nav and the content below. Diamonds straddle the edge
              (see their `top: 9px` offset below): upper halves inside
              the panel, lower halves hanging over the tile via the
              `z-10` above.
              The 2 px overflow on each side compensates for a sub-px
              rounding quirk where `100vw` computes to 1 px less than
              the actual viewport width on some displays. */}
          <div
            aria-hidden="true"
            className="absolute pointer-events-none"
            style={{
              left: 'calc(50% - 50vw - 2px)',
              width: 'calc(100vw + 4px)',
              top: 0,
              bottom: 0,
              backgroundColor: COLORS.carbon,
            }}
          />

          {/* Active-tab highlight — positioned + sized from a runtime
              measurement of the active label. Soft-faded at the ends
              to echo the base rule's tapered terminals. */}
          <div
            aria-hidden="true"
            className="absolute pointer-events-none"
            style={{
              left: `${highlight.left}px`,
              width: `${highlight.width}px`,
              // Centred on the container's outer bottom — same y as
              // the dark panel's bottom edge and the diamond centres
              // (after the 9 px downward shift applied on the SVGs).
              bottom: `calc(0px - ${HIGHLIGHT_THICKNESS / 2}px)`,
              height: `${HIGHLIGHT_THICKNESS}px`,
              // Gold glow in the middle fading to transparent at the
              // ends — reads as a bloom sitting on the dark panel's
              // bottom edge, straddling the boundary between panel
              // and page.
              background: `linear-gradient(to right, transparent 0%, ${HIGHLIGHT_GOLD} 25%, ${HIGHLIGHT_GOLD} 75%, transparent 100%)`,
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
                className="group relative z-10 flex flex-col items-center gap-2.5 outline-none cursor-pointer"
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
                        className="text-xl font-[family-name:var(--font-metamorphous)] uppercase transition-colors duration-200"
                        style={{
                          // Labels now sit on a dark panel, so the
                          // palette flips: smoke (cream) for active,
                          // silver for inactive — mirror of the
                          // onyx/graphite pairing that worked on the
                          // light bg. Hovering an inactive tab
                          // intensifies to full opacity for clear
                          // interactive feedback.
                          color: isActiveLike ? COLORS.smoke : COLORS.silver,
                          opacity: isActiveLike ? 1 : (hover || focus) ? 1 : 0.85,
                          // Metamorphous ships a single weight (400). To
                          // nudge the visual weight up without loading
                          // another font file, paint a thin stroke in
                          // the same colour as the fill — reads as a
                          // half-weight step toward semibold. Kept
                          // subtle (0.4 px) so letterforms don't lose
                          // their hand-drawn quality.
                          WebkitTextStroke: `0.4px ${isActiveLike ? COLORS.smoke : COLORS.silver}`,
                        }}
                      >
                        {tab.label}
                      </span>
                      {/* Diamond pip sits on the rule — hollow
                          rhombus filled with page bg (covers the
                          rule underneath). The active tab gets a
                          small onyx centre-dot; all other states are
                          plain. Same colours + size in every state —
                          only the dot presence + highlight-line
                          gradient differentiate selected from not. */}
                      {/* `top: 9px` relative shift moves the diamond
                          down without affecting Tab's flex layout, so
                          its centre lands on the container's outer
                          bottom (= panel/tile boundary). Top half in
                          the dark panel, bottom half hanging below,
                          painted over the tile via the container's
                          `z-10`. */}
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 22 22"
                        style={{ position: 'relative', top: '9px' }}
                      >
                        <polygon
                          points="11,1.5 20.5,11 11,20.5 1.5,11"
                          fill={PAGE_BG}
                          stroke={INK}
                          strokeWidth="2"
                          strokeLinejoin="miter"
                        />
                        {isActiveLike && (
                          <circle cx="11" cy="11" r="1.8" fill={INK} />
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
