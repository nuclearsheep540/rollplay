/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState, useEffect, useRef, useCallback } from 'react';
import { PlaybackState, ChannelType, DEFAULT_EFFECTS } from '../types';
import { useAssetManager } from '@/app/shared/providers/AssetDownloadManager';
import AudioEngine from '../engine/AudioEngine';
import { CHANNEL_PRESETS } from '../engine/presets';
import { LoopMode } from '../engine/constants';

// ── Channel ID constants ────────────────────────────────────────────────────
const BGM_CHANNEL_IDS = ['audio_channel_A', 'audio_channel_B', 'audio_channel_C', 'audio_channel_D', 'audio_channel_E', 'audio_channel_F'];
const SFX_SLOT_COUNT = 9;

/**
 * Unified Audio System for Tabletop Tavern
 *
 * Handles TWO types of audio:
 * 1. LOCAL AUDIO: Hardcoded app sounds (dice rolls, combat start, UI feedback)
 *    - Triggered by client-side events
 *    - Uses HTML5 Audio for simplicity
 *
 * 2. REMOTE AUDIO: DM-controlled audio (BGM, custom SFX)
 *    - Triggered by WebSocket events from DM
 *    - Uses Web Audio API via AudioEngine for precise mixing
 *
 * Both audio types respect the master volume slider.
 *
 * ── Engine delegation vs hook ownership ──────────────────────────────────────
 *
 * DELEGATED TO ENGINE:
 *   - AudioContext creation/lifecycle          → engine.init(), engine.context
 *   - Master chain (masterGain, localGain)     → engine.setMasterVolume(), engine.setLocalVolume()
 *   - Master metering                          → engine.getMasterAnalysers()
 *   - Buffer cache                             → engine.storeBuffer(), engine.getBuffer()
 *   - Per-channel gain/mute/effect nodes       → channel.effectChain
 *   - Per-channel stereo metering              → channel.getAnalysers(), channel.getSendAnalysers()
 *   - Channel creation                         → engine.createChannel()
 *   - Mute/solo recomputation                  → engine.updateMuteSoloState()
 *
 * KEPT IN HOOK:
 *   - All React state (useState, useRef for state mirroring)
 *   - Batch state accumulator (startStateBatch / flushStateBatch)
 *   - WebSocket event integration patterns
 *   - Network sync (started_at JIT offset calculation)
 *   - Pending play queue (before unlock)
 *   - Visibility recovery
 *   - Server state sync (syncAudioState)
 *   - SFX soundboard React state
 *   - Local audio (HTML5 elements)
 *   - Fade transitions (rAF-based with proportional reverb send fading)
 *   - Play/resume operation locking
 *   - Time tracking (via engine channel events, formatted and throttled identically)
 */

