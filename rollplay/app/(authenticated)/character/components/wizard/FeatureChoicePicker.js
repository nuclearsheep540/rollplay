/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { THEME } from '@/app/styles/colorTheme'

import { useEditionFeats, useEditionInvocations, useEditionMetamagic } from '../../hooks/useReferenceData'

/**
 * Inline picker for one ClassFeatureChoice / SpeciesSubChoice (they share the
 * same shape). `value` is the array of picked codes; `onChange(nextArray)`
 * reports edits. Used by both ClassTile (L1 feature choices) and SpeciesTile
 * (species sub-choices) — the choice's `type` decides the control:
 *   single_pick      → radio over inline options (pick 1)
 *   feat_pick        → radio over feats in the `source` category (e.g. fighting_style)
 *   skill_proficiency→ checklist over inline options (pick `count`)
 *   invocation       → checklist over the invocations catalogue (prereqs shown as guidance)
 *   metamagic        → checklist over the metamagic catalogue (sorcery-point cost shown)
 *   weapon_mastery / language / tool_proficiency → free-text slots (no catalogue yet)
 *
 * Surfaces options, never hides — and never blocks (facilitate, don't enforce).
 */
export default function FeatureChoicePicker({ choice, editionCode, value = [], onChange }) {
  const { type, count = 1, options = [], source = null, name, code } = choice

  // feat_pick resolves its options from a feat category ("fighting_style", "origin", …);
  // invocation / metamagic resolve from their own catalogue endpoints.
  const featCategory = type === 'feat_pick' ? source?.[0] ?? null : null
  const { data: feats } = useEditionFeats(featCategory ? editionCode : null, featCategory)
  const { data: invocations } = useEditionInvocations(type === 'invocation' ? editionCode : null)
  const { data: metamagic } = useEditionMetamagic(type === 'metamagic' ? editionCode : null)

  const Label = (
    <div className="text-xs uppercase mb-1" style={{ color: THEME.textSecondary }}>
      {name}
      {count > 1 ? ` — choose ${count}` : ''}
      {count > 1 ? <span className="ml-2 normal-case">({value.length}/{count})</span> : null}
    </div>
  )

  if (type === 'single_pick' || type === 'feat_pick') {
    const opts =
      type === 'feat_pick'
        ? (feats ?? []).map((f) => ({ code: f.code, name: f.name, description: f.description }))
        : options
    const selected = value[0] ?? ''
    return (
      <div className="space-y-1">
        {Label}
        {opts.length === 0 ? (
          <div className="text-sm italic" style={{ color: THEME.textSecondary }}>
            Options not available yet.
          </div>
        ) : (
          opts.map((o) => (
            <label key={o.code} className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name={code}
                checked={selected === o.code}
                onChange={() => onChange([o.code])}
                className="mt-1"
              />
              <span style={{ color: THEME.textOnDark }}>
                <span className="font-medium">{o.name}</span>
                {o.description ? (
                  <span style={{ color: THEME.textSecondary }}> — {o.description}</span>
                ) : null}
              </span>
            </label>
          ))
        )}
      </div>
    )
  }

  if (type === 'skill_proficiency') {
    const toggle = (optCode) => {
      if (value.includes(optCode)) onChange(value.filter((c) => c !== optCode))
      else if (value.length < count) onChange([...value, optCode])
    }
    return (
      <div className="space-y-1">
        {Label}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
          {options.map((o) => {
            const checked = value.includes(o.code)
            const disabled = !checked && value.length >= count
            return (
              <label
                key={o.code}
                className={`flex items-center gap-2 text-sm ${disabled ? 'opacity-40' : 'cursor-pointer'}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => toggle(o.code)}
                />
                <span style={{ color: THEME.textOnDark }}>{o.name}</span>
              </label>
            )
          })}
        </div>
      </div>
    )
  }

  // invocation / metamagic — catalogue-backed checklist (pick up to `count`). Prereqs and
  // sorcery-point costs are shown as guidance only; selection is never blocked (facilitate,
  // don't enforce). The full B.4 picker (Mystic Arcanum, prereq filtering, swap-on-level) is later.
  if (type === 'invocation' || type === 'metamagic') {
    const catalogue = type === 'invocation' ? invocations : metamagic
    const toggle = (optCode) => {
      if (value.includes(optCode)) onChange(value.filter((c) => c !== optCode))
      else if (value.length < count) onChange([...value, optCode])
    }
    return (
      <div className="space-y-1">
        {Label}
        {!catalogue ? (
          <div className="text-sm italic" style={{ color: THEME.textSecondary }}>
            Loading options…
          </div>
        ) : (
          <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
            {catalogue.map((o) => {
              const checked = value.includes(o.code)
              const disabled = !checked && value.length >= count
              const meta =
                type === 'invocation'
                  ? o.prerequisite_text
                  : `${o.sorcery_point_cost} Sorcery Point${o.sorcery_point_cost === 1 ? '' : 's'}`
              return (
                <label
                  key={o.code}
                  className={`flex items-start gap-2 text-sm ${disabled ? 'opacity-40' : 'cursor-pointer'}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggle(o.code)}
                    className="mt-1"
                  />
                  <span style={{ color: THEME.textOnDark }}>
                    <span className="font-medium">{o.name}</span>
                    {meta ? <span style={{ color: THEME.textSecondary }}> — {meta}</span> : null}
                  </span>
                </label>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // weapon_mastery / language / tool_proficiency — free-text slots until the
  // relevant catalogue lands (weapon catalogue is A.9).
  const slots = Math.max(count, 1)
  const setSlot = (idx, v) => {
    const next = [...value]
    while (next.length < slots) next.push('')
    next[idx] = v
    onChange(next)
  }
  return (
    <div className="space-y-1">
      {Label}
      {type === 'weapon_mastery' ? (
        <div className="text-xs" style={{ color: THEME.textSecondary }}>
          Weapon catalogue pending — type weapon names for now.
        </div>
      ) : null}
      {Array.from({ length: slots }).map((_, idx) => (
        <input
          key={idx}
          type="text"
          value={value[idx] ?? ''}
          onChange={(e) => setSlot(idx, e.target.value)}
          placeholder={`${name} ${idx + 1}`}
          className="w-full px-3 py-2 border rounded-sm focus:outline-none focus:ring-1 text-sm"
          style={{
            backgroundColor: THEME.bgSecondary,
            borderColor: THEME.borderDefault,
            color: THEME.textOnDark,
          }}
        />
      ))}
    </div>
  )
}
