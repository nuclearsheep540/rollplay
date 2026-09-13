/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { layoutBlocks } from './CharacterFormParts'
import { initialValueFor, pieceFor } from './registry'

/**
 * A character's values, laid out the way the GM arranged the form: groups as named
 * sections in config order, bare components standing on their own. This page is the
 * same document the player filled in, read back — so an "Inventory" section is an
 * Inventory section here too, not a run of attributes shuffled in with the rest.
 *
 * The platform-fixed type order (RUNTIME_TYPE_ORDER) is the in-game sheet's rule, for
 * the surface people read under pressure mid-play; it does not apply here.
 *
 * Every component shows, answered or not: the readers here are the owner and the GM,
 * who see everything, and an unanswered field is still a field. A first edit to one
 * builds the whole value from the component's starting point.
 */
export default function CharacterValueList({ config, values, editable = false, onChange, pendingIds }) {
  if (!config) return null

  const rows = (components) =>
    components.map((configuration) => {
      const SheetFull = pieceFor(configuration.type, 'SheetFull')
      return (
        <SheetFull
          key={configuration.id}
          configuration={configuration}
          value={values?.[configuration.id]}
          editable={editable}
          pending={pendingIds?.has(configuration.id)}
          onChange={(next) => onChange?.({ ...initialValueFor(configuration), ...next })}
        />
      )
    })

  return (
    <div className="flex flex-col gap-5">
      {layoutBlocks(config.components).map((block) => {
        const components = block.kind === 'group' ? block.group.components : block.components
        const rendered = rows(components)
        if (rendered.length === 0) return null
        return (
          <section key={block.kind === 'group' ? block.group.id : block.key}>
            {block.kind === 'group' && (
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-content-muted mb-1.5">
                {block.group.label}
              </div>
            )}
            <div className="divide-y divide-border">{rendered}</div>
          </section>
        )
      })}
    </div>
  )
}
