/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

/**
 * Fog Management Module Index
 *
 * Decoupled module modelled on audio_management/. Exposes a pure-JS
 * FogEngine, a useFogEngine React adapter, fog WebSocket helpers, and
 * thin UI components. Same module is consumed by the in-game DM panel
 * and the workshop map editor — neither knows about the other.
 */

// Engine
export { FogEngine, EventEmitter } from './engine';

// Hooks + WS helpers
export {
  useFogEngine,
  useFogRegions,
  handleRemoteFogUpdate,
  createFogSendFunctions,
  registerFogHandlers,
} from './hooks';

// Components
export {
  FogCanvasLayer,
  FogRegionStack,
  FogRegionLabels,
  FogPaintControls,
  RegionListPanel,
  RegionParamsEditor,
} from './components';
