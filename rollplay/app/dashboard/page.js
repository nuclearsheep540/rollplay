/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import CampaignManager from './components/CampaignManager'
import CharacterManager from './components/CharacterManager'
import { AssetLibraryManager } from '../asset_library'
import DashboardLayout from './components/DashboardLayout'
import SocialManager from './components/SocialManager'
import FriendsWidget from './components/FriendsWidget'
import ScreenNameModal from './components/ScreenNameModal'
import AccountNameModal from './components/AccountNameModal'
import { useAuth } from './hooks/useAuth'
import { useEvents } from '../shared/hooks/useEvents'
import { useToast } from '../shared/hooks/useToast'
import { useEventQueryInvalidation } from './hooks/useEventQueryInvalidation'
import { getEventConfig } from '../shared/config/eventConfig'

function DashboardContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const tabParam = searchParams.get('tab')
  const inviteCampaignId = searchParams.get('invite_campaign_id')
  const expandCampaignId = searchParams.get('expand_campaign_id')
  const [activeSection, setActiveSection] = useState(tabParam || 'campaigns')
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

  // Clear invite_campaign_id param from URL (called by CampaignManager after checking)
  const clearInviteCampaignId = () => {
    const current = new URLSearchParams(searchParams.toString())
    current.delete('invite_campaign_id')
    const newUrl = current.toString() ? `/dashboard?${current.toString()}` : '/dashboard'
    router.replace(newUrl)
  }

  // Clear expand_campaign_id param from URL (called by CampaignManager after expanding)
  const clearExpandCampaignId = () => {
    const current = new URLSearchParams(searchParams.toString())
    current.delete('expand_campaign_id')
    const newUrl = current.toString() ? `/dashboard?${current.toString()}` : '/dashboard'
    router.replace(newUrl)
  }

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

  // TanStack Query invalidation bridge for WebSocket events
  const invalidation = useEventQueryInvalidation()

  // WebSocket event handlers for real-time updates
  const eventHandlers = {
    // Friend request events
    'friend_request_received': (message) => {
      invalidation.invalidateFriendships()
      invalidation.invalidateNotifications()
      if (message.show_toast) {
        const config = getEventConfig('friend_request_received')
        showToast({
          type: config.toastType,
          message: config.toastMessage
        })
      }
    },

    'friend_request_accepted': (message) => {
      invalidation.invalidateFriendships()
      invalidation.invalidateNotifications()
      if (message.show_toast) {
        const config = getEventConfig('friend_request_accepted')
        showToast({
          type: config.toastType,
          message: config.toastMessage
        })
      }
    },

    'friend_request_declined': (message) => {
      invalidation.invalidateFriendships()
      invalidation.invalidateNotifications()
      if (message.show_toast) {
        const config = getEventConfig('friend_request_declined')
        showToast({
          type: config.toastType,
          message: config.toastMessage
        })
      }
    },

    'friend_removed': (message) => {
      invalidation.invalidateFriendships()
      invalidation.invalidateNotifications()
      if (message.show_toast) {
        const config = getEventConfig('friend_removed')
        showToast({
          type: config.toastType,
          message: config.toastMessage
        })
      }
    },

    // Buzz events (fun notification, no state refresh needed)
    'friend_buzzed': (message) => {
      if (message.show_toast) {
        const config = getEventConfig('friend_buzzed')
        showToast({
          type: config.toastType,
          message: config.panelMessage(message.data)
        })
      }
    },

    'buzz_sent': (message) => {
      if (message.show_toast) {
        const config = getEventConfig('buzz_sent')
        showToast({
          type: config.toastType,
          message: config.panelMessage(message.data)
        })
      }
    },

    // Campaign invite events
    'campaign_invite_received': (message) => {
      invalidation.invalidateCampaigns()
      if (message.show_toast) {
        const config = getEventConfig('campaign_invite_received')
        showToast({
          type: config.toastType,
          message: config.toastMessage
        })
      }
    },

    'campaign_invite_sent': (message) => {
      // No state refresh needed - just confirmation toast
      if (message.show_toast) {
        const config = getEventConfig('campaign_invite_sent')
        showToast({
          type: config.toastType,
          message: config.panelMessage(message.data)
        })
      }
    },

    'campaign_invite_accepted': (message) => {
      invalidation.invalidateCampaigns()
      if (message.show_toast) {
        const config = getEventConfig('campaign_invite_accepted')
        showToast({
          type: config.toastType,
          message: config.toastMessage
        })
      }
    },

    'campaign_invite_declined': (message) => {
      invalidation.invalidateCampaigns()
      if (message.show_toast) {
        const config = getEventConfig('campaign_invite_declined')
        showToast({
          type: config.toastType,
          message: config.toastMessage
        })
      }
    },

    'campaign_player_removed': (message) => {
      // Invalidate campaigns — derived state handles removing stale expanded views
      invalidation.invalidateCampaigns()
      if (message.show_toast) {
        const config = getEventConfig('campaign_player_removed')
        showToast({
          type: config.toastType,
          message: config.toastMessage
        })
      }
    },

    'campaign_player_removed_confirmation': (message) => {
      // No state refresh needed - host already has updated state
      if (message.show_toast) {
        const config = getEventConfig('campaign_player_removed_confirmation')
        showToast({
          type: config.toastType,
          message: config.panelMessage(message.data)
        })
      }
    },

    'campaign_player_left': (message) => {
      invalidation.invalidateCampaigns()
      if (message.show_toast) {
        const config = getEventConfig('campaign_player_left')
        showToast({
          type: config.toastType,
          message: config.panelMessage(message.data)
        })
      }
    },

    'campaign_player_left_confirmation': (message) => {
      // Invalidate campaigns — derived state handles removing stale expanded views
      invalidation.invalidateCampaigns()
      if (message.show_toast) {
        const config = getEventConfig('campaign_player_left_confirmation')
        showToast({
          type: config.toastType,
          message: config.toastMessage
        })
      }
    },

    'campaign_invite_canceled': (message) => {
      invalidation.invalidateCampaigns()
      if (message.show_toast) {
        const config = getEventConfig('campaign_invite_canceled')
        showToast({
          type: config.toastType,
          message: config.toastMessage
        })
      }
    },

    'campaign_invite_canceled_confirmation': (message) => {
      // No state refresh needed - host already has updated state
      if (message.show_toast) {
        const config = getEventConfig('campaign_invite_canceled_confirmation')
        showToast({
          type: config.toastType,
          message: config.panelMessage(message.data)
        })
      }
    },

    // Session events (new naming convention)
    'session_created': (message) => {
      invalidation.invalidateCampaigns()
      invalidation.invalidateNotifications()
    },

    'session_started': (message) => {
      invalidation.invalidateCampaigns()
      invalidation.invalidateNotifications()

      if (message.show_toast) {
        const config = getEventConfig('session_started')
        showToast({
          type: config.toastType,
          message: config.toastMessage
        })
      }
    },

    'session_paused': (message) => {
      invalidation.invalidateCampaigns()
      invalidation.invalidateNotifications()

      if (message.show_toast) {
        const config = getEventConfig('session_paused')
        showToast({
          type: config.toastType,
          message: config.toastMessage
        })
      }
    },

    'session_finished': (message) => {
      invalidation.invalidateCampaigns()
      invalidation.invalidateNotifications()

      if (message.show_toast) {
        const config = getEventConfig('session_finished')
        showToast({
          type: config.toastType,
          message: config.toastMessage
        })
      }
    },

    // Legacy game event names (for backward compatibility)
    'game_created': (message) => {
      invalidation.invalidateCampaigns()
    },

    'game_started': (message) => {
      invalidation.invalidateCampaigns()

      if (message.show_toast) {
        const config = getEventConfig('game_started')
        showToast({
          type: config.toastType,
          message: config.toastMessage
        })
      }
    },

    'game_ended': (message) => {
      invalidation.invalidateCampaigns()

      if (message.show_toast) {
        const config = getEventConfig('game_ended')
        showToast({
          type: config.toastType,
          message: config.toastMessage
        })
      }
    },

    'game_finished': (message) => {
      invalidation.invalidateCampaigns()
    },

    // Character selection events (silent — cache invalidation only)
    'campaign_character_selected': (message) => {
      invalidation.invalidateCampaigns()
      invalidation.invalidateNotifications()
    },

    'campaign_character_released': (message) => {
      invalidation.invalidateCampaigns()
      invalidation.invalidateNotifications()
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
      toasts={toasts}
      onDismissToast={dismissToast}
      isChildExpanded={isChildExpanded}
    >
      {/* Campaigns Section */}
      {activeSection === 'campaigns' && (
        <section className="flex-1 flex flex-col min-h-0">
          <CampaignManager
            user={user}
            onExpandedChange={setIsChildExpanded}
            inviteCampaignId={inviteCampaignId}
            clearInviteCampaignId={clearInviteCampaignId}
            expandCampaignId={expandCampaignId}
            clearExpandCampaignId={clearExpandCampaignId}
            showToast={showToast}
          />
        </section>
      )}

      {/* Characters Section */}
      {activeSection === 'characters' && (
        <section className="flex-1 flex flex-col min-h-0">
          <CharacterManager user={user} onExpandedChange={setIsChildExpanded} />
        </section>
      )}

      {/* Library Section - Asset Management */}
      {activeSection === 'library' && (
        <section className="flex-1 flex flex-col min-h-0">
          <AssetLibraryManager user={user} />
        </section>
      )}

      {/* Account Section - Profile and Friends */}
      {activeSection === 'account' && (
        <section>
          <SocialManager
            user={user}
            onUserUpdate={setUser}
          />
        </section>
      )}

      {/* Friends Widget - Fixed bottom-right widget on all tabs EXCEPT Account, hidden when child is expanded */}
      {activeSection !== 'account' && !isChildExpanded && (
        <FriendsWidget user={user} />
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