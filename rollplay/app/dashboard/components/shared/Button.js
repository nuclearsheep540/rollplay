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
  disabled = false,
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
      borderColor: COLORS.silver
    }
  }

  const disabledStyle = {
    backgroundColor: COLORS.graphite,
    color: COLORS.silver,
    borderColor: COLORS.graphite
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
      className={`rounded-sm border font-medium transition-all disabled:cursor-not-allowed ${sizes[size]} ${className}`}
      style={{
        ...(disabled ? disabledStyle : variants[variant]),
        ...(isHovered && !disabled && variant !== 'ghost' && {
          borderColor: THEME.borderActive,
          color: THEME.textAccent
        })
      }}
      disabled={disabled}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      {...props}
    >
      {children}
    </button>
  )
}

export function Badge({ children, className = '', size = 'default', ...props }) {
  const sizes = {
    default: 'px-3 py-1 text-xs',
    xs: 'px-2 py-1 text-xs',
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base'
  }

  return (
    <span
      className={`rounded-sm font-semibold border ${sizes[size]} ${className}`}
      style={{
        backgroundColor: `${THEME.bgSecondary}CC`,
        color: COLORS.smoke,
        borderColor: COLORS.silver
      }}
      {...props}
    >
      {children}
    </span>
  )
}
