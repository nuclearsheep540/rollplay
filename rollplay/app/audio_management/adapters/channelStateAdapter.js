/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

/**
 * Adapter: AudioChannelState (shared contract / WebSocket) ↔ engine config.
 *
 * AudioChannelState is the shared contract between api-site and api-game.
 * It arrives via WebSocket (syncAudioState, remote_audio_batch) and has
 * its own field naming convention.
 *
 * Contract shape (AudioChannelState):
 *   filename, asset_id, s3_url, file_size, volume, looping,
 *   effects: { eq, hpf, hpf_mix, lpf, lpf_mix, reverb, reverb_mix, reverb_preset },
 *   muted, soloed, playback_state, started_at, paused_elapsed,
 *   loop_mode, loop_start, loop_end
 *
 * Engine shape:
 *   { effects: { eq, hpf, hpf_mix, ... }, loop: { mode, start, end },
 *     volume, identity: { filename, assetId, s3Url, fileSize },
 *     playback: { state, startedAt, pausedElapsed } }
 */

import { LoopMode, PlaybackState } from '../engine/constants';
import { DEFAULT_EFFECTS } from '../engine/presets';

/**
 * Convert an AudioChannelState (from WebSocket/MongoDB) to engine config.
 *
 * @param {object} channelState - AudioChannelState contract object
 * @returns {object} Engine-format config
 */
export function channelStateToEngineConfig(channelState) {
  if (!channelState) return null;

  const effects = channelState.effects || {};

  return {
    identity: {
      filename: channelState.filename ?? null,
      assetId: channelState.asset_id ?? null,
      s3Url: channelState.s3_url ?? null,
      fileSize: channelState.file_size ?? null,
    },
    effects: {
      eq: effects.eq ?? !!(effects.hpf || effects.lpf),
      hpf: effects.hpf ?? DEFAULT_EFFECTS.hpf.enabled,
      hpf_mix: effects.hpf_mix ?? DEFAULT_EFFECTS.hpf.mix,
      lpf: effects.lpf ?? DEFAULT_EFFECTS.lpf.enabled,
      lpf_mix: effects.lpf_mix ?? DEFAULT_EFFECTS.lpf.mix,
      reverb: effects.reverb ?? DEFAULT_EFFECTS.reverb.enabled,
      reverb_mix: effects.reverb_mix ?? DEFAULT_EFFECTS.reverb.mix,
      reverb_preset: effects.reverb_preset ?? DEFAULT_EFFECTS.reverb.preset,
    },
    loop: {
      mode: _resolveLoopModeFromContract(channelState),
      start: channelState.loop_start ?? null,
      end: channelState.loop_end ?? null,
    },
    volume: channelState.volume ?? null,
    muted: channelState.muted ?? false,
    soloed: channelState.soloed ?? false,
    playback: {
      state: _mapPlaybackState(channelState.playback_state),
      startedAt: channelState.started_at ?? null,
      pausedElapsed: channelState.paused_elapsed ?? null,
    },
  };
}

/**
 * Convert engine state to AudioChannelState contract shape.
 * Used when sending state back over WebSocket (remote_audio_batch ops).
 *
 * @param {import('../engine/AudioChannel').default} channel - Engine AudioChannel
 * @param {object} identity - Track identity { filename, assetId, s3Url, fileSize }
 * @returns {object} AudioChannelState-compatible object
 */
export function engineToChannelState(channel, identity = {}) {
  const effectChain = channel.effectChain;
  const effects = {};

  if (effectChain) {
    const hpf = effectChain.getEffect('hpf');
    const lpf = effectChain.getEffect('lpf');
    const reverb = effectChain.getEffect('reverb');

    effects.eq = !!(hpf?.enabled || lpf?.enabled);
    effects.hpf = hpf?.enabled ?? false;
    effects.hpf_mix = hpf?.mix ?? DEFAULT_EFFECTS.hpf.mix;
    effects.lpf = lpf?.enabled ?? false;
    effects.lpf_mix = lpf?.mix ?? DEFAULT_EFFECTS.lpf.mix;
    effects.reverb = reverb?.enabled ?? false;
    effects.reverb_mix = reverb?.mix ?? DEFAULT_EFFECTS.reverb.mix;
    effects.reverb_preset = reverb?.preset ?? DEFAULT_EFFECTS.reverb.preset;
  }

  return {
    filename: identity.filename ?? null,
    asset_id: identity.assetId ?? null,
    s3_url: identity.s3Url ?? null,
    file_size: identity.fileSize ?? null,
    volume: channel.volume,
    looping: channel.loopMode !== LoopMode.OFF,
    loop_mode: channel.loopMode,
    loop_start: channel.loopRegion?.start ?? null,
    loop_end: channel.loopRegion?.end ?? null,
    effects,
    muted: channel.muted,
    soloed: channel.soloed,
    playback_state: channel.playbackState,
    started_at: null,       // Set by caller with actual timestamp
    paused_elapsed: null,   // Set by caller with actual value
  };
}

// ── Private helpers ──────────────────────────────────────────────────────────

function _resolveLoopModeFromContract(channelState) {
  // New contract field takes precedence
  if (channelState.loop_mode) return channelState.loop_mode;
  // Legacy fallback from bool
  if (channelState.looping === true) return LoopMode.FULL;
  if (channelState.looping === false) return LoopMode.OFF;
  return LoopMode.FULL; // Default for BGM channels
}

function _mapPlaybackState(contractState) {
  const map = {
    playing: PlaybackState.PLAYING,
    paused: PlaybackState.PAUSED,
    stopped: PlaybackState.STOPPED,
  };
  return map[contractState] ?? PlaybackState.STOPPED;
}
