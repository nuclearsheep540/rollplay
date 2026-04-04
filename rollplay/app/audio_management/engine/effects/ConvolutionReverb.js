/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import AudioEffect from './AudioEffect';
import { REVERB_MAKEUP_GAIN, RAMP_TIME } from '../constants';
import { REVERB_PRESETS } from '../presets';

/**
 * Convolution reverb effect (send/return).
 *
 * Uses a ConvolverNode with runtime-generated impulse responses (exponentially
 * decaying stereo white noise). No static WAV files needed.
 *
 * Signal path (managed by EffectChain):
 *   postEqNode → convolver → makeupGain (3x) → wetGain → sendMuteGain → output
 *
 * When enabled: wetGain = mix level.
 * When disabled: wetGain = 0.0.
 *
 * Presets change the impulse response buffer (duration + decay rate).
 */
export default class ConvolutionReverb extends AudioEffect {
  constructor(ctx, options = {}) {
    super(ctx, options);

    this._preset = options.preset || 'room';

    // Convolver with runtime-generated IR
    this._convolver = ctx.createConvolver();
    this._convolver.buffer = ConvolutionReverb.createImpulseResponse(ctx, this._preset);

    // Fixed makeup gain to compensate for convolution attenuation
    this._makeupGain = ctx.createGain();
    this._makeupGain.gain.value = REVERB_MAKEUP_GAIN;

    // Wet gain — controlled by mix level
    this._wetGain = ctx.createGain();
    this._wetGain.gain.value = 0.0; // Disabled by default

    // Mute gate — for mute/solo to control the send independently
    this._sendMuteGain = ctx.createGain();
    this._sendMuteGain.gain.value = 1.0;

    // Internal chain: convolver → makeupGain → wetGain → sendMuteGain
    this._convolver.connect(this._makeupGain);
    this._makeupGain.connect(this._wetGain);
    this._wetGain.connect(this._sendMuteGain);
  }

  get name() { return 'reverb'; }
  get type() { return 'send'; }

  /** ConvolverNode — exposed for EffectChain wiring. */
  get convolver() { return this._convolver; }

  /** Send mute gain — for mute/solo control by EffectChain. */
  get sendMuteGain() { return this._sendMuteGain; }

  /** Wet gain node — exposed for metering taps. */
  get wetGain() { return this._wetGain; }

  get preset() { return this._preset; }

  connect(inputNode, outputNode) {
    super.connect(inputNode, outputNode);
    // Send wiring: input taps signal → convolver chain → output
    inputNode.connect(this._convolver);
    this._sendMuteGain.connect(outputNode);
  }

  disconnect() {
    if (!this._connected) return;
    try {
      this._convolver.disconnect();
      this._makeupGain.disconnect();
      this._wetGain.disconnect();
      this._sendMuteGain.disconnect();
    } catch (_) {}
    // Rewire internal chain for when reconnected
    this._convolver.connect(this._makeupGain);
    this._makeupGain.connect(this._wetGain);
    this._wetGain.connect(this._sendMuteGain);
    super.disconnect();
  }

  setEnabled(enabled) {
    super.setEnabled(enabled);
    const now = this._ctx.currentTime;
    const targetGain = enabled ? this._mix : 0.0;
    this._wetGain.gain.setValueAtTime(this._wetGain.gain.value, now);
    this._wetGain.gain.linearRampToValueAtTime(targetGain, now + RAMP_TIME);
  }

  setMix(value) {
    super.setMix(value);
    if (!this._enabled) return;
    const now = this._ctx.currentTime;
    this._wetGain.gain.setValueAtTime(this._wetGain.gain.value, now);
    this._wetGain.gain.linearRampToValueAtTime(value, now + RAMP_TIME);
  }

  setParam(name, value) {
    if (name === 'preset') {
      if (value === this._preset) return;
      this._preset = value;
      this._convolver.buffer = ConvolutionReverb.createImpulseResponse(this._ctx, value);
    }
  }

  /**
   * Set the send mute gain (for mute/solo control).
   * This is independent of enabled/mix — it's a channel-level gate.
   */
  setSendMuted(muted) {
    const now = this._ctx.currentTime;
    this._sendMuteGain.gain.setValueAtTime(
      this._sendMuteGain.gain.value, now
    );
    this._sendMuteGain.gain.linearRampToValueAtTime(
      muted ? 0.0 : 1.0, now + RAMP_TIME
    );
  }

  destroy() {
    try {
      this._convolver.disconnect();
      this._makeupGain.disconnect();
      this._wetGain.disconnect();
      this._sendMuteGain.disconnect();
    } catch (_) {}
    this._convolver = null;
    this._makeupGain = null;
    this._wetGain = null;
    this._sendMuteGain = null;
    super.destroy();
  }

  /**
   * Generate a reverb impulse response AudioBuffer at runtime.
   * Exponentially decaying stereo white noise — no static files needed.
   *
   * @param {AudioContext} ctx
   * @param {string} presetName - Key into REVERB_PRESETS
   * @returns {AudioBuffer}
   */
  static createImpulseResponse(ctx, presetName) {
    const preset = REVERB_PRESETS[presetName] || REVERB_PRESETS.room;
    const length = Math.floor(ctx.sampleRate * preset.duration);
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, preset.decay);
      }
    }
    return impulse;
  }
}
