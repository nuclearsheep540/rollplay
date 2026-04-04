/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import EventEmitter from './EventEmitter';
import EffectChain from './EffectChain';
import {
  PlaybackState,
  LoopMode,
  DEFAULT_VOLUME,
  TIME_UPDATE_THRESHOLD,
  RAMP_TIME,
} from './constants';

/**
 * AudioChannel — a single audio channel with playback, effects, volume,
 * loop modes, fade transitions, and time tracking.
 *
 * Created by AudioEngine.createChannel(). Do not instantiate directly.
 *
 * Events:
 *   'ended'         — non-looping track finished ({ channelId })
 *   'timeupdate'    — periodic position update ({ currentTime, duration, remaining })
 *   'statechange'   — playback state changed ({ from, to })
 *   'loopiteration' — loop boundary crossed ({ iteration })
 */
export default class AudioChannel extends EventEmitter {
  /**
   * @param {import('./AudioEngine').default} engine
   * @param {string} id - Unique channel identifier
   * @param {object} config - Channel preset config
   * @param {string[]} config.effects - Effect names (e.g. ['hpf', 'lpf', 'reverb'])
   * @param {boolean} config.loopDefault - Default loop mode
   * @param {boolean} config.metering - Whether to create stereo metering
   */
  constructor(engine, id, config = {}) {
    super();
    this._engine = engine;
    this._id = id;
    this._config = config;

    // Playback state
    this._playbackState = PlaybackState.STOPPED;
    this._source = null;
    this._buffer = null;
    this._volume = DEFAULT_VOLUME;

    // Loop state
    this._loopMode = config.loopDefault ? LoopMode.FULL : LoopMode.OFF;
    this._loopRegion = null; // { start, end } in seconds

    // Mute / solo
    this._muted = false;
    this._soloed = false;

    // Time tracking
    this._startTime = 0;       // AudioContext.currentTime when source.start() was called
    this._pausedTime = 0;      // Accumulated time before current play segment
    this._duration = 0;
    this._currentTime = 0;
    this._rafId = null;
    this._lastEmittedTime = 0;

    // Fade tracking
    this._activeFade = null;   // { type, startTime, duration, startGain, targetGain, rafId }

    // Play operation lock (prevents duplicate play calls)
    this._playLock = false;

    // Build effect chain if engine has an AudioContext
    this._effectChain = null;
    if (engine.context) {
      this._buildEffectChain();
    }
  }

  get id() { return this._id; }
  get playbackState() { return this._playbackState; }
  get isPlaying() { return this._playbackState === PlaybackState.PLAYING; }
  get currentTime() { return this._currentTime; }
  get duration() { return this._duration; }
  get volume() { return this._volume; }
  get loopMode() { return this._loopMode; }
  get loopRegion() { return this._loopRegion; }
  get muted() { return this._muted; }
  get soloed() { return this._soloed; }
  get effectChain() { return this._effectChain; }

  /**
   * Get the channel's dry path analysers.
   * @returns {{ left: AnalyserNode, right: AnalyserNode } | null}
   */
  getAnalysers() {
    return this._effectChain?.getAnalysers() || null;
  }

  /**
   * Get analysers for a send effect (e.g. reverb return metering).
   * @param {string} effectName
   * @returns {{ left: AnalyserNode, right: AnalyserNode } | null}
   */
  getSendAnalysers(effectName) {
    return this._effectChain?.getSendAnalysers(effectName) || null;
  }

  // ── Playback ─────────────────────────────────────────────────────────────

