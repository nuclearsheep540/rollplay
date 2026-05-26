/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useEffect, useMemo, useState } from 'react'

import Combobox from '@/app/shared/components/Combobox'
import { THEME, COLORS } from '@/app/styles/colorTheme'

import {
  useEditionBackgrounds,
  useEditionFeats,
  useEditionSkills,
} from '../../hooks/useReferenceData'
import StepFooter from './StepFooter'

// Two valid 5.5e ability bonus distributions:
//   +2/+1 across two of the background's three offered abilities
//   +1/+1/+1 across all three
const PRESETS = [
  { id: '2_1', label: '+2 / +1', shape: [2, 1] },
  { id: '1_1_1', label: '+1 / +1 / +1', shape: [1, 1, 1] },
]

function distributionFromShape(shape, abilities) {
  // shape is e.g. [2,1] or [1,1,1]; abilities is the background's 3 offered.
  // Returns initial assignment using the order the player has touched first.
  return shape.map((amount, idx) => ({
    ability: abilities[idx] ?? abilities[0],
    increase: amount,
  }))
}

export default function BackgroundStep({ draft, onSave, onBack, onNext }) {
  const { data: backgrounds, isLoading } = useEditionBackgrounds(draft.edition_code)
  const { data: feats } = useEditionFeats(draft.edition_code)
  const { data: skills } = useEditionSkills(draft.edition_code)

  const [backgroundCode, setBackgroundCode] = useState(draft.background_code || '')
  const [presetId, setPresetId] = useState('2_1')
  const [increases, setIncreases] = useState([])
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const background = useMemo(
    () => backgrounds?.find((b) => b.code === backgroundCode),
    [backgrounds, backgroundCode]
  )

  const feat = useMemo(
    () => feats?.find((f) => f.code === background?.origin_feat_code),
    [feats, background]
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

  const handleNext = async () => {
    setError(null)
    if (!background) {
      setError('Pick a background before continuing.')
      return
    }
    // Server enforces the validity of (+2/+1) / (+1/+1/+1) on the same 3
    // offered abilities; we sanity-check duplicates here for fast feedback.
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

  const options = (backgrounds ?? []).map((b) => ({
    value: b.code,
    label: b.name,
  }))

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

      <Combobox
        label="Background"
        required
        options={options}
        value={backgroundCode}
        onChange={setBackgroundCode}
        placeholder="Search backgrounds…"
      />

      {background && (
        <div className="rounded-sm border p-4 space-y-3" style={{
          borderColor: THEME.borderSubtle,
          backgroundColor: `${COLORS.smoke}05`,
        }}>
          <div>
            <div className="text-xs uppercase" style={{ color: THEME.textSecondary }}>Origin feat</div>
            <div style={{ color: THEME.textOnDark }} className="font-semibold">
              {feat?.name ?? background.origin_feat_code}
            </div>
            {feat && (
              <p className="text-sm mt-1" style={{ color: THEME.textSecondary }}>
                {feat.description.slice(0, 240)}{feat.description.length > 240 ? '…' : ''}
              </p>
            )}
          </div>

          <div>
            <div className="text-xs uppercase" style={{ color: THEME.textSecondary }}>Skill proficiencies</div>
            <div style={{ color: THEME.textOnDark }}>
              {background.skill_proficiencies
                .map((c) => skillsByCode.get(c)?.name ?? c)
                .join(', ')}
            </div>
          </div>

          <div>
            <div className="text-xs uppercase" style={{ color: THEME.textSecondary }}>Tool proficiency</div>
            <div style={{ color: THEME.textOnDark }}>{background.tool_proficiency}</div>
          </div>

          {background.equipment_text && (
            <div>
              <div className="text-xs uppercase" style={{ color: THEME.textSecondary }}>Equipment</div>
              <p className="text-sm" style={{ color: THEME.textSecondary }}>{background.equipment_text}</p>
            </div>
          )}

          <div>
            <div className="text-xs uppercase mb-1" style={{ color: THEME.textSecondary }}>
              Ability bonus distribution
            </div>
            <div className="flex gap-2 mb-3">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPresetId(p.id)}
                  className="px-3 py-1 rounded-sm border text-sm"
                  style={{
                    borderColor: presetId === p.id ? COLORS.silver : THEME.borderDefault,
                    backgroundColor: presetId === p.id ? `${COLORS.silver}1A` : 'transparent',
                    color: THEME.textOnDark,
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="space-y-2">
              {increases.map((row, idx) => (
                <div key={idx} className="flex items-center gap-3 text-sm">
                  <span
                    className="inline-flex h-7 w-10 items-center justify-center rounded-sm font-semibold"
                    style={{ backgroundColor: COLORS.silver, color: COLORS.onyx }}
                  >
                    +{row.increase}
                  </span>
                  <select
                    value={row.ability}
                    onChange={(e) => handleAbilityChange(idx, e.target.value)}
                    className="px-3 py-1.5 border rounded-sm text-sm capitalize"
                    style={{
                      backgroundColor: THEME.bgSecondary,
                      borderColor: THEME.borderDefault,
                      color: THEME.textOnDark,
                    }}
                  >
                    {background.ability_scores.map((ab) => (
                      <option key={ab} value={ab}>{ab}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-sm border px-3 py-2 text-sm" style={{ borderColor: '#f87171', color: '#f87171' }}>
          {error}
        </div>
      )}

      <StepFooter onBack={onBack} onNext={handleNext} nextDisabled={!background || saving} nextLabel={saving ? 'Saving…' : 'Next →'} />
    </div>
  )
}
