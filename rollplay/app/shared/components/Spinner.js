/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const SIZE_CLASSES = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-8 w-8',
}

/**
 * Loading spinner with consistent sizing and colors.
 *
 * @param {'sm'|'md'|'lg'} size - Spinner size (default 'md')
 * @param {string} className - Additional classes
 */
export default function Spinner({ size = 'md', className = '' }) {
  return (
    <div
      className={`animate-spin rounded-full border-b-2 border-content-accent ${SIZE_CLASSES[size]} ${className}`}
      role="status"
      aria-label="Loading"
    />
  )
}
