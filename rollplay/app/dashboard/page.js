/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState, useEffect, Suspense } from 'react'
import CampaignManager from './components/CampaignManager'
import CharacterManager from './components/CharacterManager'
import ProfileManager from './components/ProfileManager'
import FriendsManager from './components/FriendsManager'
import GamesManager from './components/GamesManager'
import DashboardLayout from './components/DashboardLayout'
import ScreenNameModal from './components/ScreenNameModal'
import { useAuth } from './hooks/useAuth'

function DashboardContent() {
  const [activeSection, setActiveSection] = useState('campaigns')
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

  // Poll for updates every 5 seconds for the active tab
  useEffect(() => {
    // Only poll for tabs that need it
    const pollableTabs = ['campaigns', 'sessions', 'friends']
    if (!pollableTabs.includes(activeSection)) return

    const interval = setInterval(() => {
      setRefreshTrigger(prev => prev + 1)
    }, 5000)

    return () => clearInterval(interval)
  }, [activeSection])



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