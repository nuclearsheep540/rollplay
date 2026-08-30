/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import CampaignManager from '@/app/dashboard/components/CampaignManager'
import CharacterManager from '@/app/dashboard/components/CharacterManager'
import { AssetLibraryManager } from '@/app/asset_library'
import { WorkshopManager } from '@/app/workshop'
import DashboardLayout from '@/app/dashboard/components/DashboardLayout'
import HomeManager from '@/app/dashboard/components/home/HomeManager'
import AccountNameModal from '@/app/dashboard/components/AccountNameModal'
import InDevWarningModal from '@/app/dashboard/components/InDevWarningModal'
import { useAuthenticated } from '@/app/shared/providers/AuthenticatedContext'

// Valid `?tab=` values. Account lives at its own `/account` route, so it
// isn't a dashboard tab. Anything else - including no tab at all - is Home.
const VALID_TABS = ['characters', 'campaigns', 'library', 'workshop', 'market']

function DashboardContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const tabParam = searchParams.get('tab')
  const inviteCampaignId = searchParams.get('invite_campaign_id')
  const expandCampaignId = searchParams.get('expand_campaign_id')
  const expandCharacterId = searchParams.get('expand_character_id')
  const openCreateCampaign = searchParams.get('create_campaign') === '1'
  const [activeSection, setActiveSection] = useState(
    VALID_TABS.includes(tabParam) ? tabParam : 'home'
  )
  const [isChildExpanded, setIsChildExpanded] = useState(false)
  const [showInDevWarning, setShowInDevWarning] = useState(false)

  // Auth + toast state come from the (authenticated) layout context.
  // The layout already guarantees we have a user by the time this
  // component mounts, so no loading fallback is needed here.
  const {
    user,
    setUser,
    showScreenNameModal,
    setShowScreenNameModal,
    showToast,
  } = useAuthenticated()

  // Show setup modal if user is missing account name or screen name
  const showSetupModal = user && (!user.account_name || (showScreenNameModal && !user.screen_name))

  // Show in-dev warning once per login (flag set during auth redirect)
  useEffect(() => {
    if (user && !showSetupModal && sessionStorage.getItem('just_logged_in')) {
      sessionStorage.removeItem('just_logged_in')
      setShowInDevWarning(true)
    }
  }, [user, showSetupModal])

  // Sync activeSection when the URL tab parameter changes (e.g. from a
  // notification click, or navigating back to bare /dashboard).
  useEffect(() => {
    setActiveSection(VALID_TABS.includes(tabParam) ? tabParam : 'home')
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

  // Clear create_campaign param from URL (called by CampaignManager after
  // opening the form). Mirrors the expand flows.
  const clearOpenCreateCampaign = () => {
    const current = new URLSearchParams(searchParams.toString())
    current.delete('create_campaign')
    const newUrl = current.toString() ? `/dashboard?${current.toString()}` : '/dashboard'
    router.replace(newUrl)
  }

  // Clear expand_character_id param from URL (called by CharacterManager
  // after auto-expanding the matching drawer). Mirrors the campaigns flow.
  const clearExpandCharacterId = () => {
    const current = new URLSearchParams(searchParams.toString())
    current.delete('expand_character_id')
    const newUrl = current.toString() ? `/dashboard?${current.toString()}` : '/dashboard'
    router.replace(newUrl)
  }

  // Handle setup completion - update user state with new account info and screen name
  const handleSetupComplete = (accountResult, screenNameValue) => {
    if (user) {
      const updates = {}
      if (accountResult) {
        updates.account_name = accountResult.account_name
        updates.account_tag = accountResult.account_tag
        updates.account_identifier = accountResult.account_identifier
      }
      if (screenNameValue) {
        updates.screen_name = screenNameValue
      }
      setUser({ ...user, ...updates })
      setShowScreenNameModal(false)
    }
  }

  return (
    <DashboardLayout
      isChildExpanded={isChildExpanded}
      isChildFullBleed={activeSection === 'library' || activeSection === 'characters'}
    >
      {/* Home Section - the default landing surface */}
      {activeSection === 'home' && (
        <section className="flex-1 flex flex-col min-h-0">
          <HomeManager user={user} />
        </section>
      )}

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
            openCreateCampaign={openCreateCampaign}
            clearOpenCreateCampaign={clearOpenCreateCampaign}
            showToast={showToast}
          />
        </section>
      )}

      {/* Characters Section */}
      {activeSection === 'characters' && (
        <section className="flex-1 flex flex-col min-h-0">
          <CharacterManager
            user={user}
            onExpandedChange={setIsChildExpanded}
            expandCharacterId={expandCharacterId}
            clearExpandCharacterId={clearExpandCharacterId}
          />
        </section>
      )}

      {/* Library Section - Asset Management */}
      {activeSection === 'library' && (
        <section className="flex-1 flex flex-col min-h-0">
          <AssetLibraryManager user={user} />
        </section>
      )}

      {/* Workshop Section - Asset Authoring */}
      {activeSection === 'workshop' && (
        <section className="flex-1 flex flex-col min-h-0">
          <WorkshopManager user={user} />
        </section>
      )}

      {/* Market Section - Campaign sharing (placeholder) */}
      {activeSection === 'market' && (
        <section className="flex-1 flex flex-col items-center justify-center min-h-0 text-center">
          <h2 className="text-3xl font-bold font-[family-name:var(--font-metamorphous)] text-content-bold mb-3">
            Market
          </h2>
          <p className="text-content-primary max-w-md">
            A place to share campaigns, adventures, and assets with the community.
          </p>
          <p className="mt-4 text-xs uppercase tracking-widest text-content-secondary">
            Coming soon
          </p>
        </section>
      )}

      {/* Account Setup Modal (account name + screen name in one form) */}
      <AccountNameModal
        show={showSetupModal}
        user={user}
        onComplete={handleSetupComplete}
      />

      {/* In-development warning - shown every login, after setup modal if applicable */}
      <InDevWarningModal
        show={showInDevWarning && !showSetupModal}
        onClose={() => setShowInDevWarning(false)}
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
