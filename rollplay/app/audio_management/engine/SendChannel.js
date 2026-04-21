/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import EventEmitter from './EventEmitter';
import StereoMeter from './StereoMeter';
import { DEFAULT_VOLUME, RAMP_TIME } from './constants';

/**
 * SendChannel — a bus return (e.g. reverb wet mix) exposed as a first-class
 * mixer-strip. Shares the mute/solo/fader/meter surface of AudioChannel so
 * the engine's reconciliation logic treats every channel uniformly — sends
 * are peers, not children of whichever audio channel happens to feed them.
 *
 * Pure destination: receives signal from an upstream node (the effect's
 * wet-path output) and routes it through fader → mute gate → metering →
 * output. No source, no buffer, no play/pause.
 */
export default class SendChannel extends EventEmitter {
  /**
   * @param {import('./AudioEngine').default} engine
   * @param {string} id - Unique channel id (e.g. "audio_channel_A_reverb")
   * @param {object} options
   * @param {AudioNode} options.inputNode - Upstream source (effect's wet-path output)
   * @param {AudioNode} options.outputNode - Downstream destination (master gain)
   * @param {boolean} options.metering - Whether to create stereo metering
   */
  constructor(engine, id, { inputNode, outputNode, metering = true }) {
    super();
    this._engine = engine;
    this._id = id;

    this._muted = false;
    this._soloed = false;
    this._volume = DEFAULT_VOLUME;

    const ctx = engine.context;
    if (!ctx) {
      throw new Error('SendChannel requires engine to be initialised');
    }

    // Fader (wet mix level, controlled by the mixer strip).
    this._gainNode = ctx.createGain();
    this._gainNode.gain.value = this._volume;

    // Mute gate — driven exclusively by engine.updateMuteSoloState.
    this._muteGain = ctx.createGain();
    this._muteGain.gain.value = 1.0;

    // Optional metering chain
    this._meter = metering ? new StereoMeter(ctx) : null;

    // Wire: inputNode → gain → muteGain → meter? → outputNode
    inputNode.connect(this._gainNode);
    this._gainNode.connect(this._muteGain);
    if (this._meter) {
      this._muteGain.connect(this._meter.inputNode);
      this._meter.outputNode.connect(outputNode);
    } else {
      this._muteGain.connect(outputNode);
    }

    this._inputNode = inputNode;
    this._outputNode = outputNode;
  }

  // ── Identity ──────────────────────────────────────────────────────────
  get id() { return this._id; }
  get isSend() { return true; }

  // ── Mixer strip interface (shared with AudioChannel) ──────────────────
  get muted() { return this._muted; }
  get soloed() { return this._soloed; }
  get volume() { return this._volume; }

  setMuted(muted) { this._muted = !!muted; }
  setSoloed(soloed) { this._soloed = !!soloed; }

  setVolume(value) {
    this._volume = value;
    const now = this._engine?.context?.currentTime ?? 0;
    this._gainNode.gain.setValueAtTime(this._gainNode.gain.value, now);
    this._gainNode.gain.linearRampToValueAtTime(value, now + RAMP_TIME);
  }

  /**
   * Applied by engine.updateMuteSoloState. Ramps the mute gate to the
   * computed gain value (0.0 or 1.0). Never called directly by UI code.
   */
  applyMuteGain(gain) {
    const now = this._engine?.context?.currentTime ?? 0;
    this._muteGain.gain.setValueAtTime(this._muteGain.gain.value, now);
    this._muteGain.gain.linearRampToValueAtTime(gain, now + RAMP_TIME);
  }

  getAnalysers() {
    if (!this._meter) return null;
    return { left: this._meter.analyserL, right: this._meter.analyserR };
  }

  // ── Node accessors ────────────────────────────────────────────────────
  get gainNode() { return this._gainNode; }
  get muteGain() { return this._muteGain; }

  // ── Cleanup ───────────────────────────────────────────────────────────
  destroy() {
    try { this._gainNode.disconnect(); } catch {}
    try { this._muteGain.disconnect(); } catch {}
    if (this._meter) {
      this._meter.destroy();
      this._meter = null;
    }
    this.removeAllListeners();
    this._engine = null;
    this._inputNode = null;
    this._outputNode = null;
  }
}
