/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCopy } from '@fortawesome/free-solid-svg-icons'

export default function ProfileManager({ user, onUserUpdate }) {
  const [screenName, setScreenName] = useState('')
  const [updatingScreenName, setUpdatingScreenName] = useState(false)
  const [error, setError] = useState(null)
  const [copiedAccountTag, setCopiedAccountTag] = useState(false)

  // Copy account tag to clipboard
  const handleCopyAccountTag = async () => {
    const accountTag = user.account_identifier || user.friend_code
    await navigator.clipboard.writeText(accountTag)
    setCopiedAccountTag(true)
    setTimeout(() => setCopiedAccountTag(false), 3000)
  }

  // Update screen name
  const updateScreenName = async () => {
    if (!screenName.trim()) return

    setUpdatingScreenName(true)
    setError(null)

    try {
      const response = await fetch('/api/users/screen_name', {
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

  if (!user) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mr-3"></div>
        <div className="text-slate-400">Loading profile...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white uppercase">Your Profile</h1>
        <p className="mt-2 text-slate-400">Manage your user profile and account settings</p>
      </div>

      {/* Profile Card */}
      <div className="bg-slate-800 p-8 rounded-xl border border-purple-500/30 max-w-2xl mx-auto">
        {/* User Info Display */}
        <div className="flex items-center mb-6">
          <div className="w-24 h-24 bg-purple-500/20 border-2 border-purple-500/50 rounded-full flex items-center justify-center text-purple-400 text-5xl font-bold mr-6">
            {user.screen_name ? user.screen_name[0].toUpperCase() : user.email[0].toUpperCase()}
          </div>
          <div>
            <p className="text-3xl font-semibold text-slate-200">{user.screen_name || user.email.split('@')[0]}</p>
            <p className="text-slate-400 mt-1">{user.email}</p> 
            <p><small className="text-slate-400 mt-1">UUID: <span className="font-mono">{user.id}</span></small></p>
          </div>
        </div>

        {/* Account Settings */}
        <div className="mt-8 pt-6 border-t border-slate-700">
          <h3 className="text-xl font-semibold text-purple-400 mb-4">Account Settings</h3>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-md">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <div className="space-y-4">
            {/* Screen Name Field */}
            <div>
              <label htmlFor="screenName" className="block text-sm font-medium text-slate-300 mb-1">
                Screen Name <span className="text-slate-500">(Display Name)</span>
              </label>
              <input
                type="text"
                id="screenName"
                value={screenName || user.screen_name || ''}
                onChange={(e) => setScreenName(e.target.value)}
                placeholder={user.screen_name || "Enter your screen name"}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 text-slate-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none"
                disabled={updatingScreenName}
              />
              <p className="text-xs text-slate-500 mt-1">This is your display name shown to others (can be changed)</p>
            </div>

            {/* Account Tag Field (Read-only) */}
            <div>
              <label htmlFor="accountTag" className="block text-sm font-medium text-slate-300 mb-1">
                Account Tag <span className="text-slate-500">(Username)</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  id="accountTag"
                  value={user.account_identifier || user.friend_code || 'Not set'}
                  className="flex-1 px-4 py-2 bg-slate-900 border border-slate-700 text-slate-300 font-mono rounded-lg cursor-not-allowed"
                  disabled
                  title="Account tag cannot be changed"
                />
                <button
                  onClick={handleCopyAccountTag}
                  className="w-24 px-4 py-2 bg-purple-500/20 border border-purple-500/30 rounded-lg text-purple-400 hover:bg-purple-500/30 hover:shadow-lg hover:shadow-purple-500/30 transition-all font-medium flex items-center justify-center gap-2"
                  title="Copy account tag to clipboard"
                >
                  <FontAwesomeIcon icon={faCopy} />
                  {copiedAccountTag ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-1">Your unique identifier for friend requests (cannot be changed)</p>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end mt-6">
            <button
              onClick={updateScreenName}
              disabled={updatingScreenName || !screenName.trim() || screenName === user.screen_name}
              className={`font-semibold px-6 py-3 rounded-lg transition-all duration-200 ${
                updatingScreenName || !screenName.trim() || screenName === user.screen_name
                  ? 'bg-slate-600 border border-slate-600 text-slate-500 cursor-not-allowed'
                  : 'bg-purple-600 border border-purple-500 text-white hover:bg-purple-500 hover:shadow-lg hover:shadow-purple-500/30'
              }`}
            >
              {updatingScreenName ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>

      {/* Development Tools (dev only) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="bg-yellow-50 p-6 rounded-xl border-2 border-yellow-500 max-w-2xl mx-auto">
          <h3 className="text-lg font-semibold text-yellow-900 mb-3">Development Tools</h3>
          <p className="text-sm text-yellow-800 mb-4">
            These tools are only visible in development mode and help test notification features.
          </p>
          <button
            onClick={sendTestNotification}
            className="px-6 py-3 bg-yellow-600 text-white font-semibold rounded-lg hover:bg-yellow-700 transition-all hover:shadow-lg"
          >
            Send Test Notification
          </button>
        </div>
      )}
    </div>
  )
}