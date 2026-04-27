/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { Suspense, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faRightFromBracket, faUser, faHouse } from '@fortawesome/free-solid-svg-icons'

import SiteHeader from '@/app/shared/components/SiteHeader'
import NotificationBell from '@/app/shared/components/NotificationBell'
import { useAuth } from '@/app/dashboard/hooks/useAuth'
import { useToast } from '@/app/shared/hooks/useToast'
import { useAuthenticatedEvents } from '@/app/shared/hooks/useAuthenticatedEvents'
import { AuthenticatedContext } from '@/app/shared/providers/AuthenticatedContext'
import { THEME } from '@/app/styles/colorTheme'

function AuthenticatedShell({ children }) {
  const router = useRouter()
  const pathname = usePathname()
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

  const onAccountPage = pathname === '/account'

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
            separator, then the navigation icons. */}
        <SiteHeader showHome={false}>
          <NotificationBell
            userId={auth.user?.id}
            toasts={toasts}
            onDismissToast={dismissToast}
          />
          {/* Negative x-margin tightens the 32 px nav gap around the
              divider specifically, without touching the spacing between
              other icons. */}
          <div
            aria-hidden="true"
            className="w-px h-7 -mx-3 bg-white/20"
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
            className="hover:opacity-80 transition-opacity"
            style={{ color: onAccountPage ? THEME.textOnDark : THEME.textSecondary }}
          >
            <FontAwesomeIcon icon={faUser} className="h-7 w-7" />
          </Link>
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