  /**
   * Play an AudioBuffer through this channel.
   *
   * @param {AudioBuffer} buffer
   * @param {object} options
   * @param {number} options.offset - Start position in seconds (for resume/seek)
   * @param {number} options.volume - Override channel volume
   * @param {boolean} options.fade - Fade in
   * @param {number} options.fadeDuration - Fade duration in ms (default 1000)
   * @param {number} options.syncStartTime - AudioContext time to schedule start (for sync)
   * @returns {Promise<boolean>} - Whether playback started successfully
   */
  async play(buffer, options = {}) {
    if (this._playLock) return false;
    this._playLock = true;

    try {
      const ctx = this._engine.context;
      if (!ctx || ctx.state === 'closed') return false;

      // Ensure effect chain exists (may not if engine was unlocked after channel creation)
      if (!this._effectChain) {
        this._buildEffectChain();
        if (!this._effectChain) return false;
      }

      // Stop any existing playback
      this._stopSource();
      this._cancelFade();
      this._stopTimeTracking();

      // Create and configure source
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      this._buffer = buffer;
      this._duration = buffer.duration;

      // Configure looping
      const shouldLoop = this._loopMode !== LoopMode.OFF;
      source.loop = shouldLoop;

      if (this._loopMode === LoopMode.REGION && this._loopRegion) {
        source.loopStart = this._loopRegion.start;
        source.loopEnd = this._loopRegion.end;
      }

      // Connect source to effect chain input
      source.connect(this._effectChain.inputNode);
      this._source = source;

      // Handle source ending (non-looping tracks)
      source.onended = () => {
        if (this._source !== source) return; // Superseded by a new play call
        if (!shouldLoop) {
          this._playbackState = PlaybackState.STOPPED;
          this._currentTime = 0;
          this._duration = 0;
          this._source = null;
          this._stopTimeTracking();
          this.emit('statechange', { from: PlaybackState.PLAYING, to: PlaybackState.STOPPED });
          this.emit('ended', { channelId: this._id });
        }
      };

      // Volume
      const targetVolume = options.volume ?? this._volume;
      this._volume = targetVolume;

      if (options.fade) {
        this._effectChain.gainNode.gain.value = 0;
      } else {
        this._effectChain.gainNode.gain.value = targetVolume;
      }

      // Start playback
      const offset = options.offset ?? 0;
      if (options.syncStartTime) {
        source.start(options.syncStartTime, offset);
      } else {
        source.start(0, offset);
      }

      // Update state
      const prevState = this._playbackState;
      this._playbackState = PlaybackState.PLAYING;
      this._startTime = ctx.currentTime;
      this._pausedTime = offset;
      this._currentTime = offset;

      this.emit('statechange', { from: prevState, to: PlaybackState.PLAYING });

      // Start fade if requested
      if (options.fade) {
        this._startFade('in', options.fadeDuration || 1000, 0, targetVolume);
      }

      // Start time tracking
      this._startTimeTracking();

      return true;
    } finally {
      this._playLock = false;
    }
  }

  /**
   * Stop playback.
   * @param {object} options
   * @param {boolean} options.fade - Fade out before stopping
   * @param {number} options.fadeDuration - Fade duration in ms (default 1000)
   */
  stop(options = {}) {
    if (options.fade && this._source) {
      this._cancelFade();
      const currentGain = this._effectChain?.gainNode.gain.value ?? 0;
      this._startFade('out', options.fadeDuration || 1000, currentGain, 0, () => {
        this._doStop();
      });
    } else {
      this._doStop();
    }
  }

  /** Pause playback, preserving playhead position. */
  pause() {
    if (this._playbackState !== PlaybackState.PLAYING || !this._source) return false;

    const ctx = this._engine.context;
    const elapsed = ctx.currentTime - this._startTime + this._pausedTime;
    this._currentTime = this._loopMode !== LoopMode.OFF && this._duration > 0
      ? elapsed % this._duration
      : Math.min(elapsed, this._duration);

    this._stopSource();
    this._stopTimeTracking();
    this._cancelFade();

    const prevState = this._playbackState;
    this._playbackState = PlaybackState.PAUSED;
    this.emit('statechange', { from: prevState, to: PlaybackState.PAUSED });

    return true;
  }

