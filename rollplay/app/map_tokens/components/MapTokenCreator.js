/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCopy } from '@fortawesome/free-solid-svg-icons';

import { DM_HEADER, DM_CHILD_LAST } from '../../styles/constants';
import { FALLBACK_TOKEN_COLOR, NPC_TOKEN_COLOR, TOKEN_FOOTPRINTS } from '../config';
import MapTokenChip from './MapTokenChip';
import { HiddenToggleButton, LockToggleButton } from './TokenFlagToggles';

/**
 * MapTokenCreator — the DM's "+ Add token" (decision 14: housed in
 * CombatControlsPanel; UI placement only, no combat/initiative linkage).
 *
 * Creates local NPC drafts (label + D&D-size footprint) that appear below
 * as chips; drag a chip onto the map to place it — the token becomes
 * shared table state at that moment.
 *
 * The placed list derives from the BOARD, not from this browser's drafts —
 * every npc token on the current map gets a "return" chip, including ones
 * placed before a refresh or from another browser (the board is the truth;
 * local drafts are just unplaced stamps). Recalling a token rebuilds its
 * draft, so anything returned is immediately re-placeable. One draft can
 * place on each map in the session (per-map stamps).
 */
export default function MapTokenCreator({
  npcDrafts = [],
  tokens = [],
  createNpcDraft,
  duplicateNpcToken,
  toggleNpcDraftHidden,
  assignNpcDraft,
  removeNpcDraft,
  recallNpcToken,
  configureToken,
  seatedPlayers = [], // [{ userId, name }] — assignment targets for party-controlled tokens
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

  // An assigned npc token (a player's minion/companion) wears its
  // assignee's color in the panel too, so the DM can scan ownership.
  const companionColor = (token) => {
    if (!token.owner_user_id) return NPC_TOKEN_COLOR;
    const assignee = seatedPlayers.find((player) => player.userId === token.owner_user_id);
    return assignee?.color || FALLBACK_TOKEN_COLOR;
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

        {(() => {
          // Board truth first: every npc token on the current map gets a
          // return chip. Local drafts render only while unplaced (a placed
          // draft is represented by its board token).
          const placedNpcTokens = tokens.filter((token) => token.kind === 'npc');
          const placedTokenIds = new Set(placedNpcTokens.map((token) => token.id));
          const unplacedDrafts = npcDrafts.filter((draft) => !placedTokenIds.has(draft.id));
          if (!placedNpcTokens.length && !unplacedDrafts.length) return null;

          return (
            <div className="space-y-1">
              {placedNpcTokens.map((token) => (
                <div key={token.id} className="flex items-center gap-1">
                  <div className="flex-1 min-w-0">
                    <MapTokenChip
                      token={token}
                      name={token.label || 'NPC'}
                      color={companionColor(token)}
                      placed={true}
                      onReturn={token.locked ? null : () => recallNpcToken(token)}
                      beginCarry={beginCarry}
                      cancelCarry={cancelCarry}
                      dropCarriedToken={dropCarriedToken}
                    />
                  </div>
                  <select
                    value={token.owner_user_id || ''}
                    onChange={(event) =>
                      configureToken(token, { owner_user_id: event.target.value || null })}
                    className="bg-black/20 border border-white/10 rounded px-0.5 py-0.5 text-[10px] text-gray-200 max-w-[80px]"
                    title="Assign to a player — the token becomes their companion (they and the party can move it, and it wears their color)"
                  >
                    <option value="">DM only</option>
                    {seatedPlayers.map((player) => (
                      <option key={player.userId} value={player.userId}>{player.name}</option>
                    ))}
                  </select>
                  <HiddenToggleButton
                    hidden={token.hidden === true}
                    onToggle={() => configureToken(token, { hidden: !token.hidden })}
                  />
                  <LockToggleButton
                    locked={token.locked === true}
                    onToggle={() => configureToken(token, { locked: !token.locked })}
                    lockedTitle="Locked in place (nobody can move or return it) — click to unlock"
                  />
                  <button
                    onClick={() => duplicateNpcToken(token)}
                    className="text-gray-500 hover:text-gray-300 text-xs px-1"
                    title="Duplicate — adds an unplaced copy to the list"
                  >
                    <FontAwesomeIcon icon={faCopy} />
                  </button>
                </div>
              ))}
              {unplacedDrafts.map((draft) => (
                <div key={draft.id} className="flex items-center gap-1">
                  <div className="flex-1 min-w-0">
                    <MapTokenChip
                      token={draft}
                      name={draft.label}
                      color={companionColor(draft)}
                      beginCarry={beginCarry}
                      cancelCarry={cancelCarry}
                      dropCarriedToken={dropCarriedToken}
                    />
                  </div>
                  <select
                    value={draft.owner_user_id || ''}
                    onChange={(event) => assignNpcDraft(draft.id, event.target.value || null)}
                    className="bg-black/20 border border-white/10 rounded px-0.5 py-0.5 text-[10px] text-gray-200 max-w-[80px]"
                    title="Assign to a player before placing — it arrives on the board as their companion"
                  >
                    <option value="">DM only</option>
                    {seatedPlayers.map((player) => (
                      <option key={player.userId} value={player.userId}>{player.name}</option>
                    ))}
                  </select>
                  <HiddenToggleButton
                    hidden={draft.hidden === true}
                    onToggle={() => toggleNpcDraftHidden(draft.id)}
                  />
                  <LockToggleButton disabled disabledTitle="Place the token first to lock it" />
                  <button
                    onClick={() => duplicateNpcToken(draft)}
                    className="text-gray-500 hover:text-gray-300 text-xs px-1"
                    title="Duplicate — adds a copy to the list"
                  >
                    <FontAwesomeIcon icon={faCopy} />
                  </button>
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
          );
        })()}
      </div>
    </div>
  );
}
