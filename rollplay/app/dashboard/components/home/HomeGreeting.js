/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import HomeClock from './HomeClock'
import { COLORS } from '@/app/styles/colorTheme'

/**
 * Greeting + the page clock. The tagline is pure texture and never carries
 * status — the hero owns that. It is chosen upstream, in `tagline.js`, and
 * arrives empty only while the queries behind it are still in flight — better
 * a blank moment than greeting a returning player as a newcomer.
 */
export default function HomeGreeting({ user, tagline }) {
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
        {/* The space is load-bearing: it keeps a line of text here while the
            queries land, so the clock beside it keeps its baseline. */}
        <div className="ml-7 text-sm italic" style={{ color: COLORS.graphite }}>
          {tagline || <>&nbsp;</>}
        </div>
        <HomeClock />
      </div>
    </div>
  )
}
