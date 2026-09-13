/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useRef } from 'react'

import PlateButton from '@/app/dashboard/components/home/PlateButton'
import ComponentCard from './ComponentCard'

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
}) {
  const dragFrom = useRef(null)

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
            Players build against this when they join the party. Order here is the order they see.
            Nothing is required except what you mark required.
          </div>
        </div>

        {draft.components.map((configuration, index) => (
          <ComponentCard
            key={configuration.id}
            configuration={configuration}
            index={index}
            onChange={(next) => draft.updateComponent(configuration.id, next)}
            onRemove={() => draft.removeComponent(configuration.id)}
            onDragStart={(from) => (dragFrom.current = from)}
            onDrop={(to) => {
              if (dragFrom.current !== null && dragFrom.current !== to) {
                draft.moveComponent(dragFrom.current, to)
              }
              dragFrom.current = null
            }}
          />
        ))}

        <div className="rounded-md border border-dashed border-[#E5DECF] px-6 py-5 flex items-center justify-center gap-2.5 text-[13.5px] text-content-muted">
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
              <button
                key={entry.type}
                type="button"
                disabled={!canEdit}
                onClick={() => draft.addComponent(entry.type)}
                className="home-btn-outline rounded-md px-4 py-3 flex items-center justify-between disabled:opacity-50"
                style={{ transform: 'skewX(-8deg)' }}
              >
                <span className="inline-block text-[13px] font-semibold text-[#F7F4F3]" style={{ transform: 'skewX(8deg)' }}>
                  {entry.label}
                </span>
                <span className="inline-block text-[#D9A441]" style={{ transform: 'skewX(8deg)' }}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M8 3v10M3 8h10" />
                  </svg>
                </span>
              </button>
            ))}
          </div>
          <div className="mt-1.5 text-[12.5px] text-[#B5ADA6]">
            Number, Text and Choice arrive with the framework preset.
          </div>
        </div>
      </div>
    </div>
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
