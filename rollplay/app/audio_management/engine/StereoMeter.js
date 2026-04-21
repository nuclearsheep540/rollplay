/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { METER_FFT_SIZE, METER_SMOOTHING } from './constants';

/**
 * Reusable stereo metering chain for the audio engine.
 *
 * Signal path:
 *   inputNode (gain, stereo) → splitter → [analyserL, analyserR] → merger → outputNode
 *
 * Used for per-channel metering, effect return metering, and master output metering.
 */
export default class StereoMeter {
  constructor(ctx) {
    this._ctx = ctx;

    // Input: force stereo upmix for consistent metering of mono/stereo sources
    this._inputNode = ctx.createGain();
    this._inputNode.channelCount = 2;
    this._inputNode.channelCountMode = 'explicit';
    this._inputNode.channelInterpretation = 'speakers';

    // Split into L/R for independent analysis
    this._splitter = ctx.createChannelSplitter(2);
    this._merger = ctx.createChannelMerger(2);

    this._analyserL = ctx.createAnalyser();
    this._analyserL.fftSize = METER_FFT_SIZE;
    this._analyserL.smoothingTimeConstant = METER_SMOOTHING;

    this._analyserR = ctx.createAnalyser();
    this._analyserR.fftSize = METER_FFT_SIZE;
    this._analyserR.smoothingTimeConstant = METER_SMOOTHING;

    // Wire: input → splitter → analysers → merger
    this._inputNode.connect(this._splitter);
    this._splitter.connect(this._analyserL, 0);
    this._splitter.connect(this._analyserR, 1);
    this._analyserL.connect(this._merger, 0, 0);
    this._analyserR.connect(this._merger, 0, 1);
  }

  /** Connect sources here. */
  get inputNode() { return this._inputNode; }

  /** Connect this to the next node in the chain (e.g. master gain). */
  get outputNode() { return this._merger; }

  get analyserL() { return this._analyserL; }
  get analyserR() { return this._analyserR; }

  destroy() {
    try {
      this._inputNode.disconnect();
      this._splitter.disconnect();
      this._analyserL.disconnect();
      this._analyserR.disconnect();
      this._merger.disconnect();
    } catch (_) {
      // Nodes may already be disconnected
    }
    this._ctx = null;
  }
}
