/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Composable form field wrapper: label → input slot → helper text → error.
 *
 * Pass any input element as children (input, textarea, Combobox, etc.).
 *
 * @param {string} label - Field label text
 * @param {string} id - HTML id linking label to input
 * @param {string} error - Error message (shown in red when truthy)
 * @param {string} helperText - Helper text below the input
 * @param {React.ReactNode} children - The input element
 */
export default function FormField({ label, id, error, helperText, children }) {
  return (
    <div className="mb-4">
      {label && (
        <label
          htmlFor={id}
          className="block text-sm font-medium mb-2 text-content-secondary"
        >
          {label}
        </label>
      )}

      {children}

      {helperText && !error && (
        <p className="mt-1 text-xs text-content-secondary">{helperText}</p>
      )}

      {error && (
        <p className="mt-1 text-sm text-feedback-error">{error}</p>
      )}
    </div>
  )
}
