/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const VARIANT_CLASSES = {
  default: 'bg-surface-elevated text-content-on-dark border-border',
  success: 'bg-feedback-success/15 text-feedback-success border-feedback-success/30',
  error: 'bg-feedback-error/15 text-feedback-error border-feedback-error/30',
  warning: 'bg-feedback-warning/15 text-feedback-warning border-feedback-warning/30',
  info: 'bg-feedback-info/15 text-feedback-info border-feedback-info/30',
}

const SIZE_CLASSES = {
  xs: 'px-2 py-0.5 text-xs',
  sm: 'px-2.5 py-0.5 text-xs',
  md: 'px-3 py-1 text-sm',
}

/**
 * Badge / tag component with variant colors from design tokens.
 *
 * @param {React.ReactNode} children - Badge content
 * @param {'default'|'success'|'error'|'warning'|'info'} variant
 * @param {'xs'|'sm'|'md'} size
 * @param {string} className - Additional classes
 */
export default function Badge({ children, variant = 'default', size = 'sm', className = '' }) {
  return (
    <span
      className={`inline-flex items-center rounded-sm font-semibold border ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
    >
      {children}
    </span>
  )
}
