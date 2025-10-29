/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState, Suspense } from 'react'
import CampaignManager from './components/CampaignManager'
import CharacterManager from './components/CharacterManager'
import ProfileManager from './components/ProfileManager'
import FriendsManager from './components/FriendsManager'
import DashboardLayout from './components/DashboardLayout'
import ScreenNameModal from './components/ScreenNameModal'
import { useAuth } from './hooks/useAuth'

function DashboardContent() {
  const [activeSection, setActiveSection] = useState('characters')
  
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
          <CampaignManager user={user} />
        </section>
      )}

      {/* Friends Section */}
      {activeSection === 'friends' && (
        <section>
          <FriendsManager user={user} />
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