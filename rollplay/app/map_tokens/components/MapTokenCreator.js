/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import React, { useState } from 'react';

import { DM_HEADER, DM_CHILD_LAST } from '../../styles/constants';
import { NPC_TOKEN_COLOR, TOKEN_FOOTPRINTS } from '../config';
import MapTokenChip from './MapTokenChip';

/**
 * MapTokenCreator — the DM's "+ Add token" (decision 14: housed in
 * CombatControlsPanel; UI placement only, no combat/initiative linkage).
 *
 * Creates local NPC drafts (label + D&D-size footprint) that appear below
 * as chips; drag a chip onto the map to place it — the token becomes
 * shared table state at that moment. Unplaced drafts live only in this
 * DM's browser.
 */
export default function MapTokenCreator({
  npcDrafts = [],
  createNpcDraft,
  removeNpcDraft,
  beginCarry,
  cancelCarry,
  dropCarriedToken,
}) {
  const [label, setLabel] = useState('');
  const [footprint, setFootprint] = useState(1);

  const handleCreate = () => {
    if (!label.trim()) return;
    createNpcDraft(label, footprint);
    setLabel('');
  };

  return (
    <div className="mb-2">
      <div className={DM_HEADER}>Map Tokens</div>
      <div className={`${DM_CHILD_LAST} space-y-2`}>
        <div className="flex gap-2">
          <input
            type="text"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') handleCreate(); }}
            placeholder="Name (e.g. Goblin 3)"
            maxLength={64}
            className="flex-1 min-w-0 bg-black/30 border border-white/20 rounded px-2 py-1 text-xs text-gray-200 placeholder-gray-500"
          />
          <select
            value={footprint}
            onChange={(event) => setFootprint(Number(event.target.value))}
            className="bg-black/30 border border-white/20 rounded px-1 py-1 text-xs text-gray-200"
          >
            {TOKEN_FOOTPRINTS.map((size) => (
              <option key={size.value} value={size.value}>{size.label}</option>
            ))}
          </select>
        </div>
        <button
          onClick={handleCreate}
          disabled={!label.trim()}
          className="w-full py-1 rounded text-xs bg-rose-900/50 text-rose-100 border border-rose-400/50 hover:bg-rose-900/80 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + Add token
        </button>

        {npcDrafts.length > 0 && (
          <div className="space-y-1">
            {npcDrafts.map((draft) => (
              <div key={draft.id} className="flex items-center gap-1">
                <div className="flex-1 min-w-0">
                  <MapTokenChip
                    token={draft}
                    name={draft.label}
                    color={NPC_TOKEN_COLOR}
                    beginCarry={beginCarry}
                    cancelCarry={cancelCarry}
                    dropCarriedToken={dropCarriedToken}
                  />
                </div>
                <button
                  onClick={() => removeNpcDraft(draft.id)}
                  className="text-gray-500 hover:text-rose-400 text-xs px-1"
                  title="Discard draft"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
