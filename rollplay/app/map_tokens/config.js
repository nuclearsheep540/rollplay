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

// Live-drag streaming (v1.1, plan §3.3 fast-follow). Flip the flag off to
// ship markers-only — the backend relays move frames either way.
export const LIVE_DRAG_STREAMING = true;
// Sender throttle: minimum gap between relayed move frames (~20 Hz). The
// devtools-throttled head-of-line test (§3.3) is what tunes or vetoes this.
export const DRAG_STREAM_INTERVAL_MS = 50;
// Frames deliberately have NO staleness timeout. A gap in the stream means
// "the hand stopped moving" far more often than "the hand went dark" — people
// hold a mini still while they talk — so the disc keeps steering to the last
// known position rather than reverting to its pre-pickup one. A hand that
// really has gone dark is resolved by hold expiry (HELD_STALENESS_MS above),
// which is the mechanism that actually asks "is this hand alive". A frame
// timeout on top only disagreed with it: it told the table a held mini was
// back at its origin while its owner's hand was visibly still on it.
// Remote lerp factor per animation frame — how fast the disc chases the
// latest relayed position (0–1; higher = snappier, lower = smoother).
export const DRAG_LERP_FACTOR = 0.3;

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

// Player-token scale bounds (tokens v4), mirroring MapConfig.pc_token_scale.
// Bounded rather than free so a disc can't wander far enough from its cell to
// read as broken.
export const PC_TOKEN_SCALE_MIN = 0.5;
export const PC_TOKEN_SCALE_MAX = 1.5;
export const PC_TOKEN_SCALE_DEFAULT = 1;

/**
 * Is this token player-side? True for pc tokens, and for npc tokens the DM has
 * assigned to a player — a companion is the player's piece (decision 2), so it
 * follows the same rules including this one.
 *
 * Third derivation of a predicate that already existed as MapTokenLayer's
 * `isCompanion` and the server's `companion_move_allowed`, so it earns a name.
 */
export function isPlayerSideToken(token) {
  return token?.kind === 'pc' || !!token?.owner_user_id;
}

/**
 * Can this grid address positions? Present, enabled, and cell size tuned —
 * the client twin of shared_contracts.grid_math.grid_usable.
 */
export function gridIsUsable(gridConfig) {
  return !!gridConfig?.enabled && gridConfig.grid_cell_size > 0;
}

/**
 * Native-px disc diameter for a token (decision 8: diameter = footprint × cellPx),
 * scaled by the map's player-token size for player-side tokens only.
 *
 * The scale is presentation ONLY. footprint stays the occupancy truth, so
 * snapping, grid cell labels and the exact-cell re-snap never see this.
 *
 * It is also inert on a map with a usable grid: there, a cell IS the scale,
 * and a pc token is exactly one cell — Matt's rule, and the thing that stops
 * a scaled disc overhanging or floating inside its square. The knob exists
 * for maps with no grid, where the cell size is only an estimate.
 */
export function tokenDiameterPx(token, gridConfig, naturalWidth, naturalHeight, pcTokenScale = null) {
  const baseDiameter = (token?.footprint || 1)
    * cellPxForMap(gridConfig, naturalWidth, naturalHeight);
  if (gridIsUsable(gridConfig) || !isPlayerSideToken(token)) return baseDiameter;

  const scale = Number.isFinite(pcTokenScale) ? pcTokenScale : PC_TOKEN_SCALE_DEFAULT;
  const clampedScale = Math.max(PC_TOKEN_SCALE_MIN, Math.min(PC_TOKEN_SCALE_MAX, scale));
  return baseDiameter * clampedScale;
}

/**
 * Snap a token center to the grid at drag-end — a client-side interaction
 * affordance, never a storage format (decision 7). Odd footprints center on
 * cell centers; even footprints align to cell corners so the disc covers
 * whole cells. No grid (or untuned cell size) → no snap.
 */
export function snapTokenCenter(x, y, gridConfig, footprint = 1) {
  if (!gridIsUsable(gridConfig)) return { x, y };

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
