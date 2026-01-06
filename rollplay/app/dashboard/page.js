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
import AccountNameModal from './components/AccountNameModal'
import { useAuth } from './hooks/useAuth'
import { useEvents } from '../shared/hooks/useEvents'
import { useToast } from '../shared/hooks/useToast'
import { getEventConfig } from '../shared/config/eventConfig'

function DashboardContent() {
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  const [activeSection, setActiveSection] = useState(tabParam || 'campaigns')
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  // Sync activeSection when URL tab parameter changes (e.g., from notification click)
  useEffect(() => {
    if (tabParam && tabParam !== activeSection) {
      setActiveSection(tabParam)
    }
  }, [tabParam])

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

  // Check if user needs to set account name (shown before screen name modal)
  const showAccountNameModal = user && !user.account_name

  // Handle account name completion - update user state with new account info
  const handleAccountNameComplete = (result) => {
    if (result && user) {
      setUser({
        ...user,
        account_name: result.account_name,
        account_tag: result.account_tag,
        account_identifier: result.account_identifier
      })
    }
  }

  // Toast notifications
  const { toasts, showToast, dismissToast } = useToast()

  // WebSocket event handlers for real-time updates
  const eventHandlers = {
    // Friend request events
    'friend_request_received': (message) => {
      setRefreshTrigger(prev => prev + 1)
      if (message.show_toast) {
        const config = getEventConfig('friend_request_received')
        showToast({
          type: config.toastType,
          message: config.toastMessage
        })
      }
    },

    'friend_request_accepted': (message) => {
      setRefreshTrigger(prev => prev + 1)
      if (message.show_toast) {
        const config = getEventConfig('friend_request_accepted')
        showToast({
          type: config.toastType,
          message: config.toastMessage
        })
      }
    },

    'friend_request_declined': (message) => {
      setRefreshTrigger(prev => prev + 1)
      if (message.show_toast) {
        const config = getEventConfig('friend_request_declined')
        showToast({
          type: config.toastType,
          message: config.toastMessage
        })
      }
    },

    'friend_removed': (message) => {
      setRefreshTrigger(prev => prev + 1)
      if (message.show_toast) {
        const config = getEventConfig('friend_removed')
        showToast({
          type: config.toastType,
          message: config.toastMessage
        })
      }
    },

    // Campaign invite events
    'campaign_invite_received': (message) => {
      setRefreshTrigger(prev => prev + 1)
      if (message.show_toast) {
        const config = getEventConfig('campaign_invite_received')
        showToast({
          type: config.toastType,
          message: config.toastMessage
        })
      }
    },

    'campaign_invite_accepted': (message) => {
      setRefreshTrigger(prev => prev + 1)
      if (message.show_toast) {
        const config = getEventConfig('campaign_invite_accepted')
        showToast({
          type: config.toastType,
          message: config.toastMessage
        })
      }
    },

    'campaign_invite_declined': (message) => {
      setRefreshTrigger(prev => prev + 1)
      if (message.show_toast) {
        const config = getEventConfig('campaign_invite_declined')
        showToast({
          type: config.toastType,
          message: config.toastMessage
        })
      }
    },

    'campaign_player_removed': (message) => {
      setRefreshTrigger(prev => prev + 1)
      if (message.show_toast) {
        const config = getEventConfig('campaign_player_removed')
        showToast({
          type: config.toastType,
          message: config.toastMessage
        })
      }
    },

    // Game session events
    'game_started': (message) => {
      setRefreshTrigger(prev => prev + 1)
      if (message.show_toast) {
        const config = getEventConfig('game_started')
        showToast({
          type: config.toastType,
          message: config.toastMessage
        })
      }
    },

    'game_ended': (message) => {
      setRefreshTrigger(prev => prev + 1)
      if (message.show_toast) {
        const config = getEventConfig('game_ended')
        showToast({
          type: config.toastType,
          message: config.toastMessage
        })
      }
    },

    'game_finished': (message) => {
      setRefreshTrigger(prev => prev + 1)
      if (message.show_toast) {
        const config = getEventConfig('game_finished')
        showToast({
          type: config.toastType,
          message: config.toastMessage
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
      toasts={toasts}
      onDismissToast={dismissToast}
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

      {/* Account Name Setup Modal (shown first, before screen name) */}
      <AccountNameModal
        show={showAccountNameModal}
        onComplete={handleAccountNameComplete}
      />

      {/* Screen Name Setup Modal (shown after account name is set) */}
      <ScreenNameModal
        show={showScreenNameModal && !showAccountNameModal}
        screenName={screenName}
        setScreenName={setScreenName}
        onUpdate={updateScreenName}
        updating={updatingScreenName}
        error={error}
      />
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