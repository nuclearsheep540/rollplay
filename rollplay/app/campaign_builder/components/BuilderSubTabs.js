/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { SKEW_BOX, SKEW_LABEL } from '@/app/styles/plateGeometry'

export default function BuilderSubTabs({ subTabs, activeKey, onSelect }) {
  return (
    <div className="h-11 box-border px-7 flex items-center gap-1.5 bg-content-secondary border-b border-[#37322F]">
      {subTabs.map((subTab) => {
        const active = subTab.key === activeKey
        return (
          <button
            key={subTab.key}
            type="button"
            onClick={() => onSelect(subTab.key)}
            className={`px-4 py-2 rounded text-xs font-medium ${
              active ? 'bg-surface-secondary text-content-on-dark' : 'text-[#0B0A09]'
            }`}
            style={{ transform: SKEW_BOX }}
          >
            <span className="inline-block" style={{ transform: SKEW_LABEL }}>
              {subTab.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
