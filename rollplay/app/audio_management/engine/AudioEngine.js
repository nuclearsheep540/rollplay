/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import EventEmitter from './EventEmitter';
import AudioChannel from './AudioChannel';
import StereoMeter from './StereoMeter';
import { EngineState, DEFAULT_VOLUME, RAMP_TIME } from './constants';

/**
 * AudioEngine — core orchestrator for the audio system.
 *
 * Owns AudioContext, master output chain, buffer cache, channel registry,
 * and audio unlock (mobile/desktop strategies).
 *
 * Pure JS — no React, no WebSocket, no game concepts.
 *
 * Master chain:
 *   channels → masterGain (broadcast) → metering → localGain (per-client) → destination
 *
 * State machine: 'suspended' → 'ready' → 'closed'
 *
 * Events:
 *   'ready'       — engine unlocked and operational
 *   'statechange' — lifecycle state changed ({ from, to })
 */
export default class AudioEngine extends EventEmitter {
  /**
   * @param {object} options
   * @param {number} options.sampleRate - AudioContext sample rate
   * @param {string} options.latencyHint - 'interactive' | 'balanced' | 'playback'
   */
  constructor(options = {}) {
    super();
    this._options = options;
    this._state = EngineState.CLOSED;
    this._ctx = null;

    // Master chain nodes
    this._masterGain = null;    // Broadcast level (DM-controlled)
    this._localGain = null;     // Per-client listening level
    this._masterMeter = null;   // Master output metering

    // Channel registry
    this._channels = new Map();

    // Buffer cache
    this._buffers = new Map();

    // Pending operations queue (before unlock)
    this._pendingOps = [];

    // Unlock lock
    this._unlockInProgress = false;
  }

  get state() { return this._state; }
  get context() { return this._ctx; }
  get channels() { return this._channels; }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  /**
   * Initialize the engine. Creates AudioContext in suspended state.
   * Buffer loading works before unlock. Playback requires unlock().
   */
  async init() {
    if (this._ctx && this._ctx.state !== 'closed') return;

    const contextOptions = {};
    if (this._options.sampleRate) contextOptions.sampleRate = this._options.sampleRate;
    if (this._options.latencyHint) contextOptions.latencyHint = this._options.latencyHint;

    this._ctx = new (window.AudioContext || window.webkitAudioContext)(contextOptions);

    this._buildMasterChain();
    this._setState(EngineState.SUSPENDED);
  }

  /**
   * Unlock audio — required before playback (browser autoplay policy).
   *
   * Detects mobile vs desktop from AudioContext state:
   *   'running'   → desktop (keep context)
   *   'suspended' → mobile/iOS (close + recreate within user gesture)
   *
   * Must be called from a user gesture handler (click, touch, etc.).
   */
  async unlock() {
    if (this._state === EngineState.READY) return true;
    if (this._unlockInProgress) return false;
    this._unlockInProgress = true;

    try {
      if (!this._ctx) await this.init();

      if (this._ctx.state === 'running') {
        await this._unlockDesktop();
      } else {
        await this._unlockMobile();
      }

      this._setState(EngineState.READY);
      this.emit('ready');

      // Drain pending operations
      await this._drainPendingOps();

      return true;
    } catch (error) {
      console.warn('AudioEngine: unlock failed', error);
      return false;
    } finally {
      this._unlockInProgress = false;
    }
  }

  /** Close the engine and release all resources. */
  destroy() {
    // Stop all channels
    for (const channel of this._channels.values()) {
      channel.destroy();
    }
    this._channels.clear();

    // Clear buffers
    this._buffers.clear();

    // Clear pending ops
    this._pendingOps = [];

    // Destroy metering
    if (this._masterMeter) {
      this._masterMeter.destroy();
      this._masterMeter = null;
    }

    // Close context
    if (this._ctx && this._ctx.state !== 'closed') {
      this._ctx.close().catch(() => {});
    }

    this._masterGain = null;
    this._localGain = null;
    this._ctx = null;

    this._setState(EngineState.CLOSED);
    this.removeAllListeners();
  }

