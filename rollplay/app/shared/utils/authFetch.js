/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Wrapper around fetch that handles automatic token refresh on 401 responses.
 *
 * When an access token expires (401), this automatically:
 * 1. Calls /api/users/auth/refresh to get a new access token
 * 2. Retries the original request with the new token
 * 3. Redirects to login if refresh also fails
 *
 * Usage:
 *   import { authFetch } from '@/app/shared/utils/authFetch'
 *   const response = await authFetch('/api/users/me')
 */

let isRefreshing = false
let refreshPromise = null

/**
 * Attempt to refresh the access token using the refresh token cookie.
 * @returns {Promise<boolean>} True if refresh succeeded, false otherwise
 */
async function refreshAccessToken() {
  // If already refreshing, wait for that to complete
  if (isRefreshing && refreshPromise) {
    return refreshPromise
  }

  isRefreshing = true
  refreshPromise = (async () => {
    try {
      const response = await fetch('/api/users/auth/refresh', {
        method: 'POST',
        credentials: 'include'
      })

      if (response.ok) {
        return true
      }

      // Refresh failed - user needs to re-authenticate
      return false
    } catch (error) {
      console.error('Token refresh failed:', error)
      return false
    } finally {
      isRefreshing = false
      refreshPromise = null
    }
  })()

  return refreshPromise
}

/**
 * Fetch wrapper with automatic token refresh on 401.
 *
 * @param {string} url - The URL to fetch
 * @param {RequestInit} options - Fetch options (automatically includes credentials)
 * @returns {Promise<Response>} The fetch response
 */
export async function authFetch(url, options = {}) {
  // Always include credentials for httpOnly cookies
  const fetchOptions = {
    ...options,
    credentials: 'include'
  }

  const response = await fetch(url, fetchOptions)

  // If not 401, return response as-is
  if (response.status !== 401) {
    return response
  }

  // Got 401 - try to refresh the token
  const refreshSuccess = await refreshAccessToken()

  if (!refreshSuccess) {
    // Refresh failed - redirect to login
    if (typeof window !== 'undefined') {
      window.location.href = '/auth/magic'
    }
    return response
  }

  // Retry the original request with refreshed token
  return fetch(url, fetchOptions)
}

/**
 * Convenience method for JSON POST requests with auto-refresh.
 */
export async function authPost(url, data) {
  return authFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  })
}

/**
 * Convenience method for JSON PUT requests with auto-refresh.
 */
export async function authPut(url, data) {
  return authFetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  })
}

/**
 * Convenience method for DELETE requests with auto-refresh.
 */
export async function authDelete(url) {
  return authFetch(url, {
    method: 'DELETE'
  })
}
