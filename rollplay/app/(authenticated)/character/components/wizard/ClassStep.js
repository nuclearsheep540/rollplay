/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useMemo, useState } from 'react'

import { THEME, COLORS } from '@/app/styles/colorTheme'

import { useEditionClasses, useEditionSkills } from '../../hooks/useReferenceData'
import ClassTile from './ClassTile'
import StepFooter from './StepFooter'

/**
 * Build the wizard's local state from the draft's existing class entries.
 * Skill picks come down on the draft.skills list with source='CLASS' but
 * aren't keyed by class, so we attribute them all to the primary class
 * (matches the backend's 5.5e rule — only the primary class grants picks).
 */
function buildInitial(draft) {
  if (!draft.class_entries?.length) return []
  return draft.class_entries.map((e, idx) => ({
    class_code: e.class_code,
    level: e.level,
    is_primary: e.is_primary || idx === 0,
    chosen_skills:
      idx === 0
        ? (draft.skills || []).filter((s) => s.source === 'CLASS').map((s) => s.skill_code)
        : [],
  }))
}

export default function ClassStep({ draft, onSave, onBack, onNext }) {
  const { data: classes, isLoading: classesLoading } = useEditionClasses(draft.edition_code)
  const { data: skills } = useEditionSkills(draft.edition_code)

  // Already-selected class picks (level + skills). Each entry corresponds to
  // a class tile rendered in 'selected' mode above the picker.
  const [picks, setPicks] = useState(() => buildInitial(draft))

  // Picker visibility — auto-open when no class is selected yet (the player
  // has nothing else to do). Toggled by "+ Add another class".
  const [pickerOpen, setPickerOpen] = useState(() => buildInitial(draft).length === 0)

  // Which class tile is expanded inside the picker. Only one at a time —
  // expanding a different tile collapses the previous one.
  const [expandedInPicker, setExpandedInPicker] = useState(null)

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

  const pickedCodes = useMemo(() => new Set(picks.map((p) => p.class_code)), [picks])
  const availableClasses = useMemo(
    () => (classes ?? []).filter((c) => !pickedCodes.has(c.code)),
    [classes, pickedCodes],
  )

  const handleSelectClass = (classCode) => {
    const isPrimary = picks.length === 0
    setPicks((curr) => [
      ...curr,
      {
        class_code: classCode,
        level: 1,
        is_primary: isPrimary,
        chosen_skills: [],
      },
    ])
    setPickerOpen(false)
    setExpandedInPicker(null)
  }

  const handleChangePick = (classCode, next) => {
    setPicks((curr) => curr.map((p) => (p.class_code === classCode ? next : p)))
  }

  const handleRemovePick = (classCode) => {
    setPicks((curr) => {
      const next = curr.filter((p) => p.class_code !== classCode)
      // If the primary was removed, promote the new first entry so the
      // backend's "only primary grants skill picks" invariant stays true.
      if (next.length > 0 && !next.some((p) => p.is_primary)) {
        next[0] = { ...next[0], is_primary: true }
      }
      return next
    })
    // Re-open the picker if we now have nothing selected — gives the player
    // something to interact with immediately.
    if (picks.length === 1) {
      setPickerOpen(true)
    }
  }

  const handleNext = async () => {
    setError(null)
    if (picks.length === 0) {
      setError('Pick at least one class before continuing.')
      return
    }
    if (totalLevel > 20) {
      setError(`Total class levels (${totalLevel}) exceeds 20.`)
      return
    }
    // Primary class needs its skill picks completed.
    const primary = picks.find((p) => p.is_primary)
    if (primary) {
      const def = classesByCode.get(primary.class_code)
      const need = def?.skill_choices?.count ?? 0
      const have = (primary.chosen_skills || []).length
      if (have < need) {
        setError(`Pick ${need} skill proficiency(ies) for your ${def.name}.`)
        return
      }
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

  const canAddMore = picks.length < 3 && availableClasses.length > 0
  const showAddButton = !pickerOpen && canAddMore

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-xl font-semibold" style={{ color: THEME.textOnDark }}>
          Choose class &amp; skill proficiencies
        </h2>
        <p className="mt-1 text-sm" style={{ color: THEME.textSecondary }}>
          Pick a primary class — its skill choices become your character's
          skill proficiencies. You can multi-class into up to two more classes
          as long as your total level stays at or below 20.
        </p>
      </header>

      {/* Selected classes — always rendered expanded with editable level
          and (for the primary) skill checkboxes. */}
      {picks.length > 0 && (
        <div className="space-y-3">
          {picks.map((pick) => {
            const classDef = classesByCode.get(pick.class_code)
            if (!classDef) return null
            return (
              <ClassTile
                key={pick.class_code}
                classDef={classDef}
                mode="selected"
                pick={pick}
                isPrimary={pick.is_primary}
                skillsByCode={skillsByCode}
                onChange={(next) => handleChangePick(pick.class_code, next)}
                onRemove={() => handleRemovePick(pick.class_code)}
              />
            )
          })}
        </div>
      )}

      {/* Picker — appears when no class is selected, or when the player
          clicks "+ Add another class". Lists every class not already picked
          as a collapsed tile; one can be expanded at a time. */}
      {pickerOpen && (
        <div className="space-y-2">
          {picks.length > 0 && (
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase" style={{ color: THEME.textSecondary }}>
                Pick another class
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
          {availableClasses.map((classDef) => (
            <ClassTile
              key={classDef.code}
              classDef={classDef}
              mode={expandedInPicker === classDef.code ? 'expandedToPick' : 'collapsed'}
              onExpand={() => setExpandedInPicker(classDef.code)}
              onCollapse={() => setExpandedInPicker(null)}
              onSelect={() => handleSelectClass(classDef.code)}
            />
          ))}
        </div>
      )}

      {showAddButton && (
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
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
        Total character level:{' '}
        <span style={{ color: THEME.textOnDark, fontWeight: 600 }}>{totalLevel}</span>
      </div>

      {error && (
        <div className="rounded-sm border px-3 py-2 text-sm" style={{ borderColor: '#f87171', color: '#f87171' }}>
          {error}
        </div>
      )}

      <StepFooter
        onBack={onBack}
        onNext={handleNext}
        nextDisabled={saving || picks.length === 0}
        nextLabel={saving ? 'Saving…' : 'Next →'}
      />
    </div>
  )
}
