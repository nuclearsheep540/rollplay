/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState } from 'react'
import { authFetch } from '@/app/shared/utils/authFetch'
import Modal from '@/app/shared/components/Modal'

/**
 * Modal for setting the user's immutable account name.
 *
 * This is shown when a user doesn't have an account_name set yet.
 * The modal is blocking - user cannot dismiss without setting a name.
 *
 * Account name rules:
 * - 3-30 characters
 * - Alphanumeric + dash + underscore only
 * - Must start with letter or number
 *
 * The user's account_tag is pre-assigned during account creation,
 * so we can show the final identifier (e.g., "username#2345") immediately.
 */
export default function AccountNameModal({ show, user, onComplete }) {
  const [accountName, setAccountName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null) // { account_name, account_tag, account_identifier }

  // Validation regex matching backend rules
  const isValidFormat = (name) => {
    if (!name) return false
    const regex = /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,29}$/
    return regex.test(name)
  }

  const handleInputChange = (e) => {
    const value = e.target.value
    setAccountName(value)
    setError(null) // Clear error on input change
  }

  const handleSubmit = async () => {
    // Client-side validation
    if (!accountName.trim()) {
      setError('Account name is required')
      return
    }

    if (!isValidFormat(accountName.trim())) {
      setError('Account name must be 3-30 characters, start with a letter or number, and contain only letters, numbers, dashes, and underscores')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
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

      // Show success with the generated tag
      setResult(data)

    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleContinue = () => {
    // User has seen their account tag, complete the flow
    onComplete(result)
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !submitting && isValidFormat(accountName.trim())) {
      handleSubmit()
    }
  }

  // Input state
  const inputValue = accountName.trim()
  const isValid = isValidFormat(inputValue)
  const charCount = inputValue.length

  return (
    <Modal open={show} onClose={() => {}} size="md">
      <div className="p-6">
        {/* Success state with generated tag */}
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
            {/* Input state */}
            <div className="text-center mb-6">
              <h3 className="text-2xl font-bold text-content-on-dark mb-2">Create Account Name</h3>
              <p className="text-content-secondary">
                Your account name cannot be changed but you can choose a nickname on the next screen.
              </p>
            </div>

            <div className="mb-4">
              <label htmlFor="accountName" className="block text-sm font-medium text-content-secondary mb-2">
                Account Name
              </label>
              <input
                type="text"
                id="accountName"
                value={accountName}
                onChange={handleInputChange}
                onKeyPress={handleKeyPress}
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
                  <span className={isValid ? 'text-feedback-success' : 'text-feedback-error'}>
                    {isValid ? '✓ Valid format' : '✗ Invalid format'}
                  </span>
                )}
              </div>
            </div>

            {/* Preview of what the tag will look like */}
            {inputValue && isValid && user?.account_tag && (
              <div className="mb-4 p-3 rounded-sm border bg-surface-elevated border-border-subtle">
                <p className="text-sm text-content-secondary">
                  Your account tag will be: <span className="font-mono font-semibold text-content-accent">{inputValue}#{user.account_tag}</span>
                </p>
                <p className="text-xs text-content-secondary mt-1">
                  This is your permanent identifier
                </p>
              </div>
            )}

            {/* Format rules */}
            <div className="mb-4 text-xs text-content-secondary">
              <p className="font-medium mb-1">Allowed characters:</p>
              <ul className="list-disc list-inside">
                <li>Letters (a-z, A-Z)</li>
                <li>Numbers (0-9)</li>
                <li>Dashes (-) and underscores (_)</li>
                <li>Must start with a letter or number</li>
              </ul>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-sm border bg-feedback-error/15 border-feedback-error/30">
                <p className="text-sm text-feedback-error">{error}</p>
              </div>
            )}

            <div className="flex justify-center">
              <button
                onClick={handleSubmit}
                disabled={submitting || !isValid}
                className={`px-6 py-2 rounded-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-border-active ${
                  submitting || !isValid
                    ? 'bg-surface-elevated text-content-secondary cursor-not-allowed'
                    : 'bg-interactive-hover text-content-primary hover:brightness-110'
                }`}
              >
                {submitting ? 'Creating...' : 'Submit Username'}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
