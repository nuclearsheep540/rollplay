/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

/**
 * Base class for all audio effects in the engine.
 *
 * Subclasses implement the audio processing by creating Web Audio nodes
 * and wiring them between an input and output node.
 *
 * Two effect types:
 *   'insert' — inline in the signal chain (HPF, LPF). Signal flows through the effect.
 *   'send'   — parallel path with wet/dry mix (reverb). Dry signal bypasses, wet goes through.
 */
export default class AudioEffect {
  /**
   * @param {AudioContext} ctx
   * @param {object} options - Effect-specific configuration
   */
  constructor(ctx, options = {}) {
    if (new.target === AudioEffect) {
      throw new Error('AudioEffect is abstract — use a subclass (HighPassFilter, LowPassFilter, ConvolutionReverb)');
    }
    this._ctx = ctx;
    this._enabled = false;
    this._mix = 0;
    this._connected = false;
  }

  /** Effect name used as registry key (e.g. 'hpf', 'lpf', 'reverb'). */
  get name() { throw new Error('Subclass must implement get name()'); }

  /** 'insert' or 'send'. Determines how EffectChain wires this effect. */
  get type() { throw new Error('Subclass must implement get type()'); }

  get enabled() { return this._enabled; }
  get mix() { return this._mix; }

  /**
   * Wire this effect into the audio graph.
   * Called by EffectChain during construction.
   *
   * For 'insert' effects: inputNode → [effect nodes] → outputNode
   * For 'send' effects: inputNode → [effect nodes] → outputNode (parallel path)
   *
   * @param {AudioNode} inputNode - Where to receive signal from
   * @param {AudioNode} outputNode - Where to send processed signal
   */
  connect(inputNode, outputNode) {
    this._connected = true;
  }

  /** Remove this effect from the audio graph. */
  disconnect() {
    this._connected = false;
  }

  /**
   * Enable or disable this effect.
   * Insert effects: disabled = pass-all frequency.
   * Send effects: disabled = wet gain at 0.
   */
  setEnabled(enabled) {
    this._enabled = enabled;
  }

  /**
   * Set the mix/frequency level.
   * Insert effects: maps to cutoff frequency via log curve.
   * Send effects: maps to wet gain.
   */
  setMix(value) {
    this._mix = value;
  }

  /**
   * Set an effect-specific parameter (e.g. reverb preset).
   * Default implementation is a no-op. Override in subclasses that support params.
   */
  setParam(name, value) {
    // Override in subclasses
  }

  /** Release all Web Audio nodes. */
  destroy() {
    this.disconnect();
    this._ctx = null;
  }
}
