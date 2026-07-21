/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { Suspense, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faRightFromBracket, faHouse } from '@fortawesome/free-solid-svg-icons'

import SiteHeader from '@/app/shared/components/SiteHeader'
import SocialPanel from '@/app/shared/components/SocialPanel'
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
            the authenticated group. Icons ordered: bell (panel toggle),
            the navigation icons, then a separator before logout. */}
        <SiteHeader showHome={false}>
          <SocialPanel
            user={auth.user}
            toasts={toasts}
            onDismissToast={dismissToast}
          />
          <Link
            href="/dashboard"
            aria-label="Home"
            title="Home"
            className="hover:opacity-80 transition-opacity"
            style={{ color: THEME.textSecondary }}
          >
            <FontAwesomeIcon icon={faHouse} className="h-7 w-7" />
          </Link>
          <Link
            href="/account"
            aria-label="Account"
            title="Account"
            className="hover:opacity-80 transition-opacity -ml-1"
          >
            {/* The user's own identity disc — same UserDisc as friend rows
                and the account page avatar, so color and treatment can never
                drift. The nav's items-center handles vertical alignment.

                Optical alignment + intent (deliberate): a circle fills ~78%
                of its box and reads smaller than square glyphs at the same
                metric size, and we overshoot parity a touch on purpose —
                this is the user's own path, not general navigation. w-9 with
                a border-2 ring = a 32px colored fill (the overshoot against
                the neighbours' 28px glyphs) with the darker black/40 ring
                sitting beyond it, matching the account page avatar. Sizing
                the box smaller lets the ring eat the fill and collapses the
                overshoot back to parity — don't. */}
            <UserDisc
              userId={auth.user?.id}
              color={auth.user?.color}
              name={auth.user?.account_name || auth.user?.screen_name || auth.user?.email}
              className="w-9 h-9 text-base border-2 border-black/40 -top-0.5"
            />
          </Link>
          {/* Negative x-margin tightens the 32 px nav gap around the
              divider specifically, without touching the spacing between
              other icons. */}
          <div
            aria-hidden="true"
            className="w-px h-7 -mx-3 bg-white/20"
          />
          <button
            onClick={auth.handleLogout}
            aria-label="Logout"
            style={{ color: THEME.textSecondary }}
            className="hover:opacity-80 transition-opacity"
          >
            <FontAwesomeIcon icon={faRightFromBracket} className="h-7 w-7" />
          </button>
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
