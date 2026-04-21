/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioEngine } from '@/app/audio_management/engine';
import { CHANNEL_PRESETS, DEFAULT_EFFECTS as ENGINE_DEFAULT_EFFECTS } from '@/app/audio_management/engine/presets';
import { DEFAULT_VOLUME } from '@/app/audio_management/engine/constants';
import { assetToEngineConfig, engineToApiPayload } from '@/app/audio_management/adapters/assetAdapter';
import { BGM_CHANNELS, PlaybackState } from '@/app/audio_management/types';
import { useAssetManager } from '@/app/shared/providers/AssetDownloadManager';
import { authFetch } from '@/app/shared/utils/authFetch';

/**
 * useWorkshopMixEngine — standalone multi-channel preview engine for the
 * Workshop Mix Editor. Mirrors the in-game mixer's playback behavior but
 * with no WebSocket, no session state, no MongoDB.
 *
 * Writes land on the asset itself via debounced PATCH to
 * `/api/library/{id}/audio-config` — so every session and every preset
 * that references the asset picks up the new defaults next time it loads.
 */
const PATCH_DEBOUNCE_MS = 500;

async function fetchAssetById(assetId) {
  const response = await authFetch(`/api/library/${assetId}`, { method: 'GET' });
  if (!response.ok) return null;
  return response.json();
}

// Empty shape for unfilled BGM channel slots — keeps MixerStrips happy.
function emptyTrackState(channelId) {
  const label = channelId.replace('audio_channel_', '');
  return {
    filename: null,
    asset_id: null,
    s3_url: null,
    type: 'bgm',
    channelGroup: 'bgm',
    track: label,
    playbackState: PlaybackState.STOPPED,
    volume: 0.8,
    currentTime: 0,
    duration: 0,
    remaining: 0,
    looping: true,
    loop_mode: null,
    loop_start: null,
    loop_end: null,
  };
}

function emptyTrackStates() {
  const map = {};
  for (const ch of BGM_CHANNELS) map[ch.id] = emptyTrackState(ch.id);
  return map;
}

