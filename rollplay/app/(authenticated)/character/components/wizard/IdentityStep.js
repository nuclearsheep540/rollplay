/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useEffect, useMemo, useState } from 'react'

import Combobox from '@/app/shared/components/Combobox'
import { THEME, COLORS } from '@/app/styles/colorTheme'

import { useEditionSpecies } from '../../hooks/useReferenceData'
import StepFooter from './StepFooter'

export default function IdentityStep({ draft, onSave, onBack, onNext }) {
  const { data: speciesList, isLoading } = useEditionSpecies(draft.edition_code)
  const [speciesCode, setSpeciesCode] = useState(draft.species_code || '')
  const [name, setName] = useState(draft.character_name || '')
  const [extraLanguages, setExtraLanguages] = useState([])
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  // Reset language picks when species changes — different species have
  // different "choose N more" rules so previous picks aren't reusable.
  useEffect(() => { setExtraLanguages([]) }, [speciesCode])

  const species = useMemo(
    () => speciesList?.find((s) => s.code === speciesCode),
    [speciesList, speciesCode]
  )

  const speciesOptions = useMemo(
    () => (speciesList ?? []).map((s) => ({ value: s.code, label: s.name })),
    [speciesList]
  )

  const languageChoiceCount = species?.language_choices?.count ?? 0

  const handleExtraLanguageChange = (idx, value) => {
    setExtraLanguages((prev) => {
      const next = [...prev]
      next[idx] = value
      return next
    })
  }

  const handleNext = async () => {
    setError(null)
    if (!speciesCode) {
      setError('Pick a species before continuing.')
      return
    }
    const validExtras = extraLanguages.filter((l) => l && l.trim())
    if (validExtras.length < languageChoiceCount) {
      setError(`Pick ${languageChoiceCount} extra language(s).`)
      return
    }
    setSaving(true)
    try {
      await onSave({
        species_code: speciesCode,
        name: name.trim() || undefined,
        chosen_languages: validExtras,
      })
      onNext()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) {
    return <p style={{ color: THEME.textSecondary }}>Loading species…</p>
  }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-xl font-semibold" style={{ color: THEME.textOnDark }}>
          Identity & species
        </h2>
        <p className="mt-1 text-sm" style={{ color: THEME.textSecondary }}>
          Your species determines speed, size, default languages and a handful
          of innate traits.
        </p>
      </header>

      <div>
        <label className="block text-sm font-medium mb-1" style={{ color: THEME.textSecondary }}>
          Character name
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
        />
      </div>

      <Combobox
        label="Species"
        required
        options={speciesOptions}
        value={speciesCode}
        onChange={setSpeciesCode}
        placeholder="Search species…"
      />

      {species && (
        <div className="rounded-sm border p-4" style={{
          borderColor: THEME.borderSubtle,
          backgroundColor: `${COLORS.smoke}08`,
        }}>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <div style={{ color: THEME.textSecondary }} className="text-xs uppercase">Size</div>
              <div style={{ color: THEME.textOnDark }}>{species.size}</div>
            </div>
            <div>
              <div style={{ color: THEME.textSecondary }} className="text-xs uppercase">Speed</div>
              <div style={{ color: THEME.textOnDark }}>{species.speed} ft</div>
            </div>
            <div>
              <div style={{ color: THEME.textSecondary }} className="text-xs uppercase">Creature type</div>
              <div style={{ color: THEME.textOnDark }}>{species.creature_type}</div>
            </div>
          </div>

          <div className="mt-3">
            <div style={{ color: THEME.textSecondary }} className="text-xs uppercase">Languages</div>
            <div style={{ color: THEME.textOnDark }} className="text-sm">
              {species.default_languages.join(', ') || '—'}
            </div>
          </div>

          {languageChoiceCount > 0 && (
            <div className="mt-3 space-y-2">
              <div style={{ color: THEME.textSecondary }} className="text-xs uppercase">
                Extra languages — choose {languageChoiceCount}
              </div>
              {Array.from({ length: languageChoiceCount }).map((_, idx) => (
                <input
                  key={idx}
                  type="text"
                  value={extraLanguages[idx] ?? ''}
                  onChange={(e) => handleExtraLanguageChange(idx, e.target.value)}
                  placeholder={`Language ${idx + 1}`}
                  className="w-full px-3 py-2 border rounded-sm focus:outline-none focus:ring-1 text-sm"
                  style={{
                    backgroundColor: THEME.bgSecondary,
                    borderColor: THEME.borderDefault,
                    color: THEME.textOnDark,
                  }}
                />
              ))}
            </div>
          )}

          {species.traits.length > 0 && (
            <div className="mt-4">
              <div style={{ color: THEME.textSecondary }} className="text-xs uppercase mb-2">Traits</div>
              <ul className="space-y-2">
                {species.traits.map((t) => (
                  <li key={t.name} className="text-sm">
                    <span className="font-semibold" style={{ color: THEME.textOnDark }}>{t.name}.</span>{' '}
                    <span style={{ color: THEME.textSecondary }}>{t.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-sm border px-3 py-2 text-sm" style={{ borderColor: '#f87171', color: '#f87171' }}>
          {error}
        </div>
      )}

      <StepFooter onBack={onBack} onNext={handleNext} nextDisabled={!speciesCode || saving} nextLabel={saving ? 'Saving…' : 'Next →'} />
    </div>
  )
}
