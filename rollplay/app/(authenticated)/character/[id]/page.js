/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

import { THEME, COLORS } from '@/app/styles/colorTheme'

import CharacterAvatarPane from '../components/CharacterAvatarPane'
import CharacterSheet from '../components/CharacterSheet'
import { useCharacterDraft } from '../hooks/useCharacterDraft'

const SRD_ATTRIBUTION =
  'Content from D&D SRD 5.2.1, © Wizards of the Coast, used under CC BY 4.0.'

export default function CharacterDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params?.id
  const { data: character, isLoading, isError, error } = useCharacterDraft(id)

  // Redirect drafts back into the wizard. Effect (not render-time) so we don't
  // call router.replace during another component's render phase.
  useEffect(() => {
    if (character?.is_draft) {
      router.replace(`/character/create?id=${character.id}`)
    }
  }, [character?.id, character?.is_draft, router])

  if (isLoading) {
    return (
      <main className="flex-1 flex items-center justify-center" style={{ color: THEME.textSecondary }}>
        Loading character…
      </main>
    )
  }

  if (isError) {
    return (
      <main className="flex-1 flex items-center justify-center" style={{ color: '#f87171' }}>
        {error?.message ?? 'Failed to load character'}
      </main>
    )
  }

  if (!character) {
    return null
  }

  // Drafts redirect into the wizard via the effect above; render nothing
  // while the navigation lands.
  if (character.is_draft) {
    return null
  }

  return (
    // Same two-column shell as the wizard's WizardChrome: avatar pane on the
    // left at 33vw, sheet on the right filling the remaining width. Read-only
    // — no edit affordances on the avatar or the sheet. Graphite page, no
    // panel chrome — sheet content sits directly on the page background.
    <main
      className="flex-1 flex min-h-0 overflow-hidden"
      style={{ backgroundColor: COLORS.graphite, color: THEME.textOnDark }}
    >
      <div className="shrink-0" style={{ width: '33vw' }}>
        <CharacterAvatarPane avatarUrl={character.avatar_url} focalArea={character.avatar_focal_area} readOnly />
      </div>

      <div className="flex-1 overflow-y-auto min-w-0">
        <div className="max-w-3xl pl-8 pr-6 py-8">
          <div className="mb-4">
            <button
              type="button"
              onClick={() => router.push('/dashboard?tab=characters')}
              className="text-sm"
              style={{ color: THEME.textOnDark }}
            >
              ← Back to characters
            </button>
          </div>

          <div className="p-6 sm:p-8" style={{ color: THEME.textOnDark }}>
            <CharacterSheet character={character} />
          </div>

          <p
            className="mt-4 text-xs text-center"
            style={{ color: THEME.textOnDark, opacity: 0.5 }}
          >
            {SRD_ATTRIBUTION}
          </p>
        </div>
      </div>
    </main>
  )
}
