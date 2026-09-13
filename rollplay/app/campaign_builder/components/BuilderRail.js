/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useRef } from 'react'

/**
 * The dark left rail: three vertical parallelogram tabs in the page's 8° family.
 *
 * Written by hand rather than with the shared TabNav because these tabs are vertical and
 * rotated, which that component has no notion of.
 */
export default function BuilderRail({ sections, activeKey, onSelect }) {
  const tabsRef = useRef([])

  const onKeyDown = (event, index) => {
    const delta = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
    if (!delta) return
    event.preventDefault()
    const next = (index + delta + sections.length) % sections.length
    tabsRef.current[next]?.focus()
    onSelect(sections[next].key)
  }

  return (
    <div
      role="tablist"
      aria-orientation="vertical"
      aria-label="Campaign sections"
      className="w-[92px] shrink-0 bg-surface-secondary px-5 pt-9 pb-6 flex flex-col items-center gap-[22px]"
    >
      {sections.map((section, index) => {
        const active = section.key === activeKey
        return (
          <button
            key={section.key}
            ref={(element) => (tabsRef.current[index] = element)}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(section.key)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`w-[52px] h-[168px] rounded-lg flex items-center justify-center transition-colors ${
              active ? 'home-btn-gold' : 'home-btn-outline'
            }`}
            style={{ transform: 'skewY(-8deg)' }}
          >
            <span
              className="inline-block whitespace-nowrap text-[13px] font-semibold tracking-[0.12em] uppercase"
              style={{ transform: 'skewY(8deg) rotate(-90deg)' }}
            >
              {section.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
