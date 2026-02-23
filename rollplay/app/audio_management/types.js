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
  room: { duration: 0.6, decay: 3.0 },
  hall: { duration: 1.0, decay: 1.0 },
  cathedral: { duration: 3.0, decay: 1.5 },
};