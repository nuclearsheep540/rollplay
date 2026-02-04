/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import Modal from '@/app/shared/components/Modal'
import FormField from '@/app/shared/components/FormField'

export default function ScreenNameModal({
  show,
  screenName,
  setScreenName,
  onUpdate,
  updating,
  error
}) {
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && screenName.trim()) {
      onUpdate()
    }
  }

  return (
    <Modal open={show} onClose={() => {}} size="md">
      <div className="p-6">
        <div className="text-center mb-6">
          <h3 className="text-2xl font-bold text-content-on-dark mb-2">Welcome to Tabletop Tavern!</h3>
          <p className="text-content-secondary">To get started, please choose a screen name that other players will see.</p>
        </div>

        <FormField
          label="Choose Your Screen Name"
          id="newScreenName"
          error={error}
          helperText="You can change this later in your profile settings."
        >
          <input
            type="text"
            id="newScreenName"
            value={screenName}
            onChange={(e) => setScreenName(e.target.value)}
            placeholder="Enter your screen name..."
            className="w-full px-3 py-2 border rounded-sm focus:outline-none focus:ring-2 bg-surface-elevated border-border text-content-on-dark focus:ring-border-active focus:border-border-active"
            disabled={updating}
            onKeyPress={handleKeyPress}
          />
        </FormField>

        <div className="flex justify-center">
          <button
            onClick={onUpdate}
            disabled={updating || !screenName.trim()}
            className={`px-6 py-2 rounded-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-border-active ${
              updating || !screenName.trim()
                ? 'bg-surface-elevated text-content-secondary cursor-not-allowed'
                : 'bg-interactive-hover text-content-primary hover:brightness-110'
            }`}
          >
            {updating ? 'Setting up...' : 'Continue'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