  // ── Master chain ─────────────────────────────────────────────────────────

  setMasterVolume(value) {
    if (this._masterGain) {
      this._masterGain.gain.value = value;
    }
  }

  setLocalVolume(value) {
    if (this._localGain) {
      this._localGain.gain.value = value;
    }
  }

  /**
   * Get master output analysers for metering.
   * @returns {{ left: AnalyserNode, right: AnalyserNode } | null}
   */
  getMasterAnalysers() {
    if (!this._masterMeter) return null;
    return { left: this._masterMeter.analyserL, right: this._masterMeter.analyserR };
  }

  // ── Channel management ───────────────────────────────────────────────────

  /**
   * Create a new audio channel.
   *
   * @param {string} id - Unique channel identifier
   * @param {object} config - Channel preset (e.g. CHANNEL_PRESETS.BGM)
   * @returns {AudioChannel}
   */
  createChannel(id, config = {}) {
    if (this._channels.has(id)) {
      throw new Error(`Channel '${id}' already exists`);
    }

    const channel = new AudioChannel(this, id, config);
    this._channels.set(id, channel);
    return channel;
  }

  getChannel(id) {
    return this._channels.get(id) || null;
  }

  removeChannel(id) {
    const channel = this._channels.get(id);
    if (channel) {
      channel.destroy();
      this._channels.delete(id);
    }
  }

  getChannelIds() {
    return Array.from(this._channels.keys());
  }

  /**
   * Recompute mute/solo gains across all channels.
   * Called when any channel's mute or solo state changes.
   */
  updateMuteSoloState() {
    const anySoloed = Array.from(this._channels.values()).some(ch => ch.soloed);

    for (const channel of this._channels.values()) {
      let gain;
      if (anySoloed) {
        gain = channel.soloed ? 1.0 : 0.0;
      } else {
        gain = channel.muted ? 0.0 : 1.0;
      }
      channel.applyMuteGain(gain);

      // Update reverb send mute for this channel
      const reverb = channel.effectChain?.getEffect('reverb');
      if (reverb) {
        const effectMuted = channel.muted;
        let sendGain;
        if (anySoloed) {
          // Reverb send follows channel solo state
          sendGain = channel.soloed ? 1.0 : 0.0;
        } else {
          sendGain = effectMuted ? 0.0 : 1.0;
        }
        reverb.setSendMuted(sendGain === 0.0);
      }
    }
  }

  // ── Buffer management ────────────────────────────────────────────────────

