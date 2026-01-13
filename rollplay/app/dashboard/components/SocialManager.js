/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { THEME } from '@/app/styles/colorTheme'
import ProfileManager from './ProfileManager'
import FriendsManager from './FriendsManager'

export default function SocialManager({ user, refreshTrigger, onUserUpdate }) {
  return (
    <div className="space-y-8">
      {/* Profile Section */}
      <ProfileManager user={user} onUserUpdate={onUserUpdate} />

      {/* Divider */}
      <div className="border-t" style={{borderColor: THEME.borderSubtle}}></div>

      {/* Friends Section */}
      <FriendsManager user={user} refreshTrigger={refreshTrigger} />
    </div>
  )
}
