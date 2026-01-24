# Plan: Proactive Token Refresh Timer

## Summary
Add a background timer that proactively refreshes the access token before it expires, eliminating the need for users to refresh the page when their token expires.

## Current State
- Access token expires after 15 minutes
- `authFetch` wrapper handles 401 responses with retry, but not all components use it
- Next.js middleware refreshes on route changes, but not during in-page interactions
- Users currently must refresh the page when token expires during long sessions

## Solution: Background Refresh Timer

Create a `useTokenRefresh` hook that:
1. Refreshes the token every **12 minutes** (80% of 15-minute lifetime)
2. Also refreshes when the browser tab becomes visible (handles sleep/background)
3. Uses the existing `/api/users/auth/refresh` endpoint
4. Runs silently in the background - no UI impact

## Implementation

### 1. Create Token Refresh Hook

**File**: `rollplay/app/shared/hooks/useTokenRefresh.js`

```javascript
'use client'

import { useEffect, useRef } from 'react'

const REFRESH_INTERVAL = 12 * 60 * 1000 // 12 minutes (80% of 15-min token lifetime)

export function useTokenRefresh() {
  const refreshTimeoutRef = useRef(null)

  const refreshToken = async () => {
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
  }

  const scheduleRefresh = () => {
    // Clear any existing timeout
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current)
    }

    // Schedule next refresh
    refreshTimeoutRef.current = setTimeout(() => {
      refreshToken()
      scheduleRefresh() // Reschedule for next interval
    }, REFRESH_INTERVAL)
  }

  useEffect(() => {
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
  }, [])
}
```

### 2. Integrate into Dashboard Layout

**File**: `rollplay/app/dashboard/layout.js` (or create if doesn't exist)

Add the hook to the dashboard layout so it runs for all authenticated pages:

```javascript
'use client'

import { useTokenRefresh } from '@/app/shared/hooks/useTokenRefresh'

export default function DashboardLayout({ children }) {
  useTokenRefresh()

  return <>{children}</>
}
```

Alternatively, if there's a shared provider/context for authenticated pages, add it there.

### 3. Alternative: Add to useAuth Hook

If you prefer keeping auth logic together, add to existing `useAuth` hook:

**File**: `rollplay/app/dashboard/hooks/useAuth.js`

Add the refresh timer logic inside the existing `useAuth` hook after the user is authenticated.

## Files to Modify/Create
- `rollplay/app/shared/hooks/useTokenRefresh.js` (NEW)
- `rollplay/app/dashboard/layout.js` OR `rollplay/app/dashboard/hooks/useAuth.js`

## Verification
1. Log in to the application
2. Open browser dev tools Network tab
3. Wait 12+ minutes without interacting
4. Observe automatic `/api/users/auth/refresh` calls every 12 minutes
5. Test tab visibility: switch away for a few seconds, switch back, observe immediate refresh
6. Verify no page refresh needed after 15+ minutes of inactivity

## Benefits
- **Seamless UX**: Token always fresh, no 401 failures
- **No migration needed**: Works regardless of `authFetch` vs raw `fetch` usage
- **Handles edge cases**: Tab visibility, browser sleep, etc.
- **Minimal code**: Single hook, ~50 lines
- **Backwards compatible**: Existing 401 handling still works as fallback
