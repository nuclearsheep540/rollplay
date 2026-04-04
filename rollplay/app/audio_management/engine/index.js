/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

/**
 * Audio Engine — barrel export.
 *
 * A reusable, class-based Web Audio engine with dynamic channels,
 * pluggable effects, stereo metering, and cross-browser audio unlock.
 */

// Core classes
export { default as AudioEngine } from './AudioEngine';
export { default as AudioChannel } from './AudioChannel';
export { default as EffectChain } from './EffectChain';
export { default as StereoMeter } from './StereoMeter';
export { default as EventEmitter } from './EventEmitter';

// Effects
export { default as AudioEffect } from './effects/AudioEffect';
export { default as HighPassFilter } from './effects/HighPassFilter';
export { default as LowPassFilter } from './effects/LowPassFilter';
export { default as ConvolutionReverb } from './effects/ConvolutionReverb';

// Configuration
export { CHANNEL_PRESETS, REVERB_PRESETS, DEFAULT_EFFECTS } from './presets';
export {
  PlaybackState,
  EngineState,
  LoopMode,
  mapHpfFrequency,
  mapLpfFrequency,
} from './constants';