export function useWorkshopMixEngine(preset) {
  const assetManager = useAssetManager();

  const engineRef = useRef(null);
  // channelsRef: channelId → { channel, buffer, asset }
  const channelsRef = useRef(new Map());
  const readyRef = useRef(false);

  const [trackStates, setTrackStates] = useState(() => emptyTrackStates());
  const [trackAnalysers, setTrackAnalysers] = useState({});
  const [channelEffects, setChannelEffects] = useState({});
  const [mutedChannels, setMutedChannels] = useState({});
  const [soloedChannels, setSoloedChannels] = useState({});
  const [masterVolume, setMasterVolume] = useState(1.0);
  const masterAnalysersRef = useRef(null);

  // Pending PATCH queue per asset → merged + debounced
  const pendingPatchesRef = useRef(new Map()); // assetId → { timeoutId, patch }
  const schedulePatch = useCallback((assetId, delta) => {
    if (!assetId) return;
    const existing = pendingPatchesRef.current.get(assetId);
    const merged = { ...(existing?.patch ?? {}), ...delta };
    if (existing?.timeoutId) clearTimeout(existing.timeoutId);
    const timeoutId = setTimeout(async () => {
      pendingPatchesRef.current.delete(assetId);
      try {
        await authFetch(`/api/library/${assetId}/audio-config`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(merged),
        });
      } catch (err) {
        console.warn(`Failed to persist asset ${assetId} config:`, err);
      }
    }, PATCH_DEBOUNCE_MS);
    pendingPatchesRef.current.set(assetId, { timeoutId, patch: merged });
  }, []);

  // ── Engine lifecycle ────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const engine = new AudioEngine();
      await engine.init();
      await engine.unlock();
      if (cancelled) { engine.destroy(); return; }
      engineRef.current = engine;
      // Master analysers are stable for the engine's lifetime — grab them once
      masterAnalysersRef.current = engine.getMasterAnalysers?.() ?? null;
      readyRef.current = true;
    })();
    return () => {
      cancelled = true;
      // Flush pending PATCHes so edits made right before unmount aren't lost
      for (const [assetId, { timeoutId, patch }] of pendingPatchesRef.current.entries()) {
        clearTimeout(timeoutId);
        authFetch(`/api/library/${assetId}/audio-config`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        }).catch(() => {});
      }
      pendingPatchesRef.current.clear();
      const eng = engineRef.current;
      if (eng) eng.destroy();
      engineRef.current = null;
      channelsRef.current.clear();
      readyRef.current = false;
    };
  }, []);

  // ── Load preset into channels ───────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Wait for engine if still initialising
      while (!readyRef.current && !cancelled) {
        await new Promise(r => setTimeout(r, 20));
      }
      if (cancelled) return;
      const engine = engineRef.current;
      if (!engine) return;

      // Tear down all current channels (simpler than diffing — preset switches are rare)
      for (const [channelId, entry] of channelsRef.current) {
        try { entry.channel.stop(); } catch {}
        try { engine.removeChannel(channelId); } catch {}
      }
      channelsRef.current.clear();

      // Reset state to a clean baseline
      const nextTrackStates = emptyTrackStates();
      const nextAnalysers = {};
      const nextEffects = {};

      if (!preset || !preset.slots || preset.slots.length === 0) {
        if (!cancelled) {
          setTrackStates(nextTrackStates);
          setTrackAnalysers(nextAnalysers);
          setChannelEffects(nextEffects);
        }
        return;
      }

      // Build up new channels for each slot
      for (const slot of preset.slots) {
        if (cancelled) return;
        if (!BGM_CHANNELS.find(c => c.id === slot.channel_id)) continue;

        const asset = await fetchAssetById(slot.music_asset_id);
        if (!asset || cancelled) continue;

        // Decode buffer
        let buffer = null;
        try {
          const blob = await assetManager.download(asset.s3_url, asset.file_size, asset.id);
          const arrayBuffer = await blob.arrayBuffer();
          buffer = await engine.context.decodeAudioData(arrayBuffer);
        } catch (err) {
          console.warn(`Failed to decode asset ${asset.id}:`, err);
          continue;
        }
        if (cancelled) return;

        const channel = engine.createChannel(slot.channel_id, CHANNEL_PRESETS.BGM);
        const engineConfig = assetToEngineConfig(asset);

        // Apply effects, volume, and loop config from the asset's stored defaults
        if (engineConfig.effects) channel.effectChain.applyEffects(engineConfig.effects);
        if (engineConfig.volume != null) channel.setVolume(engineConfig.volume);
        if (engineConfig.loop?.mode) channel.setLoopMode(engineConfig.loop.mode);
        if (engineConfig.loop?.start != null && engineConfig.loop?.end != null) {
          channel.setLoopRegion(engineConfig.loop.start, engineConfig.loop.end);
        }

        channelsRef.current.set(slot.channel_id, { channel, buffer, asset });

        // Grab metering analysers — dry path + reverb send return.
        const dryAnalysers = channel.getAnalysers?.();
        if (dryAnalysers) nextAnalysers[slot.channel_id] = dryAnalysers;
        const reverbAnalysers = channel.getSendAnalysers?.('reverb');
        if (reverbAnalysers) nextAnalysers[`${slot.channel_id}_reverb`] = reverbAnalysers;

        // Seed track state + effects state for this slot
        nextTrackStates[slot.channel_id] = {
          ...emptyTrackState(slot.channel_id),
          filename: asset.filename,
          asset_id: asset.id,
          s3_url: asset.s3_url,
          volume: engineConfig.volume ?? 0.8,
          duration: buffer.duration,
          looping: engineConfig.loop?.mode !== 'off',
          loop_mode: engineConfig.loop?.mode ?? null,
          loop_start: engineConfig.loop?.start ?? null,
          loop_end: engineConfig.loop?.end ?? null,
        };
        nextEffects[slot.channel_id] = { ...(engineConfig.effects ?? {}) };

        // Subscribe to time/state updates
        const onTimeUpdate = ({ currentTime, duration, remaining }) => {
          setTrackStates(prev => ({
            ...prev,
            [slot.channel_id]: { ...prev[slot.channel_id], currentTime, duration, remaining },
          }));
        };
        const onStateChange = ({ to }) => {
          setTrackStates(prev => ({
            ...prev,
            [slot.channel_id]: { ...prev[slot.channel_id], playbackState: to },
          }));
        };
        channel.on('timeupdate', onTimeUpdate);
        channel.on('statechange', onStateChange);
      }

      if (!cancelled) {
        setTrackStates(nextTrackStates);
        setTrackAnalysers(nextAnalysers);
        setChannelEffects(nextEffects);
      }
    })();
    return () => { cancelled = true; };
  }, [preset, assetManager]);

  // ── Transport callbacks ─────────────────────────────────────────────────
  const onPlay = useCallback((trackId) => {
    const entry = channelsRef.current.get(trackId);
    if (!entry?.channel || !entry.buffer) return;
    const { channel, buffer } = entry;
    if (channel.playbackState === PlaybackState.PAUSED) {
      channel.resume();
    } else if (channel.playbackState !== PlaybackState.PLAYING) {
      channel.play(buffer, { offset: channel.currentTime ?? 0 });
    }
  }, []);

  const onPause = useCallback((trackId) => {
    const entry = channelsRef.current.get(trackId);
    if (entry?.channel) entry.channel.pause();
  }, []);

  const onStop = useCallback((trackId) => {
    const entry = channelsRef.current.get(trackId);
    if (entry?.channel) entry.channel.stop();
  }, []);

  // ── Volume ──────────────────────────────────────────────────────────────
  const setTrackVolume = useCallback((trackId, volume) => {
    const entry = channelsRef.current.get(trackId);
    if (entry?.channel) entry.channel.setVolume(volume);
    setTrackStates(prev => ({
      ...prev,
      [trackId]: { ...prev[trackId], volume },
    }));
  }, []);

  const onVolumeCommit = useCallback((trackId, volume) => {
    const entry = channelsRef.current.get(trackId);
    if (!entry) return;
    schedulePatch(entry.asset.id, { default_volume: volume });
  }, [schedulePatch]);

  // ── Loop ────────────────────────────────────────────────────────────────
  const onLoopCommit = useCallback((trackId, looping, loopMode) => {
    const entry = channelsRef.current.get(trackId);
    if (!entry) return;
    const mode = loopMode ?? (looping ? 'full' : 'off');
    entry.channel.setLoopMode(mode);
    setTrackStates(prev => ({
      ...prev,
      [trackId]: { ...prev[trackId], looping, loop_mode: mode },
    }));
    schedulePatch(entry.asset.id, { default_looping: looping, loop_mode: mode });
  }, [schedulePatch]);

  // ── Effects ─────────────────────────────────────────────────────────────
  const applyChannelEffects = useCallback((trackId, effects) => {
    const entry = channelsRef.current.get(trackId);
    if (entry?.channel?.effectChain) entry.channel.effectChain.applyEffects(effects);
    setChannelEffects(prev => ({ ...prev, [trackId]: { ...(prev[trackId] ?? {}), ...effects } }));
  }, []);

  const setEffectMixLevel = useCallback((trackId, effectName, mix) => {
    const entry = channelsRef.current.get(trackId);
    if (entry?.channel?.effectChain) {
      const effect = entry.channel.effectChain.getEffect(effectName);
      if (effect) effect.setMix(mix);
    }
    setChannelEffects(prev => ({
      ...prev,
      [trackId]: { ...(prev[trackId] ?? {}), [`${effectName}_mix`]: mix },
    }));
  }, []);

  const onEffectsChange = useCallback((trackId, effects) => {
    const entry = channelsRef.current.get(trackId);
    if (!entry) return;
    const payload = engineToApiPayload({ effects });
    schedulePatch(entry.asset.id, payload);
  }, [schedulePatch]);

  // ── Mute / solo ─────────────────────────────────────────────────────────
  // Setters only touch state. A reconciliation effect below pushes the
  // combined state into the engine — this is how the game hook does it,
  // and it's the only way to correctly handle reverb-send composite IDs
  // (e.g. 'audio_channel_A_reverb' — not a real engine channel, it's a
  // per-effect sub-mute on the primary channel's reverb effect).
  const setChannelMuted = useCallback((trackId, muted) => {
    setMutedChannels(prev => ({ ...prev, [trackId]: muted }));
  }, []);

  const setChannelSoloed = useCallback((trackId, soloed) => {
    setSoloedChannels(prev => ({ ...prev, [trackId]: soloed }));
  }, []);

  // Forward mute/solo state into the engine — sends (e.g. `${id}_reverb`)
  // are first-class channels in the engine's registry, so the resolution
  // is just "look up by id, set flags". The engine owns the cascade and
  // gain computation.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    const ids = new Set([
      ...Object.keys(mutedChannels),
      ...Object.keys(soloedChannels),
    ]);
    for (const [channelId] of channelsRef.current) {
      ids.add(channelId);
      ids.add(`${channelId}_reverb`);
    }

    for (const id of ids) {
      const channel = engine.getChannel(id);
      if (!channel) continue;
      channel.setMuted(mutedChannels[id] || false);
      channel.setSoloed(soloedChannels[id] || false);
    }

    engine.updateMuteSoloState();
  }, [mutedChannels, soloedChannels]);

  // ── Master volume ───────────────────────────────────────────────────────
  // Workshop has no broadcast/local split, so we route to the broadcast
  // node (_masterGain) rather than _localGain. This matters for metering:
  // _masterMeter sits *between* the two gain stages, so only _masterGain
  // changes are reflected on the master RMS meter. Using _localGain would
  // attenuate the audible signal without moving the needle.
  const onMasterVolumeChange = useCallback((v) => {
    setMasterVolume(v);
    engineRef.current?.setMasterVolume?.(v);
  }, []);
  const onMasterVolumeCommit = useCallback(() => { /* no-op: Workshop master isn't persisted */ }, []);

  // ── Global transport (play all / stop all) ──────────────────────────────
  const onPlayAll = useCallback(() => {
    for (const [, entry] of channelsRef.current) {
      if (!entry?.channel || !entry.buffer) continue;
      const { channel, buffer } = entry;
      if (channel.playbackState === PlaybackState.PLAYING) continue;
      if (channel.playbackState === PlaybackState.PAUSED) {
        channel.resume();
      } else {
        channel.play(buffer, { offset: channel.currentTime ?? 0 });
      }
    }
  }, []);

  const onStopAll = useCallback(() => {
    for (const [, entry] of channelsRef.current) {
      if (entry?.channel) entry.channel.stop();
    }
  }, []);

  // Reset every loaded channel's level + effect config back to engine
  // defaults. Loop points, BPM, and time signature are untouched — those
  // are intrinsic to how the asset plays, not mix-bus config.
  const onResetAll = useCallback(() => {
    const defaultEffects = {
      hpf: ENGINE_DEFAULT_EFFECTS.hpf.enabled,
      hpf_mix: ENGINE_DEFAULT_EFFECTS.hpf.mix,
      lpf: ENGINE_DEFAULT_EFFECTS.lpf.enabled,
      lpf_mix: ENGINE_DEFAULT_EFFECTS.lpf.mix,
      reverb: ENGINE_DEFAULT_EFFECTS.reverb.enabled,
      reverb_mix: ENGINE_DEFAULT_EFFECTS.reverb.mix,
      reverb_preset: ENGINE_DEFAULT_EFFECTS.reverb.preset,
      eq: false,
    };

    const nextTrackStates = {};
    const nextEffects = {};

    for (const [channelId, entry] of channelsRef.current) {
      if (!entry?.channel) continue;
      entry.channel.setVolume(DEFAULT_VOLUME);
      if (entry.channel.effectChain) {
        entry.channel.effectChain.applyEffects(defaultEffects);
      }
      nextTrackStates[channelId] = { volume: DEFAULT_VOLUME };
      nextEffects[channelId] = { ...defaultEffects };
      schedulePatch(entry.asset.id, {
        default_volume: DEFAULT_VOLUME,
        ...engineToApiPayload({ effects: defaultEffects }),
      });
    }

    setTrackStates(prev => {
      const merged = { ...prev };
      for (const [id, patch] of Object.entries(nextTrackStates)) {
        merged[id] = { ...merged[id], ...patch };
      }
      return merged;
    });
    setChannelEffects(prev => ({ ...prev, ...nextEffects }));
  }, [schedulePatch]);

  return {
    // State
    trackStates,
    trackAnalysers,
    channelEffects,
    mutedChannels,
    soloedChannels,
    masterAnalysers: masterAnalysersRef,
    masterVolume,
    // Commands
    setTrackVolume,
    onVolumeCommit,
    onPlay,
    onPause,
    onStop,
    onPlayAll,
    onStopAll,
    onResetAll,
    onLoopCommit,
    applyChannelEffects,
    setEffectMixLevel,
    onEffectsChange,
    setChannelMuted,
    setChannelSoloed,
    onMasterVolumeChange,
    onMasterVolumeCommit,
  };
}
