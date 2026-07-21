/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import React from 'react'

import { resolveUserColor } from '@/app/utils/userColors'

/**
 * UserDisc — THE way to render a user's identity disc, everywhere.
 *
 * Colored circle (stored users.color, deterministic palette hash until the
 * user picks) with the user's initial cut out. Every surface that shows a
 * user as a disc — social pane friends/requests/search, account page
 * friends list, the profile avatar — renders through this component so
 * color and treatment can never drift between them.
 *
 * Size/typography/extras come in via className (e.g. 'w-8 h-8 text-sm');
 * children render inside the disc for overlays (online indicator dot).
 */
export default function UserDisc({ userId, color, name, className = 'w-8 h-8 text-sm', children }) {
  return (
    <span
      className={`relative rounded-full flex items-center justify-center font-bold flex-none select-none text-surface-secondary ${className}`}
      style={{ backgroundColor: resolveUserColor(color, userId) }}
    >
      {(name || '?')[0].toUpperCase()}
      {children}
    </span>
  )
}
