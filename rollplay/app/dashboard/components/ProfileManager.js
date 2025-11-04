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
  const [copied, setCopied] = useState(false)

  // Copy UUID to clipboard
  const handleCopyUUID = async () => {
    await navigator.clipboard.writeText(user.id)
    setCopied(true)
    setTimeout(() => setCopied(false), 3000)
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
              <label htmlFor="screenName" className="block text-sm font-medium text-slate-300 mb-1">Screen Name</label>
              <input
                type="text"
                id="screenName"
                value={screenName || user.screen_name || ''}
                onChange={(e) => setScreenName(e.target.value)}
                placeholder={user.screen_name || "Enter your screen name"}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 text-slate-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none"
                disabled={updatingScreenName}
              />
            </div>

            {/* Email Field (Read-only) */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1">Email Address</label>
              <input
                type="email"
                id="email"
                value={user.email}
                className="w-full px-4 py-2 bg-slate-900 border border-slate-700 text-slate-500 rounded-lg cursor-not-allowed"
                disabled
                title="Email cannot be changed"
              />
              <p className="text-xs text-slate-500 mt-1">Email address cannot be changed</p>
            </div>
            {/* ID Field (Read-only) */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1">UUID</label>
              <div className="flex gap-2">
                <input
                  type="id"
                  id="id"
                  value={user.id}
                  className="flex-1 px-4 py-2 bg-slate-900 border border-slate-700 text-slate-500 font-mono rounded-lg cursor-not-allowed"
                  disabled
                  title="id cannot be changed"
                />
                <button
                  onClick={handleCopyUUID}
                  className="w-24 px-4 py-2 bg-purple-500/20 border border-purple-500/30 rounded-lg text-purple-400 hover:bg-purple-500/30 hover:shadow-lg hover:shadow-purple-500/30 transition-all font-medium flex items-center justify-center gap-2"
                  title="Copy to clipboard"
                >
                  <FontAwesomeIcon icon={faCopy} />
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-1">ID cannot be changed</p>
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
    </div>
  )
}