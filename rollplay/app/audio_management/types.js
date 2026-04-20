/*
 * Audio Management Types
 *
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const PlaybackState = {
  STOPPED: 'stopped',
  PLAYING: 'playing',
  PAUSED: 'paused',
  TRANSITIONING: 'transitioning'
};

export const ChannelType = {
  BGM: 'bgm',
  SFX: 'sfx'
};

// V1 hardcoded effect parameters — V2 replaces these with user-configurable values
// from music_assets (asset defaults) and SceneAudioChannel (scene overrides)
export const DEFAULT_EFFECTS = {
  hpf: { enabled: false, frequency: 1000, mix: 0.7 },
  lpf: { enabled: false, frequency: 500, mix: 0.7 },
  reverb: { enabled: false, preset: 'room', mix: 0.6 },
};

// Reverb IR presets — generated at runtime from { duration, decay } configs
// No static WAV files needed; AudioBuffers created via createImpulseResponse()
export const REVERB_PRESETS = {
  room: { duration: 0.3, decay: 1.0 },
  hall: { duration: 0.6, decay: 1.5 },
  cathedral: { duration: 1.0, decay: 0.3 },
};

// Effect strip definitions for mixer drawer rendering (reverb only — HPF/LPF are knobs on channel strip)
export const EFFECT_STRIP_DEFS = [
  { key: 'reverb', label: 'RVB', color: 'purple' },
];

// Canonical BGM channel layout. Shared between:
//   - the in-game mixer (useUnifiedAudio initial state)
//   - the Workshop preset editor (slot rows)
//   - the preset-load path (WebSocket batch trackIds)
// These IDs MUST match the keys in useUnifiedAudio's remoteTrackStates
// initial state, otherwise preset loads won't resolve to real channels.
export const BGM_CHANNELS = [
  { id: 'audio_channel_A', label: 'A' },
  { id: 'audio_channel_B', label: 'B' },
  { id: 'audio_channel_C', label: 'C' },
  { id: 'audio_channel_D', label: 'D' },
  { id: 'audio_channel_E', label: 'E' },
  { id: 'audio_channel_F', label: 'F' },
];