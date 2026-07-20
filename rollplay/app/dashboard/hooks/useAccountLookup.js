/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState, useEffect } from 'react'
import { authFetch } from '@/app/shared/utils/authFetch'

/**
 * Validate a friend identifier: a user UUID or an account tag (name#1234).
 * Single source of truth for the format — shared by FriendsManager and
 * SocialPanel.
 */
export const isValidAccountIdentifier = (identifier) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const accountTagRegex = /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,29}#\d{4}$/
  return uuidRegex.test(identifier) || accountTagRegex.test(identifier)
}

/**
 * Debounced lookup of a user by account tag / UUID (500ms, stays local —
 * intentionally not a TanStack query: it's transient type-ahead state, not
 * cacheable app data). Invalid or empty identifiers resolve to a silent
 * null match, mirroring the original FriendsManager behaviour.
 *
 * @param {string} identifier - raw input value (untrimmed is fine)
 * @returns {{ matchedUser: object|null, isLooking: boolean, lookupError: string|null }}
 *          matchedUser: { id, screen_name, account_identifier, ... }
 */
export function useAccountLookup(identifier) {
  const [matchedUser, setMatchedUser] = useState(null)
  const [isLooking, setIsLooking] = useState(false)
  const [lookupError, setLookupError] = useState(null)

  useEffect(() => {
    const lookupUserByCode = async () => {
      const trimmed = (identifier || '').trim()

      if (!trimmed || !isValidAccountIdentifier(trimmed)) {
        setMatchedUser(null)
        setLookupError(null)
        return
      }

      try {
        setIsLooking(true)
        setLookupError(null)

        const response = await authFetch(
          `/api/users/by-account-tag/${encodeURIComponent(trimmed)}`,
          { credentials: 'include' }
        )

        if (response.ok) {
          setMatchedUser(await response.json())
        } else if (response.status === 404) {
          setLookupError('User not found')
          setMatchedUser(null)
        } else {
          setLookupError('Failed to lookup user')
          setMatchedUser(null)
        }
      } catch (err) {
        console.error('Error looking up user:', err)
        setLookupError('Failed to lookup user')
        setMatchedUser(null)
      } finally {
        setIsLooking(false)
      }
    }

    const timeoutId = setTimeout(lookupUserByCode, 500)
    return () => clearTimeout(timeoutId)
  }, [identifier])

  return { matchedUser, isLooking, lookupError }
}
