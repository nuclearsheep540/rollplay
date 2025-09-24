/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState } from 'react'

export default function ProfileManager({ user, onUserUpdate }) {
  const [screenName, setScreenName] = useState('')
  const [updatingScreenName, setUpdatingScreenName] = useState(false)
  const [error, setError] = useState(null)

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
        <div className="text-slate-600">Loading profile...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-slate-800">Your Profile</h1>
        <p className="mt-2 text-slate-600">Manage your user profile and account settings. You can update your personal information and change your preferences to customize your experience on the platform.</p>
      </div>

      {/* Profile Card */}
      <div className="bg-white p-8 rounded-xl shadow-lg border border-gray-200 max-w-2xl mx-auto">
        {/* User Info Display */}
        <div className="flex items-center mb-6">
          <div className="w-24 h-24 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 text-5xl font-bold mr-6">
            {user.screen_name ? user.screen_name[0].toUpperCase() : user.email[0].toUpperCase()}
          </div>
          <div>
            <p className="text-3xl font-semibold text-slate-800">{user.screen_name || user.email.split('@')[0]}</p>
            <p className="text-slate-600 mt-1">{user.email}</p>
          </div>
        </div>

        {/* Account Settings */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <h3 className="text-xl font-semibold text-slate-700 mb-4">Account Settings</h3>
          
          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          <div className="space-y-4">
            {/* Screen Name Field */}
            <div>
              <label htmlFor="screenName" className="block text-sm font-medium text-slate-700 mb-1">Screen Name</label>
              <input 
                type="text" 
                id="screenName" 
                value={screenName || user.screen_name || ''}
                onChange={(e) => setScreenName(e.target.value)}
                placeholder={user.screen_name || "Enter your screen name"}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                disabled={updatingScreenName}
              />
            </div>

            {/* Email Field (Read-only) */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
              <input 
                type="email" 
                id="email" 
                value={user.email}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-600 cursor-not-allowed"
                disabled
                title="Email cannot be changed"
              />
              <p className="text-xs text-slate-500 mt-1">Email address cannot be changed</p>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end mt-6">
            <button 
              onClick={updateScreenName}
              disabled={updatingScreenName || !screenName.trim() || screenName === user.screen_name}
              className={`font-semibold px-6 py-3 rounded-xl shadow-md transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                updatingScreenName || !screenName.trim() || screenName === user.screen_name
                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
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