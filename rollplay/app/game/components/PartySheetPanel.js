/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useEffect, useState } from 'react'

import CharacterSheet from './CharacterSheet'
import { useCampaignParty } from '../hooks/useCharacterRuntime'

/**
 * Read-only party panel — every finalised character locked to the campaign.
 *
 * Lives in the left drawer alongside PARTY / CHARACTER / LOG. The DM uses
 * this to spot-check vitals across the table; players see it too for
 * coordination (the underlying endpoint authorises any campaign member).
 *
 * Layout: small horizontal picker at the top (one button per character),
 * then the selected character's full sheet underneath, rendered through
 * the same CharacterSheet component the player uses — just with
 * ``readOnly={true}`` so the editors disappear.
 */
export default function PartySheetPanel({ campaignId, onRoll }) {
  const { data: party, isLoading, isError, error, refetch } = useCampaignParty(campaignId)
  const [selectedId, setSelectedId] = useState(null)

  // Sync selected character: default to first entry, fall back when the
  // selected character disappears (e.g. player releases mid-session).
  useEffect(() => {
    if (!party || party.length === 0) {
      setSelectedId(null)
      return
    }
    if (!selectedId || !party.some((c) => c.id === selectedId)) {
      setSelectedId(party[0].id)
    }
  }, [party, selectedId])

  if (isLoading) {
    return <p className="px-2 py-3 text-sm text-slate-400">Loading party…</p>
  }

  if (isError) {
    return (
      <div className="px-2 py-3 space-y-2">
        <p className="text-sm text-rose-400">
          {error?.message ?? 'Failed to load party.'}
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="px-2 py-1 rounded border border-slate-600 text-slate-200 text-xs hover:bg-slate-700"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!party || party.length === 0) {
    return (
      <p className="px-2 py-3 text-sm text-slate-400">
        No party members have a character selected for this campaign yet.
      </p>
    )
  }

  const selected = party.find((c) => c.id === selectedId)

  return (
    <div className="space-y-3">
      {/* Picker strip — scrolls horizontally if the party grows beyond ~4. */}
      <div className="flex overflow-x-auto gap-1 pb-1 -mx-2 px-2 border-b border-slate-700">
        {party.map((c) => {
          const isActive = c.id === selectedId
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedId(c.id)}
              className={`whitespace-nowrap rounded px-2 py-1 text-xs border ${
                isActive
                  ? 'border-amber-500 bg-amber-500/10 text-amber-200'
                  : 'border-slate-700 text-slate-300 hover:border-slate-500'
              }`}
              title={`${c.character_name} — Level ${c.level}`}
            >
              <span className="font-semibold">{c.character_name}</span>
              <span className="ml-1 opacity-70">L{c.level}</span>
              {!c.is_alive && <span className="ml-1 text-rose-400">✝</span>}
            </button>
          )
        })}
      </div>

      {/* Selected character's sheet, read-only. Reuses the player runtime
          sheet so visual changes stay in lockstep across tabs. ``readOnly``
          disables every editor AND the dice-roll affordances — rolls should
          come from the owning player so the roll log attributes correctly. */}
      {selected && (
        <CharacterSheet
          key={selected.id}
          character={selected}
          onRoll={onRoll}
          readOnly
        />
      )}
    </div>
  )
}
