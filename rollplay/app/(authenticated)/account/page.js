/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { Suspense } from 'react'
import SocialManager from '@/app/dashboard/components/SocialManager'
import { useAuthenticated } from '@/app/shared/providers/AuthenticatedContext'

/**
 * /account — standalone route for the user's profile, friends, and
 * account settings. Header chrome (site header, notification bell,
 * logout) lives in the shared `(authenticated)` layout; this page just
 * renders the account content.
 */
function AccountContent() {
  const { user, setUser } = useAuthenticated()

  return (
    <main
      id="account-main"
      className="flex-1 flex flex-col pt-4 sm:pt-8 md:pt-10 px-4 sm:px-8 md:px-10 overflow-x-hidden overflow-y-auto overscroll-none pb-8"
    >
      <section>
        <SocialManager user={user} onUserUpdate={setUser} />
      </section>
    </main>
  )
}

export default function AccountPage() {
  return (
    <Suspense fallback={null}>
      <AccountContent />
    </Suspense>
  )
}
