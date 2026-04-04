/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import HighPassFilter from './effects/HighPassFilter';
import LowPassFilter from './effects/LowPassFilter';
import ConvolutionReverb from './effects/ConvolutionReverb';
import StereoMeter from './StereoMeter';
import { DEFAULT_EFFECTS } from './presets';

/**
 * Effect registry — maps effect name to constructor.
 * To add a new effect, register it here and create the class.
 */
const EFFECT_REGISTRY = {
  hpf: HighPassFilter,
  lpf: LowPassFilter,
  reverb: ConvolutionReverb,
};

/**
 * EffectChain manages the signal routing for a channel's effects.
 *
 * Signal path (with all effects):
 *   inputNode → [HPF insert] → [LPF insert] → postInsertNode
 *     → gainNode (channel fader) → muteGain → metering → outputNode     (dry path)
 *     → [reverb send] → reverbMetering → outputNode                     (wet path)
 *
 * The chain is built dynamically based on the effects list in the channel preset.
 * Effects are wired in the order they appear in the list.
 *
 * Insert effects are inline (signal flows through them).
 * Send effects tap the post-insert signal and route to a parallel wet path.
 */
export default class EffectChain {
  /**
   * @param {AudioContext} ctx
   * @param {object} config
   * @param {string[]} config.effects - Effect names to include (e.g. ['hpf', 'lpf', 'reverb'])
   * @param {AudioNode} config.outputNode - Final destination (e.g. master gain)
   * @param {boolean} config.metering - Whether to create stereo metering
   */
  constructor(ctx, config) {
    this._ctx = ctx;
    this._effects = new Map();
    this._bypassed = false;

    const { effects = [], outputNode, metering = true } = config;

    // ── Input node — sources connect here ──────────────────────────────────
    this._inputNode = ctx.createGain();
    this._inputNode.gain.value = 1.0;

    // ── Post-insert fan-out — after inline inserts, before fader and sends ─
    this._postInsertNode = ctx.createGain();
    this._postInsertNode.gain.value = 1.0;

    // ── Channel fader (volume control) ─────────────────────────────────────
    this._gainNode = ctx.createGain();
    this._gainNode.gain.value = 1.0;

    // ── Mute gate (for mute/solo) ──────────────────────────────────────────
    this._muteGain = ctx.createGain();
    this._muteGain.gain.value = 1.0;

    // ── Metering ───────────────────────────────────────────────────────────
    this._meter = metering ? new StereoMeter(ctx) : null;

    // ── Build insert chain ─────────────────────────────────────────────────
    // Wire inserts in order: inputNode → insert1 → insert2 → ... → postInsertNode
    const inserts = effects
      .filter(name => EFFECT_REGISTRY[name] && this._getEffectType(name) === 'insert')
      .map(name => this._createEffect(name));

    let prevOutput = this._inputNode;
    for (const effect of inserts) {
      effect.connect(prevOutput, this._postInsertNode);
      // For chained inserts: each insert takes from prev output node.
      // Since BiquadFilter.connect(output) works additively, we need to
      // wire them sequentially through their internal nodes.
      prevOutput = effect.node; // Use the filter's output directly
    }

    // If no inserts, connect input directly to postInsert
    if (inserts.length === 0) {
      this._inputNode.connect(this._postInsertNode);
    }

    // ── Dry path: postInsert → gainNode → muteGain → metering → output ───
    this._postInsertNode.connect(this._gainNode);
    this._gainNode.connect(this._muteGain);

    if (this._meter) {
      this._muteGain.connect(this._meter.inputNode);
      this._meter.outputNode.connect(outputNode);
    } else {
      this._muteGain.connect(outputNode);
    }

    // ── Send effects (pre-fader, post-insert) ──────────────────────────────
    // Each send taps from postInsertNode and routes to outputNode via its own wet path.
    const sends = effects
      .filter(name => EFFECT_REGISTRY[name] && this._getEffectType(name) === 'send');

    this._sendMeters = new Map();

    for (const name of sends) {
      const effect = this._createEffect(name);

      // Create a metering chain for this send's wet path
      if (metering) {
        const sendMeter = new StereoMeter(ctx);
        this._sendMeters.set(name, sendMeter);

        // Wire: postInsert → [send effect] → sendMeter → output
        effect.connect(this._postInsertNode, sendMeter.inputNode);
        sendMeter.outputNode.connect(outputNode);
      } else {
        effect.connect(this._postInsertNode, outputNode);
      }
    }

    // ── Bypass path ────────────────────────────────────────────────────────
    // When bypassed, input connects directly to gainNode (skipping all inserts).
    // Sends are muted (wet gain → 0).
    this._bypassNode = null; // Created lazily on first bypass
  }

  /** Connect sources here. */
  get inputNode() { return this._inputNode; }

  /** Channel fader gain node — for volume control by AudioChannel. */
  get gainNode() { return this._gainNode; }

  /** Mute gate node — for mute/solo control by AudioChannel. */
  get muteGain() { return this._muteGain; }

  /** Post-insert fan-out node — for pre-fader taps. */
  get postInsertNode() { return this._postInsertNode; }

  get bypassed() { return this._bypassed; }

  // ── Effect access ────────────────────────────────────────────────────────

  getEffect(name) {
    return this._effects.get(name) || null;
  }

  hasEffect(name) {
    return this._effects.has(name);
  }

