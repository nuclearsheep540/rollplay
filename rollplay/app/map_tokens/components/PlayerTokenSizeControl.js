/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useEffect, useRef } from 'react';

import {
  PC_TOKEN_SCALE_DEFAULT,
  PC_TOKEN_SCALE_MAX,
  PC_TOKEN_SCALE_MIN,
  gridIsUsable,
} from '../config';

// Quiet period after the last value change before the save fires. Long enough
// to swallow keyboard auto-repeat, short enough that letting go and looking
// away still saves before you have moved on.
const SAVE_DEBOUNCE_MS = 400;

/**
 * PlayerTokenSizeControl — the map's player-token size (tokens v4).
 *
 * Scales player-side discs only: pc tokens and npc tokens the DM has assigned
 * to a player. NPC size stays per-token via footprint, so this never collapses
 * the two axes.
 *
 * Inert on a map with a usable grid (decision 49): a cell IS the scale there
 * and a player token is exactly one cell, so the control disables and says why
 * rather than silently doing nothing.
 *
 * Owns its own persist path deliberately — it writes one map_config field and
 * never touches grid_config. Keeping token art and map geometry on separate
 * write paths is the point of the v4 redesign (see plans/tokens/04 §0).
 *
 * Sends the field, not the map. Saving used to PUT this component's whole
 * cached map, which the server wrote as a document replacement — and the copy
 * in hand goes stale the moment the DM paints fog, because fog updates reach
 * the fog engine and never the cached map. Every size nudge after a brush
 * stroke wrote that fog away, silently. The scoped route also broadcasts the
 * new size, which the whole-map path never did.
 *
 * Saving is debounced, and that matters more than it looks: each save is a
 * MongoDB write plus a map broadcast to every client in the room. Firing one
 * per keypress meant holding an arrow key spammed the whole table.
 */
export default function PlayerTokenSizeControl({ roomId, activeMap, setActiveMap }) {
  // Hooks first — the early return below cannot sit above them.
  const pendingScaleRef = useRef(null);
  const saveTimerRef = useRef(null);
  // Refreshed every render so the unmount cleanup never calls a stale closure
  // (it would otherwise save against a long-dead activeMap).
  const commitPendingRef = useRef(() => {});

  // Flush on unmount. Without this the debounce reintroduces the exact bug it
  // was added to avoid: close the drawer inside the quiet period and the last
  // adjustment is silently lost — visible locally via the preview, never sent,
  // and gone at session end when the ETL reads what Mongo actually holds.
  useEffect(() => () => commitPendingRef.current(), []);

  const gridSetsTokenSize = gridIsUsable(activeMap?.map_config?.grid_config || null);
  const scale = activeMap?.map_config?.pc_token_scale ?? PC_TOKEN_SCALE_DEFAULT;

  // Live preview with no HTTP: the board reads pc_token_scale straight off
  // activeMap, so a local update resizes the discs as the slider moves. The
  // save's broadcast then carries the same value to everyone else — including
  // back to this client, where merging it is a no-op.
  const previewScale = (nextScale) => {
    if (!setActiveMap || !activeMap) return;
    setActiveMap({
      ...activeMap,
      map_config: { ...activeMap.map_config, pc_token_scale: nextScale },
    });
  };

  const persistScale = async (nextScale) => {
    // The map is identified by name, not sent: the server writes this one
    // field by path, leaving the fog and grid on that document untouched.
    const filename = activeMap?.map_config?.filename;
    if (!filename) return;
    try {
      const response = await fetch(`/api/game/${roomId}/map/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename,
          pc_token_scale: nextScale,
          updated_by: 'dm',
        })
      });
      if (!response.ok) {
        console.error('🪙 Failed to save player token size:', await response.text());
        alert('Failed to save player token size. Please try again.');
      }
    } catch (error) {
      console.error('🪙 Error saving player token size:', error);
      alert('Failed to save player token size. Please try again.');
    }
  };

  /** Save whatever is queued, now. Safe to call with nothing pending. */
  const commitPending = () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const scaleToSave = pendingScaleRef.current;
    if (scaleToSave === null) return;
    pendingScaleRef.current = null;
    persistScale(scaleToSave);
  };
  commitPendingRef.current = commitPending;

  // Debounced on the VALUE rather than on an input-method event: keyboard has
  // no equivalent of pointerup, and blur is not it — a DM can arrow the slider
  // to where they want it and simply stop, never leaving the control.
  const queueSave = (nextScale) => {
    pendingScaleRef.current = nextScale;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(commitPending, SAVE_DEBOUNCE_MS);
  };

  if (!activeMap) return null;

  return (
    <div className="ml-4 mb-4">
      <label className="block text-xs text-gray-400 mb-1">
        Player token size: {Math.round(scale * 100)}%
      </label>
      <input
        type="range"
        min={PC_TOKEN_SCALE_MIN}
        max={PC_TOKEN_SCALE_MAX}
        step="0.05"
        value={scale}
        disabled={gridSetsTokenSize}
        onChange={(event) => {
          const nextScale = parseFloat(event.target.value);
          previewScale(nextScale);
          queueSave(nextScale);
        }}
        // Mouse has a real "I'm done" moment, so skip the quiet period. No-op
        // when nothing is queued (a click that never moved the thumb).
        onPointerUp={commitPending}
        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="Player token size"
      />
      <p className="mt-1 text-[11px] leading-snug text-gray-500">
        {gridSetsTokenSize
          ? 'This map’s grid sets token size — a player token is exactly one cell.'
          : 'No grid on this map, so token size is estimated. Adjust if players look wrong against your image.'}
      </p>
    </div>
  );
}
