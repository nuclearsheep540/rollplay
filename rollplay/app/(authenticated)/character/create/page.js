/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { Suspense } from 'react'

import CharacterWizard from '../components/CharacterWizard'
import { THEME } from '@/app/styles/colorTheme'

export default function CreateCharacterPage() {
  return (
    <Suspense
      fallback={
        <div
          className="flex-1 flex items-center justify-center"
          style={{ color: THEME.textSecondary }}
        >
          Loading wizard…
        </div>
      }
    >
      <CharacterWizard />
    </Suspense>
  )
}
