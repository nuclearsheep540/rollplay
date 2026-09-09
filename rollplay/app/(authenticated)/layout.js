/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { faRightFromBracket, faUser } from '@fortawesome/free-solid-svg-icons'

import SiteHeader from '@/app/shared/components/SiteHeader'
import SocialPanel from '@/app/shared/components/SocialPanel'
import AppLauncher from '@/app/shared/components/AppLauncher'
import Dropdown from '@/app/shared/components/Dropdown'
import { useAuth } from '@/app/dashboard/hooks/useAuth'
import { useToast } from '@/app/shared/hooks/useToast'
import { usePulse } from '@/app/shared/hooks/usePulse'
import { useAuthenticatedEvents } from '@/app/shared/hooks/useAuthenticatedEvents'
import { AuthenticatedContext } from '@/app/shared/providers/AuthenticatedContext'
import { THEME } from '@/app/styles/colorTheme'
import UserChrome from '@/app/shared/components/UserChrome'

function AuthenticatedShell({ children }) {
  const router = useRouter()
  const auth = useAuth()
  const { toasts, showToast, dismissToast } = useToast()
  // Seeded from the user payload the app already fetches, so the line is
  // populated on first paint rather than waiting for something to happen.
  const { pulseEvents, addPulseEvent } = usePulse(auth.user?.pulse_events)

  // A counter rather than a boolean: asking twice must open the panel twice,
  // and a boolean would need resetting after every open.
  const [socialOpenSignal, setSocialOpenSignal] = useState(0)
  const openSocialPanel = useCallback(() => setSocialOpenSignal((count) => count + 1), [])

  // Publish the header's height as --site-header-height, so anything that
  // needs to sit below the chrome can subtract it. Measured rather than
  // hardcoded because the header's height comes from its contents (logo, user
  // capsule), which a fixed number would silently stop matching.
  const headerRef = useRef(null)

  useEffect(() => {
    const header = headerRef.current
    if (!header) return

    const publish = () =>
      document.documentElement.style.setProperty(
        '--site-header-height',
        `${header.offsetHeight}px`
      )

    publish()

    // ResizeObserver, not a window listener: the header can change height
    // without the window doing so.
    const observer = new ResizeObserver(publish)
    observer.observe(header)
    return () => observer.disconnect()
  }, [])

  // One persistent WebSocket subscription for the whole authenticated
  // route group. Handlers live in useAuthenticatedEvents.
  useAuthenticatedEvents(auth.user?.id, showToast, addPulseEvent)

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
        openSocialPanel,
        pulseEvents,
      }}
    >
      <div
        className="h-screen flex flex-col"
        style={{ backgroundColor: THEME.bgPrimary, color: THEME.textPrimary }}
      >
        {/* Persistent header — doesn't remount on route changes inside
            the authenticated group. The wordmark anchors Home; the user
            chip owns account access and sign-out. */}
        <div ref={headerRef} className="flex-shrink-0">
          <SiteHeader>
          <SocialPanel
            user={auth.user}
            toasts={toasts}
            onDismissToast={dismissToast}
            openSignal={socialOpenSignal}
          />
          <AppLauncher isAdmin={Boolean(auth.user?.is_admin)} />
          <Dropdown
            size="panel"
            trigger={
              <button
                aria-label="Account menu"
                className="flex items-center hover:opacity-90 transition-opacity focus:outline-none"
              >
                {/* Name reads into the colour block, which runs off the
                    capsule's slanted end. */}
                <UserChrome
                  userId={auth.user?.id}
                  color={auth.user?.color}
                  name={chipName}
                  avatarSide="end"
                />
              </button>
            }
            items={[
              { label: 'Account', icon: faUser, onClick: () => router.push('/account') },
              { label: 'Sign out', icon: faRightFromBracket, onClick: auth.handleLogout },
            ]}
          />
          </SiteHeader>
        </div>

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
