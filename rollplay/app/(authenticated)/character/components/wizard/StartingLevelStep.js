/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { THEME } from '@/app/styles/colorTheme'

import StepFooter from './StepFooter'

/**
 * Starting-level step (E.1). Local-only — it sets the target level the player wants to build
 * to. The class step distributes real levels (persisted); the wizard shows the Advancement step
 * once the total class level exceeds 1. Facilitate, don't enforce: any level 1–20 is allowed.
 */
export default function StartingLevelStep({ startingLevel, setStartingLevel, onBack, onNext }) {
  const set = (v) => {
    const n = parseInt(v, 10)
    setStartingLevel(Number.isNaN(n) ? 1 : Math.max(1, Math.min(20, n)))
  }
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold" style={{ color: THEME.textBold }}>
          Starting level
        </h2>
        <p className="text-sm" style={{ color: THEME.textSecondary }}>
          Most characters begin at level 1. You can start higher — you&apos;ll make each level&apos;s
          choices (subclass, feats, features) as you go. Homebrew levels are fine; your table decides.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-sm" style={{ color: THEME.textSecondary }}>
          Start at level
        </label>
        <input
          type="number"
          min={1}
          max={20}
          value={startingLevel}
          onChange={(e) => set(e.target.value)}
          className="w-20 px-3 py-2 border rounded-sm text-sm focus:outline-none focus:ring-1"
          style={{
            backgroundColor: THEME.bgSecondary,
            borderColor: THEME.borderDefault,
            color: THEME.textOnDark,
          }}
        />
      </div>

      <StepFooter onBack={onBack} onNext={onNext} />
    </div>
  )
}
