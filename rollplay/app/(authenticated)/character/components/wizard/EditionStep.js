/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState } from 'react'

import { THEME, COLORS } from '@/app/styles/colorTheme'

export default function EditionStep({
  editions,
  initialName,
  initialEditionCode,
  isCreating,
  onSubmit,
}) {
  const [name, setName] = useState(initialName ?? '')
  const [editionCode, setEditionCode] = useState(
    initialEditionCode ?? editions[0]?.code ?? ''
  )
  const [error, setError] = useState(null)

  const canContinue = name.trim().length > 0 && editionCode

  const handleNext = async () => {
    setError(null)
    try {
      await onSubmit({ editionCode, name: name.trim() })
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-xl font-semibold" style={{ color: THEME.textOnDark }}>
          Pick an edition and name your character
        </h2>
        <p className="mt-1 text-sm" style={{ color: THEME.textSecondary }}>
          The edition is locked once you start — it controls which species,
          classes and feats are available for the rest of the wizard.
        </p>
      </header>

      <div>
        <label className="block text-sm font-medium mb-1" style={{ color: THEME.textSecondary }}>
          Character name
          <span className="ml-1" style={{ color: '#f87171' }}>*</span>
        </label>
        <input
          type="text"
          maxLength={50}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 border rounded-sm focus:outline-none focus:ring-1"
          style={{
            backgroundColor: THEME.bgSecondary,
            borderColor: THEME.borderDefault,
            color: THEME.textOnDark,
          }}
          placeholder="e.g. Aelwyn Stormblade"
        />
      </div>

      <div>
        <p className="block text-sm font-medium mb-2" style={{ color: THEME.textSecondary }}>
          Edition
        </p>
        <div className="space-y-2">
          {editions.map((edition) => {
            const selected = edition.code === editionCode
            return (
              <button
                key={edition.code}
                type="button"
                onClick={() => setEditionCode(edition.code)}
                className="w-full text-left rounded-sm border px-4 py-3 transition-colors"
                style={{
                  borderColor: selected ? COLORS.silver : THEME.borderDefault,
                  backgroundColor: selected ? `${COLORS.silver}1A` : THEME.bgSecondary,
                  color: THEME.textOnDark,
                }}
              >
                <div className="font-semibold">{edition.name}</div>
                <div className="text-xs" style={{ color: THEME.textSecondary }}>
                  Version {edition.version}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {error && (
        <div className="rounded-sm border px-3 py-2 text-sm" style={{
          borderColor: '#f87171',
          color: '#f87171',
        }}>
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          disabled={!canContinue || isCreating}
          onClick={handleNext}
          className="px-5 py-2 rounded-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: COLORS.silver, color: COLORS.onyx }}
        >
          {isCreating ? 'Starting…' : 'Start →'}
        </button>
      </div>
    </div>
  )
}
