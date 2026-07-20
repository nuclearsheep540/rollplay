/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

/**
 * Map token constants + pure sizing/snapping math.
 *
 * All position math is in map-image-native pixels (product decision 7 —
 * one coordinate system, center-anchored). Rendering scales by
 * renderScale; storage never does.
 */

// footprint = cells per side, labeled with D&D size names (Small shares 1
// with Medium — product decision 8).
export const TOKEN_FOOTPRINTS = [
  { value: 1, label: 'Medium — 5 ft' },
  { value: 2, label: 'Large — 10 ft' },
  { value: 3, label: 'Huge — 15 ft' },
  { value: 4, label: 'Gargantuan — 20 ft' },
];

// Gridless sizing: modern VTT convention (Roll20 70px, Foundry 100px
// default), clamped so tokens stay sane on tiny or enormous images.
export const GRIDLESS_ASSUMED_CELL_PX = 100;

// Mirrors the server's hold staleness (map_token_holds.py) — a remote lift
// affordance with no release after this long reverts to committed state.
export const HELD_STALENESS_MS = 10000;

// NPC disc default: DM-rose (decision, 2026-07-20), matching the DM panel
// theme (Tailwind rose-500). Distinct from the 8-color seat fallback palette.
export const NPC_TOKEN_COLOR = '#f43f5e';

// Last-resort disc color when a pc token's owner has no character color and
// no seat (owner offline and unseated, or left the campaign).
export const FALLBACK_TOKEN_COLOR = '#6b7280';

/**
 * Native px per grid cell for token sizing. A tuned grid_cell_size wins
 * (even when the grid overlay is toggled off — it's still the map's scale
 * truth); otherwise assume the VTT-convention cell, clamped against the
 * smaller image dimension.
 */
export function cellPxForMap(gridConfig, naturalWidth, naturalHeight) {
  if (gridConfig?.grid_cell_size > 0) return gridConfig.grid_cell_size;

  const smallerMapDim = Math.min(naturalWidth || 0, naturalHeight || 0);
  if (smallerMapDim <= 0) return GRIDLESS_ASSUMED_CELL_PX;
  return Math.max(smallerMapDim / 50, Math.min(smallerMapDim / 10, GRIDLESS_ASSUMED_CELL_PX));
}

/**
 * Mint a token id (uuid4 string, client-side at placement — plan §3.1).
 * crypto.randomUUID is unavailable in non-secure contexts (plain-HTTP LAN
 * hosting); getRandomValues works everywhere, so fall back to assembling
 * the uuid4 by hand.
 */
export function mintTokenId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(bytes, (byteValue) => byteValue.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Native-px disc diameter for a token (decision 8: diameter = footprint × cellPx). */
export function tokenDiameterPx(footprint, gridConfig, naturalWidth, naturalHeight) {
  return (footprint || 1) * cellPxForMap(gridConfig, naturalWidth, naturalHeight);
}

/**
 * Snap a token center to the grid at drag-end — a client-side interaction
 * affordance, never a storage format (decision 7). Odd footprints center on
 * cell centers; even footprints align to cell corners so the disc covers
 * whole cells. No grid (or untuned cell size) → no snap.
 */
export function snapTokenCenter(x, y, gridConfig, footprint = 1) {
  if (!gridConfig?.enabled || !(gridConfig.grid_cell_size > 0)) return { x, y };

  const cellSize = gridConfig.grid_cell_size;
  const originX = gridConfig.offset_x || 0;
  const originY = gridConfig.offset_y || 0;
  const snapAxis = (value, origin) => {
    if (footprint % 2 === 1) {
      const cellIndex = Math.floor((value - origin) / cellSize);
      return origin + (cellIndex + 0.5) * cellSize;
    }
    return origin + Math.round((value - origin) / cellSize) * cellSize;
  };

  return { x: snapAxis(x, originX), y: snapAxis(y, originY) };
}
