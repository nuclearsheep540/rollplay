/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

/**
 * Adapter: REST API asset responses ↔ engine config format.
 *
 * This is the ONLY code that knows both backend field names and engine
 * configuration shapes. The engine never sees `effect_hpf_enabled` or
 * `default_looping`. Backend schemas never know about `LoopMode` or
 * `EffectChain.applyEffects()` format.
 *
 * Backend shape (MediaAssetResponse):
 *   effect_hpf_enabled, effect_hpf_mix, effect_lpf_enabled, effect_lpf_mix,
 *   effect_reverb_enabled, effect_reverb_mix, effect_reverb_preset,
 *   effect_eq_enabled, default_volume, default_looping, duration_seconds,
 *   loop_start, loop_end, bpm, loop_mode
 *
 * Engine shape:
 *   { effects: { eq, hpf, hpf_mix, lpf, lpf_mix, reverb, reverb_mix, reverb_preset },
 *     loop: { mode, start, end }, volume, bpm, duration }
 */

import { LoopMode } from '../engine/constants';
import { DEFAULT_EFFECTS } from '../engine/presets';

/**
 * Convert a REST API asset response to engine configuration.
 *
 * @param {object} asset - MediaAssetResponse from backend
 * @returns {object} Engine-format config for EffectChain + AudioChannel
 */
export function assetToEngineConfig(asset) {
  if (!asset) return null;

  return {
    effects: {
      eq: !!(asset.effect_hpf_enabled || asset.effect_lpf_enabled || asset.effect_eq_enabled),
      hpf: asset.effect_hpf_enabled ?? DEFAULT_EFFECTS.hpf.enabled,
      hpf_mix: asset.effect_hpf_mix ?? DEFAULT_EFFECTS.hpf.mix,
      lpf: asset.effect_lpf_enabled ?? DEFAULT_EFFECTS.lpf.enabled,
      lpf_mix: asset.effect_lpf_mix ?? DEFAULT_EFFECTS.lpf.mix,
      reverb: asset.effect_reverb_enabled ?? DEFAULT_EFFECTS.reverb.enabled,
      reverb_mix: asset.effect_reverb_mix ?? DEFAULT_EFFECTS.reverb.mix,
      reverb_preset: asset.effect_reverb_preset ?? DEFAULT_EFFECTS.reverb.preset,
    },
    loop: {
      mode: _resolveLoopMode(asset.loop_mode, asset.default_looping),
      start: asset.loop_start ?? null,
      end: asset.loop_end ?? null,
    },
    volume: asset.default_volume ?? null,
    bpm: asset.bpm ?? null,
    duration: asset.duration_seconds ?? null,
  };
}

/**
 * Convert engine state to a REST API request payload for
 * PATCH /api/library/{id}/audio-config.
 *
 * Only includes fields that are set (non-null).
 *
 * @param {object} engineConfig - Engine-format config
 * @returns {object} Flat fields for UpdateAudioConfigRequest
 */
export function engineToApiPayload(engineConfig) {
  if (!engineConfig) return {};

  const payload = {};

  // Loop fields
  if (engineConfig.loop) {
    if (engineConfig.loop.mode != null) payload.loop_mode = engineConfig.loop.mode;
    if (engineConfig.loop.start != null) payload.loop_start = engineConfig.loop.start;
    if (engineConfig.loop.end != null) payload.loop_end = engineConfig.loop.end;
  }

  // BPM
  if (engineConfig.bpm != null) payload.bpm = engineConfig.bpm;

  // Volume
  if (engineConfig.volume != null) payload.default_volume = engineConfig.volume;

  // Effects
  if (engineConfig.effects) {
    const e = engineConfig.effects;
    if (e.hpf != null) payload.effect_hpf_enabled = e.hpf;
    if (e.hpf_mix != null) payload.effect_hpf_mix = e.hpf_mix;
    if (e.lpf != null) payload.effect_lpf_enabled = e.lpf;
    if (e.lpf_mix != null) payload.effect_lpf_mix = e.lpf_mix;
    if (e.reverb != null) payload.effect_reverb_enabled = e.reverb;
    if (e.reverb_mix != null) payload.effect_reverb_mix = e.reverb_mix;
    if (e.reverb_preset != null) payload.effect_reverb_preset = e.reverb_preset;
    if (e.eq != null) payload.effect_eq_enabled = e.eq;
  }

  return payload;
}

// ── Private helpers ──────────────────────────────────────────────────────────

/**
 * Resolve loop mode from backend fields.
 * New assets have loop_mode directly. Legacy assets only have default_looping bool.
 */
function _resolveLoopMode(loopMode, defaultLooping) {
  if (loopMode) return loopMode;
  if (defaultLooping === true) return LoopMode.FULL;
  if (defaultLooping === false) return LoopMode.OFF;
  return LoopMode.FULL; // Default for music assets
}
