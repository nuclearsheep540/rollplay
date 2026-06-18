/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useMemo, useState } from 'react'

import { THEME } from '@/app/styles/colorTheme'
import { useEditionSpells } from '../../hooks/useReferenceData'

import StepFooter from './StepFooter'

/**
 * Spell selection step — only mounted by the wizard when a chosen class has
 * spellcasting. Renders one picker section per spellcasting class (a single
 * class at level 1). Cantrip / prepared counts are shown as guidance with a
 * running tally; the player is never blocked from over- or under-picking
 * (facilitate, don't enforce — see core/product-principles.md §3.0).
 */
export default function SpellsStep({ draft, classDefs = [], onSave, onBack, onNext }) {
  const classByCode = useMemo(() => {
    const m = new Map()
    classDefs.forEach((c) => m.set(c.code, c))
    return m
  }, [classDefs])

  const casterEntries = useMemo(
    () => (draft.class_entries ?? []).filter((e) => classByCode.get(e.class_code)?.spellcasting),
    [draft.class_entries, classByCode],
  )

  // Hydrate per-class picks from the draft's stored class-sourced spells.
  const [picks, setPicks] = useState(() => {
    const initial = {}
    for (const s of draft.spells ?? []) {
      if (s.source === 'class_known' || s.source === 'class_prepared') {
        ;(initial[s.granted_by] ||= []).push(s.spell_code)
      }
    }
    return initial
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const handleNext = async () => {
    setSaving(true)
    setError(null)
    try {
      const selections = casterEntries.map((e) => ({
        class_code: e.class_code,
        spell_codes: picks[e.class_code] ?? [],
      }))
      await onSave({ selections })
      onNext()
    } catch (err) {
      setError(err?.message || 'Failed to save spells')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold" style={{ color: THEME.textBold }}>
          Spells
        </h2>
        <p className="text-sm" style={{ color: THEME.textSecondary }}>
          Choose your cantrips and prepared spells. The suggested counts follow your class —
          you can pick fewer or more; nothing here is locked.
        </p>
      </div>

      {casterEntries.map((entry) => (
        <ClassSpellPicker
          key={entry.class_code}
          editionCode={draft.edition_code}
          classDef={classByCode.get(entry.class_code)}
          classEntry={entry}
          value={picks[entry.class_code] ?? []}
          onChange={(codes) => setPicks((p) => ({ ...p, [entry.class_code]: codes }))}
        />
      ))}

      {error ? (
        <div className="text-sm" style={{ color: THEME.feedbackError ?? '#f87171' }}>
          {error}
        </div>
      ) : null}

      <StepFooter onBack={onBack} onNext={handleNext} nextDisabled={saving} />
    </div>
  )
}

/**
 * One class's spell picker: a cantrip checklist (level 0) and a level-1 spell
 * checklist, each labelled with the class's suggested count and a running tally.
 */
function ClassSpellPicker({ editionCode, classDef, classEntry, value, onChange }) {
  const { data: cantrips } = useEditionSpells(editionCode, classDef.code, 0)
  const { data: leveled } = useEditionSpells(editionCode, classDef.code, 1)

  const sc = classDef.spellcasting || {}
  const lvl = String(classEntry.level)
  const cantripLimit = sc.cantrips_known_by_level?.[lvl] ?? 0
  const preparedLimit = sc.prepared_spells_by_level?.[lvl] ?? 0

  const selected = new Set(value)
  const toggle = (code) => {
    const next = new Set(selected)
    if (next.has(code)) next.delete(code)
    else next.add(code)
    onChange([...next])
  }

  const cantripCodes = new Set((cantrips ?? []).map((s) => s.code))
  const leveledCodes = new Set((leveled ?? []).map((s) => s.code))
  const cantripCount = value.filter((c) => cantripCodes.has(c)).length
  const leveledCount = value.filter((c) => leveledCodes.has(c)).length

  return (
    <div className="border rounded-sm p-3 space-y-4" style={{ borderColor: THEME.borderDefault }}>
      <div className="text-sm font-semibold" style={{ color: THEME.textBold }}>
        {classDef.name}
      </div>

      <SpellChecklist
        title="Cantrips"
        limit={cantripLimit}
        count={cantripCount}
        spells={cantrips}
        selected={selected}
        onToggle={toggle}
      />

      <SpellChecklist
        title="Level 1 spells"
        limit={preparedLimit}
        count={leveledCount}
        spells={leveled}
        selected={selected}
        onToggle={toggle}
      />
    </div>
  )
}

function SpellChecklist({ title, limit, count, spells, selected, onToggle }) {
  const over = count > limit && limit > 0
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase" style={{ color: THEME.textSecondary }}>
        {title}
        {limit > 0 ? ` — choose ${limit}` : ''}
        <span className="ml-2 normal-case" style={{ color: over ? '#fbbf24' : THEME.textSecondary }}>
          ({count}{limit > 0 ? `/${limit}` : ''})
        </span>
      </div>
      {!spells ? (
        <div className="text-sm italic" style={{ color: THEME.textSecondary }}>
          Loading…
        </div>
      ) : spells.length === 0 ? (
        <div className="text-sm italic" style={{ color: THEME.textSecondary }}>
          None available.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 max-h-60 overflow-y-auto pr-1">
          {spells.map((s) => (
            <label key={s.code} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={selected.has(s.code)}
                onChange={() => onToggle(s.code)}
              />
              <span style={{ color: THEME.textOnDark }}>{s.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
