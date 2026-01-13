/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { THEME, COLORS } from '@/app/styles/colorTheme'
import ProfileManager from './ProfileManager'
import FriendsManager from './FriendsManager'
import AccountNotificationFeed from './AccountNotificationFeed'

// Send test notification (dev only)
const sendTestNotification = async () => {
  try {
    await fetch('/api/notifications/test-notification', {
      method: 'POST',
      credentials: 'include'
    })
    console.log('Test notification sent')
  } catch (error) {
    console.error('Failed to send test notification:', error)
  }
}

export default function SocialManager({ user, refreshTrigger, onUserUpdate }) {
  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold font-[family-name:var(--font-metamorphous)]" style={{color: THEME.textBold}}>
          Account
        </h1>
        <p className="mt-2" style={{color: THEME.textPrimary}}>
          Manage your profile, friends, and view recent activity
        </p>
      </div>

      {/* Top Row: Profile (left) + Notification Feed (right) - aligned heights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        <ProfileManager user={user} onUserUpdate={onUserUpdate} />
        <AccountNotificationFeed userId={user?.id} refreshTrigger={refreshTrigger} />
      </div>

      {/* Divider */}
      <div className="border-t" style={{borderColor: THEME.borderSubtle}}></div>

      {/* Friends Section - Full Width (has its own header) */}
      <FriendsManager user={user} refreshTrigger={refreshTrigger} />

      {/* Development Tools (dev only) */}
      {process.env.NODE_ENV === 'development' && (
        <div
          className="p-4 rounded-sm border"
          style={{backgroundColor: '#422006', borderColor: '#ca8a04'}}
        >
          <h3 className="text-sm font-semibold mb-2" style={{color: '#fef08a'}}>
            Development Tools
          </h3>
          <p className="text-xs mb-3" style={{color: '#fde047'}}>
            These tools are only visible in development mode.
          </p>
          <button
            onClick={sendTestNotification}
            className="px-4 py-2 rounded-sm font-semibold text-sm transition-opacity hover:opacity-80"
            style={{backgroundColor: '#ca8a04', color: '#422006'}}
          >
            Send Test Notification
          </button>
        </div>
      )}
    </div>
  )
}
