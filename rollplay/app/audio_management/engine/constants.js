/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

/**
 * Audio engine constants — frequency mappings, timing, and playback states.
 *
 * These are engine-internal values. Backend field names never appear here.
 */

// ── Playback states ──────────────────────────────────────────────────────────
export const PlaybackState = {
  STOPPED: 'stopped',
  PLAYING: 'playing',
  PAUSED: 'paused',
};

// ── Engine lifecycle states ──────────────────────────────────────────────────
export const EngineState = {
  SUSPENDED: 'suspended',
  READY: 'ready',
  CLOSED: 'closed',
};

// ── Loop modes ───────────────────────────────────────────────────────────────
//
// OFF        — no looping; the track plays once and stops.
// FULL       — loop the entire buffer end-to-end.
// CONTINUOUS — play from 0 on first start; once playback reaches the loop
//              region end it wraps to loop region start and keeps looping
//              forever. The pre-loop portion plays as an intro.
//              (Matches the SFZ/SoundFont `loop_continuous` convention —
//              a.k.a. "sustain loop with intro".)
// REGION     — strictly within the loop region. Playback from a stopped
//              state snaps to loopStart; subsequent wraps behave the same
//              as CONTINUOUS. Pre-region audio never plays.
export const LoopMode = {
  OFF: 'off',
  FULL: 'full',
  CONTINUOUS: 'continuous',
  REGION: 'region',
};

// ── Frequency mapping ────────────────────────────────────────────────────────
// Logarithmic mapping from 0.0–1.0 fader → Hz.

// HPF: 0.0 = 20Hz (minimal cut / pass-all), 1.0 = 5000Hz (aggressive cut)
export const HPF_MIN_FREQ = 20;
export const HPF_MAX_FREQ = 5000;
export const HPF_PASS_ALL_FREQ = 20;

export const mapHpfFrequency = (faderValue) => {
  const minLog = Math.log(HPF_MIN_FREQ);
  const maxLog = Math.log(HPF_MAX_FREQ);
  return Math.exp(minLog + faderValue * (maxLog - minLog));
};

// LPF: 0.0 = 200Hz (aggressive cut), 1.0 = 20kHz (minimal cut / pass-all)
// Inverted: fader-up = brighter (less cut)
export const LPF_MIN_FREQ = 200;
export const LPF_MAX_FREQ = 20000;
export const LPF_PASS_ALL_FREQ = 20000;

export const mapLpfFrequency = (faderValue) => {
  const minLog = Math.log(LPF_MIN_FREQ);
  const maxLog = Math.log(LPF_MAX_FREQ);
  return Math.exp(minLog + faderValue * (maxLog - minLog));
};

// ── Filter defaults ──────────────────────────────────────────────────────────
export const FILTER_Q = 0.707; // Butterworth (maximally flat passband)

// ── Ramp timing ──────────────────────────────────────────────────────────────
export const RAMP_TIME = 0.02; // 20ms to avoid clicks on parameter changes

// ── Reverb ───────────────────────────────────────────────────────────────────
export const REVERB_MAKEUP_GAIN = 3.0; // Fixed boost to compensate for convolution attenuation

// ── Volume ───────────────────────────────────────────────────────────────────
export const MAX_VOLUME = 1.3; // Allow slight boost above unity
export const DEFAULT_VOLUME = 0.8;

// ── Metering ─────────────────────────────────────────────────────────────────
export const METER_FFT_SIZE = 256;
export const METER_SMOOTHING = 0.8;

// ── Time tracking ────────────────────────────────────────────────────────────
export const TIME_UPDATE_THRESHOLD = 0.1; // Only emit timeupdate every 100ms
