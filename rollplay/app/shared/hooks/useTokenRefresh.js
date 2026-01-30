/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useEffect, useRef, useCallback } from 'react'

const REFRESH_INTERVAL = 12 * 60 * 1000 // 12 minutes (80% of 15-min token lifetime)

/**
 * Proactive token refresh hook
 *
 * Refreshes the access token every 12 minutes (before the 15-minute expiry)
 * and immediately when the browser tab becomes visible (handles sleep/background).
 *
 * @param {boolean} enabled - Whether to enable the refresh timer (only when user is authenticated)
 */
export function useTokenRefresh(enabled = false) {
  const refreshTimeoutRef = useRef(null)

  const refreshToken = useCallback(async () => {
    try {
      const response = await fetch('/api/users/auth/refresh', {
        method: 'POST',
        credentials: 'include'
      })

      if (!response.ok) {
        console.warn('Token refresh failed, user may need to re-authenticate')
        // Don't redirect here - let the next API call handle 401
      }
    } catch (error) {
      console.error('Token refresh error:', error)
    }
  }, [])

  const scheduleRefresh = useCallback(() => {
    // Clear any existing timeout
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current)
    }

    // Schedule next refresh
    refreshTimeoutRef.current = setTimeout(() => {
      refreshToken()
      scheduleRefresh() // Reschedule for next interval
    }, REFRESH_INTERVAL)
  }, [refreshToken])

  useEffect(() => {
    if (!enabled) {
      // Clear timeout if disabled
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current)
        refreshTimeoutRef.current = null
      }
      return
    }

    // Start the refresh timer
    scheduleRefresh()

    // Also refresh when tab becomes visible (handles sleep/background)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshToken() // Refresh immediately when tab becomes active
        scheduleRefresh() // Reset the timer
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Cleanup
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current)
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [enabled, refreshToken, scheduleRefresh])
}
