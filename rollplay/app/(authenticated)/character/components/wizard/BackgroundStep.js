/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useEffect, useMemo, useState } from 'react'

import { THEME } from '@/app/styles/colorTheme'

import {
  useEditionBackgrounds,
  useEditionFeats,
  useEditionSkills,
} from '../../hooks/useReferenceData'
import BackgroundTile from './BackgroundTile'
import StepFooter from './StepFooter'

// 5.5e rules: each background grants +3 split across its three offered
// abilities, either as +2/+1 (across two of the three) or +1/+1/+1.
const PRESETS = [
  { id: '2_1', shape: [2, 1] },
  { id: '1_1_1', shape: [1, 1, 1] },
]

function distributionFromShape(shape, abilities) {
  return shape.map((amount, idx) => ({
    ability: abilities[idx] ?? abilities[0],
    increase: amount,
  }))
}

export default function BackgroundStep({ draft, onSave, onBack, onNext }) {
  const { data: backgrounds, isLoading } = useEditionBackgrounds(draft.edition_code)
  const { data: feats } = useEditionFeats(draft.edition_code)
  const { data: skills } = useEditionSkills(draft.edition_code)

  // The chosen background (one). null/undefined ⇒ player hasn't selected yet,
  // so the picker is auto-open. Hydrate from the draft on mount so refreshes
  // resume on the correct selection.
  const [backgroundCode, setBackgroundCode] = useState(draft.background_code || null)

  // Ability bonus distribution config for the selected background.
  const [presetId, setPresetId] = useState('2_1')
  const [increases, setIncreases] = useState([])

  // Picker visibility — open when no background is selected, hidden once one
  // is picked. The selected tile remains expanded above; player can hit ✕
  // to clear and re-open the picker.
  const [pickerOpen, setPickerOpen] = useState(() => !draft.background_code)
  const [expandedInPicker, setExpandedInPicker] = useState(null)

  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const background = useMemo(
    () => backgrounds?.find((b) => b.code === backgroundCode),
    [backgrounds, backgroundCode],
  )
  const feat = useMemo(
    () => feats?.find((f) => f.code === background?.origin_feat_code),
    [feats, background],
  )

  const skillsByCode = useMemo(() => {
    const map = new Map()
    for (const s of skills ?? []) map.set(s.code, s)
    return map
  }, [skills])

  // Reset the distribution when background or preset changes.
  useEffect(() => {
    if (!background) {
      setIncreases([])
      return
    }
    const preset = PRESETS.find((p) => p.id === presetId)
    setIncreases(distributionFromShape(preset.shape, background.ability_scores))
  }, [backgroundCode, presetId, background?.code])

  const handleAbilityChange = (idx, ability) => {
    setIncreases((curr) => curr.map((row, i) => (i === idx ? { ...row, ability } : row)))
  }

  const handleSelectBackground = (code) => {
    setBackgroundCode(code)
    setPresetId('2_1')
    setPickerOpen(false)
    setExpandedInPicker(null)
  }

  const handleClearBackground = () => {
    setBackgroundCode(null)
    setIncreases([])
    setPickerOpen(true)
  }

  const handleNext = async () => {
    setError(null)
    if (!background) {
      setError('Pick a background before continuing.')
      return
    }
    const seen = new Set()
    for (const row of increases) {
      if (seen.has(row.ability)) {
        setError('Pick three distinct abilities for the distribution.')
        return
      }
      seen.add(row.ability)
    }
    setSaving(true)
    try {
      await onSave({
        background_code: backgroundCode,
        ability_increases: increases,
      })
      onNext()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) {
    return <p style={{ color: THEME.textSecondary }}>Loading backgrounds…</p>
  }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-xl font-semibold" style={{ color: THEME.textOnDark }}>
          Background
        </h2>
        <p className="mt-1 text-sm" style={{ color: THEME.textSecondary }}>
          Backgrounds grant an Origin Feat, two skill proficiencies, a tool
          proficiency and a +3 ability score bonus you split across the three
          offered abilities.
        </p>
      </header>

      {/* Selected background — always rendered expanded with the ability
          distribution config below the info body. */}
      {background && (
        <BackgroundTile
          background={background}
          feat={feat}
          skillsByCode={skillsByCode}
          mode="selected"
          presetId={presetId}
          increases={increases}
          onPresetChange={setPresetId}
          onAbilityChange={handleAbilityChange}
          onRemove={handleClearBackground}
        />
      )}

      {/* Picker — open when no background is selected, or after the player
          clears the current pick via the ✕. One selection only; selecting
          replaces any previous choice. */}
      {pickerOpen && (
        <div className="space-y-2">
          {background && (
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase" style={{ color: THEME.textSecondary }}>
                Change background
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
          {(backgrounds ?? []).map((bg) => {
            const tileFeat = feats?.find((f) => f.code === bg.origin_feat_code)
            return (
              <BackgroundTile
                key={bg.code}
                background={bg}
                feat={tileFeat}
                skillsByCode={skillsByCode}
                mode={expandedInPicker === bg.code ? 'expandedToPick' : 'collapsed'}
                onExpand={() => setExpandedInPicker(bg.code)}
                onCollapse={() => setExpandedInPicker(null)}
                onSelect={() => handleSelectBackground(bg.code)}
              />
            )
          })}
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
        nextDisabled={!background || saving}
        nextLabel={saving ? 'Saving…' : 'Next →'}
      />
    </div>
  )
}
