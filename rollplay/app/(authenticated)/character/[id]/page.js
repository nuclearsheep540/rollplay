/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useParams, useRouter } from 'next/navigation'

import { THEME, COLORS } from '@/app/styles/colorTheme'

import CharacterSheet from '../components/CharacterSheet'
import { useCharacterDraft } from '../hooks/useCharacterDraft'

export default function CharacterDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params?.id
  const { data: character, isLoading, isError, error } = useCharacterDraft(id)

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

  // Drafts redirect into the wizard; the finalised view is read-only.
  if (character.is_draft) {
    router.replace(`/character/create?id=${character.id}`)
    return null
  }

  return (
    <main
      className="flex-1 overflow-y-auto"
      style={{ backgroundColor: THEME.bgPrimary, color: THEME.textPrimary }}
    >
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
        <div className="mb-4">
          <button
            type="button"
            onClick={() => router.push('/dashboard?tab=characters')}
            className="text-sm"
            style={{ color: THEME.textPrimary }}
          >
            ← Back to characters
          </button>
        </div>
        <div
          className="rounded-sm border p-6 sm:p-8"
          style={{ backgroundColor: COLORS.carbon, borderColor: THEME.borderSubtle, color: THEME.textOnDark }}
        >
          <CharacterSheet character={character} />
        </div>
      </div>
    </main>
  )
}
