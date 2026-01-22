/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState } from 'react'

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

  if (!show) return null

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
      const response = await fetch('/api/users/me/account-name', {
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

  // Show success state with generated tag
  if (result) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
          <div className="text-center mb-6">
            <div className="text-4xl mb-4">🎉</div>
            <h3 className="text-2xl font-bold text-slate-800 mb-2">Account Created!</h3>
            <p className="text-slate-600">Your unique account tag is:</p>
          </div>

          <div className="bg-slate-100 rounded-lg p-4 mb-6 text-center">
            <span className="text-2xl font-mono font-bold text-indigo-600">
              {result.account_identifier}
            </span>
          </div>

          <div className="mb-6 p-3 bg-amber-50 border border-amber-200 rounded-md">
            <p className="text-amber-800 text-sm">
              <strong>Important:</strong> This is your permanent account tag. Share it with friends so they can find you! It cannot be changed.
            </p>
          </div>

          <div className="flex justify-center">
            <button
              onClick={handleContinue}
              className="px-6 py-2 rounded-md font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              Continue to Dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Input state
  const inputValue = accountName.trim()
  const isValid = isValidFormat(inputValue)
  const charCount = inputValue.length

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <div className="text-center mb-6">
          <h3 className="text-2xl font-bold text-slate-800 mb-2">Create Account Name</h3>
          <p className="text-slate-600">
            Your account name cannot be changed but you can choose a nickname on the next screen.
          </p>
        </div>

        <div className="mb-4">
          <label htmlFor="accountName" className="block text-sm font-medium text-slate-700 mb-2">
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
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            disabled={submitting}
            autoFocus
          />
          <div className="flex justify-between text-xs mt-1">
            <span className={charCount < 3 || charCount > 30 ? 'text-red-500' : 'text-slate-500'}>
              {charCount}/30 characters (min 3)
            </span>
            {inputValue && (
              <span className={isValid ? 'text-green-600' : 'text-red-500'}>
                {isValid ? '✓ Valid format' : '✗ Invalid format'}
              </span>
            )}
          </div>
        </div>

        {/* Preview of what the tag will look like */}
        {inputValue && isValid && user?.account_tag && (
          <div className="mb-4 p-3 bg-slate-50 border border-slate-200 rounded-md">
            <p className="text-sm text-slate-600">
              Your account tag will be: <span className="font-mono font-semibold text-indigo-600">{inputValue}#{user.account_tag}</span>
            </p>
            <p className="text-xs text-slate-500 mt-1">
              This is your permanent identifier
            </p>
          </div>
        )}

        {/* Format rules */}
        <div className="mb-4 text-xs text-slate-500">
          <p className="font-medium mb-1">Allowed characters:</p>
          <ul className="list-disc list-inside">
            <li>Letters (a-z, A-Z)</li>
            <li>Numbers (0-9)</li>
            <li>Dashes (-) and underscores (_)</li>
            <li>Must start with a letter or number</li>
          </ul>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
          <p className="text-amber-800 text-sm">
            Your username cannot be changed after creation.
          </p>
        </div>

        <div className="flex justify-center">
          <button
            onClick={handleSubmit}
            disabled={submitting || !isValid}
            className={`px-6 py-2 rounded-md font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
              submitting || !isValid
                ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                : 'bg-indigo-600 text-white hover:bg-indigo-700'
            }`}
          >
            {submitting ? 'Creating...' : 'Submit Username'}
          </button>
        </div>
      </div>
    </div>
  )
}
