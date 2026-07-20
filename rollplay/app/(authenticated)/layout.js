/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { Suspense, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faRightFromBracket, faHouse, faCircle } from '@fortawesome/free-solid-svg-icons'

import SiteHeader from '@/app/shared/components/SiteHeader'
import SocialPanel from '@/app/shared/components/SocialPanel'
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

  // Avatar initial for the account icon — prefer the immutable account
  // handle, then screen name, then email; '?' if none are set.
  const accountInitial = (
    auth.user?.account_name?.[0] ||
    auth.user?.screen_name?.[0] ||
    auth.user?.email?.[0] ||
    '?'
  ).toUpperCase()

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
            className="hover:opacity-80 transition-opacity"
            style={{ color: onAccountPage ? THEME.textOnDark : THEME.textSecondary }}
          >
            {/* Avatar disc — faCircle rendered by FontAwesome itself, so it
                aligns with the neighbouring icons by construction (same SVG
                pipeline, same box, same baseline behaviour) and inherits the
                Link's active/inactive colour. The wrapper span only exists to
                anchor the initial overlay: it carries FA's own -0.125em
                vertical-align while the SVG goes display:block inside it, so
                the wrapper's outer geometry is identical to a bare icon's.
                The initial is cut out in the header background colour, nudged
                1px down to optically centre the capital. */}
            <span className="relative inline-block align-[-0.125em]">
              <FontAwesomeIcon icon={faCircle} className="block h-7 w-7" />
              <span
                className="absolute inset-0 flex items-center justify-center text-sm font-bold leading-none select-none mt-px"
                style={{ color: THEME.bgSecondary }}
              >
                {accountInitial}
              </span>
            </span>
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
