/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useState } from 'react';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCopy, faImage } from '@fortawesome/free-solid-svg-icons';

import { NPC_TOKEN_COLOR, TOKEN_FOOTPRINTS } from '@/app/map_tokens';
import { HiddenToggleButton, LockToggleButton } from '@/app/map_tokens/components/TokenFlagToggles';

/**
 * WorkshopTokenControls — right-panel editor for a map's npc token
 * baseline (tokens v2, decision 22). Tokens added here appear on the
 * center preview and drag-position like the game runtime; Save commits
 * the whole list atomically via PATCH /tokens.
 *
 * The in-play warning (decision 26) renders inline: a paused session's
 * board for this map diverges from what the workshop would author, so the
 * server answers 409 board_in_play and the DM chooses "save anyway"
 * (retry with force) or backs off. The live-session 409 stays a hard
 * inline error, exactly like grid and fog.
 */
export default function WorkshopTokenControls({
  tokens = [],
  dirty = false,
  onAddToken,
  onUpdateToken,
  onDeleteToken,
  onDuplicateToken,
  onPickAvatar,
  onSave,
  isSaving = false,
  saveSuccess = false,
  error = null,
  inPlayWarning = null,
  onDismissInPlayWarning,
}) {
  const [newLabel, setNewLabel] = useState('');
  const [newFootprint, setNewFootprint] = useState(1);

  const handleAdd = () => {
    if (!newLabel.trim()) return;
    onAddToken(newLabel, newFootprint);
    setNewLabel('');
  };

  return (
    <div className="p-3 space-y-3">
      <p className="text-content-on-dark font-semibold text-xs">Token baseline</p>
      <p className="text-[11px] text-content-secondary leading-relaxed">
        Prepared npc tokens for this map. They seed every new session and
        persist between games; in-session changes never write back here.
        New tokens start hidden from players.
      </p>

      <div className="flex gap-2">
        <input
          type="text"
          value={newLabel}
          onChange={(event) => setNewLabel(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') handleAdd(); }}
          placeholder="Name (e.g. Pit Trap)"
          maxLength={64}
          className="flex-1 min-w-0 bg-black/30 border border-white/20 rounded px-2 py-1 text-xs text-gray-200 placeholder-gray-500"
        />
        <select
          value={newFootprint}
          onChange={(event) => setNewFootprint(Number(event.target.value))}
          className="bg-black/30 border border-white/20 rounded px-1 py-1 text-xs text-gray-200"
        >
          {TOKEN_FOOTPRINTS.map((size) => (
            <option key={size.value} value={size.value}>{size.label}</option>
          ))}
        </select>
      </div>
      <button
        onClick={handleAdd}
        disabled={!newLabel.trim()}
        className="w-full py-1 rounded text-xs bg-rose-900/50 text-rose-100 border border-rose-400/50 hover:bg-rose-900/80 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        + Add token
      </button>

      {tokens.length > 0 && (
        <div className="space-y-1">
          {tokens.map((baselineToken) => (
            <div key={baselineToken.id} className="flex items-center gap-1">
              <span
                className="inline-block w-3 h-3 rounded-full border border-black/50 shrink-0"
                style={{ backgroundColor: NPC_TOKEN_COLOR }}
              />
              <input
                type="text"
                value={baselineToken.label || ''}
                maxLength={64}
                onChange={(event) => onUpdateToken(baselineToken.id, { label: event.target.value })}
                className="flex-1 min-w-0 bg-black/20 border border-white/10 rounded px-1.5 py-0.5 text-xs text-gray-200"
              />
              <select
                value={baselineToken.footprint || 1}
                onChange={(event) => onUpdateToken(baselineToken.id, { footprint: Number(event.target.value) })}
                className="bg-black/20 border border-white/10 rounded px-0.5 py-0.5 text-xs text-gray-200"
                title="Size"
              >
                {TOKEN_FOOTPRINTS.map((size) => (
                  <option key={size.value} value={size.value}>{size.value}</option>
                ))}
              </select>
              <button
                onClick={() => onPickAvatar(baselineToken.id)}
                className={`text-xs px-1 ${baselineToken.image_asset_id ? 'text-amber-300' : 'text-gray-500 hover:text-gray-300'}`}
                title={baselineToken.image_asset_id
                  ? 'Change avatar image'
                  : 'Set avatar image (library or upload)'}
              >
                <FontAwesomeIcon icon={faImage} />
              </button>
              <HiddenToggleButton
                hidden={baselineToken.hidden === true}
                onToggle={() => onUpdateToken(baselineToken.id, { hidden: !baselineToken.hidden })}
              />
              <LockToggleButton
                locked={baselineToken.locked === true}
                onToggle={() => onUpdateToken(baselineToken.id, { locked: !baselineToken.locked })}
                lockedTitle="Locked in place at session start — click to unlock"
              />
              <button
                onClick={() => onDuplicateToken(baselineToken.id)}
                className="text-gray-500 hover:text-gray-300 text-xs px-1"
                title="Duplicate — copy lands at map center"
              >
                <FontAwesomeIcon icon={faCopy} />
              </button>
              <button
                onClick={() => onDeleteToken(baselineToken.id)}
                className="text-gray-500 hover:text-rose-400 text-xs px-0.5"
                title="Delete token"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {inPlayWarning ? (
        <div className="border border-amber-400/50 bg-amber-900/20 rounded p-2 space-y-2">
          <p className="text-xs text-amber-200 leading-relaxed">{inPlayWarning}</p>
          <p className="text-[11px] text-amber-200/80 leading-relaxed">
            Un-conflicting changes land when the session resumes; anything
            play already touched keeps its in-game state until the session
            finishes.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => onSave(true)}
              disabled={isSaving}
              className="flex-1 py-1 rounded text-xs bg-amber-700/60 text-amber-100 border border-amber-400/50 hover:bg-amber-700/90 disabled:opacity-40"
            >
              {isSaving ? 'Saving…' : 'Save anyway'}
            </button>
            <button
              onClick={onDismissInPlayWarning}
              disabled={isSaving}
              className="flex-1 py-1 rounded text-xs text-gray-300 border border-white/25 hover:bg-white/10"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => onSave(false)}
          disabled={isSaving || !dirty}
          className="w-full py-1.5 rounded text-xs bg-emerald-900/50 text-emerald-100 border border-emerald-400/50 hover:bg-emerald-900/80 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isSaving ? 'Saving…' : 'Save tokens'}
        </button>
      )}

      {saveSuccess && (
        <div className="text-xs text-emerald-300">✓ Token baseline saved.</div>
      )}
      {error && (
        <div className="text-xs text-rose-300">{error}</div>
      )}

      <p className="text-[11px] text-content-secondary leading-relaxed">
        Drag tokens on the preview to position them. While a session is
        active, edit tokens in-game from the DM panel instead.
      </p>
    </div>
  );
}
