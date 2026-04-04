/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

/**
 * Audio adapters — translate between backend schemas and engine config.
 *
 * These are the ONLY files that know both backend field names and engine
 * configuration shapes. Import from here, not from engine or API directly.
 */

export { assetToEngineConfig, engineToApiPayload } from './assetAdapter';
export { channelStateToEngineConfig, engineToChannelState } from './channelStateAdapter';
