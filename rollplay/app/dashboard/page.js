/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import CampaignManager from './components/CampaignManager'
import CharacterManager from './components/CharacterManager'
import DashboardLayout from './components/DashboardLayout'
import SocialManager from './components/SocialManager'
import FriendsWidget from './components/FriendsWidget'
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
  const [campaignUpdateHandlers, setCampaignUpdateHandlers] = useState(null)
  const [isChildExpanded, setIsChildExpanded] = useState(false)

  // Sync activeSection when URL tab parameter changes (e.g., from notification click)
  useEffect(() => {
    if (tabParam && tabParam !== activeSection) {
      setActiveSection(tabParam)
    }
  }, [tabParam])

  // Reset expanded state when switching tabs (components manage their own expanded state)
  useEffect(() => {
    setIsChildExpanded(false)
  }, [activeSection])

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

  // Helper function to update game state (targeted or full refresh)
  const updateGameState = (campaignId) => {
    if (campaignUpdateHandlers?.updateGames && campaignId) {
      campaignUpdateHandlers.updateGames(campaignId)
    } else {
      setRefreshTrigger(prev => prev + 1)
    }
  }

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
    'game_created': (message) => {
      // Silent state update - no toast notification
      updateGameState(message.data?.campaign_id)
    },

    'game_started': (message) => {
      updateGameState(message.data?.campaign_id)

      if (message.show_toast) {
        const config = getEventConfig('game_started')
        showToast({
          type: config.toastType,
          message: config.toastMessage
        })
      }
    },

    'game_ended': (message) => {
      updateGameState(message.data?.campaign_id)

      if (message.show_toast) {
        const config = getEventConfig('game_ended')
        showToast({
          type: config.toastType,
          message: config.toastMessage
        })
      }
    },

    'game_finished': (message) => {
      // Silent state update - no toast notification
      updateGameState(message.data?.campaign_id)
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
      isChildExpanded={isChildExpanded}
    >
      {/* Campaigns Section */}
      {activeSection === 'campaigns' && (
        <section className="flex-1 flex flex-col min-h-0">
          <CampaignManager
            user={user}
            refreshTrigger={refreshTrigger}
            onCampaignUpdate={setCampaignUpdateHandlers}
            onExpandedChange={setIsChildExpanded}
          />
        </section>
      )}

      {/* Characters Section */}
      {activeSection === 'characters' && (
        <section className="flex-1 flex flex-col min-h-0">
          <CharacterManager user={user} onExpandedChange={setIsChildExpanded} />
        </section>
      )}

      {/* Account Section - Profile and Friends */}
      {activeSection === 'account' && (
        <section>
          <SocialManager
            user={user}
            refreshTrigger={refreshTrigger}
            onUserUpdate={setUser}
          />
        </section>
      )}

      {/* Friends Widget - Fixed bottom-right widget on all tabs EXCEPT Account, hidden when child is expanded */}
      {activeSection !== 'account' && !isChildExpanded && (
        <FriendsWidget user={user} refreshTrigger={refreshTrigger} />
      )}

      {/* Account Name Setup Modal (shown first, before screen name) */}
      <AccountNameModal
        show={showAccountNameModal}
        user={user}
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