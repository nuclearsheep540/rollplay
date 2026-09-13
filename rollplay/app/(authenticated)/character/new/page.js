/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

import CampaignChooser from '@/app/characters/components/CampaignChooser'
import CharacterCreateForm from '@/app/characters/components/CharacterCreateForm'

/**
 * One route, two states: pick a table, then build against its config.
 *
 * They are one page because they are one decision — a character exists for a table, so
 * choosing the table is the first field of the form, not a separate journey.
 */
function CharacterCreateRoute() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session_id')

  return sessionId ? <CharacterCreateForm sessionId={sessionId} /> : <CampaignChooser />
}

export default function CharacterCreatePage() {
  return (
    <Suspense fallback={null}>
      <CharacterCreateRoute />
    </Suspense>
  )
}
