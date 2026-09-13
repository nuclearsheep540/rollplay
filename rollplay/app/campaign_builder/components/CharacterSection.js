/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { Fragment, useState } from 'react'

import PlateButton from '@/app/dashboard/components/home/PlateButton'
import ComponentCard from './ComponentCard'
import FormPreview from './FormPreview'
import GroupCard from './GroupCard'

/** The insert index a card's "before me" or "after me" names, given where the card sits. */
const slotFor = (index, position) => (position === 'before' ? index : index + 1)

/** What a character is made of, and the versions of it that have been published. */
export default function CharacterSection({
  tabKey,
  draft,
  catalogue,
  state,
  onPublish,
  publishing,
  canEdit,
  campaignSaved,
  campaignName,
  hostName,
}) {
  // Drag state is React state, not refs: the placeholder renders from it. A target is a
  // container (null for the top level, else a group id) and a slot in its list — the
  // insert index as the list stands before the entry in hand is lifted out.
  const [dragging, setDragging] = useState(null)      // { id, kind: 'component' | 'group' }
  const [dropTarget, setDropTarget] = useState(null)  // { containerId, slot }

  const entries = draft.components
  const source = dragging ? draft.locate(dragging.id) : null

  const clearDrag = () => {
    setDragging(null)
    setDropTarget(null)
  }

  // A group goes on the top level only; a component goes anywhere.
  const accepts = (containerId) => dragging !== null && (containerId === null || dragging.kind === 'component')

  // A drop that would put the entry back where it is: its own index, or one past it.
  const isNoop = ({ containerId, slot }) =>
    !!source && source.containerId === containerId && (slot === source.index || slot === source.index + 1)

  const hover = (containerId, slot) => {
    if (!accepts(containerId)) return
    if (dropTarget?.containerId === containerId && dropTarget?.slot === slot) return
    setDropTarget({ containerId, slot })
  }

  const drop = (containerId, slot) => {
    if (!accepts(containerId)) return
    const target = { containerId, slot }
    if (!isNoop(target)) draft.moveEntry(dragging.id, target)
    clearDrag()
  }

  // No placeholder where a drop would change nothing.
  const showsPlaceholder = (containerId, slot) =>
    dragging !== null && dropTarget?.containerId === containerId && dropTarget?.slot === slot && !isNoop({ containerId, slot })

  // The slot the cursor is over, rendered as a target for itself. Opening it pushes what
  // follows down, so the cursor usually ends up over the placeholder rather than the card
  // that named the slot — and the outlined slot is where anyone would drop anyway.
  const placeholderAt = (containerId, slot) =>
    showsPlaceholder(containerId, slot) && <DropPlaceholder onDrop={() => drop(containerId, slot)} />

  // The "Move to" menu: every group the card is not already in, and the top level when it
  // is in one. A move by menu appends to the destination — the GM then drags within it if
  // the end is not where it belongs. Dragging stays the way to pick an exact slot.
  const groups = entries.filter((entry) => entry.type === 'group')
  const moveOptionsFor = (configuration, containerId) => {
    const sendTo = (targetId, length) => () => draft.moveEntry(configuration.id, { containerId: targetId, slot: length })
    const options = groups
      .filter((group) => group.id !== containerId)
      .map((group) => ({ label: group.label || 'Unnamed group', onClick: sendTo(group.id, group.components.length) }))
    if (containerId !== null) options.push({ label: 'Out of the group', onClick: sendTo(null, entries.length) })
    return options
  }

  // One component card, wherever it lives. The placeholder for the slot before it renders
  // here; the slot after the last card in a container is the container's to render.
  const renderComponent = (configuration, containerId, index) => (
    <Fragment key={configuration.id}>
      {placeholderAt(containerId, index)}
      <ComponentCard
        configuration={configuration}
        isDragging={dragging?.id === configuration.id}
        onChange={(next) => draft.updateComponent(configuration.id, next)}
        onDuplicate={() => draft.duplicateComponent(configuration.id)}
        onRemove={() => draft.removeComponent(configuration.id)}
        moveOptions={moveOptionsFor(configuration, containerId)}
        droppable={dragging === null || accepts(containerId)}
        onDragStart={() => setDragging({ id: configuration.id, kind: 'component' })}
        onDragOver={(position) => hover(containerId, slotFor(index, position))}
        onDrop={(position) => drop(containerId, slotFor(index, position))}
        onDragEnd={clearDrag}
      />
    </Fragment>
  )

  const renderGroup = (group, index) => (
    <Fragment key={group.id}>
      {placeholderAt(null, index)}
      <GroupCard
        group={group}
        isDragging={dragging?.id === group.id}
        memberInHand={dragging?.kind === 'component'}
        tailHighlighted={showsPlaceholder(group.id, group.components.length)}
        onRename={(patch) => draft.updateGroup(group.id, patch)}
        onUngroup={() => draft.removeGroup(group.id)}
        onDragStart={() => setDragging({ id: group.id, kind: 'group' })}
        onDragEnd={clearDrag}
        onDragOver={(position) => hover(null, slotFor(index, position))}
        onDrop={(position) => drop(null, slotFor(index, position))}
        onTailDragOver={() => hover(group.id, group.components.length)}
        onTailDrop={() => drop(group.id, group.components.length)}
      >
        {group.components.map((configuration, memberIndex) => renderComponent(configuration, group.id, memberIndex))}
      </GroupCard>
    </Fragment>
  )

  if (tabKey === 'preview') {
    return <FormPreview config={draft.asConfig()} campaignName={campaignName} hostName={hostName} />
  }

  if (tabKey === 'versions') {
    return (
      <VersionsTab
        state={state}
        onPublish={onPublish}
        publishing={publishing}
        canEdit={canEdit}
        campaignSaved={campaignSaved}
      />
    )
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_300px] gap-[26px] items-start">
      <div className="flex flex-col gap-[18px]">
        <div className="mb-1.5">
          <div className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#9A7526] mb-2">
            Character config
          </div>
          <div className="font-[family-name:var(--font-metamorphous)] text-[28px] text-content-primary">What a character is made of</div>
          <div className="mt-1.5 max-w-[620px] text-[12.5px] leading-relaxed text-content-muted">
            Players build against this when they join the party. Order here is the order they see;
            a group is a named section of the form. Nothing is required except what you mark required.
          </div>
        </div>

        {/* The list is the contract's entries: bare components and groups, in the order the
            form shows them. Groups are the GM's — nothing is grouped for them. */}
        {entries.map((entry, index) =>
          entry.type === 'group' ? renderGroup(entry, index) : renderComponent(entry, null, index),
        )}
        {placeholderAt(null, entries.length)}

        {/* The tail is a drop target too, so an entry can be moved to the very end. */}
        <div
          onDragOver={(event) => {
            event.preventDefault()
            event.dataTransfer.dropEffect = 'move'
            hover(null, entries.length)
          }}
          onDrop={(event) => {
            event.preventDefault()
            drop(null, entries.length)
          }}
          className={`rounded-md border border-dashed px-6 py-5 flex items-center justify-center gap-2.5 text-[13.5px] text-content-muted ${
            dragging !== null ? 'border-[#D9A441] bg-[#FBF7EF]' : 'border-[#E5DECF]'
          }`}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M8 3v10M3 8h10" />
          </svg>
          Drop a component here, or pick one from the palette
        </div>
      </div>

      <div className="sticky top-6 flex flex-col gap-6">
        <div className="rounded-md bg-surface-secondary px-5 pt-5 pb-6 flex flex-col gap-3.5">
          <div className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#D9A441]">Components</div>
          <div className="text-[12.5px] leading-relaxed text-[#B5ADA6]">
            Ours to define, yours to configure. Add as many of each as your game needs, or none.
            Secret components are seen only by their player and the GM.
          </div>
          <div className="flex flex-col gap-2 mt-1">
            {(catalogue || []).map((entry) => (
              <PaletteButton key={entry.type} disabled={!canEdit} onClick={() => draft.addComponent(entry.type)}>
                {entry.label}
              </PaletteButton>
            ))}
          </div>
          <div className="mt-1.5 text-[12.5px] text-[#B5ADA6]">
            Number, Text and Choice arrive with the framework preset.
          </div>

          <div className="mt-2 pt-4 border-t border-[#3A3633] flex flex-col gap-2">
            <div className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#D9A441]">Sections</div>
            <div className="text-[12.5px] leading-relaxed text-[#B5ADA6]">
              A group is a named section of the form. Add one, name it, drag components in.
            </div>
            <PaletteButton disabled={!canEdit} onClick={() => draft.addGroup()}>
              Add group
            </PaletteButton>
          </div>
        </div>
      </div>
    </div>
  )
}

