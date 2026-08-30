/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { Suspense, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { faRightFromBracket, faUser } from '@fortawesome/free-solid-svg-icons'

import SiteHeader from '@/app/shared/components/SiteHeader'
import SocialPanel from '@/app/shared/components/SocialPanel'
import Dropdown from '@/app/shared/components/Dropdown'
import { useAuth } from '@/app/dashboard/hooks/useAuth'
import { useToast } from '@/app/shared/hooks/useToast'
import { useAuthenticatedEvents } from '@/app/shared/hooks/useAuthenticatedEvents'
import { AuthenticatedContext } from '@/app/shared/providers/AuthenticatedContext'
import { THEME } from '@/app/styles/colorTheme'
import UserDisc from '@/app/shared/components/UserDisc'

function AuthenticatedShell({ children }) {
  const router = useRouter()
  const auth = useAuth()
  const { toasts, showToast, dismissToast } = useToast()

  // One persistent WebSocket subscription for the whole authenticated
  // route group. Handlers live in useAuthenticatedEvents.
  useAuthenticatedEvents(auth.user?.id, showToast)

  // Screen name is the display name; it can be unset ('') before the
  // account setup modal runs.
  const chipName = auth.user?.screen_name || auth.user?.account_name || auth.user?.email

  // Redirect unauthenticated users out of the authenticated group.
  useEffect(() => {
    if (!auth.loading && !auth.user) {
      router.replace('/')
    }
  }, [auth.loading, auth.user, router])

  if (!auth.user || auth.loading) {
    return (
      <div
        className="h-screen flex items-center justify-center"
        style={{ backgroundColor: THEME.bgPrimary }}
      >
        <div style={{ color: THEME.textSecondary }}>Loading...</div>
      </div>
    )
  }

  return (
    <AuthenticatedContext.Provider
      value={{
        ...auth,
        toasts,
        showToast,
        dismissToast,
      }}
    >
      <div
        className="h-screen flex flex-col"
        style={{ backgroundColor: THEME.bgPrimary, color: THEME.textPrimary }}
      >
        {/* Persistent header — doesn't remount on route changes inside
            the authenticated group. The wordmark anchors Home; the user
            chip owns account access and sign-out. */}
        <SiteHeader>
          <SocialPanel
            user={auth.user}
            toasts={toasts}
            onDismissToast={dismissToast}
          />
          <Dropdown
            trigger={
              <button
                aria-label="Account menu"
                className="flex items-center gap-2.5 px-2 py-1 rounded-sm hover:bg-white/[0.07] transition-colors"
              >
                <span
                  className="text-sm font-semibold"
                  style={{ color: THEME.textOnDark }}
                >
                  {chipName}
                </span>
                {/* Same UserDisc as friend rows and the account page, so
                    colour and treatment never drift. Keep w-9: a smaller box
                    lets the border-2 ring eat into the coloured fill. */}
                <UserDisc
                  userId={auth.user?.id}
                  color={auth.user?.color}
                  name={auth.user?.account_name || auth.user?.screen_name || auth.user?.email}
                  className="w-9 h-9 text-base border-2 border-black/40"
                />
              </button>
            }
            items={[
              { label: 'Account', icon: faUser, onClick: () => router.push('/account') },
              { label: 'Sign out', icon: faRightFromBracket, onClick: auth.handleLogout },
            ]}
          />
        </SiteHeader>

        {children}
      </div>
    </AuthenticatedContext.Provider>
  )
}

export default function AuthenticatedLayout({ children }) {
  return (
    <Suspense
      fallback={
        <div
          className="h-screen flex items-center justify-center"
          style={{ backgroundColor: THEME.bgPrimary }}
        >
          <div style={{ color: THEME.textSecondary }}>Loading...</div>
        </div>
      }
    >
      <AuthenticatedShell>{children}</AuthenticatedShell>
    </Suspense>
  )
}
