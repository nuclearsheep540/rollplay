/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const VARIANT_CLASSES = {
  default: 'bg-surface-elevated text-content-on-dark border-border',
  success: 'bg-[color-mix(in_srgb,var(--feedback-success),transparent_75%)] text-feedback-success border-[color-mix(in_srgb,var(--feedback-success),black_30%)]',
  error: 'bg-[color-mix(in_srgb,var(--feedback-error),transparent_75%)] text-feedback-error border-[color-mix(in_srgb,var(--feedback-error),black_30%)]',
  warning: 'bg-[color-mix(in_srgb,var(--feedback-warning),transparent_75%)] text-feedback-warning border-[color-mix(in_srgb,var(--feedback-warning),black_30%)]',
  info: 'bg-[color-mix(in_srgb,var(--feedback-info),transparent_75%)] text-feedback-info border-[color-mix(in_srgb,var(--feedback-info),black_30%)]',
  audio: 'bg-[color-mix(in_srgb,var(--feedback-audio),transparent_75%)] text-feedback-audio border-[color-mix(in_srgb,var(--feedback-audio),black_30%)]',
}

const SIZE_CLASSES = {
  xs: 'px-2 py-0.5 text-xs',
  sm: 'px-2.5 py-0.5 text-xs',
  md: 'px-3 py-1 text-sm',
  lg: 'px-4 py-2 text-sm',
}

/**
 * Badge / tag component with variant colors from design tokens.
 *
 * @param {React.ReactNode} children - Badge content
 * @param {'default'|'success'|'error'|'warning'|'info'} variant
 * @param {'xs'|'sm'|'md'|'lg'} size
 * @param {boolean} pulse - Enables pulse animation
 * @param {string} className - Additional classes
 */
export default function Badge({ children, variant = 'default', size = 'sm', pulse = false, className = '' }) {
  return (
    <span
      className={`inline-flex items-center rounded-sm font-semibold border ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${pulse ? 'animate-pulse' : ''} ${className}`}
    >
      {children}
    </span>
  )
}