  /**
   * Resume from paused position.
   * @param {object} options
   * @param {boolean} options.fade - Fade in on resume
   * @param {number} options.fadeDuration
   */
  async resume(options = {}) {
    if (this._playbackState !== PlaybackState.PAUSED || !this._buffer) return false;
    return this.play(this._buffer, {
      offset: this._currentTime,
      volume: this._volume,
      ...options,
    });
  }

  // ── Volume ───────────────────────────────────────────────────────────────

  setVolume(value) {
    this._volume = value;
    if (this._effectChain?.gainNode && !this._activeFade) {
      this._effectChain.gainNode.gain.value = value;
    }
  }

  // ── Loop ─────────────────────────────────────────────────────────────────

  setLoopMode(mode) {
    if (!Object.values(LoopMode).includes(mode)) return;
    this._loopMode = mode;

    // If currently playing, restart with new loop setting
    if (this._source && this._playbackState === PlaybackState.PLAYING) {
      const shouldLoop = mode !== LoopMode.OFF;
      this._source.loop = shouldLoop;

      if (mode === LoopMode.REGION && this._loopRegion) {
        this._source.loopStart = this._loopRegion.start;
        this._source.loopEnd = this._loopRegion.end;
      } else if (mode === LoopMode.FULL) {
        this._source.loopStart = 0;
        this._source.loopEnd = 0; // 0 means end of buffer
      }
    }
  }

  setLoopRegion(start, end) {
    this._loopRegion = { start, end };

    // Apply to running source if in region mode
    if (this._source && this._loopMode === LoopMode.REGION) {
      this._source.loop = true;
      this._source.loopStart = start;
      this._source.loopEnd = end;
    }
  }

  clearLoopRegion() {
    this._loopRegion = null;

    // If in region mode, revert to full loop
    if (this._source && this._loopMode === LoopMode.REGION) {
      this._source.loopStart = 0;
      this._source.loopEnd = 0;
    }
  }

  // ── Mute / Solo ──────────────────────────────────────────────────────────

  setMuted(muted) {
    this._muted = muted;
    // Actual gain changes are managed by AudioEngine (which considers solo state globally)
  }

  setSoloed(soloed) {
    this._soloed = soloed;
    // Actual gain changes are managed by AudioEngine (which considers solo state globally)
  }

  /**
   * Apply the computed mute/solo gain to this channel's mute gate.
   * Called by AudioEngine when any channel's mute/solo state changes.
   * @param {number} gain - 0.0 or 1.0
   */
  applyMuteGain(gain) {
    if (!this._effectChain?.muteGain) return;
    const now = this._engine.context?.currentTime ?? 0;
    this._effectChain.muteGain.gain.setValueAtTime(
      this._effectChain.muteGain.gain.value, now
    );
    this._effectChain.muteGain.gain.linearRampToValueAtTime(gain, now + RAMP_TIME);
  }

  // ── Rebuild (for mobile unlock context recreation) ───────────────────────

