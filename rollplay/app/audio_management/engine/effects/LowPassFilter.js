/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import AudioEffect from './AudioEffect';
import {
  FILTER_Q,
  LPF_PASS_ALL_FREQ,
  RAMP_TIME,
  mapLpfFrequency,
} from '../constants';

/**
 * Low-pass filter effect (inline insert).
 *
 * When enabled, the filter cuts frequencies above the cutoff.
 * When disabled, frequency is set to 20kHz (pass-all — no audible effect).
 *
 * Mix level maps to cutoff frequency via logarithmic curve (inverted):
 *   0.0 → 200Hz (aggressive cut), 1.0 → 20kHz (minimal cut / brighter)
 */
export default class LowPassFilter extends AudioEffect {
  constructor(ctx, options = {}) {
    super(ctx, options);

    this._filterNode = ctx.createBiquadFilter();
    this._filterNode.type = 'lowpass';
    this._filterNode.frequency.value = LPF_PASS_ALL_FREQ;
    this._filterNode.Q.value = FILTER_Q;
  }

  get name() { return 'lpf'; }
  get type() { return 'insert'; }

  /** The BiquadFilterNode — exposed for direct EffectChain wiring. */
  get node() { return this._filterNode; }

  connect(inputNode, outputNode) {
    super.connect(inputNode, outputNode);
    inputNode.connect(this._filterNode);
    this._filterNode.connect(outputNode);
  }

  disconnect() {
    if (!this._connected) return;
    try {
      this._filterNode.disconnect();
    } catch (_) {}
    super.disconnect();
  }

  setEnabled(enabled) {
    super.setEnabled(enabled);
    const now = this._ctx.currentTime;
    const targetFreq = enabled ? mapLpfFrequency(this._mix) : LPF_PASS_ALL_FREQ;
    this._filterNode.frequency.setValueAtTime(this._filterNode.frequency.value, now);
    this._filterNode.frequency.linearRampToValueAtTime(targetFreq, now + RAMP_TIME);
  }

  setMix(value) {
    super.setMix(value);
    if (!this._enabled) return;
    const now = this._ctx.currentTime;
    const targetFreq = mapLpfFrequency(value);
    this._filterNode.frequency.setValueAtTime(this._filterNode.frequency.value, now);
    this._filterNode.frequency.linearRampToValueAtTime(targetFreq, now + RAMP_TIME);
  }

  destroy() {
    this.disconnect();
    this._filterNode = null;
    super.destroy();
  }
}
