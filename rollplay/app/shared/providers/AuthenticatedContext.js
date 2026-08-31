/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { createContext, useContext } from 'react'

/**
 * Shared context for pages inside the `(authenticated)` route group.
 * Populated by the group's layout; consumed by its pages.
 *
 * Exposes:
 *   user, setUser, loading, error
 *   showScreenNameModal, setShowScreenNameModal
 *   handleLogout, setError
 *   toasts, showToast, dismissToast
 *   openSocialPanel — asks the header's social panel to open
 *   contentRef — the region below the header; overlays that should stay
 *     within the app chrome portal into it instead of over the viewport
 *
 * Pages should not call `useAuth()` / `useToast()` / `useEvents()`
 * directly — the layout owns one instance of each so the WebSocket
 * subscription and user-fetch survive route changes.
 */
export const AuthenticatedContext = createContext(null)

export function useAuthenticated() {
  const ctx = useContext(AuthenticatedContext)
  if (!ctx) {
    throw new Error(
      'useAuthenticated must be called inside the (authenticated) route group'
    )
  }
  return ctx
}
