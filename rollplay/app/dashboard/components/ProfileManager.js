/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState } from 'react'
import { authFetch } from '@/app/shared/utils/authFetch'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCopy, faTrash } from '@fortawesome/free-solid-svg-icons'
import { THEME, COLORS } from '@/app/styles/colorTheme'
import { Button } from './shared/Button'

export default function ProfileManager({ user, onUserUpdate }) {
  const [screenName, setScreenName] = useState('')
  const [updatingScreenName, setUpdatingScreenName] = useState(false)
  const [error, setError] = useState(null)
  const [copiedAccountTag, setCopiedAccountTag] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Copy account tag to clipboard
  const handleCopyAccountTag = async () => {
    if (!user.account_identifier) return
    await navigator.clipboard.writeText(user.account_identifier)
    setCopiedAccountTag(true)
    setTimeout(() => setCopiedAccountTag(false), 3000)
  }

  // Update screen name
  const updateScreenName = async () => {
    if (!screenName.trim()) return

    setUpdatingScreenName(true)
    setError(null)

    try {
      const response = await authFetch('/api/users/screen_name', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ screen_name: screenName.trim() })
      })

      if (response.ok) {
        const updatedUser = await response.json()
        onUserUpdate(updatedUser)
        setScreenName('')
      } else {
        const errorData = await response.json()
        setError(errorData.detail || 'Failed to update screen name')
      }
    } catch (error) {
      console.error('Error updating screen name:', error)
      setError('Failed to update screen name')
    } finally {
      setUpdatingScreenName(false)
    }
  }

  // Soft delete account (production)
  const handleDeleteAccount = async () => {
    setDeleting(true)
    setError(null)

    try {
      const response = await authFetch('/api/users/me', {
        method: 'DELETE',
        credentials: 'include'
      })

      if (response.ok || response.status === 204) {
        window.location.href = '/auth/magic'
      } else {
        const errorData = await response.json()
        setError(errorData.detail || 'Failed to delete account')
        setShowDeleteConfirm(false)
      }
    } catch (error) {
      console.error('Error deleting account:', error)
      setError('Failed to delete account')
      setShowDeleteConfirm(false)
    } finally {
      setDeleting(false)
    }
  }

  if (!user) {
    return (
      <div
        className="flex items-center justify-center py-8 rounded-sm border"
        style={{backgroundColor: THEME.bgPanel, borderColor: THEME.borderSubtle}}
      >
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 mr-3" style={{borderColor: THEME.borderActive}}></div>
        <div style={{color: THEME.textSecondary}}>Loading profile...</div>
      </div>
    )
  }

  return (
    <div
      className="p-6 rounded-sm border"
      style={{backgroundColor: THEME.bgPanel, borderColor: THEME.borderSubtle}}
    >
      {/* Section Header */}
      <h2
        className="text-xl font-semibold font-[family-name:var(--font-metamorphous)] mb-6"
        style={{color: THEME.textOnDark}}
      >
        Your Profile
      </h2>

      {/* User Info Display */}
      <div className="flex items-center mb-6">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-3xl font-bold mr-4 border-2"
          style={{
            backgroundColor: `${THEME.textAccent}30`,
            borderColor: `${THEME.textAccent}80`,
            color: THEME.textAccent
          }}
        >
          {user.screen_name ? user.screen_name[0].toUpperCase() : user.email[0].toUpperCase()}
        </div>
        <div>
          <p className="text-xl font-semibold" style={{color: THEME.textOnDark}}>
            {user.screen_name || user.email.split('@')[0]}
          </p>
          <p className="text-sm" style={{color: THEME.textSecondary}}>{user.email}</p>
          <p className="text-xs font-mono" style={{color: THEME.textSecondary}}>{user.id}</p>
        </div>
      </div>

      {/* Account Settings */}
      <div className="pt-4 border-t" style={{borderTopColor: THEME.borderSubtle}}>
        <h3 className="text-sm font-semibold uppercase mb-4" style={{color: THEME.textAccent}}>
          Account Settings
        </h3>

        {/* Error Message */}
        {error && (
          <div
            className="mb-4 p-3 rounded-sm border"
            style={{backgroundColor: '#991b1b', borderColor: '#dc2626'}}
          >
            <p style={{color: '#fca5a5'}} className="text-sm">{error}</p>
          </div>
        )}

        <div className="space-y-4">
          {/* Screen Name Field */}
          <div>
            <label
              htmlFor="screenName"
              className="block text-sm font-medium mb-1"
              style={{color: THEME.textOnDark}}
            >
              Screen Name <span style={{color: THEME.textSecondary}}>(Display Name)</span>
            </label>
            <input
              type="text"
              id="screenName"
              value={screenName || user.screen_name || ''}
              onChange={(e) => setScreenName(e.target.value)}
              placeholder={user.screen_name || "Enter your screen name"}
              className="w-full px-3 py-2 rounded-sm border focus:outline-none focus:ring-2"
              style={{
                backgroundColor: THEME.bgSecondary,
                borderColor: THEME.borderDefault,
                color: THEME.textOnDark
              }}
              disabled={updatingScreenName}
            />
            <p className="text-xs mt-1" style={{color: THEME.textSecondary}}>
              This is your display name shown to others (can be changed)
            </p>
          </div>

          {/* Account Tag Field (Read-only) */}
          <div>
            <label
              htmlFor="accountTag"
              className="block text-sm font-medium mb-1"
              style={{color: THEME.textOnDark}}
            >
              Account Tag <span style={{color: THEME.textSecondary}}>(Username)</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                id="accountTag"
                value={user.account_identifier || 'Not set'}
                className="flex-1 px-3 py-2 rounded-sm border font-mono cursor-not-allowed"
                style={{
                  backgroundColor: COLORS.onyx,
                  borderColor: THEME.borderSubtle,
                  color: THEME.textSecondary
                }}
                disabled
                title="Account tag cannot be changed"
              />
              <button
                onClick={handleCopyAccountTag}
                className="px-4 py-2 rounded-sm border font-medium flex items-center gap-2 hover:opacity-80 transition-opacity"
                style={{
                  backgroundColor: THEME.bgSecondary,
                  borderColor: THEME.borderDefault,
                  color: THEME.textAccent
                }}
                title="Copy account tag to clipboard"
              >
                <FontAwesomeIcon icon={faCopy} />
                {copiedAccountTag ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="text-xs mt-1" style={{color: THEME.textSecondary}}>
              Your unique identifier for friend requests (cannot be changed)
            </p>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end mt-6">
          <Button
            variant="primary"
            onClick={updateScreenName}
            disabled={updatingScreenName || !screenName.trim() || screenName === user.screen_name}
          >
            {updatingScreenName ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {/* Account Actions */}
      <div className="mt-6 pt-6 border-t" style={{borderTopColor: THEME.borderSubtle}}>
        <h3 className="text-sm font-semibold uppercase mb-4" style={{color: THEME.textSecondary}}>
          Account Actions
        </h3>

        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="px-4 py-2 rounded-sm border font-medium flex items-center gap-2 hover:opacity-80 transition-opacity"
            style={{
              backgroundColor: 'transparent',
              borderColor: '#ef4444',
              color: '#ef4444'
            }}
          >
            <FontAwesomeIcon icon={faTrash} />
            Delete Account
          </button>
        ) : (
          <div
            className="p-4 rounded-sm border"
            style={{backgroundColor: '#450a0a', borderColor: '#dc2626'}}
          >
            <p className="text-sm mb-3" style={{color: '#fca5a5'}}>
              Are you sure? Your account will be deactivated and you won&apos;t be able to log in.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleDeleteAccount}
                disabled={deleting}
                className="px-4 py-2 rounded-sm font-medium hover:opacity-80 transition-opacity disabled:opacity-50"
                style={{
                  backgroundColor: '#dc2626',
                  color: '#fff'
                }}
              >
                {deleting ? 'Deleting...' : 'Yes, Delete My Account'}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="px-4 py-2 rounded-sm border font-medium hover:opacity-80 transition-opacity"
                style={{
                  backgroundColor: 'transparent',
                  borderColor: THEME.borderDefault,
                  color: THEME.textSecondary
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
