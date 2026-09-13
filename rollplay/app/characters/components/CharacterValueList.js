/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { flatComponents, labelForType, pieceFor, RUNTIME_TYPE_ORDER } from './registry'

/**
 * A character's values, in the platform's fixed order: identity, then hit points, then
 * attributes, then anything else.
 *
 * Fixed rather than the GM's order because this is the surface people read under time
 * pressure mid-game, and it should sit in the same place on everyone's screen. The create
 * form is the opposite case and keeps the GM's order.
 *
 * The GM's groups are a form thing and do not appear here: the sheet is flat, by type.
 *
 * A component with no value is skipped — that is a secret one, stripped for this viewer.
 */
export default function CharacterValueList({ config, values, editable = false, onChange, pendingIds }) {
  if (!config) return null

  const byType = new Map()
  for (const configuration of flatComponents(config.components)) {
    const list = byType.get(configuration.type) || []
    list.push(configuration)
    byType.set(configuration.type, list)
  }

  const orderedTypes = [
    ...RUNTIME_TYPE_ORDER.filter((type) => byType.has(type)),
    ...[...byType.keys()].filter((type) => !RUNTIME_TYPE_ORDER.includes(type)),
  ]

  return (
    <div className="flex flex-col gap-5">
      {orderedTypes.map((type) => {
        const configurations = byType.get(type).filter((configuration) => values?.[configuration.id])
        if (configurations.length === 0) return null
        const SheetFull = pieceFor(type, 'SheetFull')
        return (
          <div key={type}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-content-muted mb-1.5">
              {labelForType(type)}
            </div>
            <div className="divide-y divide-border">
              {configurations.map((configuration) => (
                <SheetFull
                  key={configuration.id}
                  configuration={configuration}
                  value={values[configuration.id]}
                  editable={editable}
                  pending={pendingIds?.has(configuration.id)}
                  onChange={(next) => onChange?.(next)}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
