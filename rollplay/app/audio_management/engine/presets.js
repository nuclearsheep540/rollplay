/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

/**
 * Channel presets and effect defaults for the audio engine.
 *
 * Presets are convenience objects — the engine is capability-based.
 * Consumers can override any field or define entirely new presets.
 */

// ── Channel presets ──────────────────────────────────────────────────────────
// Used with engine.createChannel(id, preset).
// Consumers can spread + override: { ...CHANNEL_PRESETS.BGM, metering: false }

export const CHANNEL_PRESETS = {
  /** Background music — full effect chain, loops by default, stereo metering. */
  BGM: {
    effects: ['hpf', 'lpf', 'reverb'],
    loopDefault: true,
    metering: true,
  },

  /** Sound effects — no effects, plays once, no metering. */
  SFX: {
    effects: [],
    loopDefault: false,
    metering: false,
  },
};

// ── Reverb impulse response presets ──────────────────────────────────────────
// { duration, decay } configs for runtime IR generation.
// duration: length of the reverb tail (seconds)
// decay: exponential decay rate (higher = faster decay)

export const REVERB_PRESETS = {
  room: { duration: 0.3, decay: 1.0 },
  hall: { duration: 0.6, decay: 1.5 },
  cathedral: { duration: 1.0, decay: 0.3 },
};

// ── Default effect state ─────────────────────────────────────────────────────
// Initial effect configuration when a channel is created.
// These are engine-native values (not backend field names).

export const DEFAULT_EFFECTS = {
  hpf: { enabled: false, mix: 0.7 },
  lpf: { enabled: false, mix: 0.7 },
  reverb: { enabled: false, mix: 0.6, preset: 'room' },
};
