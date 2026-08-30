/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { resolveUserColor } from '@/app/utils/userColors'
import { COLORS } from '@/app/styles/colorTheme'
import { SKEW_BOX, SKEW_LABEL } from '@/app/dashboard/components/home/plateGeometry'

const SIZES = {
  sm: { box: 'h-9', avatar: 'w-9', initial: 'text-sm', name: 'text-sm', status: 'text-xs', pad: 'px-3' },
  md: { box: 'h-12', avatar: 'w-12', initial: 'text-lg', name: 'text-base', status: 'text-xs', pad: 'px-4' },
  lg: { box: 'h-16', avatar: 'w-16', initial: 'text-2xl', name: 'text-xl', status: 'text-sm', pad: 'px-5' },
}

/**
 * UserChrome — a user's identity as a capsule in the app's 8° family.
 *
 * The name sits on the dark face; the identity colour runs full-bleed into the
 * capsule's end, taking the slant with it (the hero's art-through-a-seam
 * treatment at chip scale). The colour block holds the initial today and is
 * shaped to hold an uploaded avatar when users get one.
 *
 * `avatarSide` flips the order: 'start' reads avatar → name (friend rows,
 * profile), 'end' reads name → avatar (the header's account chip).
 *
 * Presentation only — it never handles its own click. Wrap it in whatever the
 * parent needs (a Dropdown trigger, a row, a button).
 */
export default function UserChrome({
  userId,
  color,
  name,
  status,
  isOnline,
  avatarSide = 'start',
  size = 'sm',
  dimmed = false,
  className = '',
}) {
  const scale = SIZES[size]
  const initial = (name || '?')[0].toUpperCase()
  const avatarFirst = avatarSide === 'start'

  const avatarBlock = (
    <span
      className={`${scale.avatar} relative flex h-full flex-none items-center justify-center`}
      style={{ backgroundColor: resolveUserColor(color, userId) }}
    >
      <span
        className={`${scale.initial} font-bold`}
        style={{ transform: SKEW_LABEL, color: COLORS.carbon }}
      >
        {initial}
      </span>
      {/* Presence pip — a chip flush into the wedge's top-right, sharp on that
          corner so its two outer edges continue the wedge's own. No
          counter-skew: it takes the capsule's lean like every other chip. */}
      {isOnline !== undefined && (
        <span
          className={`absolute right-0 top-0 h-2 w-2 ${isOnline ? 'bg-feedback-success' : 'bg-border'}`}
          style={{ borderRadius: '2px 0 2px 2px' }}
        />
      )}
    </span>
  )

  const nameBlock = (
    <span
      className={`flex min-w-0 flex-1 flex-col justify-center ${scale.pad}`}
      style={{ transform: SKEW_LABEL }}
    >
      {/* Names are capped at 30 characters, but 30 still renders too wide for
          chrome — hold the capsule to a readable length and ellipsis past it. */}
      <span className={`${scale.name} max-w-[15ch] truncate text-content-on-dark`}>
        {name || 'Unknown'}
      </span>
      {status && (
        <span className={`${scale.status} truncate text-content-secondary`}>{status}</span>
      )}
    </span>
  )

  return (
    <span
      className={`${scale.box} inline-flex items-stretch overflow-hidden rounded-lg ${dimmed ? 'opacity-60' : ''} ${className}`}
      style={{ transform: SKEW_BOX, backgroundColor: COLORS.graphite }}
    >
      {avatarFirst ? avatarBlock : nameBlock}
      {avatarFirst ? nameBlock : avatarBlock}
    </span>
  )
}
