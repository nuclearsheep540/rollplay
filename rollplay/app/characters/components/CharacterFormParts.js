/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { Fragment } from 'react'

import { platePolygon, SKEW_BOX, SKEW_LABEL, TEXT_SHADOW_ON_ART } from '@/app/styles/plateGeometry'
import { pieceFor } from './registry'

/**
 * The pieces of the player's create form, fed data rather than fetching it.
 *
 * Split out so the campaign builder's Preview tab renders the REAL form against the
 * working draft — the same reason the news editor imports NewsCard rather than
 * approximating it: a preview built from the same parts cannot drift from what ships.
 * CharacterCreateForm composes these with the session, the avatar and the submit.
 */

const HERO_GRADIENT =
  'radial-gradient(120% 90% at 78% 8%, #6B4A2E 0%, rgba(107,74,46,0) 34%), ' +
  'radial-gradient(90% 70% at 85% 30%, #24344F 0%, rgba(36,52,79,0) 55%), ' +
  'linear-gradient(115deg,#0A0D16 20%,#131B2E 55%,#0C1020 100%)'

/**
 * The page the form sits on: the content frame, not a reading column. The header's nav
 * items mark the frame's edges and the form sits a step inside them. Inside a narrower
 * pane (the builder's preview) the frame is simply wider than the pane, and the form
 * fills what it has — the same rule, applied to less room.
 */
export function CharacterFormFrame({ children }) {
  return <div className="mx-auto w-full max-w-[var(--content-frame)] px-6 py-10 flex flex-col gap-6">{children}</div>
}

/** The title plate: which campaign, which version, whose table. */
export function CharacterFormHero({ campaignName, version, hostName }) {
  return (
    <div className="relative overflow-hidden rounded-md px-10 py-8 flex flex-col gap-2.5" style={{ background: HERO_GRADIENT, clipPath: platePolygon() }}>
      <div className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#D9A441]">Join the party</div>
      <div className="font-[family-name:var(--font-metamorphous)] text-[36px] leading-tight text-[#F7F4F3]" style={{ textShadow: TEXT_SHADOW_ON_ART }}>
        {campaignName || 'This campaign'}
      </div>
      <div className="flex items-center gap-2.5 text-[13.5px] text-[#CFC9C2]">
        <span>Built against</span>
        <span className="inline-flex px-2 py-[2.5px] rounded bg-[#D9A441] text-[#241C08] text-[9.5px] font-bold tracking-[0.1em]" style={{ transform: SKEW_BOX }}>
          <span className="inline-block" style={{ transform: SKEW_LABEL }}>{version}</span>
        </span>
        <span>run by {hostName || 'your GM'}</span>
      </div>
    </div>
  )
}

/**
 * The white card of inputs, in the GM's order and sections, with `children` as the
 * footer row (the hint and the submit — or, in a preview, a note that nothing is saved).
 */
export function CharacterFormFields({ config, values, errors, onChange, children }) {
  return (
    <div className="rounded-md border border-[#E5DECF] bg-white px-7 py-6 flex flex-col gap-[22px]">
      {layoutBlocks(config.components).map((block) =>
        block.kind === 'group' ? (
          <section key={block.group.id}>
            <div className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#9A7526] mb-3">
              {block.group.label}
            </div>
            <ComponentInputs components={block.group.components} values={values} errors={errors} onChange={onChange} />
          </section>
        ) : (
          <ComponentInputs key={block.key} components={block.components} values={values} errors={errors} onChange={onChange} />
        ),
      )}
      {children}
    </div>
  )
}

/**
 * The form's blocks, in the GM's order: each group is one block, and each run of bare
 * components between groups is one. A group published empty has nothing to ask, so it
 * is left out rather than shown as a heading over nothing. Shared with the character
 * page, which is the same document read back.
 */
export function layoutBlocks(entries) {
  const blocks = []
  for (const entry of entries) {
    if (entry.type === 'group') {
      if (entry.components.length > 0) blocks.push({ kind: 'group', group: entry })
      continue
    }
    const last = blocks[blocks.length - 1]
    if (last?.kind === 'components') {
      last.components.push(entry)
    } else {
      blocks.push({ kind: 'components', key: entry.id, components: [entry] })
    }
  }
  return blocks
}

/**
 * The inputs for one run of components. Attributes that sit together tile into a grid;
 * everything else stacks in order. Purely a layout rule — nothing is grouped by it.
 *
 * The page fills the content frame, so nothing here may assume a column: the grid packs
 * as many cells as fit and caps each one, and every control caps its own width — a name
 * box or a description a screen wide is harder to read, not easier.
 */
function ComponentInputs({ components, values, errors, onChange }) {
  const runs = []
  for (const configuration of components) {
    const last = runs[runs.length - 1]
    if (configuration.type === 'attribute' && last?.type === 'attribute') {
      last.items.push(configuration)
    } else {
      runs.push({ type: configuration.type, key: configuration.id, items: [configuration] })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {runs.map((run) => {
        const inputs = run.items.map((configuration) => {
          const CreateInput = pieceFor(configuration.type, 'CreateInput')
          return (
            <CreateInput
              key={configuration.id}
              configuration={configuration}
              value={values[configuration.id]}
              error={errors[configuration.id]}
              onChange={(next) => onChange(configuration.id, next)}
            />
          )
        })
        return run.type === 'attribute' ? (
          <div key={run.key} className="grid grid-cols-[repeat(auto-fill,minmax(180px,240px))] gap-4">{inputs}</div>
        ) : (
          <Fragment key={run.key}>{inputs}</Fragment>
        )
      })}
    </div>
  )
}
