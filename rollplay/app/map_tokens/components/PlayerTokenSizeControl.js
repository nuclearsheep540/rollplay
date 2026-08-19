/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import {
  PC_TOKEN_SCALE_DEFAULT,
  PC_TOKEN_SCALE_MAX,
  PC_TOKEN_SCALE_MIN,
  gridIsUsable,
} from '../config';

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
 */
export default function PlayerTokenSizeControl({ roomId, activeMap, setActiveMap }) {
  if (!activeMap) return null;

  const gridSetsTokenSize = gridIsUsable(activeMap?.map_config?.grid_config || null);
  const scale = activeMap?.map_config?.pc_token_scale ?? PC_TOKEN_SCALE_DEFAULT;

  // Live preview with no HTTP: the board reads pc_token_scale straight off
  // activeMap, so a local update resizes the discs as the slider moves. The
  // broadcast from the PUT lands the same value moments later.
  const previewScale = (nextScale) => {
    if (!setActiveMap) return;
    setActiveMap({
      ...activeMap,
      map_config: { ...activeMap.map_config, pc_token_scale: nextScale },
    });
  };

  const persistScale = async (nextScale) => {
    const { _id, ...mapWithoutId } = activeMap;
    const updatedMap = {
      ...mapWithoutId,
      map_config: { ...mapWithoutId.map_config, pc_token_scale: nextScale },
    };
    try {
      const response = await fetch(`/api/game/${roomId}/map`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ map: updatedMap, updated_by: 'dm' })
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
        onChange={(event) => previewScale(parseFloat(event.target.value))}
        onPointerUp={(event) => persistScale(parseFloat(event.target.value))}
        onKeyUp={(event) => persistScale(parseFloat(event.target.value))}
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
