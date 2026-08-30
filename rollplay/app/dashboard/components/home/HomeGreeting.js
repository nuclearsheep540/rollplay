/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import HomeClock from './HomeClock'
import { COLORS } from '@/app/styles/colorTheme'

/**
 * Greeting + the page clock. The tagline is pure texture and never carries
 * status — the hero owns that. Its template bank is a later step, so the
 * slot shows its own placeholder for now.
 */
export default function HomeGreeting({ user }) {
  // screen_name is the display name and can be unset ('') until the account
  // setup modal runs over the top of this page.
  const name = user?.screen_name || user?.account_name || 'adventurer'

  return (
    <div>
      <h1
        className="text-[38px] leading-tight font-[family-name:var(--font-metamorphous)]"
        style={{ color: COLORS.onyx }}
      >
        Welcome back, {name}
      </h1>
      <div className="flex justify-between items-baseline gap-6 mt-1.5">
        <div className="ml-7 text-sm italic" style={{ color: COLORS.graphite }}>
          Tagline goes here
        </div>
        <HomeClock />
      </div>
    </div>
  )
}