/** One skewed plate in the palette — a component type, or the group. */
function PaletteButton({ onClick, disabled, children }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="home-btn-outline rounded-md px-4 py-3 flex items-center justify-between disabled:opacity-50"
      style={{ transform: 'skewX(-8deg)' }}
    >
      <span className="inline-block text-[13px] font-semibold text-[#F7F4F3]" style={{ transform: 'skewX(8deg)' }}>
        {children}
      </span>
      <span className="inline-block text-[#D9A441]" style={{ transform: 'skewX(8deg)' }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M8 3v10M3 8h10" />
        </svg>
      </span>
    </button>
  )
}

/**
 * The outlined slot a drop will land in. Card-height so the list does not jump, and a drop
 * target in its own right — it stops the event so the card or group around it does not
 * re-target the drop to a different slot.
 */
function DropPlaceholder({ onDrop }) {
  return (
    <div
      aria-hidden="true"
      onDragOver={(event) => {
        event.preventDefault()
        event.stopPropagation()
        event.dataTransfer.dropEffect = 'move'
      }}
      onDrop={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onDrop()
      }}
      className="h-[72px] rounded-md border-2 border-dashed border-[#D9A441] bg-[#FBF7EF]"
    />
  )
}

function VersionsTab({ state, onPublish, publishing, canEdit, campaignSaved }) {
  const versions = [...(state?.versions || [])].reverse()
  const pending = state?.pending_changes || []
  const latest = state?.versions?.length ? state.versions[state.versions.length - 1] : null
  const nextVersion = (latest?.version || 0) + 1

  return (
    <div className="max-w-[760px] flex flex-col gap-6">
      <div>
        <div className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#9A7526] mb-2">Versions</div>
        <div className="font-[family-name:var(--font-metamorphous)] text-[28px] text-content-primary">What players have built against</div>
        <div className="mt-1.5 text-[12.5px] leading-relaxed text-content-muted">
          Publishing freezes the current draft as a version. Characters already built keep the version
          they were built on and keep playing — a difference is something to know about, never a block.
        </div>
      </div>

      {canEdit && (
        <div className="rounded-xl border border-[#E5DECF] bg-[#FBF7EF] px-6 py-5">
          <div className="text-[13px] font-semibold text-[#141210] mb-2.5">Pending changes</div>
          {!campaignSaved ? (
            <div className="text-[12.5px] text-content-muted">
              Name the campaign to save it, then publish v1. Publishing needs a campaign to
              belong to — the components you add are kept here until then.
            </div>
          ) : pending.length === 0 ? (
            <div className="text-[12.5px] text-content-muted">
              {latest ? `No changes since v${latest.version}.` : 'Nothing saved yet.'}
            </div>
          ) : (
            <>
              <ul className="flex flex-col gap-1.5 mb-4">
                {pending.map((change) => (
                  <li key={`${change.component_id}-${change.kind}`} className="text-[12.5px] text-[#37322F]">
                    <span className="font-semibold">{change.label}</span> — {change.kind}
                    {change.fields?.length ? ` (${change.fields.join(', ')})` : ''}
                  </li>
                ))}
              </ul>
              <PlateButton variant="gold" size="sm" onClick={onPublish} disabled={publishing}>
                {publishing ? 'Publishing…' : `Publish v${nextVersion}`}
              </PlateButton>
            </>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {versions.length === 0 && (
          <div className="text-[12.5px] text-content-muted">Nothing published yet.</div>
        )}
        {versions.map((version) => (
          <div key={version.id} className="flex items-center justify-between rounded-md border border-[#E5DECF] bg-white px-5 py-3.5">
            <span className="font-semibold text-sm">v{version.version}</span>
            <span className="text-[12.5px] text-content-muted">
              {version.component_count} component{version.component_count === 1 ? '' : 's'}
            </span>
            <span className="text-[12.5px] text-content-muted">
              {new Date(version.created_at).toLocaleDateString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
