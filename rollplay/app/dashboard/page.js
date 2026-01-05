/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import CampaignManager from './components/CampaignManager'
import CharacterManager from './components/CharacterManager'
import ProfileManager from './components/ProfileManager'
import FriendsManager from './components/FriendsManager'
import GamesManager from './components/GamesManager'
import DashboardLayout from './components/DashboardLayout'
import ScreenNameModal from './components/ScreenNameModal'
import { useAuth } from './hooks/useAuth'
import { useEvents } from '../shared/hooks/useEvents'
import { useToast } from '../shared/hooks/useToast'
import { ToastContainer } from '../shared/components/ToastNotification'

function DashboardContent() {
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  const [activeSection, setActiveSection] = useState(tabParam || 'campaigns')
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  // Use auth hook for all authentication-related state and logic
  const {
    user,
    setUser,
    loading,
    error,
    screenName,
    setScreenName,
    updatingScreenName,
    showScreenNameModal,
    setShowScreenNameModal,
    updateScreenName,
    handleLogout,
    setError
  } = useAuth()

  // Toast notifications
  const { toasts, showToast, dismissToast } = useToast()

  // WebSocket event handlers for real-time updates
  const eventHandlers = {
    // Friend request events
    'friend_request_received': (message) => {
      setRefreshTrigger(prev => prev + 1)
      if (message.show_toast) {
        showToast({
          type: 'info',
          message: 'New friend request'
        })
      }
    },

    'friend_request_accepted': (message) => {
      setRefreshTrigger(prev => prev + 1)
      if (message.show_toast) {
        showToast({
          type: 'success',
          message: 'Friend request accepted'
        })
      }
    },

    // Campaign invite events
    'campaign_invite_received': (message) => {
      setRefreshTrigger(prev => prev + 1)
      if (message.show_toast) {
        showToast({
          type: 'info',
          message: 'New campaign invite'
        })
      }
    },

    'campaign_invite_accepted': (message) => {
      setRefreshTrigger(prev => prev + 1)
      if (message.show_toast) {
        showToast({
          type: 'success',
          message: 'Player joined campaign'
        })
      }
    },

    'campaign_player_removed': (message) => {
      setRefreshTrigger(prev => prev + 1)
      if (message.show_toast) {
        showToast({
          type: 'warning',
          message: 'Removed from campaign'
        })
      }
    },

    // Game session events
    'game_started': (message) => {
      setRefreshTrigger(prev => prev + 1)
      if (message.show_toast) {
        showToast({
          type: 'success',
          message: 'Game session started'
        })
      }
    },

    'game_ended': (message) => {
      setRefreshTrigger(prev => prev + 1)
      if (message.show_toast) {
        showToast({
          type: 'info',
          message: 'Game session ended'
        })
      }
    },

    'game_finished': (message) => {
      setRefreshTrigger(prev => prev + 1)
      if (message.show_toast) {
        showToast({
          type: 'success',
          message: 'Campaign milestone completed'
        })
      }
    }
  }

  // Connect to WebSocket events (replaces polling)
  const { isConnected } = useEvents(user?.id, eventHandlers)



  if (!user || loading) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-slate-600">Loading...</div>
    </div>
  }

  return (
    <DashboardLayout
      activeSection={activeSection}
      setActiveSection={setActiveSection}
      onLogout={handleLogout}
      user={user}
      refreshTrigger={refreshTrigger}
    >
      {/* Characters Section */}
      {activeSection === 'characters' && (
        <section>
          <CharacterManager user={user} />
        </section>
      )}

      {/* Campaigns Section */}
      {activeSection === 'campaigns' && (
        <section>
          <CampaignManager user={user} refreshTrigger={refreshTrigger} />
        </section>
      )}

      {/* Sessions Section */}
      {activeSection === 'sessions' && (
        <section>
          <GamesManager user={user} refreshTrigger={refreshTrigger} />
        </section>
      )}

      {/* Friends Section */}
      {activeSection === 'friends' && (
        <section>
          <FriendsManager user={user} refreshTrigger={refreshTrigger} />
        </section>
      )}

      {/* Profile Section */}
      {activeSection === 'profile' && (
        <section>
          <ProfileManager user={user} onUserUpdate={setUser} />
        </section>
      )}

      {/* Screen Name Setup Modal */}
      <ScreenNameModal
        show={showScreenNameModal}
        screenName={screenName}
        setScreenName={setScreenName}
        onUpdate={updateScreenName}
        updating={updatingScreenName}
        error={error}
      />

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </DashboardLayout>
  )
}

export default function Dashboard() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-slate-600">Loading...</div>
    </div>}>
      <DashboardContent />
    </Suspense>
  )
}