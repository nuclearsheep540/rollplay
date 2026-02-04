/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import ConfirmDialog from './ConfirmDialog'

/**
 * Reusable confirmation modal component.
 *
 * Delegates to ConfirmDialog (backed by Headless UI Dialog)
 * for focus trap, escape-to-close, and ARIA support.
 *
 * @see ConfirmDialog for full props documentation
 */
export default function ConfirmModal(props) {
  return <ConfirmDialog {...props} />
}
