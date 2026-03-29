/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState } from 'react'
import { authFetch, authPut } from '@/app/shared/utils/authFetch'
import Modal from '@/app/shared/components/Modal'

/**
 * Modal for setting the user's account name and screen name in a single form.
 *
 * Shown when a user is missing either account_name or screen_name.
 * The modal is blocking - user cannot dismiss without completing setup.
 *
 * Account name rules:
 * - 3-30 characters
 * - Alphanumeric + dash + underscore only
 * - Must start with letter or number
 * - Immutable once set
 *
 * Screen name:
 * - Any non-empty string
 * - Can be changed later in profile settings
 */
export default function AccountNameModal({ show, user, onComplete }) {
  const [accountName, setAccountName] = useState('')
  const [screenName, setScreenName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  const needsAccountName = !user?.account_name
  const needsScreenName = !user?.screen_name

  const isValidFormat = (name) => {
    if (!name) return false
    const regex = /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,29}$/
    return regex.test(name)
  }

  const handleSubmit = async () => {
    if (needsAccountName && !isValidFormat(accountName.trim())) {
      setError('Account name must be 3-30 characters, start with a letter or number, and contain only letters, numbers, dashes, and underscores')
      return
    }

    if (needsScreenName && !screenName.trim()) {
      setError('Screen name is required')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      let accountResult = null

      // Step 1: Set account name if needed
      if (needsAccountName) {
        const response = await authFetch('/api/users/me/account-name', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ account_name: accountName.trim() })
        })

        const data = await response.json()
        if (!response.ok) {
          throw new Error(data.detail || 'Failed to set account name')
        }
        accountResult = data
      }

      // Step 2: Set screen name if needed
      if (needsScreenName) {
        const response = await authPut('/api/users/screen_name', {
          screen_name: screenName.trim()
        })

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.detail || 'Failed to set screen name')
        }
      }

      setResult(accountResult)

      // If no account name was needed (only screen name), skip success state
      if (!accountResult) {
        onComplete(null, screenName.trim())
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleContinue = () => {
    onComplete(result, screenName.trim())
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !submitting) {
      const accountValid = !needsAccountName || isValidFormat(accountName.trim())
      const screenValid = !needsScreenName || screenName.trim()
      if (accountValid && screenValid) {
        handleSubmit()
      }
    }
  }

  const inputValue = accountName.trim()
  const isAccountValid = isValidFormat(inputValue)
  const charCount = inputValue.length
  const canSubmit = (!needsAccountName || isAccountValid) && (!needsScreenName || screenName.trim())

  return (
    <Modal open={show} onClose={() => {}} size="md">
      <div className="p-6">
        {/* Success state — only shown when account name was just created */}
        {result ? (
          <>
            <div className="text-center mb-6">
              <div className="text-4xl mb-4">🎉</div>
              <h3 className="text-2xl font-bold text-content-on-dark mb-2">Account Created!</h3>
              <p className="text-content-secondary">Your unique account tag is:</p>
            </div>

            <div className="rounded-sm p-4 mb-6 text-center bg-surface-elevated">
              <span className="text-2xl font-mono font-bold text-content-accent">
                {result.account_identifier}
              </span>
            </div>

            <div className="mb-6 p-3 rounded-sm border bg-feedback-success/15 border-feedback-success/30">
              <p className="text-sm text-feedback-success">
                Share your account tag with friends so they can find you!
              </p>
            </div>

            <div className="flex justify-center">
              <button
                onClick={handleContinue}
                className="px-6 py-2 rounded-sm font-semibold transition-all bg-interactive-hover text-content-primary hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-border-active"
              >
                Continue to Dashboard
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Form state */}
            <div className="text-center mb-6">
              <h3 className="text-2xl font-bold text-content-on-dark mb-2">Welcome to Tabletop Tavern!</h3>
              <p className="text-content-secondary">
                {needsAccountName && needsScreenName
                  ? 'Set up your account to get started.'
                  : needsAccountName
                    ? 'Choose a permanent account name to get started.'
                    : 'Choose a screen name that other players will see.'}
              </p>
            </div>

            {/* Account Name Field */}
            {needsAccountName && (
              <div className="mb-4">
                <label htmlFor="accountName" className="block text-sm font-medium text-content-secondary mb-2">
                  Account Name
                </label>
                <input
                  type="text"
                  id="accountName"
                  value={accountName}
                  onChange={(e) => { setAccountName(e.target.value); setError(null) }}
                  onKeyDown={handleKeyPress}
                  placeholder="e.g: dragon_slayer420, xo_stronkMage_ox, steve"
                  maxLength={30}
                  className="w-full px-3 py-2 border rounded-sm focus:outline-none focus:ring-2 bg-surface-elevated border-border text-content-on-dark focus:ring-border-active focus:border-border-active"
                  disabled={submitting}
                  autoFocus
                />
                <div className="flex justify-between text-xs mt-1">
                  <span className={charCount < 3 || charCount > 30 ? 'text-feedback-error' : 'text-content-secondary'}>
                    {charCount}/30 characters (min 3)
                  </span>
                  {inputValue && (
                    <span className={isAccountValid ? 'text-feedback-success' : 'text-feedback-error'}>
                      {isAccountValid ? '✓ Valid format' : '✗ Invalid format'}
                    </span>
                  )}
                </div>

                {/* Account tag preview */}
                {inputValue && isAccountValid && user?.account_tag && (
                  <div className="mt-2 p-3 rounded-sm border bg-surface-elevated border-border-subtle">
                    <p className="text-sm text-content-secondary">
                      Your account tag will be: <span className="font-mono font-semibold text-content-accent">{inputValue}#{user.account_tag}</span>
                    </p>
                    <p className="text-xs text-content-secondary mt-1">
                      This is your permanent identifier
                    </p>
                  </div>
                )}

                {/* Format rules */}
                <div className="mt-2 text-xs text-content-secondary">
                  <p className="font-medium mb-1">Allowed characters:</p>
                  <ul className="list-disc list-inside">
                    <li>Letters (a-z, A-Z)</li>
                    <li>Numbers (0-9)</li>
                    <li>Dashes (-) and underscores (_)</li>
                    <li>Must start with a letter or number</li>
                  </ul>
                </div>
              </div>
            )}

            {/* Screen Name Field */}
            {needsScreenName && (
              <div className="mb-4">
                <label htmlFor="screenName" className="block text-sm font-medium text-content-secondary mb-2">
                  Screen Name
                </label>
                <input
                  type="text"
                  id="screenName"
                  value={screenName}
                  onChange={(e) => { setScreenName(e.target.value); setError(null) }}
                  onKeyDown={handleKeyPress}
                  placeholder="Enter your screen name..."
                  className="w-full px-3 py-2 border rounded-sm focus:outline-none focus:ring-2 bg-surface-elevated border-border text-content-on-dark focus:ring-border-active focus:border-border-active"
                  disabled={submitting}
                  autoFocus={!needsAccountName}
                />
                <p className="text-xs text-content-secondary mt-1">
                  This is the name other players will see. You can change it later.
                </p>
              </div>
            )}

            {error && (
              <div className="mb-4 p-3 rounded-sm border bg-feedback-error/15 border-feedback-error/30">
                <p className="text-sm text-feedback-error">{error}</p>
              </div>
            )}

            <div className="flex justify-center">
              <button
                onClick={handleSubmit}
                disabled={submitting || !canSubmit}
                className={`px-6 py-2 rounded-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-border-active ${
                  submitting || !canSubmit
                    ? 'bg-surface-elevated text-content-secondary cursor-not-allowed'
                    : 'bg-interactive-hover text-content-primary hover:brightness-110'
                }`}
              >
                {submitting ? 'Setting up...' : 'Continue'}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