  /**
   * Rebuild the effect chain after an AudioContext change.
   * Preserves effect state. Called by AudioEngine during mobile unlock.
   */
  rebuild() {
    // Capture current effect state
    const effectState = {};
    if (this._effectChain) {
      for (const [name, effect] of this._effectChain._effects) {
        effectState[name] = {
          enabled: effect.enabled,
          mix: effect.mix,
        };
        if (effect.preset) effectState[name].preset = effect.preset;
      }
      this._effectChain.destroy();
    }

    // Rebuild with new context
    this._buildEffectChain();

    // Restore effect state
    if (this._effectChain && Object.keys(effectState).length > 0) {
      for (const [name, state] of Object.entries(effectState)) {
        const effect = this._effectChain.getEffect(name);
        if (!effect) continue;
        if (state.preset) effect.setParam('preset', state.preset);
        effect.setMix(state.mix);
        effect.setEnabled(state.enabled);
      }
    }

    // Clear stale source — it was tied to the old context
    this._source = null;
    this._stopTimeTracking();
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────

  destroy() {
    this._stopSource();
    this._stopTimeTracking();
    this._cancelFade();

    if (this._effectChain) {
      this._effectChain.destroy();
      this._effectChain = null;
    }

    this.removeAllListeners();
    this._engine = null;
    this._buffer = null;
  }

  // ── Private: Effect chain construction ───────────────────────────────────

  _buildEffectChain() {
    const ctx = this._engine.context;
    if (!ctx) return;

    const masterNode = this._engine._masterGain;
    if (!masterNode) return;

    this._effectChain = new EffectChain(ctx, {
      effects: this._config.effects || [],
      outputNode: masterNode,
      metering: this._config.metering ?? true,
    });
  }

  // ── Private: Source management ───────────────────────────────────────────

  _stopSource() {
    if (this._source) {
      try {
        this._source.onended = null;
        this._source.stop();
      } catch (_) {}
      this._source = null;
    }
  }

  _doStop() {
    this._stopSource();
    this._stopTimeTracking();
    this._cancelFade();

    const prevState = this._playbackState;
    this._playbackState = PlaybackState.STOPPED;
    this._currentTime = 0;
    this._duration = 0;

    // Restore volume after fade-out
    if (this._effectChain?.gainNode) {
      this._effectChain.gainNode.gain.value = this._volume;
    }

    if (prevState !== PlaybackState.STOPPED) {
      this.emit('statechange', { from: prevState, to: PlaybackState.STOPPED });
    }
  }

  // ── Private: Time tracking ───────────────────────────────────────────────

  _startTimeTracking() {
    this._stopTimeTracking();
    this._lastEmittedTime = -1;

    const tick = () => {
      if (this._playbackState !== PlaybackState.PLAYING) return;

      const ctx = this._engine?.context;
      if (!ctx) return;

      const elapsed = ctx.currentTime - this._startTime + this._pausedTime;

      if (this._loopMode !== LoopMode.OFF && this._duration > 0) {
        this._currentTime = elapsed % this._duration;
      } else {
        this._currentTime = Math.min(elapsed, this._duration);

        // Auto-stop non-looping tracks (as safety net alongside source.onended)
        if (elapsed >= this._duration && this._duration > 0) {
          this._doStop();
          this.emit('ended', { channelId: this._id });
          return;
        }
      }

      // Throttle event emission
      if (Math.abs(this._currentTime - this._lastEmittedTime) > TIME_UPDATE_THRESHOLD) {
        this._lastEmittedTime = this._currentTime;
        this.emit('timeupdate', {
          currentTime: this._currentTime,
          duration: this._duration,
          remaining: this._duration - this._currentTime,
        });
      }

      this._rafId = requestAnimationFrame(tick);
    };

    this._rafId = requestAnimationFrame(tick);
  }

  _stopTimeTracking() {
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  // ── Private: Fade transitions ────────────────────────────────────────────

  _startFade(type, durationMs, startGain, targetGain, onComplete) {
    this._cancelFade();

    const ctx = this._engine?.context;
    if (!ctx || !this._effectChain?.gainNode) return;

    const fadeStartTime = ctx.currentTime;
    const fadeDuration = durationMs / 1000;
    const gainNode = this._effectChain.gainNode;

    gainNode.gain.setValueAtTime(startGain, fadeStartTime);
    gainNode.gain.linearRampToValueAtTime(targetGain, fadeStartTime + fadeDuration);

    // Track fade completion via rAF (more reliable than scheduling)
    const checkComplete = () => {
      if (!this._activeFade) return;
      if (ctx.currentTime >= fadeStartTime + fadeDuration) {
        this._activeFade = null;
        if (onComplete) onComplete();
      } else {
        this._activeFade.rafId = requestAnimationFrame(checkComplete);
      }
    };

    this._activeFade = { type, rafId: requestAnimationFrame(checkComplete) };
  }

  _cancelFade() {
    if (this._activeFade) {
      cancelAnimationFrame(this._activeFade.rafId);
      this._activeFade = null;
    }
  }
}