export const useUnifiedAudio = () => {
  const [isAudioUnlocked, setIsAudioUnlocked] = useState(false);
  const isAudioUnlockedRef = useRef(false);
  const assetManager = useAssetManager();

  // Callback to clear pending operations when tracks auto-stop
  const clearPendingOperationCallbackRef = useRef(null);

  // ── AudioEngine instance (created once, lives for hook lifetime) ──────────
  const engineRef = useRef(null);

  // Local listening volume (per-client, localStorage-persisted, private)
  const [masterVolume, setMasterVolume] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('rollplay_master_volume');
      if (saved !== null) {
        const parsed = parseFloat(saved);
        if (!Number.isNaN(parsed)) return parsed;
      }
      const isMobile = window.matchMedia('(max-width: 639px)').matches;
      return isMobile ? 0.75 : 0.5;
    }
    return 0.5;
  });

  // Broadcast master volume (DM-controlled, synced to all clients via WebSocket)
  const [broadcastMasterVolume, setBroadcastMasterVolume] = useState(1.0);

  // =====================================
  // LOCAL AUDIO SYSTEM (HTML5 Audio)
  // =====================================
  // Kept in the hook — HTML5 Audio is outside engine scope.
  const localAudioElements = useRef({});

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localAudioElements.current = {
        combatStart: new Audio('/audio/sword.mp3'),
      };
      Object.values(localAudioElements.current).forEach(audio => {
        if (audio) {
          audio.preload = 'auto';
          audio.volume = masterVolume;
        }
      });
    }
  }, []);

  useEffect(() => {
    Object.values(localAudioElements.current).forEach(audio => {
      if (audio) {
        audio.volume = masterVolume;
      }
    });
  }, [masterVolume]);

  const playLocalSFX = (soundName, volume = null) => {
    if (!isAudioUnlocked) {
      console.warn('Audio not unlocked yet - cannot play local audio');
      return;
    }
    const audio = localAudioElements.current[soundName];
    if (audio) {
      try {
        audio.volume = volume !== null ? volume * masterVolume : masterVolume;
        audio.currentTime = 0;
        audio.play().catch(e => console.warn('Local audio play failed:', e));
      } catch (error) {
        console.warn(`Failed to play local audio ${soundName}:`, error);
      }
    } else {
      console.warn(`Local audio '${soundName}' not found`);
    }
  };

  // =====================================
  // REMOTE AUDIO SYSTEM (Web Audio API via AudioEngine)
  // =====================================

  // Refs for play/resume operation locking (kept in hook — game-specific concurrency)
  const resumeOperationsRef = useRef({});
  const playOperationsRef = useRef({});
  const pendingPlayOpsRef = useRef([]);
  const pendingAudioStateRef = useRef(null);
  const [audioSyncComplete, setAudioSyncComplete] = useState(false);
  const unlockInProgressRef = useRef(false);

  // Track timing info (kept in hook — rAF-based time tracking with throttled React state updates)
  const trackTimersRef = useRef({});

  // Remote track states (for DM-controlled BGM audio)
  const [remoteTrackStates, setRemoteTrackStatesRaw] = useState({
    audio_channel_A: { playbackState: PlaybackState.STOPPED, volume: 0.8, filename: null, asset_id: null, s3_url: null, type: ChannelType.BGM, channelGroup: ChannelType.BGM, track: 'A', currentTime: 0, duration: 0, looping: true },
    audio_channel_B: { playbackState: PlaybackState.STOPPED, volume: 0.8, filename: null, asset_id: null, s3_url: null, type: ChannelType.BGM, channelGroup: ChannelType.BGM, track: 'B', currentTime: 0, duration: 0, looping: true },
    audio_channel_C: { playbackState: PlaybackState.STOPPED, volume: 0.8, filename: null, asset_id: null, s3_url: null, type: ChannelType.BGM, channelGroup: ChannelType.BGM, track: 'C', currentTime: 0, duration: 0, looping: true },
    audio_channel_D: { playbackState: PlaybackState.STOPPED, volume: 0.8, filename: null, asset_id: null, s3_url: null, type: ChannelType.BGM, channelGroup: ChannelType.BGM, track: 'D', currentTime: 0, duration: 0, looping: true },
    audio_channel_E: { playbackState: PlaybackState.STOPPED, volume: 0.8, filename: null, asset_id: null, s3_url: null, type: ChannelType.BGM, channelGroup: ChannelType.BGM, track: 'E', currentTime: 0, duration: 0, looping: true },
    audio_channel_F: { playbackState: PlaybackState.STOPPED, volume: 0.8, filename: null, asset_id: null, s3_url: null, type: ChannelType.BGM, channelGroup: ChannelType.BGM, track: 'F', currentTime: 0, duration: 0, looping: true },
  });

  // Ref mirror for use in event listeners (avoids re-registering on every state change)
  const remoteTrackStatesRef = useRef(remoteTrackStates);
  useEffect(() => { remoteTrackStatesRef.current = remoteTrackStates; }, [remoteTrackStates]);

  // Batch accumulator — when active, setRemoteTrackStates calls accumulate
  // into the ref instead of firing individually. flushBatch() applies them
  // as one atomic state update. Used by handleRemoteAudioBatch.
  const batchAccumulatorRef = useRef(null);

  const setRemoteTrackStates = useCallback((updater) => {
    if (batchAccumulatorRef.current !== null) {
      if (typeof updater === 'function') {
        batchAccumulatorRef.current.push(updater);
      } else {
        batchAccumulatorRef.current.push(() => updater);
      }
    } else {
      setRemoteTrackStatesRaw(updater);
    }
  }, []);

  const startStateBatch = useCallback(() => {
    batchAccumulatorRef.current = [];
  }, []);

  const flushStateBatch = useCallback(() => {
    const updaters = batchAccumulatorRef.current;
    batchAccumulatorRef.current = null;
    if (!updaters || updaters.length === 0) return;
    setRemoteTrackStatesRaw(prev => {
      let state = prev;
      for (const updater of updaters) {
        state = typeof updater === 'function' ? updater(state) : { ...state, ...updater };
      }
      return state;
    });
  }, []);

  // =====================================
  // SFX SOUNDBOARD (Lightweight fire-and-forget)
  // =====================================
  // SFX uses engine channels with CHANNEL_PRESETS.SFX for playback.
  // React state is kept in the hook for UI.

  const [sfxSlots, setSfxSlots] = useState(() =>
    Array.from({ length: SFX_SLOT_COUNT }, (_, i) => ({
      slotIndex: i,
      trackId: `sfx_slot_${i}`,
      asset_id: null,
      filename: null,
      s3_url: null,
      volume: 0.8,
      isPlaying: false,
    }))
  );

  // Per-channel mute/solo state (channel-level, not asset-level — survives track swaps)
  const [mutedChannels, setMutedChannels] = useState({});
  const [soloedChannels, setSoloedChannels] = useState({});

  const setChannelMuted = useCallback((channelId, muted) => {
    setMutedChannels(prev => ({ ...prev, [channelId]: muted }));
  }, []);

  const setChannelSoloed = useCallback((channelId, soloed) => {
    setSoloedChannels(prev => ({ ...prev, [channelId]: soloed }));
  }, []);

  // Recompute muteGainNode values whenever mute/solo state changes.
  // Delegates to engine.updateMuteSoloState() after syncing mute/solo flags
  // to engine channels.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    for (const trackId of BGM_CHANNEL_IDS) {
      const channel = engine.getChannel(trackId);
      if (!channel) continue;
      channel.setMuted(mutedChannels[trackId] || false);
      channel.setSoloed(soloedChannels[trackId] || false);
    }

    // Reverb send mute/solo — engine handles this via updateMuteSoloState,
    // but we also need per-effect mute/solo via composite keys (e.g. "audio_channel_A_reverb").
    // The engine's updateMuteSoloState handles channel mute cascading to reverb sends.
    // For independent effect strip mute/solo, we handle it separately here.
    const anySoloed = Object.values(soloedChannels).some(Boolean);

    for (const trackId of BGM_CHANNEL_IDS) {
      const channel = engine.getChannel(trackId);
      if (!channel?.effectChain) continue;

      const reverb = channel.effectChain.getEffect('reverb');
      if (!reverb) continue;

      const channelMuted = mutedChannels[trackId] || false;
      const effectId = `${trackId}_reverb`;
      const effectMuted = mutedChannels[effectId] || false;
      const effectSoloed = soloedChannels[effectId] || false;

      let gain;
      if (anySoloed) {
        gain = (effectSoloed && !effectMuted) ? 1.0 : 0.0;
      } else {
        gain = (channelMuted || effectMuted) ? 0.0 : 1.0;
      }
      reverb.setSendMuted(gain === 0.0);
    }

    engine.updateMuteSoloState();
  }, [mutedChannels, soloedChannels]);

  // Active fade transitions state (kept in hook — rAF-based with proportional reverb send fading)
  const [activeFades, setActiveFades] = useState({});
  const activeFadeRafsRef = useRef({});

  // Per-channel effect state — enabled flags + mix levels (React state for UI)
  const [channelEffects, setChannelEffects] = useState(() => {
    const effects = {};
    ['A', 'B', 'C', 'D', 'E', 'F'].forEach(ch => {
      effects[`audio_channel_${ch}`] = {
        eq: false,
        hpf: DEFAULT_EFFECTS.hpf.enabled,
        hpf_mix: DEFAULT_EFFECTS.hpf.mix,
        lpf: DEFAULT_EFFECTS.lpf.enabled,
        lpf_mix: DEFAULT_EFFECTS.lpf.mix,
        reverb: DEFAULT_EFFECTS.reverb.enabled,
        reverb_mix: DEFAULT_EFFECTS.reverb.mix,
        reverb_preset: DEFAULT_EFFECTS.reverb.preset || 'room',
      };
    });
    return effects;
  });

  const channelEffectsRef = useRef(channelEffects);
  useEffect(() => { channelEffectsRef.current = channelEffects; }, [channelEffects]);

  // Analyser refs — built from engine channels, exposed as refs for consumers.
  // remoteTrackAnalysers includes both dry path and reverb return analysers.
  const remoteTrackAnalysersRef = useRef({});
  const masterAnalysersRef = useRef(null);

  // ── Helper: build analyser refs from engine channels ──────────────────────
  const rebuildAnalyserRefs = () => {
    const engine = engineRef.current;
    if (!engine) return;

    for (const trackId of BGM_CHANNEL_IDS) {
      const channel = engine.getChannel(trackId);
      if (!channel) continue;
      // Dry path analysers
      const dryAnalysers = channel.getAnalysers();
      if (dryAnalysers) {
        remoteTrackAnalysersRef.current[trackId] = dryAnalysers;
      }
      // Reverb return analysers (composite key)
      const reverbAnalysers = channel.getSendAnalysers('reverb');
      if (reverbAnalysers) {
        remoteTrackAnalysersRef.current[`${trackId}_reverb`] = reverbAnalysers;
      }
    }

    // Master analysers
    masterAnalysersRef.current = engine.getMasterAnalysers();
  };

  // ── Engine initialization ─────────────────────────────────────────────────
  // Eagerly create AudioEngine on mount (creates AudioContext in 'suspended' state).
  // This allows loadRemoteAudioBuffer to decode audio even before user interaction.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (engineRef.current) return;

    const engine = new AudioEngine();
    engineRef.current = engine;

    const initEngine = async () => {
      await engine.init();

      // Create 6 BGM channels with full effect chain
      for (const trackId of BGM_CHANNEL_IDS) {
        engine.createChannel(trackId, CHANNEL_PRESETS.BGM);
      }

      // Create SFX slot channels (lightweight, no effects)
      for (let i = 0; i < SFX_SLOT_COUNT; i++) {
        engine.createChannel(`sfx_slot_${i}`, CHANNEL_PRESETS.SFX);
      }

      // Set initial volumes
      engine.setMasterVolume(broadcastMasterVolume);
      engine.setLocalVolume(masterVolume);

      // Build analyser refs for consumers
      rebuildAnalyserRefs();

      console.log('Web Audio API initialized via AudioEngine for remote tracks + SFX soundboard + effects chains');
    };

    initEngine();
  }, []);

  // Load remote audio buffer — uses assetManager.download() for progress tracking,
  // then decodes via engine.context and stores in engine's buffer cache.
  const loadRemoteAudioBuffer = async (url, trackId, assetId) => {
    const engine = engineRef.current;
    if (!engine?.context || engine.context.state === 'closed') {
      console.warn('loadRemoteAudioBuffer: AudioContext is null or closed — cannot decode audio');
      return null;
    }

    // Check engine buffer cache first
    const cacheKey = `${trackId}_${assetId || url}`;
    const cached = engine.getBuffer(cacheKey);
    if (cached) return cached;

    try {
      const blob = await assetManager.download(url, undefined, assetId);
      const arrayBuffer = await blob.arrayBuffer();
      const audioBuffer = await engine.context.decodeAudioData(arrayBuffer);
      engine.storeBuffer(cacheKey, audioBuffer);
      return audioBuffer;
    } catch (error) {
      console.warn(`Failed to load remote audio: ${url}`, error);
      return null;
    }
  };

  // =====================================
  // FADE TRANSITION FUNCTIONS
  // =====================================
  // Kept in the hook — the engine's fade is simpler; the hook's rAF-based fade
  // with proportional reverb send fading and TRANSITIONING state is more sophisticated.

  const startFade = (trackId, type, duration, startGain, targetGain, operation) => {
    // Cancel any existing fade for this track
    if (activeFadeRafsRef.current[trackId]) {
      cancelAnimationFrame(activeFadeRafsRef.current[trackId]);
      delete activeFadeRafsRef.current[trackId];
    }

    const startTime = performance.now();

    // Capture reverb send state for proportional fading.
    // Read the wet gain from the engine channel's reverb effect.
    const engine = engineRef.current;
    const channel = engine?.getChannel(trackId);
    const reverb = channel?.effectChain?.getEffect('reverb');
    const reverbWetGainAtStart = reverb?.wetGain?.gain?.value ?? 0;

    const effects = channelEffectsRef.current[trackId];
    const reverbEnabled = effects?.reverb ?? false;
    const reverbTargetLevel = reverbEnabled
      ? (effects?.reverb_mix ?? DEFAULT_EFFECTS.reverb.mix)
      : 0;

    // Set state ONCE at fade start — this is the only state update until fade ends
    setActiveFades(prev => ({
      ...prev,
      [trackId]: { type, startTime, duration, startGain, targetGain, operation }
    }));

    // Mark track as transitioning (TRANSITIONING state used by mixer UI)
    setRemoteTrackStates(prev => ({
      ...prev,
      [trackId]: { ...prev[trackId], playbackState: PlaybackState.TRANSITIONING }
    }));

    // Animation loop — only touches gain nodes and the ref, NOT React state
    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1.0);
      const currentGain = startGain + (targetGain - startGain) * progress;

      // Apply gain to channel fader via engine channel's gainNode
      if (channel?.effectChain?.gainNode) {
        channel.effectChain.gainNode.gain.value = currentGain;
      }

      // Fade reverb send in proportion alongside the dry signal
      if (reverb?.wetGain) {
        let fadeRatio;
        if (type === 'out') {
          fadeRatio = startGain > 0 ? currentGain / startGain : 0;
        } else if (type === 'in') {
          fadeRatio = targetGain > 0 ? currentGain / targetGain : 0;
        } else {
          fadeRatio = 1;
        }
        fadeRatio = Math.min(Math.max(fadeRatio, 0), 1);
        const reverbBase = type === 'in' ? reverbTargetLevel : reverbWetGainAtStart;
        reverb.wetGain.gain.value = reverbBase * fadeRatio;
      }

      if (progress < 1.0) {
        activeFadeRafsRef.current[trackId] = requestAnimationFrame(animate);
      } else {
        // Fade complete
        delete activeFadeRafsRef.current[trackId];

        setActiveFades(prev => {
          const newFades = { ...prev };
          delete newFades[trackId];
          return newFades;
        });

        if (type === 'out') {
          setTimeout(() => {
            stopRemoteTrack(trackId);
          }, 50);
        } else if (type === 'in') {
          setRemoteTrackStates(prev => ({
            ...prev,
            [trackId]: { ...prev[trackId], playbackState: PlaybackState.PLAYING }
          }));
        }
      }
    };

    activeFadeRafsRef.current[trackId] = requestAnimationFrame(animate);
  };

  const cancelFade = (trackId) => {
    if (activeFadeRafsRef.current[trackId]) {
      cancelAnimationFrame(activeFadeRafsRef.current[trackId]);
      delete activeFadeRafsRef.current[trackId];
    }
    setActiveFades(prev => {
      if (!prev[trackId]) return prev;
      const newFades = { ...prev };
      delete newFades[trackId];
      return newFades;
    });
  };

  // ── Playback: play remote track ───────────────────────────────────────────
  // Delegates AudioBuffer source creation to engine channels, but keeps all
  // game-specific logic (operation locking, pending queue, JIT sync, React state).
  const playRemoteTrack = async (trackId, audioFile, loop = true, volume = null, resumeFromTime = null, completeTrackState = null, skipBufferLoad = false, syncStartTime = null, fade = false, fadeDuration = 1000) => {
    const operationId = `${trackId}_${Date.now()}`;
    const engine = engineRef.current;

    // Check if a play operation is already in progress for this track
    if (playOperationsRef.current[trackId]) {
      console.warn(`Play operation already in progress for ${trackId}, ignoring duplicate`);
      return false;
    }

    playOperationsRef.current[trackId] = operationId;

    try {
      // Check if Web Audio context exists, is unlocked, and the user has clicked the gate overlay
      if (
        !engine?.context ||
        engine.context.state === 'suspended' ||
        !isAudioUnlockedRef.current
      ) {
        console.warn('Audio not ready — queueing play operation for unlock');
        pendingPlayOpsRef.current.push({
          trackId, audioFile, loop, volume, completeTrackState, skipBufferLoad,
          resumeFromTime,
          queuedAt: Date.now()
        });
        // Update UI state so track metadata is visible while waiting for unlock
        setRemoteTrackStates(prev => ({
          ...prev,
          [trackId]: {
            ...prev[trackId],
            filename: audioFile,
            asset_id: completeTrackState?.asset_id || prev[trackId]?.asset_id,
            s3_url: completeTrackState?.s3_url || prev[trackId]?.s3_url,
          }
        }));
        return false;
      }

      const channel = engine.getChannel(trackId);
      if (!channel) {
        console.warn(`No engine channel found for ${trackId}`);
        return false;
      }

      // Stop any existing source for this track via engine channel
      channel._stopSource();
      channel._cancelFade();
      channel._stopTimeTracking();

      // Clean up any existing hook-level timer
      if (trackTimersRef.current[trackId]) {
        delete trackTimersRef.current[trackId];
      }

      // Load (or reuse) the AudioBuffer
      const trackState = remoteTrackStates[trackId];
      const assetId = completeTrackState?.asset_id || trackState?.asset_id;
      const bufferKey = `${trackId}_${assetId || audioFile}`;
      let audioBuffer = engine.getBuffer(bufferKey);

      // Resolve audio URL
      const audioUrl = completeTrackState?.s3_url || trackState?.s3_url || `/audio/${audioFile}`;

      if (skipBufferLoad) {
        if (!audioBuffer) {
          console.error(`Expected pre-loaded buffer not found for ${trackId}`);
          return false;
        }
      } else if (!audioBuffer) {
        audioBuffer = await loadRemoteAudioBuffer(audioUrl, trackId, assetId);
        if (!audioBuffer) return false;
      }

      // Determine looping
      const trackType = completeTrackState?.type || remoteTrackStates[trackId]?.type;
      const shouldLoop = trackType === 'sfx' ? false : (completeTrackState?.looping ?? loop);

      // Compute resume offset
      let startOffset;
      let resumeFromPause = false;
      const NETWORK_COMPENSATION = 0.4;

      if (completeTrackState?.started_at && resumeFromTime === null) {
        const elapsed = (Date.now() / 1000) - completeTrackState.started_at;
        const compensated = Math.max(0, elapsed - NETWORK_COMPENSATION);
        startOffset = shouldLoop
          ? (compensated % audioBuffer.duration)
          : Math.min(compensated, audioBuffer.duration);
        resumeFromPause = true;
      } else {
        resumeFromPause =
          resumeFromTime !== null ||
          (remoteTrackStates[trackId]?.playbackState === PlaybackState.PAUSED &&
            remoteTrackStates[trackId]?.currentTime > 0);
        startOffset =
          resumeFromTime !== null
            ? resumeFromTime
            : resumeFromPause
            ? remoteTrackStates[trackId].currentTime
            : 0;
      }

      // Configure channel loop mode before play
      channel.setLoopMode(shouldLoop ? LoopMode.FULL : LoopMode.OFF);

      // Create and configure the BufferSource directly (we need hook-level
      // timer control, so we manage the source ourselves rather than using channel.play())
      const ctx = engine.context;
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.loop = shouldLoop;

      // Connect source to channel's effect chain input
      if (!channel.effectChain) {
        // Effect chain should exist but rebuild defensively
        channel.rebuild();
        if (!channel.effectChain) return false;
      }
      source.connect(channel.effectChain.inputNode);

      // Store source on channel for proper lifecycle management
      channel._source = source;
      channel._buffer = audioBuffer;
      channel._duration = audioBuffer.duration;

      // Handle source ending (non-looping tracks)
      source.onended = () => {
        if (channel._source !== source) return;
        if (!shouldLoop) {
          channel._source = null;
          delete trackTimersRef.current[trackId];
          setRemoteTrackStates((prev) => ({
            ...prev,
            [trackId]: {
              ...prev[trackId],
              playbackState: PlaybackState.STOPPED,
              currentTime: 0,
              duration: 0,
              remaining: null
            }
          }));

          // Clear ALL pending operations for this track when it auto-stops
          if (clearPendingOperationCallbackRef.current) {
            clearPendingOperationCallbackRef.current(`play_${trackId}`);
            clearPendingOperationCallbackRef.current(`pause_${trackId}`);
            clearPendingOperationCallbackRef.current(`stop_${trackId}`);
            clearPendingOperationCallbackRef.current(`loop_${trackId}`);
          }
        }
      };

      // Volume
      const finalVolume = volume !== null ? volume : remoteTrackStates[trackId]?.volume ?? 0.7;

      if (fade) {
        channel.effectChain.gainNode.gain.value = 0;
      } else {
        channel.effectChain.gainNode.gain.value = finalVolume;
      }

      // Start playback
      if (syncStartTime) {
        source.start(syncStartTime, startOffset);
      } else {
        source.start(0, startOffset);
      }

      // Update React state
      const duration = audioBuffer.duration;
      setRemoteTrackStates((prev) => ({
        ...prev,
        [trackId]: {
          ...prev[trackId],
          playbackState: PlaybackState.PLAYING,
          filename: audioFile,
          volume: finalVolume,
          currentTime: startOffset,
          duration
        }
      }));

      // Handle fade-in if requested
      if (fade) {
        cancelFade(trackId);
        startFade(trackId, 'in', fadeDuration, 0, finalVolume, 'play');
      }

      // Set up hook-level time-update loop (rAF-based, throttled to 100ms)
      const playStartTime = ctx.currentTime;
      const pausedTime = resumeFromPause ? startOffset : 0;

      trackTimersRef.current[trackId] = {
        startTime: playStartTime,
        pausedTime,
        duration,
        loop: shouldLoop,
        lastUpdateTime: playStartTime
      };

      const updateTime = () => {
        const timer = trackTimersRef.current[trackId];
        if (!timer || channel._source !== source) return;

        const elapsed = ctx.currentTime - timer.startTime + timer.pausedTime;

        let currentTime;
        let keepUpdating = true;

        if (timer.loop && timer.duration > 0) {
          currentTime = elapsed % timer.duration;
        } else {
          currentTime = Math.min(elapsed, timer.duration);
          if (elapsed >= timer.duration && timer.duration > 0) {
            try { source.stop(); } catch (_) {}
            channel._source = null;
            delete trackTimersRef.current[trackId];
            setRemoteTrackStates((prev) => ({
              ...prev,
              [trackId]: {
                ...prev[trackId],
                playbackState: PlaybackState.STOPPED,
                currentTime: 0,
                duration: 0,
                remaining: null
              }
            }));

            if (clearPendingOperationCallbackRef.current) {
              clearPendingOperationCallbackRef.current(`play_${trackId}`);
              clearPendingOperationCallbackRef.current(`pause_${trackId}`);
              clearPendingOperationCallbackRef.current(`stop_${trackId}`);
              clearPendingOperationCallbackRef.current(`loop_${trackId}`);
            }
            keepUpdating = false;
          }
        }

        if (keepUpdating) {
          const timeDiff = Math.abs(currentTime - (timer.lastUpdateTime || 0));
          if (timeDiff > 0.1) {
            timer.lastUpdateTime = currentTime;
            setRemoteTrackStates((prev) => ({
              ...prev,
              [trackId]: {
                ...prev[trackId],
                currentTime,
                remaining: (prev[trackId]?.duration || timer.duration) - currentTime,
                playbackState: PlaybackState.PLAYING
              }
            }));
          }
          requestAnimationFrame(updateTime);
        }
      };

      requestAnimationFrame(updateTime);
      return true;
    } catch (error) {
      console.warn(`Failed to play remote ${trackId}:`, error);
      return false;
    } finally {
      if (playOperationsRef.current[trackId] === operationId) {
        delete playOperationsRef.current[trackId];
      }
    }
  };

  // ── Stop remote track ─────────────────────────────────────────────────────
  const stopRemoteTrack = (trackId, fade = false, fadeDuration = 1000) => {
    const engine = engineRef.current;
    const channel = engine?.getChannel(trackId);

    if (channel?._source) {
      try {
        if (fade) {
          cancelFade(trackId);
          const currentGain = channel.effectChain?.gainNode?.gain?.value || 0;
          startFade(trackId, 'out', fadeDuration, currentGain, 0, 'stop');
        } else {
          // Immediate stop
          try { channel._source.stop(); } catch (_) {}
          channel._source = null;
          delete trackTimersRef.current[trackId];
          cancelFade(trackId);

          setRemoteTrackStates(prev => ({
            ...prev,
            [trackId]: {
              ...prev[trackId],
              playbackState: PlaybackState.STOPPED,
              currentTime: 0,
              duration: 0,
              remaining: null
            }
          }));
        }
      } catch (error) {
        console.warn(`Failed to stop remote ${trackId}:`, error);
      }
    }
  };

  // ── Pause remote track ────────────────────────────────────────────────────
  const pauseRemoteTrack = (trackId) => {
    const engine = engineRef.current;
    const channel = engine?.getChannel(trackId);
    const ctx = engine?.context;

    if (channel?._source && trackTimersRef.current[trackId]) {
      try {
        const timer = trackTimersRef.current[trackId];
        const elapsed = ctx.currentTime - timer.startTime + timer.pausedTime;

        let currentTime;
        if (timer.loop && timer.duration > 0) {
          currentTime = elapsed % timer.duration;
        } else {
          currentTime = Math.min(elapsed, timer.duration);
        }

        // Stop the source
        try { channel._source.stop(); } catch (_) {}
        channel._source = null;

        setRemoteTrackStates(prev => ({
          ...prev,
          [trackId]: {
            ...prev[trackId],
            playbackState: PlaybackState.PAUSED,
            currentTime: currentTime,
            remaining: null
          }
        }));

        return true;
      } catch (error) {
        console.warn(`Failed to pause remote ${trackId}:`, error);
        return false;
      }
    }
    return false;
  };

  // ── Toggle remote track looping ───────────────────────────────────────────
  const toggleRemoteTrackLooping = (trackId, looping) => {
    const trackType = remoteTrackStates[trackId]?.type;
    if (trackType === 'sfx') {
      console.warn('SFX tracks cannot be looped - ignoring toggle request');
      return;
    }

    const engine = engineRef.current;
    const channel = engine?.getChannel(trackId);
    const ctx = engine?.context;
    const hasActiveSource = !!channel?._source;
    const currentState = remoteTrackStates[trackId];

    setRemoteTrackStates(prev => ({
      ...prev,
      [trackId]: { ...prev[trackId], looping }
    }));

    if (hasActiveSource && currentState) {
      const { filename } = currentState;
      const actualVolume = channel?.effectChain?.gainNode?.gain?.value || currentState.volume;

      // Calculate current playback position before stopping
      let currentPlaybackTime = 0;
      const timer = trackTimersRef.current[trackId];
      if (timer && ctx) {
        const elapsed = ctx.currentTime - timer.startTime + timer.pausedTime;
        if (timer.loop && timer.duration > 0) {
          currentPlaybackTime = elapsed % timer.duration;
        } else {
          currentPlaybackTime = Math.min(elapsed, timer.duration);
        }
      }

      // Stop current playback
      try {
        channel._source.stop();
        channel._source = null;
        delete trackTimersRef.current[trackId];
      } catch (e) {
        console.warn(`Warning stopping ${trackId} for loop change:`, e);
      }

      const completeTrackState = {
        ...currentState,
        looping,
        channelId: trackId,
        filename,
        volume: actualVolume
      };

      playRemoteTrack(trackId, filename, looping, actualVolume, currentPlaybackTime, completeTrackState);
    }
  };

  // Set callback to clear pending operations when tracks auto-stop
  const setClearPendingOperationCallback = (callback) => {
    clearPendingOperationCallbackRef.current = callback;
  };

  // ── Set remote track volume ───────────────────────────────────────────────
  // Writes to the engine channel's gain node; updates React state.
  const setRemoteTrackVolume = (trackId, volume) => {
    const engine = engineRef.current;
    const channel = engine?.getChannel(trackId);
    if (channel?.effectChain?.gainNode) {
      channel.effectChain.gainNode.gain.value = volume;
    }
    setRemoteTrackStates(prev => ({
      ...prev,
      [trackId]: { ...prev[trackId], volume }
    }));
  };

  // ── Update local listening volume (per-client) ────────────────────────────
  // Delegates to engine.setLocalVolume().
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setLocalVolume(masterVolume);
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem('rollplay_master_volume', masterVolume.toString());
    }
  }, [masterVolume]);

  // ── Update broadcast master volume (DM-controlled) ────────────────────────
  // Delegates to engine.setMasterVolume().
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setMasterVolume(broadcastMasterVolume);
    }
  }, [broadcastMasterVolume]);

  // ── Shared unlock helpers ─────────────────────────────────────────────────

  // Re-apply channel effects to engine channels after unlock.
  const reapplyEffects = () => {
    for (const [trackId, effects] of Object.entries(channelEffects)) {
      const channel = engineRef.current?.getChannel(trackId);
      if (channel?.effectChain) {
        applyChannelEffects(trackId, effects);
      }
    }
  };

  // Drain play operations queued while context was suspended.
  const drainPendingOps = async () => {
    const pending = pendingPlayOpsRef.current;
    pendingPlayOpsRef.current = [];
    if (pending.length === 0) return;

    for (const op of pending) {
      let offset = op.resumeFromTime ?? null;
      if (op.completeTrackState?.started_at) {
        offset = null;
      } else if (offset != null && op.queuedAt) {
        const waitSeconds = (Date.now() - op.queuedAt) / 1000;
        offset = offset + waitSeconds;
        if (op.loop) {
          const assetId = op.completeTrackState?.asset_id;
          const bufferKey = `${op.trackId}_${assetId || op.audioFile}`;
          const buffer = engineRef.current?.getBuffer(bufferKey);
          if (buffer) {
            offset = offset % buffer.duration;
          }
        }
      }
      await playRemoteTrack(op.trackId, op.audioFile, op.loop, op.volume, offset, op.completeTrackState, op.skipBufferLoad);
    }
  };

  // Reconcile: start any channels from pendingAudioStateRef that should be
  // playing but have no active source.
  const reconcileAudioState = async () => {
    const pendingState = pendingAudioStateRef.current;
    if (!pendingState) return;

    pendingAudioStateRef.current = null;
    for (const [channelId, channelState] of Object.entries(pendingState)) {
      if (channelId === '__master_volume') continue;
      if (!channelState?.filename) continue;
      if (channelState.playback_state !== 'playing' || !channelState.started_at) continue;
      if (channelId.startsWith('sfx_slot_')) continue;

      const channel = engineRef.current?.getChannel(channelId);
      if (channel?._source) continue;

      const audioUrl = channelState.s3_url || `/audio/${channelState.filename}`;
      const assetId = channelState.asset_id || channelState.filename;
      const bufferKey = `${channelId}_${assetId}`;
      let buffer = engineRef.current?.getBuffer(bufferKey);

      if (!buffer) {
        buffer = await loadRemoteAudioBuffer(audioUrl, channelId, channelState.asset_id);
      }

      if (buffer) {
        const elapsed = (Date.now() / 1000) - channelState.started_at;
        if (!channelState.looping && elapsed >= buffer.duration) continue;

        await playRemoteTrack(channelId, channelState.filename, channelState.looping,
          channelState.volume, null, { ...channelState, channelId }, true);
      }
    }
  };

  // ── Desktop unlock strategy ───────────────────────────────────────────────
  const unlockDesktop = async () => {
    const engine = engineRef.current;
    if (engine?.context?.state === 'suspended') {
      await engine.context.resume();
    }

    isAudioUnlockedRef.current = true;
    setIsAudioUnlocked(true);
    reapplyEffects();
    await drainPendingOps();
    await reconcileAudioState();
  };

  // ── Mobile unlock strategy ────────────────────────────────────────────────
  // On iOS the eager-init context is 'suspended'. We must close + recreate
  // within a user gesture. The engine handles the heavy lifting via its
  // _unlockMobile path, but we need post-unlock reconciliation here.
  const unlockMobile = async () => {
    const engine = engineRef.current;

    // 1. Activate iOS audio session via HTML5 Audio.play() within user gesture
    const silentAudio = new Audio('data:audio/mp3;base64,SUQzBAAAAAAAIlRTU0UAAAAOAAADTGF2ZjYxLjcuMTAwAAAAAAAAAAAAAAD/+0DAAAAAAAAAAAAAAAAAAAAAAABJbmZvAAAADwAAAAUAAAK+AGhoaGhoaGhoaGhoaGhoaGhoaGiOjo6Ojo6Ojo6Ojo6Ojo6Ojo6OjrS0tLS0tLS0tLS0tLS0tLS0tLS02tra2tra2tra2tra2tra2tra2tr//////////////////////////wAAAABMYXZjNjEuMTkAAAAAAAAAAAAAAAAkAwYAAAAAAAACvhC6DYoAAAAAAP/7EMQAA8AAAaQAAAAgAAA0gAAABExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQxCmDwAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+xDEUwPAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7EMR8g8AAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQxKYDwAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU=');
    silentAudio.volume = 0;
    await silentAudio.play().catch((err) => {
      console.warn('silentAudio.play() rejected:', err);
    });

    // 2. Close the eager-init context. AudioBuffers in engine cache survive (raw PCM).
    if (engine.context && engine.context.state !== 'closed') {
      await engine.context.close();
    }

    // 3. Clear stale source refs on all channels
    for (const channel of engine.channels.values()) {
      channel._stopSource();
      channel._stopTimeTracking();
    }
    trackTimersRef.current = {};
    playOperationsRef.current = {};

    // 4. Create fresh AudioContext + full audio graph within user gesture
    const contextOptions = {};
    if (engine._options?.sampleRate) contextOptions.sampleRate = engine._options.sampleRate;
    if (engine._options?.latencyHint) contextOptions.latencyHint = engine._options.latencyHint;

    engine._ctx = new (window.AudioContext || window.webkitAudioContext)(contextOptions);

    // 5. Rebuild master chain
    if (engine._masterMeter) engine._masterMeter.destroy();
    engine._buildMasterChain();

    // Restore volume levels
    engine.setMasterVolume(broadcastMasterVolume);
    engine.setLocalVolume(masterVolume);

    // 6. Rebuild all channel effect chains
    for (const channel of engine.channels.values()) {
      channel.rebuild();
    }

    // 7. Rebuild analyser refs
    rebuildAnalyserRefs();

    // 8. Resume if still suspended
    if (engine.context?.state === 'suspended') {
      await engine.context.resume();
    }

    // 9. Mark unlocked + finish
    isAudioUnlockedRef.current = true;
    setIsAudioUnlocked(true);
    reapplyEffects();
    await drainPendingOps();
    await reconcileAudioState();
  };

  // ── Unlock orchestrator ───────────────────────────────────────────────────
  const unlockAudio = async () => {
    if (unlockInProgressRef.current) {
      return false;
    }
    unlockInProgressRef.current = true;
    try {
      const engine = engineRef.current;
      const contextState = engine?.context?.state;

      if (contextState === 'running') {
        await unlockDesktop();
      } else {
        await unlockMobile();
      }

      console.log('Audio system unlocked successfully');
      return true;
    } catch (error) {
      console.warn('Audio unlock failed:', error);
      return false;
    } finally {
      unlockInProgressRef.current = false;
    }
  };

  // ── Resume remote track from paused position ──────────────────────────────
  const resumeRemoteTrack = async (trackId) => {
    if (resumeOperationsRef.current[trackId]) {
      console.warn(`Resume operation already in progress for ${trackId}, ignoring duplicate`);
      return false;
    }

    resumeOperationsRef.current[trackId] = true;

    try {
      return await new Promise((resolve) => {
        setRemoteTrackStates(currentState => {
          const trackState = currentState[trackId];
          if (!trackState) {
            resolve(false);
            return currentState;
          }

          if (trackState.playbackState !== PlaybackState.PAUSED) {
            resolve(false);
            return currentState;
          }

          const { filename, currentTime, looping, volume } = trackState;
          playRemoteTrack(trackId, filename, looping, volume, currentTime).then(resolve);
          return currentState;
        });
      });
    } finally {
      delete resumeOperationsRef.current[trackId];
    }
  };

  // ── Apply effect toggles to a BGM channel ─────────────────────────────────
  // Delegates to the engine channel's EffectChain.applyEffects() for the actual
  // Web Audio parameter changes. Keeps React state in sync for UI.
  const applyChannelEffects = useCallback((trackId, effects) => {
    // Always update React state so UI toggles reflect correct values immediately
    setChannelEffects(prev => ({
      ...prev,
      [trackId]: { ...prev[trackId], ...effects },
    }));

    const engine = engineRef.current;
    const channel = engine?.getChannel(trackId);
    if (!channel?.effectChain) return;

    // Build the merged state for applyEffects
    const mergedState = { ...channelEffectsRef.current[trackId], ...effects };

    // Delegate to engine EffectChain.applyEffects()
    channel.effectChain.applyEffects(mergedState);

    // Reverb preset change is handled by EffectChain.applyEffects → reverb.setParam('preset', ...)
  }, []);

  // ── Set effect mix level ──────────────────────────────────────────────────
  // Delegates to engine channel's EffectChain.
  const setEffectMixLevel = useCallback((trackId, effectName, mixLevel) => {
    setChannelEffects(prev => ({
      ...prev,
      [trackId]: { ...prev[trackId], [`${effectName}_mix`]: mixLevel },
    }));

    const engine = engineRef.current;
    const channel = engine?.getChannel(trackId);
    if (!channel?.effectChain) return;

    const isEnabled = channelEffectsRef.current[trackId]?.[effectName] ?? false;
    if (!isEnabled) return;

    channel.effectChain.setEffectMix(effectName, mixLevel);
  }, []);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  const cleanupAllAudio = useCallback(() => {
    // Stop all local audio elements
    Object.values(localAudioElements.current).forEach(audio => {
      if (audio) {
        try {
          audio.pause();
          audio.currentTime = 0;
        } catch (e) {
          console.warn('Error stopping local audio:', e);
        }
      }
    });

    // Cancel all active fades
    Object.keys(activeFadeRafsRef.current).forEach(trackId => {
      cancelAnimationFrame(activeFadeRafsRef.current[trackId]);
    });
    activeFadeRafsRef.current = {};

    // Clear hook-level tracking
    trackTimersRef.current = {};
    resumeOperationsRef.current = {};
    playOperationsRef.current = {};

    // Destroy engine (stops all channels, clears buffers, closes context)
    if (engineRef.current) {
      engineRef.current.destroy();
      engineRef.current = null;
    }

    // Clear analyser refs
    remoteTrackAnalysersRef.current = {};
    masterAnalysersRef.current = null;
  }, []);

  // ── Visibility recovery ───────────────────────────────────────────────────
  // Recover audio playback after page visibility change (phone lock, tab switch)
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const handleVisibilityChange = async () => {
      if (document.visibilityState !== 'visible') return;
      if (!isAudioUnlocked || !engineRef.current?.context) return;

      const ctx = engineRef.current.context;

      // Resume AudioContext if it was suspended/interrupted by OS
      if (ctx.state === 'suspended') {
        try {
          await ctx.resume();
        } catch (e) {
          console.warn('Failed to resume AudioContext:', e);
          return;
        }
      }

      if (ctx.state !== 'running') return;

      // Check each track that should be playing but has a dead/missing source
      const currentStates = { ...remoteTrackStatesRef.current };
      for (const [trackId, trackState] of Object.entries(currentStates)) {
        if (trackState.playbackState !== PlaybackState.PLAYING) continue;

        const channel = engineRef.current.getChannel(trackId);
        if (channel?._source && trackTimersRef.current[trackId]) continue;

        const { filename, s3_url, asset_id, volume, looping, currentTime: lastKnownTime, duration } = trackState;
        if (!filename) continue;

        let offset = lastKnownTime || 0;
        if (looping && duration > 0) {
          offset = offset % duration;
        }

        await playRemoteTrack(trackId, filename, looping, volume, offset, {
          asset_id, s3_url, looping
        }, false);
      }

      // Re-apply channel effects to ensure audio graph is correct
      for (const [trackId, effects] of Object.entries(channelEffectsRef.current)) {
        const channel = engineRef.current?.getChannel(trackId);
        if (channel?.effectChain) {
          applyChannelEffects(trackId, effects);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isAudioUnlocked]);

  // ── Sync audio state from server ──────────────────────────────────────────
  // Called on initial_state for late-joiners. Kept in hook — game/WebSocket logic.
  const syncAudioState = async (audioState) => {
    if (!audioState || typeof audioState !== 'object') return;

    pendingAudioStateRef.current = audioState;

    const engine = engineRef.current;

    // Ensure engine exists and has a context
    if (!engine?.context || engine.context.state === 'closed') {
      // Engine should have been initialized on mount, but be defensive
      if (engine) {
        await engine.init();
        // Recreate channels if needed
        for (const trackId of BGM_CHANNEL_IDS) {
          if (!engine.getChannel(trackId)) {
            engine.createChannel(trackId, CHANNEL_PRESETS.BGM);
          }
        }
        for (let i = 0; i < SFX_SLOT_COUNT; i++) {
          const sfxId = `sfx_slot_${i}`;
          if (!engine.getChannel(sfxId)) {
            engine.createChannel(sfxId, CHANNEL_PRESETS.SFX);
          }
        }
        rebuildAnalyserRefs();
      }
    }

    // Restore broadcast master volume if present
    if (audioState.__master_volume !== undefined) {
      setBroadcastMasterVolume(audioState.__master_volume);
    }

    for (const [channelId, channelState] of Object.entries(audioState)) {
      if (channelId === '__master_volume') continue;
      if (!channelState || !channelState.filename) continue;

      // SFX soundboard slots — restore loaded asset only (no playback sync for one-shots)
      if (channelId.startsWith('sfx_slot_')) {
        const slotIndex = parseInt(channelId.replace('sfx_slot_', ''), 10);
        if (isNaN(slotIndex) || slotIndex < 0 || slotIndex >= SFX_SLOT_COUNT) continue;

        setSfxSlots(prev => prev.map((s, i) =>
          i === slotIndex ? {
            ...s,
            asset_id: channelState.asset_id,
            filename: channelState.filename,
            s3_url: channelState.s3_url,
            volume: channelState.volume ?? 0.8,
          } : s
        ));

        // Pre-load buffer for instant playback
        if (channelState.s3_url) {
          await loadRemoteAudioBuffer(channelState.s3_url, channelId, channelState.asset_id);
        }
        continue;
      }

      const { filename, asset_id, s3_url, volume, looping, playback_state, started_at, paused_elapsed } = channelState;

      // Update track metadata in React state
      setRemoteTrackStates(prev => ({
        ...prev,
        [channelId]: {
          ...prev[channelId],
          filename,
          asset_id,
          s3_url,
          volume: volume ?? prev[channelId]?.volume ?? 0.8,
          looping: looping ?? prev[channelId]?.looping ?? true,
        }
      }));

      // Restore effects state if present
      if (channelState.effects) {
        const syncEffects = { ...channelState.effects };
        if (syncEffects.eq === undefined) {
          syncEffects.eq = !!(syncEffects.hpf || syncEffects.lpf);
        }
        if (syncEffects.reverb !== undefined && syncEffects.reverb_preset === undefined) {
          syncEffects.reverb_preset = 'room';
        }
        applyChannelEffects(channelId, syncEffects);
      }

      // Restore mute/solo state
      if (channelState.muted) {
        setMutedChannels(prev => ({ ...prev, [channelId]: true }));
      }
      if (channelState.soloed) {
        setSoloedChannels(prev => ({ ...prev, [channelId]: true }));
      }

      if (playback_state === 'playing' && started_at) {
        const audioUrl = s3_url || `/audio/${filename}`;
        const buffer = await loadRemoteAudioBuffer(audioUrl, channelId, asset_id);

        if (buffer) {
          const elapsed = (Date.now() / 1000) - started_at;
          if (!looping && elapsed >= buffer.duration) continue;

          await playRemoteTrack(channelId, filename, looping, volume, null, {
            ...channelState,
            channelId,
          }, true);
        }
      } else if (playback_state === 'paused' && paused_elapsed != null) {
        const audioUrl = s3_url || `/audio/${filename}`;
        const buffer = await loadRemoteAudioBuffer(audioUrl, channelId, asset_id);

        let normalizedTime = paused_elapsed;
        if (buffer && looping && buffer.duration > 0 && paused_elapsed > buffer.duration) {
          normalizedTime = paused_elapsed % buffer.duration;
        }

        setRemoteTrackStates(prev => ({
          ...prev,
          [channelId]: {
            ...prev[channelId],
            playbackState: PlaybackState.PAUSED,
            currentTime: normalizedTime,
            duration: buffer?.duration,
            remaining: null,
          }
        }));
      }
    }

    if (isAudioUnlocked) {
      pendingAudioStateRef.current = null;
    }

    setAudioSyncComplete(true);
  };

  // ── Load asset into channel ───────────────────────────────────────────────
  const loadAssetIntoChannel = (channelId, asset) => {
    const volume = asset.default_volume ?? 0.8;
    const engine = engineRef.current;
    const channel = engine?.getChannel(channelId);

    setRemoteTrackStates(prev => {
      const prevAssetId = prev[channelId]?.asset_id;
      const newAssetId = asset.id ?? null;

      // Stop currently playing source when the asset changes
      if (prevAssetId !== newAssetId && channel?._source) {
        try { channel._source.stop(); } catch (_) {}
        channel._source = null;
        delete trackTimersRef.current[channelId];
        cancelFade(channelId);
      }

      if (channel?.effectChain?.gainNode) {
        channel.effectChain.gainNode.gain.value = volume;
      }

      return {
        ...prev,
        [channelId]: {
          ...prev[channelId],
          filename: asset.filename,
          asset_id: newAssetId,
          s3_url: asset.s3_url,
          volume,
          ...(prevAssetId !== newAssetId ? {
            playbackState: PlaybackState.STOPPED,
            currentTime: 0,
            duration: 0,
          } : {}),
        }
      };
    });

    // Apply effects
    if (asset.effects && typeof asset.effects === 'object') {
      const syncEffects = { ...asset.effects };
      if (syncEffects.eq === undefined) {
        syncEffects.eq = !!(syncEffects.hpf || syncEffects.lpf);
      }
      applyChannelEffects(channelId, syncEffects);
    } else if (asset.effect_hpf_enabled !== undefined || asset.effect_lpf_enabled !== undefined || asset.effect_reverb_enabled !== undefined) {
      applyChannelEffects(channelId, {
        eq: asset.effect_eq_enabled || false,
        hpf: asset.effect_hpf_enabled || false,
        hpf_mix: asset.effect_hpf_mix ?? DEFAULT_EFFECTS.hpf.mix,
        lpf: asset.effect_lpf_enabled || false,
        lpf_mix: asset.effect_lpf_mix ?? DEFAULT_EFFECTS.lpf.mix,
        reverb: asset.effect_reverb_enabled || false,
        reverb_mix: asset.effect_reverb_mix ?? DEFAULT_EFFECTS.reverb.mix,
        reverb_preset: asset.effect_reverb_preset || 'room',
      });
    } else {
      applyChannelEffects(channelId, {
        eq: false,
        hpf: false,
        lpf: false,
        reverb: false,
      });
    }
  };

  // =====================================
  // SFX SOUNDBOARD FUNCTIONS
  // =====================================
  // Uses engine channels with CHANNEL_PRESETS.SFX for playback.

  const loadSfxSlot = async (slotIndex, asset) => {
    const volume = asset.default_volume ?? 0.8;
    const trackId = `sfx_slot_${slotIndex}`;
    const engine = engineRef.current;
    const channel = engine?.getChannel(trackId);
    if (channel) {
      channel.setVolume(volume);
    }
    setSfxSlots(prev => prev.map((s, i) =>
      i === slotIndex ? { ...s, asset_id: asset.id, filename: asset.filename, s3_url: asset.s3_url, volume } : s
    ));

    // Pre-fetch buffer for instant trigger response
    if (asset.s3_url) {
      await loadRemoteAudioBuffer(asset.s3_url, trackId, asset.id);
    }
  };

  const playSfxSlot = async (slotIndex) => {
    const slot = sfxSlots[slotIndex];
    const engine = engineRef.current;
    if (!slot?.s3_url || !engine?.context) return false;

    // If context is suspended, drop silently — one-shot SFX would be stale by unlock time
    if (engine.context.state === 'suspended') {
      console.warn(`SFX slot ${slotIndex} dropped — AudioContext suspended`);
      return false;
    }

    const trackId = `sfx_slot_${slotIndex}`;
    const channel = engine.getChannel(trackId);
    if (!channel) return false;

    // Re-trigger: stop any currently playing source on this slot
    channel._stopSource();

    // Load or reuse buffer
    const bufferKey = `${trackId}_${slot.asset_id || slot.filename}`;
    let buffer = engine.getBuffer(bufferKey);
    if (!buffer) {
      buffer = await loadRemoteAudioBuffer(slot.s3_url, trackId, slot.asset_id);
      if (!buffer) return false;
    }

    // Ensure effect chain exists
    if (!channel.effectChain) {
      channel.rebuild();
      if (!channel.effectChain) return false;
    }

    // Create source, connect to channel's effect chain, play
    const ctx = engine.context;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = false;
    source.connect(channel.effectChain.inputNode);
    source.start(0);
    channel._source = source;

    // Set volume on channel
    if (channel.effectChain.gainNode) {
      channel.effectChain.gainNode.gain.value = slot.volume;
    }

    // Mark as playing, auto-clear when done
    setSfxSlots(prev => prev.map((s, i) => i === slotIndex ? { ...s, isPlaying: true } : s));
    source.onended = () => {
      if (channel._source === source) {
        channel._source = null;
      }
      setSfxSlots(prev => prev.map((s, i) => i === slotIndex ? { ...s, isPlaying: false } : s));
    };

    return true;
  };

  const stopSfxSlot = (slotIndex) => {
    const trackId = `sfx_slot_${slotIndex}`;
    const channel = engineRef.current?.getChannel(trackId);
    if (channel?._source) {
      channel._stopSource();
    }
    setSfxSlots(prev => prev.map((s, i) => i === slotIndex ? { ...s, isPlaying: false } : s));
  };

  const setSfxSlotVolume = (slotIndex, volume) => {
    const trackId = `sfx_slot_${slotIndex}`;
    const channel = engineRef.current?.getChannel(trackId);
    if (channel?.effectChain?.gainNode) {
      channel.effectChain.gainNode.gain.value = volume;
    }
    setSfxSlots(prev => prev.map((s, i) => i === slotIndex ? { ...s, volume } : s));
  };

  const clearSfxSlot = (slotIndex) => {
    const trackId = `sfx_slot_${slotIndex}`;
    const channel = engineRef.current?.getChannel(trackId);
    if (channel?._source) {
      channel._stopSource();
    }

    // Drop cached buffer for this slot
    const engine = engineRef.current;
    if (engine) {
      // Clear any buffers with this slot prefix
      for (const key of engine._buffers.keys()) {
        if (key.startsWith(`${trackId}_`)) {
          engine.clearBuffer(key);
        }
      }
    }

    setSfxSlots(prev => prev.map((s, i) =>
      i === slotIndex
        ? { ...s, asset_id: null, filename: null, s3_url: null, isPlaying: false }
        : s
    ));
  };

  // ── Compatibility refs ────────────────────────────────────────────────────
  // Some consumers access audioContextRef and audioBuffersRef directly.
  // Provide thin wrappers that delegate to engine.
  const audioContextRef = useRef(null);
  const audioBuffersRef = useRef(null);

  // Keep audioContextRef in sync with engine context
  useEffect(() => {
    const engine = engineRef.current;
    if (engine?.context) {
      audioContextRef.current = engine.context;
    }
  });

  // Proxy audioBuffersRef to engine's buffer cache
  if (!audioBuffersRef.current) {
    audioBuffersRef.current = new Proxy({}, {
      get(_, key) {
        return engineRef.current?.getBuffer(key) ?? undefined;
      },
      set(_, key, value) {
        engineRef.current?.storeBuffer(key, value);
        return true;
      },
      has(_, key) {
        return engineRef.current?.hasBuffer(key) ?? false;
      },
      deleteProperty(_, key) {
        engineRef.current?.clearBuffer(key);
        return true;
      },
      ownKeys() {
        if (!engineRef.current?._buffers) return [];
        return Array.from(engineRef.current._buffers.keys());
      },
      getOwnPropertyDescriptor(_, key) {
        if (engineRef.current?.hasBuffer(key)) {
          return { configurable: true, enumerable: true, value: engineRef.current.getBuffer(key) };
        }
        return undefined;
      },
    });
  }

  return {
    // Audio state
    isAudioUnlocked,
    masterVolume,
    setMasterVolume,
    broadcastMasterVolume,
    setBroadcastMasterVolume,

    // Local audio functions (for hardcoded events)
    playLocalSFX,

    // Remote audio functions (for WebSocket events)
    remoteTrackStates,
    remoteTrackAnalysers: remoteTrackAnalysersRef.current,
    playRemoteTrack,
    resumeRemoteTrack,
    pauseRemoteTrack,
    stopRemoteTrack,
    setRemoteTrackVolume,
    toggleRemoteTrackLooping,
    loadRemoteAudioBuffer,
    audioBuffersRef,
    audioContextRef,

    // Fade transition functions
    activeFades,
    startFade,
    cancelFade,

    // Pending operation management
    setClearPendingOperationCallback,

    // Asset library integration
    loadAssetIntoChannel,

    // Per-channel insert effects (HPF, LPF, Reverb with wet/dry mix)
    channelEffects,
    applyChannelEffects,
    setEffectMixLevel,

    // Master metering
    masterAnalysers: masterAnalysersRef,

    // Channel mute/solo (channel-level, not asset-level)
    mutedChannels,
    soloedChannels,
    setChannelMuted,
    setChannelSoloed,

    // Late-joiner sync
    syncAudioState,
    audioSyncComplete,

    // SFX Soundboard
    sfxSlots,
    playSfxSlot,
    stopSfxSlot,
    setSfxSlotVolume,
    loadSfxSlot,
    clearSfxSlot,

    // Batch state updates (for atomic multi-track operations)
    startStateBatch,
    flushStateBatch,

    // Unified functions
    unlockAudio,
    cleanupAllAudio
  };
};
