/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { flatComponents, labelForType, pieceFor, RUNTIME_TYPE_ORDER } from '@/app/characters/components/registry'
import { SKEW_BOX, SKEW_LABEL } from '@/app/styles/plateGeometry'

/**
 * The in-game sheet: a character's values as the room holds them, grouped by type in the
 * platform's fixed order — identity, hit points, attributes, anything else — GM order
 * within a type. Fixed rather than the GM's sections because this is the surface people
 * read under pressure mid-play, and it should sit in the same place on everyone's screen.
 *
 * A component with no value is skipped: the room stripped it, so it is secret to this
 * viewer. Every edit goes through the component write (HTTP → room → broadcast); the
 * sheet never assumes a change landed until the room says so.
 */
const PLURAL = { identity: 'Identity', hit_points: 'Hit points', attribute: 'Attributes' }

export default function RuntimeCharacterSheet({
  configuration,
  values,
  displayName,
  isOwner,
  isGM,
  onChange,
  pendingComponentIds,
  picker = null,
}) {
  if (!configuration) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto p-4 text-sm text-content-secondary">
        {picker ? 'Pick a character to open its sheet.' : 'No character at this seat.'}
        {picker && <SheetPicker picker={picker} />}
      </div>
    )
  }

  const byType = new Map()
  for (const entry of flatComponents(configuration.components)) {
    if (!values?.[entry.id]) continue
    const list = byType.get(entry.type) || []
    list.push(entry)
    byType.set(entry.type, list)
  }
  const orderedTypes = [
    ...RUNTIME_TYPE_ORDER.filter((type) => byType.has(type)),
    ...[...byType.keys()].filter((type) => !RUNTIME_TYPE_ORDER.includes(type)),
  ]
  const editable = isOwner || isGM

  return (
    // The sheet pieces were written for the light character page; on the dark drawer
    // their muted tone is re-pointed at the on-dark muted colour, one token for all.
    <div
      className="flex-1 min-h-0 overflow-y-auto px-4 py-4 flex flex-col gap-5"
      style={{ '--content-muted': 'var(--content-secondary)' }}
    >
      {picker && <SheetPicker picker={picker} />}
      <div className="flex items-center gap-3">
        <h2 className="font-[family-name:var(--font-metamorphous)] text-xl text-content-on-dark">{displayName || 'Unnamed character'}</h2>
        <span className="inline-flex px-2 py-[2.5px] rounded bg-[#D9A441] text-[#241C08] text-[9.5px] font-bold tracking-[0.1em]" style={{ transform: SKEW_BOX }}>
          <span className="inline-block" style={{ transform: SKEW_LABEL }}>v{configuration.version}</span>
        </span>
      </div>
      {orderedTypes.map((type) => {
        const SheetFull = pieceFor(type, 'SheetFull')
        return (
          <section key={type}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-content-secondary mb-1.5">
              {PLURAL[type] || labelForType(type)}
            </div>
            <div className="divide-y divide-white/10">
              {byType.get(type).map((entry) => (
                <SheetFull
                  key={entry.id}
                  configuration={entry}
                  value={values[entry.id]}
                  editable={editable}
                  pending={pendingComponentIds?.has(entry.id)}
                  onChange={(next) => onChange?.(next)}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

/** The GM's choice of whose sheet to open. */
function SheetPicker({ picker }) {
  return (
    <label className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-content-secondary">
      Sheet
      <select
        className="px-2 py-1 rounded-sm border border-white/20 bg-black/30 text-sm normal-case tracking-normal text-content-on-dark"
        value={picker.value || ''}
        onChange={(event) => picker.onChange(event.target.value)}
      >
        {picker.options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  )
}
