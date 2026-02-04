/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTrash } from '@fortawesome/free-solid-svg-icons'
import { THEME, COLORS } from '@/app/styles/colorTheme'
import ProfileManager from './ProfileManager'
import FriendsManager from './FriendsManager'
import AccountNotificationFeed from './AccountNotificationFeed'

// Send test notification (dev only)
const sendTestNotification = async () => {
  try {
    await fetch('/api/notifications/test-notification', {
      method: 'POST',
      credentials: 'include'
    })
    console.log('Test notification sent')
  } catch (error) {
    console.error('Failed to send test notification:', error)
  }
}

export default function SocialManager({ user, onUserUpdate }) {
  const [showHardDeleteConfirm, setShowHardDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState(null)

  // Hard delete account (development only)
  const handleHardDeleteAccount = async () => {
    setDeleting(true)
    setError(null)

    try {
      const response = await fetch('/api/users/me/hard', {
        method: 'DELETE',
        credentials: 'include'
      })

      if (response.ok || response.status === 204) {
        window.location.href = '/auth/magic'
      } else {
        const errorData = await response.json()
        setError(errorData.detail || 'Failed to delete account')
        setShowHardDeleteConfirm(false)
      }
    } catch (error) {
      console.error('Error deleting account:', error)
      setError('Failed to delete account')
      setShowHardDeleteConfirm(false)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-8 max-w-[1600px]">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold font-[family-name:var(--font-metamorphous)]" style={{color: THEME.textBold}}>
          Account
        </h1>
        <p className="mt-2" style={{color: THEME.textPrimary}}>
          Manage your profile, friends, and view recent activity
        </p>
      </div>

      {/* Main Layout: Left Column (Profile + Activity) | Right Column (Add Friend + Friends) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* Left Column */}
        <div className="space-y-6">
          <ProfileManager user={user} onUserUpdate={onUserUpdate} />
          <AccountNotificationFeed userId={user?.id} />
        </div>

        {/* Right Column - stretch to match left column height */}
        <FriendsManager user={user} fillHeight />
      </div>

      {/* Development Tools (dev only) */}
      {process.env.NODE_ENV === 'development' && (
        <div
          className="p-4 rounded-sm border"
          style={{backgroundColor: '#422006', borderColor: '#ca8a04'}}
        >
          <h3 className="text-sm font-semibold mb-2" style={{color: '#fef08a'}}>
            Development Tools
          </h3>
          <p className="text-xs mb-3" style={{color: '#fde047'}}>
            These tools are only visible in development mode.
          </p>

          {error && (
            <div
              className="mb-4 p-3 rounded-sm border"
              style={{backgroundColor: '#991b1b', borderColor: '#dc2626'}}
            >
              <p style={{color: '#fca5a5'}} className="text-sm">{error}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              onClick={sendTestNotification}
              className="px-4 py-2 rounded-sm font-semibold text-sm transition-opacity hover:opacity-80"
              style={{backgroundColor: '#ca8a04', color: '#422006'}}
            >
              Send Test Notification
            </button>

            {!showHardDeleteConfirm ? (
              <button
                onClick={() => setShowHardDeleteConfirm(true)}
                className="px-4 py-2 rounded-sm border font-medium flex items-center gap-2 hover:opacity-80 transition-opacity"
                style={{
                  backgroundColor: 'transparent',
                  borderColor: '#f59e0b',
                  color: '#f59e0b'
                }}
              >
                <FontAwesomeIcon icon={faTrash} />
                Hard Delete Account
              </button>
            ) : (
              <div
                className="p-4 rounded-sm border flex-1"
                style={{backgroundColor: '#451a03', borderColor: '#f59e0b'}}
              >
                <p className="text-sm mb-3" style={{color: '#fcd34d'}}>
                  This will PERMANENTLY delete your account and ALL data. This cannot be undone!
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleHardDeleteAccount}
                    disabled={deleting}
                    className="px-4 py-2 rounded-sm font-medium hover:opacity-80 transition-opacity disabled:opacity-50"
                    style={{
                      backgroundColor: '#f59e0b',
                      color: '#000'
                    }}
                  >
                    {deleting ? 'Deleting...' : 'Yes, Permanently Delete'}
                  </button>
                  <button
                    onClick={() => setShowHardDeleteConfirm(false)}
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
      )}
    </div>
  )
}
