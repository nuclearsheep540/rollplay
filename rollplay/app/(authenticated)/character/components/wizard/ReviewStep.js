/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { THEME, COLORS } from '@/app/styles/colorTheme'

import CharacterSheet from '../CharacterSheet'

export default function ReviewStep({ draft, onBack, onFinalize, isFinalizing, error }) {
  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-xl font-semibold" style={{ color: THEME.textOnDark }}>
          Review &amp; finalize
        </h2>
        <p className="mt-1 text-sm" style={{ color: THEME.textSecondary }}>
          One last look at the sheet before locking it in. After finalizing
          you can edit HP / XP / death saves in-game but the character's
          structural details are fixed.
        </p>
      </header>

      <div
        className="rounded-sm border p-4"
        style={{ borderColor: THEME.borderSubtle, backgroundColor: `${COLORS.smoke}05` }}
      >
        <CharacterSheet character={draft} />
      </div>

      {error && (
        <div className="rounded-sm border px-3 py-2 text-sm" style={{ borderColor: '#f87171', color: '#f87171' }}>
          {error.message ?? String(error)}
        </div>
      )}

      <div className="flex justify-between items-center pt-4 border-t" style={{ borderColor: THEME.borderSubtle }}>
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 rounded-sm border text-sm"
          style={{
            backgroundColor: 'transparent',
            borderColor: THEME.borderDefault,
            color: THEME.textOnDark,
          }}
        >
          ← Back
        </button>
        <button
          type="button"
          disabled={isFinalizing}
          onClick={onFinalize}
          className="px-6 py-2 rounded-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: COLORS.silver, color: COLORS.onyx }}
        >
          {isFinalizing ? 'Finalizing…' : 'Finalize character ✓'}
        </button>
      </div>
    </div>
  )
}