  /**
   * Load and decode an audio file, caching the result.
   *
   * @param {string} url - Audio file URL
   * @param {string} cacheKey - Cache key (defaults to url)
   * @returns {Promise<AudioBuffer|null>}
   */
  async loadBuffer(url, cacheKey) {
    const key = cacheKey || url;

    // Return cached buffer
    if (this._buffers.has(key)) {
      return this._buffers.get(key);
    }

    if (!this._ctx) return null;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`AudioEngine: failed to fetch ${url} (${response.status})`);
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this._ctx.decodeAudioData(arrayBuffer);
      this._buffers.set(key, audioBuffer);
      return audioBuffer;
    } catch (error) {
      console.warn(`AudioEngine: failed to decode ${url}`, error);
      return null;
    }
  }

  getBuffer(cacheKey) {
    return this._buffers.get(cacheKey) || null;
  }

  hasBuffer(cacheKey) {
    return this._buffers.has(cacheKey);
  }

  clearBuffer(cacheKey) {
    this._buffers.delete(cacheKey);
  }

  clearAllBuffers() {
    this._buffers.clear();
  }

  // ── Private: Master chain construction ───────────────────────────────────

  _buildMasterChain() {
    const ctx = this._ctx;

    // Broadcast master gain (DM-controlled, synced to all clients)
    this._masterGain = ctx.createGain();
    this._masterGain.gain.value = 1.0;

    // Per-client listening gain (private, localStorage-persisted by consumer)
    this._localGain = ctx.createGain();
    this._localGain.gain.value = DEFAULT_VOLUME;

    // Master metering (reflects broadcast level, unaffected by local volume)
    this._masterMeter = new StereoMeter(ctx);

    // Chain: channels → masterGain → metering → localGain → destination
    this._masterGain.connect(this._masterMeter.inputNode);
    this._masterMeter.outputNode.connect(this._localGain);
    this._localGain.connect(ctx.destination);
  }

  // ── Private: State machine ───────────────────────────────────────────────

  _setState(newState) {
    const from = this._state;
    if (from === newState) return;
    this._state = newState;
    this.emit('statechange', { from, to: newState });
  }

  // ── Private: Unlock strategies ───────────────────────────────────────────

  async _unlockDesktop() {
    // Desktop: AudioContext is already 'running' (browser allows audio after
    // prior user interaction on the origin). Just resume defensively.
    if (this._ctx.state === 'suspended') {
      await this._ctx.resume();
    }
  }

  async _unlockMobile() {
    // Mobile/iOS: The eager-init context is 'suspended' — it can decode
    // audio but cannot produce output. We must:
    // 1. Activate the iOS audio session (silent MP3 within gesture)
    // 2. Close the stale context
    // 3. Create a fresh context within the gesture
    // 4. Rebuild everything

    // 1. Activate iOS audio session via HTML5 Audio.play()
    const silentAudio = new Audio(
      'data:audio/mp3;base64,SUQzBAAAAAAAIlRTU0UAAAAOAAADTGF2ZjYxLjcuMTAwAAAAAAAAAAAAAAD/+0DAAAAAAAAAAAAAAAAAAAAAAABJbmZvAAAADwAAAAUAAAK+AGhoaGhoaGhoaGhoaGhoaGhoaGiOjo6Ojo6Ojo6Ojo6Ojo6Ojo6OjrS0tLS0tLS0tLS0tLS0tLS0tLS02tra2tra2tra2tra2tra2tra2tr//////////////////////////wAAAABMYXZjNjEuMTkAAAAAAAAAAAAAAAAkAwYAAAAAAAACvhC6DYoAAAAAAP/7EMQAA8AAAaQAAAAgAAA0gAAABExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQxCmDwAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+xDEUwPAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7EMR8g8AAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQxKYDwAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU='
    );
    silentAudio.volume = 0;
    await silentAudio.play().catch(() => {});

    // 2. Close the stale context
    // AudioBuffers are context-independent (raw PCM) and survive replacement.
    if (this._ctx && this._ctx.state !== 'closed') {
      await this._ctx.close();
    }

    // 3. Clear stale source refs in channels
    for (const channel of this._channels.values()) {
      channel._stopSource();
      channel._stopTimeTracking();
    }

    // 4. Create fresh AudioContext within gesture
    const contextOptions = {};
    if (this._options.sampleRate) contextOptions.sampleRate = this._options.sampleRate;
    if (this._options.latencyHint) contextOptions.latencyHint = this._options.latencyHint;

    this._ctx = new (window.AudioContext || window.webkitAudioContext)(contextOptions);

    // 5. Rebuild master chain
    if (this._masterMeter) this._masterMeter.destroy();
    this._buildMasterChain();

    // 6. Rebuild all channel effect chains
    for (const channel of this._channels.values()) {
      channel.rebuild();
    }

    // 7. Resume if still suspended (defensive)
    if (this._ctx.state === 'suspended') {
      await this._ctx.resume();
    }
  }

  // ── Private: Pending operations queue ────────────────────────────────────

  /**
   * Queue a play operation for after unlock.
   * Called by AudioChannel.play() when engine is not ready.
   */
  _queueOperation(op) {
    this._pendingOps.push(op);
  }

  async _drainPendingOps() {
    const ops = this._pendingOps;
    this._pendingOps = [];

    for (const op of ops) {
      try {
        await op();
      } catch (error) {
        console.warn('AudioEngine: pending operation failed', error);
      }
    }
  }
}
