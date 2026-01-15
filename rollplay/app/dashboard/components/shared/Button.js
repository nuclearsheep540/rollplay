/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState } from 'react'
import { COLORS, THEME, STYLES } from '@/app/styles/colorTheme'

export function Button({
  variant = 'default',
  size = 'md',
  children,
  className = '',
  ...props
}) {
  const variants = {
    default: {
      ...STYLES.button,
      transition: 'all 200ms'
    },

    primary: {
      backgroundColor: THEME.bgSecondary,
      color: THEME.textAccent,
      borderColor: THEME.borderActive
    },

    danger: {
      backgroundColor: '#991b1b',
      color: COLORS.smoke,
      borderColor: '#dc2626'
    },

    success: {
      backgroundColor: '#166534',
      color: COLORS.smoke,
      borderColor: '#16a34a'
    },

    ghost: {
      backgroundColor: 'transparent',
      color: THEME.textOnDark,
      borderColor: 'transparent'
    }
  }

  const sizes = {
    xs: 'px-2 py-1 text-xs',
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base'
  }

  const [isHovered, setIsHovered] = useState(false)

  return (
    <button
      className={`rounded-sm border font-medium transition-all ${sizes[size]} ${className}`}
      style={{
        ...variants[variant],
        ...(isHovered && variant !== 'ghost' && {
          borderColor: THEME.borderActive,
          color: THEME.textAccent
        })
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      {...props}
    >
      {children}
    </button>
  )
}

export function Badge({ children, className = '', ...props }) {
  return (
    <span
      className={`px-3 py-1 rounded-sm text-xs font-semibold border ${className}`}
      style={{
        backgroundColor: `${THEME.bgSecondary}CC`,
        color: COLORS.smoke,
        borderColor: THEME.borderDefault
      }}
      {...props}
    >
      {children}
    </span>
  )
}
