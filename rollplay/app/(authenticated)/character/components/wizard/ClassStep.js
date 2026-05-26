/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useMemo, useState } from 'react'

import Combobox from '@/app/shared/components/Combobox'
import { THEME, COLORS } from '@/app/styles/colorTheme'

import { useEditionClasses, useEditionSkills } from '../../hooks/useReferenceData'
import StepFooter from './StepFooter'

function emptyPick() {
  return { class_code: '', level: 1, is_primary: false, chosen_skills: [] }
}

function buildInitial(draft) {
  if (!draft.class_entries?.length) return [{ ...emptyPick(), is_primary: true }]
  return draft.class_entries.map((e, idx) => ({
    class_code: e.class_code,
    level: e.level,
    is_primary: e.is_primary || idx === 0,
    // The server doesn't tell us which skill picks came from which class —
    // for now show all CLASS-source skills under the primary class.
    chosen_skills:
      idx === 0
        ? (draft.skills || []).filter((s) => s.source === 'CLASS').map((s) => s.skill_code)
        : [],
  }))
}

function SkillCheckbox({ skill, checked, disabled, onToggle }) {
  return (
    <label
      className="flex items-center gap-2 px-2 py-1 rounded-sm cursor-pointer text-sm"
      style={{
        backgroundColor: checked ? `${COLORS.silver}1A` : 'transparent',
        color: disabled ? THEME.textSecondary : THEME.textOnDark,
        cursor: disabled && !checked ? 'not-allowed' : 'pointer',
        opacity: disabled && !checked ? 0.4 : 1,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled && !checked}
        onChange={onToggle}
        className="rounded-sm"
      />
      {skill.name}
    </label>
  )
}

function ClassCard({
  pick,
  index,
  classDef,
  skillsById,
  onChange,
  onRemove,
  canRemove,
}) {
  if (!classDef) return null

  const offered = classDef.skill_choices?.from ?? []
  // Primary class gets the full skill_choices.count picks. Non-primary
  // multi-class entries don't grant skill picks in 5.5e by default.
  const allowedCount = pick.is_primary ? classDef.skill_choices?.count ?? 0 : 0

  const toggleSkill = (code) => {
    const current = pick.chosen_skills || []
    if (current.includes(code)) {
      onChange({ ...pick, chosen_skills: current.filter((c) => c !== code) })
    } else if (current.length < allowedCount) {
      onChange({ ...pick, chosen_skills: [...current, code] })
    }
  }

  return (
    <div className="rounded-sm border p-4 space-y-3" style={{
      borderColor: THEME.borderSubtle,
      backgroundColor: `${COLORS.smoke}05`,
    }}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm uppercase tracking-wide" style={{ color: THEME.textSecondary }}>
          {pick.is_primary ? 'Primary class' : `Multi-class ${index}`}
        </div>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-xs px-2 py-1 rounded-sm border"
            style={{
              borderColor: '#f87171',
              color: '#f87171',
              backgroundColor: 'transparent',
            }}
          >
            Remove
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <div style={{ color: THEME.textSecondary }} className="text-xs uppercase">Hit die</div>
          <div style={{ color: THEME.textOnDark }}>d{classDef.hit_die}</div>
        </div>
        <div>
          <div style={{ color: THEME.textSecondary }} className="text-xs uppercase">Primary ability</div>
          <div style={{ color: THEME.textOnDark, textTransform: 'capitalize' }}>{classDef.primary_ability}</div>
        </div>
        <div>
          <div style={{ color: THEME.textSecondary }} className="text-xs uppercase">Saves</div>
          <div style={{ color: THEME.textOnDark, textTransform: 'capitalize' }}>
            {classDef.saving_throw_proficiencies.join(', ')}
          </div>
        </div>
      </div>

      <div>
        <label className="block text-xs uppercase mb-1" style={{ color: THEME.textSecondary }}>
          Level
        </label>
        <input
          type="number"
          min={1}
          max={20}
          value={pick.level}
          onChange={(e) => onChange({ ...pick, level: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })}
          className="w-24 px-3 py-1 border rounded-sm text-sm"
          style={{
            backgroundColor: THEME.bgSecondary,
            borderColor: THEME.borderDefault,
            color: THEME.textOnDark,
          }}
        />
      </div>

      {allowedCount > 0 && (
        <div>
          <div className="text-xs uppercase mb-2" style={{ color: THEME.textSecondary }}>
            Skill proficiencies — choose {allowedCount}
            <span className="ml-2 normal-case" style={{ opacity: 0.7 }}>
              ({(pick.chosen_skills || []).length}/{allowedCount} picked)
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
            {offered.map((skillCode) => {
              const skill = skillsById?.get(skillCode)
              const checked = (pick.chosen_skills || []).includes(skillCode)
              const limitReached = (pick.chosen_skills || []).length >= allowedCount
              return skill ? (
                <SkillCheckbox
                  key={skillCode}
                  skill={skill}
                  checked={checked}
                  disabled={limitReached}
                  onToggle={() => toggleSkill(skillCode)}
                />
              ) : null
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default function ClassStep({ draft, onSave, onBack, onNext }) {
  const { data: classes, isLoading: classesLoading } = useEditionClasses(draft.edition_code)
  const { data: skills } = useEditionSkills(draft.edition_code)
  const [picks, setPicks] = useState(() => buildInitial(draft))
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const classesByCode = useMemo(() => {
    const map = new Map()
    for (const c of classes ?? []) map.set(c.code, c)
    return map
  }, [classes])

  const skillsByCode = useMemo(() => {
    const map = new Map()
    for (const s of skills ?? []) map.set(s.code, s)
    return map
  }, [skills])

  const totalLevel = picks.reduce((sum, p) => sum + (p.level || 0), 0)

  const updatePick = (idx, next) => {
    setPicks((curr) => curr.map((p, i) => (i === idx ? next : p)))
  }

  const addMultiClass = () => {
    if (picks.length >= 3) return
    setPicks((curr) => [...curr, emptyPick()])
  }

  const removeMultiClass = (idx) => {
    setPicks((curr) => curr.filter((_, i) => i !== idx))
  }

  const handleNext = async () => {
    setError(null)
    if (picks.some((p) => !p.class_code)) {
      setError('Pick a class for every entry.')
      return
    }
    if (totalLevel > 20) {
      setError(`Total class levels (${totalLevel}) exceeds 20.`)
      return
    }
    setSaving(true)
    try {
      await onSave({ classes: picks })
      onNext()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (classesLoading || !classes) {
    return <p style={{ color: THEME.textSecondary }}>Loading classes…</p>
  }

  const classOptions = classes.map((c) => ({
    value: c.code,
    label: `${c.name} (d${c.hit_die}, ${c.primary_ability})`,
  }))

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-xl font-semibold" style={{ color: THEME.textOnDark }}>
          Choose class & skill proficiencies
        </h2>
        <p className="mt-1 text-sm" style={{ color: THEME.textSecondary }}>
          Pick a primary class and skill proficiencies it grants. You can
          multi-class into up to two additional classes if your total level
          stays at or below 20.
        </p>
      </header>

      <div className="space-y-4">
        {picks.map((pick, idx) => (
          <div key={idx} className="space-y-3">
            <Combobox
              label={pick.is_primary ? 'Primary class' : `Multi-class ${idx}`}
              required
              options={classOptions}
              value={pick.class_code}
              onChange={(value) => updatePick(idx, { ...pick, class_code: value, chosen_skills: [] })}
              placeholder="Search classes…"
            />
            {pick.class_code && (
              <ClassCard
                pick={pick}
                index={idx}
                classDef={classesByCode.get(pick.class_code)}
                skillsById={skillsByCode}
                onChange={(next) => updatePick(idx, next)}
                onRemove={() => removeMultiClass(idx)}
                canRemove={!pick.is_primary}
              />
            )}
          </div>
        ))}
      </div>

      {picks.length < 3 && (
        <button
          type="button"
          onClick={addMultiClass}
          className="text-sm px-3 py-1.5 rounded-sm border"
          style={{
            borderColor: THEME.borderDefault,
            color: THEME.textOnDark,
            backgroundColor: 'transparent',
          }}
        >
          + Add another class
        </button>
      )}

      <div className="text-sm" style={{ color: THEME.textSecondary }}>
        Total character level: <span style={{ color: THEME.textOnDark, fontWeight: 600 }}>{totalLevel}</span>
      </div>

      {error && (
        <div className="rounded-sm border px-3 py-2 text-sm" style={{ borderColor: '#f87171', color: '#f87171' }}>
          {error}
        </div>
      )}

      <StepFooter onBack={onBack} onNext={handleNext} nextDisabled={saving} nextLabel={saving ? 'Saving…' : 'Next →'} />
    </div>
  )
}
