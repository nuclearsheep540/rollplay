/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

export default function ScreenNameModal({ 
  show, 
  screenName, 
  setScreenName, 
  onUpdate, 
  updating, 
  error 
}) {
  if (!show) return null

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && screenName.trim()) {
      onUpdate()
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <div className="text-center mb-6">
          <h3 className="text-2xl font-bold text-slate-800 mb-2">Welcome to Tabletop Tavern! 🎲</h3>
          <p className="text-slate-600">To get started, please choose a screen name that other players will see.</p>
        </div>
        
        <div className="mb-4">
          <label htmlFor="newScreenName" className="block text-sm font-medium text-slate-700 mb-2">
            Choose Your Screen Name
          </label>
          <input
            type="text"
            id="newScreenName"
            value={screenName}
            onChange={(e) => setScreenName(e.target.value)}
            placeholder="Enter your screen name..."
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            disabled={updating}
            onKeyPress={handleKeyPress}
          />
          <p className="text-xs text-slate-500 mt-1">You can change this later in your profile settings.</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        <div className="flex justify-center">
          <button
            onClick={onUpdate}
            disabled={updating || !screenName.trim()}
            className={`px-6 py-2 rounded-md font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
              updating || !screenName.trim()
                ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                : 'bg-indigo-600 text-white hover:bg-indigo-700'
            }`}
          >
            {updating ? 'Setting up...' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  )
}