/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useEffect, useMemo, useState } from 'react'

import { THEME } from '@/app/styles/colorTheme'

import { useEditionSpecies } from '../../hooks/useReferenceData'
import SpeciesTile from './SpeciesTile'
import StepFooter from './StepFooter'

export default function SpeciesStep({ draft, onSave, onBack, onNext }) {
  const { data: speciesList, isLoading } = useEditionSpecies(draft.edition_code)

  // The chosen species (one). null/undefined ⇒ player hasn't selected yet, so
  // the picker is auto-open. Hydrate from the draft on mount so refreshes
  // resume on the correct selection.
  const [speciesCode, setSpeciesCode] = useState(draft.species_code || null)
  const [extraLanguages, setExtraLanguages] = useState([])

  // Picker visibility — open when no species is selected, hidden once one is
  // picked. The selected tile remains expanded above; player can hit ✕ to
  // clear and re-open the picker.
  const [pickerOpen, setPickerOpen] = useState(() => !draft.species_code)
  const [expandedInPicker, setExpandedInPicker] = useState(null)

  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  // Reset language picks when species changes — different species have
  // different "choose N more" rules so previous picks aren't reusable.
  useEffect(() => { setExtraLanguages([]) }, [speciesCode])

  const species = useMemo(
    () => speciesList?.find((s) => s.code === speciesCode),
    [speciesList, speciesCode],
  )

  const languageChoiceCount = species?.language_choices?.count ?? 0

  const handleExtraLanguageChange = (idx, value) => {
    setExtraLanguages((prev) => {
      const next = [...prev]
      next[idx] = value
      return next
    })
  }

  const handleSelectSpecies = (code) => {
    setSpeciesCode(code)
    setPickerOpen(false)
    setExpandedInPicker(null)
  }

  const handleClearSpecies = () => {
    setSpeciesCode(null)
    setExtraLanguages([])
    setPickerOpen(true)
  }

  const handleNext = async () => {
    setError(null)
    if (!species) {
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
      // Name now lives in the persistent header (rename step), so this
      // payload is species + languages only. Wire contract stays
      // step='identity' since the backend handler key is unchanged.
      await onSave({
        species_code: speciesCode,
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
          Species
        </h2>
        <p className="mt-1 text-sm" style={{ color: THEME.textSecondary }}>
          Your species determines speed, size, default languages and a handful
          of innate traits.
        </p>
      </header>

      {/* Selected species — always rendered expanded with the language picker
          (when this species offers extra picks) below the info body. */}
      {species && (
        <SpeciesTile
          species={species}
          mode="selected"
          extraLanguages={extraLanguages}
          onExtraLanguageChange={handleExtraLanguageChange}
          onRemove={handleClearSpecies}
        />
      )}

      {/* Picker — open when no species is selected, or after the player clears
          the current pick via the ✕. One selection only; selecting replaces
          any previous choice. */}
      {pickerOpen && (
        <div className="space-y-2">
          {species && (
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase" style={{ color: THEME.textSecondary }}>
                Change species
              </div>
              <button
                type="button"
                onClick={() => {
                  setPickerOpen(false)
                  setExpandedInPicker(null)
                }}
                className="text-xs px-2 py-1 rounded-sm border"
                style={{
                  borderColor: THEME.borderDefault,
                  color: THEME.textOnDark,
                  backgroundColor: 'transparent',
                }}
              >
                Cancel
              </button>
            </div>
          )}
          {(speciesList ?? []).map((sp) => (
            <SpeciesTile
              key={sp.code}
              species={sp}
              mode={expandedInPicker === sp.code ? 'expandedToPick' : 'collapsed'}
              onExpand={() => setExpandedInPicker(sp.code)}
              onCollapse={() => setExpandedInPicker(null)}
              onSelect={() => handleSelectSpecies(sp.code)}
            />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-sm border px-3 py-2 text-sm" style={{ borderColor: '#f87171', color: '#f87171' }}>
          {error}
        </div>
      )}

      <StepFooter
        onBack={onBack}
        onNext={handleNext}
        nextDisabled={!species || saving}
        nextLabel={saving ? 'Saving…' : 'Next →'}
      />
    </div>
  )
}