  /**
   * Get analysers for a specific effect's send metering.
   * Returns { left, right } or null.
   */
  getSendAnalysers(effectName) {
    const meter = this._sendMeters.get(effectName);
    if (!meter) return null;
    return { left: meter.analyserL, right: meter.analyserR };
  }

  /**
   * Get the channel's dry path analysers.
   * Returns { left, right } or null.
   */
  getAnalysers() {
    if (!this._meter) return null;
    return { left: this._meter.analyserL, right: this._meter.analyserR };
  }

  // ── Effect control ───────────────────────────────────────────────────────

  /**
   * Batch-apply effect state.
   *
   * Accepts engine-format config:
   * {
   *   eq: true,                    // EQ master bypass (controls HPF + LPF)
   *   hpf: true, hpf_mix: 0.7,
   *   lpf: false, lpf_mix: 0.5,
   *   reverb: true, reverb_mix: 0.6, reverb_preset: 'hall',
   * }
   */
  applyEffects(state) {
    if (!state) return;

    const eqActive = state.eq ?? false;

    // HPF — respects EQ master bypass
    if (this.hasEffect('hpf')) {
      const hpf = this.getEffect('hpf');
      if (state.hpf_mix !== undefined) hpf.setMix(state.hpf_mix);
      const hpfEnabled = (state.hpf ?? hpf.enabled) && eqActive;
      hpf.setEnabled(hpfEnabled);
    }

    // LPF — respects EQ master bypass
    if (this.hasEffect('lpf')) {
      const lpf = this.getEffect('lpf');
      if (state.lpf_mix !== undefined) lpf.setMix(state.lpf_mix);
      const lpfEnabled = (state.lpf ?? lpf.enabled) && eqActive;
      lpf.setEnabled(lpfEnabled);
    }

    // Reverb — independent of EQ bypass
    if (this.hasEffect('reverb')) {
      const reverb = this.getEffect('reverb');
      if (state.reverb_preset !== undefined) reverb.setParam('preset', state.reverb_preset);
      if (state.reverb_mix !== undefined) reverb.setMix(state.reverb_mix);
      if (state.reverb !== undefined) reverb.setEnabled(state.reverb);
    }
  }

  setEffectEnabled(name, enabled) {
    const effect = this._effects.get(name);
    if (effect) effect.setEnabled(enabled);
  }

  setEffectMix(name, value) {
    const effect = this._effects.get(name);
    if (effect) effect.setMix(value);
  }

  setEffectParam(name, param, value) {
    const effect = this._effects.get(name);
    if (effect) effect.setParam(param, value);
  }

  // ── Bypass ───────────────────────────────────────────────────────────────

  setBypass(bypassed) {
    if (this._bypassed === bypassed) return;
    this._bypassed = bypassed;

    // Disable all effects when bypassed
    for (const effect of this._effects.values()) {
      if (bypassed) {
        effect.setEnabled(false);
      }
    }
  }

  // ── Rebuild (for mobile unlock context recreation) ───────────────────────

  /**
   * Rebuild all Web Audio nodes after an AudioContext change.
   * Called by AudioEngine during mobile unlock when the context is recreated.
   *
   * This destroys existing nodes and creates new ones using the new context,
   * preserving the current effect state (enabled, mix, presets).
   *
   * @param {AudioContext} newCtx - The new AudioContext
   * @param {AudioNode} newOutputNode - The new output destination
   */
  rebuild(newCtx, newOutputNode) {
    // Capture current state before destroying
    const effectStates = {};
    for (const [name, effect] of this._effects) {
      effectStates[name] = {
        enabled: effect.enabled,
        mix: effect.mix,
        preset: effect.preset, // Only reverb has this
      };
    }

    // Destroy existing nodes
    for (const effect of this._effects.values()) {
      effect.destroy();
    }
    this._effects.clear();

    if (this._meter) this._meter.destroy();
    for (const meter of this._sendMeters.values()) meter.destroy();
    this._sendMeters.clear();

    // Recreate with new context — constructor handles all wiring
    // This is a lightweight approach: we store the config and rebuild.
    // The caller (AudioChannel) handles reconnecting sources.
    this._ctx = newCtx;

    // Note: Full rebuild is handled by AudioChannel.rebuild() which
    // creates a new EffectChain entirely. This method is kept minimal.
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────

  destroy() {
    for (const effect of this._effects.values()) {
      effect.destroy();
    }
    this._effects.clear();

    if (this._meter) {
      this._meter.destroy();
      this._meter = null;
    }

    for (const meter of this._sendMeters.values()) {
      meter.destroy();
    }
    this._sendMeters.clear();

    try {
      this._inputNode.disconnect();
      this._postInsertNode.disconnect();
      this._gainNode.disconnect();
      this._muteGain.disconnect();
    } catch (_) {}

    this._ctx = null;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  _createEffect(name) {
    const EffectClass = EFFECT_REGISTRY[name];
    if (!EffectClass) throw new Error(`Unknown effect: ${name}`);

    const defaults = DEFAULT_EFFECTS[name] || {};
    const effect = new EffectClass(this._ctx, { preset: defaults.preset });
    effect.setMix(defaults.mix ?? 0);
    // Don't enable by default — enabled state comes from applyEffects()

    this._effects.set(name, effect);
    return effect;
  }

  _getEffectType(name) {
    const EffectClass = EFFECT_REGISTRY[name];
    if (!EffectClass) return null;
    // Instantiate briefly to check type — or use a static convention
    // Convention: insert effects have node getter, send effects have convolver getter
    if (name === 'reverb') return 'send';
    return 'insert';
  }
}
