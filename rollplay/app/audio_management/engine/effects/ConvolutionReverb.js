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
 * DSP-only: this effect owns the convolver + makeup gain. The "mixer strip"
 * responsibilities — wet fader, mute gate, metering — live on a companion
 * SendChannel registered with the engine. EffectChain wires the SendChannel
 * up when the chain is built; this class only needs to know the channel's
 * reference to drive volume from its enabled/mix state.
 *
 * Signal path:
 *   postInsertNode → convolver → makeupGain → [SendChannel handles the rest]
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

    // Internal DSP wiring: convolver → makeupGain (end of this effect's output)
    this._convolver.connect(this._makeupGain);

    // SendChannel reference — set by EffectChain after it's registered
    // with the engine. Volume follows enabled/mix state.
    this._sendChannel = null;
  }

  get name() { return 'reverb'; }
  get type() { return 'send'; }

  /** ConvolverNode — exposed for EffectChain wiring. */
  get convolver() { return this._convolver; }

  /** Makeup gain — end of this effect's DSP; SendChannel takes signal from here. */
  get outputNode() { return this._makeupGain; }

  /**
   * Wet gain — surfaces the companion SendChannel's fader node.
   * Exposed for direct AudioParam animation (e.g. cue crossfades ramping
   * the wet signal in proportion with the dry path, without fighting the
   * smoothed setMix ramp).
   */
  get wetGain() { return this._sendChannel?.gainNode ?? null; }

  get preset() { return this._preset; }

  /** Set by EffectChain once the companion SendChannel is built. */
  set sendChannel(channel) {
    this._sendChannel = channel;
    // Sync the channel to current enabled/mix state
    if (channel) {
      channel.setVolume(this._enabled ? this._mix : 0);
    }
  }
  get sendChannel() { return this._sendChannel; }

  connect(inputNode, outputNode) {
    super.connect(inputNode, outputNode);
    // Tap post-insert signal into the convolver. Downstream of makeupGain
    // is the SendChannel, wired separately by EffectChain.
    inputNode.connect(this._convolver);
  }

  disconnect() {
    if (!this._connected) return;
    try {
      this._convolver.disconnect();
      this._makeupGain.disconnect();
    } catch (_) {}
    // Keep the internal convolver → makeupGain wire so reconnection works
    this._convolver.connect(this._makeupGain);
    super.disconnect();
  }

  setEnabled(enabled) {
    super.setEnabled(enabled);
    // Drive the SendChannel's fader: enabled → current mix; disabled → 0
    this._sendChannel?.setVolume(enabled ? this._mix : 0);
  }

  setMix(value) {
    super.setMix(value);
    if (!this._enabled) return;
    this._sendChannel?.setVolume(value);
  }

  setParam(name, value) {
    if (name === 'preset') {
      if (value === this._preset) return;
      this._preset = value;
      this._convolver.buffer = ConvolutionReverb.createImpulseResponse(this._ctx, value);
    }
  }

  destroy() {
    this.disconnect();
    this._convolver = null;
    this._makeupGain = null;
    this._sendChannel = null;
    super.destroy();
  }

  /**
   * Generate a reverb impulse response AudioBuffer at runtime.
   * Exponentially decaying stereo white noise — no static files needed.
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
