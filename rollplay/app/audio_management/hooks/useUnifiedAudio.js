/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState, useEffect, useRef, useCallback } from 'react';
import { PlaybackState, ChannelType, DEFAULT_EFFECTS, REVERB_PRESETS } from '../types';
import { useAssetManager } from '@/app/shared/providers/AssetDownloadManager';

// Logarithmic frequency mapping for filter faders (0.0–1.0 → Hz)
// HPF: 0.0 = 20Hz (minimal cut), 1.0 = 5000Hz (aggressive cut)
const mapHpfFrequency = (faderValue) => {
  const minLog = Math.log(20);
  const maxLog = Math.log(5000);
  return Math.exp(minLog + faderValue * (maxLog - minLog));
};
// LPF: 0.0 = 200Hz (aggressive cut), 1.0 = 20000Hz (minimal cut)
// Inverted so fader-up = brighter (less cut)
const mapLpfFrequency = (faderValue) => {
  const minLog = Math.log(200);
  const maxLog = Math.log(20000);
  return Math.exp(minLog + faderValue * (maxLog - minLog));
};

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
 *    - Uses Web Audio API for precise mixing
 * 
 * Both audio types respect the master volume slider
 */

export const useUnifiedAudio = () => {
  const [isAudioUnlocked, setIsAudioUnlocked] = useState(false);
  const isAudioUnlockedRef = useRef(false);
  const assetManager = useAssetManager();

  // Callback to clear pending operations when tracks auto-stop
  const clearPendingOperationCallbackRef = useRef(null);
  
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
  const localAudioElements = useRef({});

  // Initialize local audio elements
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localAudioElements.current = {
        combatStart: new Audio('/audio/sword.mp3'),
        // Add more local sounds here as needed
        // diceRoll: new Audio('/audio/dice-roll.mp3'),
        // seatClick: new Audio('/audio/seat-click.mp3'),
      };

      // Preload and set volume for local audio
      Object.values(localAudioElements.current).forEach(audio => {
        if (audio) {
          audio.preload = 'auto';
          audio.volume = masterVolume;
        }
      });
    }
  }, []);

  // Update local audio volumes when master volume changes
  useEffect(() => {
    Object.values(localAudioElements.current).forEach(audio => {
      if (audio) {
        audio.volume = masterVolume;
      }
    });
  }, [masterVolume]);

  // Play local audio (for hardcoded events)
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
        console.log(`🔊 Playing local audio: ${soundName}`);
      } catch (error) {
        console.warn(`Failed to play local audio ${soundName}:`, error);
      }
    } else {
      console.warn(`Local audio '${soundName}' not found`);
    }
  };

  // =====================================
  // REMOTE AUDIO SYSTEM (Web Audio API)
  // =====================================
  const audioContextRef = useRef(null);
  const masterGainRef = useRef(null);  // Broadcast master level (DM-controlled, synced to all clients)
  const localGainRef = useRef(null);   // Per-client listening level (private, localStorage-persisted)
  const remoteTrackGainsRef = useRef({});
  const remoteTrackInputNodesRef = useRef({}); // Pre-fader input nodes for BGM channels (effect sends tap here)
  const remoteTrackMuteGainsRef = useRef({});
  const remoteTrackAnalysersRef = useRef({});
  const audioBuffersRef = useRef({});
  const activeSourcesRef = useRef({});
  const trackTimersRef = useRef({}); // Store timing info for each track
  const resumeOperationsRef = useRef({}); // Track active resume operations to prevent duplicates
  const playOperationsRef = useRef({}); // Track active play operations to prevent duplicates
  const pendingPlayOpsRef = useRef([]); // Queue play ops when AudioContext is suspended (non-DM players)
  const pendingAudioStateRef = useRef(null); // Store audio_state from initial_state for post-unlock reconciliation
  const unlockInProgressRef = useRef(false); // Prevent overlapping unlockAudio calls

  // Remote track states (for DM-controlled BGM audio)
  // Channels start empty — DM loads audio from asset library via AudioTrackSelector
  // SFX is handled separately by the lightweight soundboard system below
  const [remoteTrackStates, setRemoteTrackStatesRaw] = useState({
    audio_channel_A: { playbackState: PlaybackState.STOPPED, volume: 0.8, filename: null, asset_id: null, s3_url: null, type: ChannelType.BGM, channelGroup: ChannelType.BGM, track: 'A', currentTime: 0, duration: 0, looping: true },
    audio_channel_B: { playbackState: PlaybackState.STOPPED, volume: 0.8, filename: null, asset_id: null, s3_url: null, type: ChannelType.BGM, channelGroup: ChannelType.BGM, track: 'B', currentTime: 0, duration: 0, looping: true },
    audio_channel_C: { playbackState: PlaybackState.STOPPED, volume: 0.8, filename: null, asset_id: null, s3_url: null, type: ChannelType.BGM, channelGroup: ChannelType.BGM, track: 'C', currentTime: 0, duration: 0, looping: true },
    audio_channel_D: { playbackState: PlaybackState.STOPPED, volume: 0.8, filename: null, asset_id: null, s3_url: null, type: ChannelType.BGM, channelGroup: ChannelType.BGM, track: 'D', currentTime: 0, duration: 0, looping: true },
    audio_channel_E: { playbackState: PlaybackState.STOPPED, volume: 0.8, filename: null, asset_id: null, s3_url: null, type: ChannelType.BGM, channelGroup: ChannelType.BGM, track: 'E', currentTime: 0, duration: 0, looping: true },
    audio_channel_F: { playbackState: PlaybackState.STOPPED, volume: 0.8, filename: null, asset_id: null, s3_url: null, type: ChannelType.BGM, channelGroup: ChannelType.BGM, track: 'F', currentTime: 0, duration: 0, looping: true },
  });

  // Refs mirroring state for use in event listeners (avoids re-registering on every state change)
  const remoteTrackStatesRef = useRef(remoteTrackStates);
  useEffect(() => { remoteTrackStatesRef.current = remoteTrackStates; }, [remoteTrackStates]);

  // Batch accumulator — when active, setRemoteTrackStates calls accumulate
  // into the ref instead of firing individually. flushBatch() applies them
  // as one atomic state update. Used by handleRemoteAudioBatch so that
  // parallel play/stop operations produce a single re-render.
  const batchAccumulatorRef = useRef(null);

  // All internal code uses setRemoteTrackStates (the batched version).
  // In normal mode it delegates to the raw setter immediately.
  // In batch mode (startStateBatch → flushStateBatch) it accumulates
  // updates and applies them as one atomic state transition.
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
  // Shares AudioContext + MasterGain with BGM, but uses a simpler path:
  // BufferSource → SlotGainNode → MasterGainNode → destination
  // No AnalyserNodes, no RAF time tracking, no pause/resume state machine.
  const SFX_SLOT_COUNT = 9;
  const sfxSlotGainsRef = useRef({});
  const sfxSlotSourcesRef = useRef({});
  const sfxSlotBuffersRef = useRef({});

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
  const [mutedChannels, setMutedChannels] = useState({});   // { audio_channel_A: true, ... }
  const [soloedChannels, setSoloedChannels] = useState({}); // { audio_channel_B: true, ... }

  const setChannelMuted = useCallback((channelId, muted) => {
    setMutedChannels(prev => ({ ...prev, [channelId]: muted }));
  }, []);

  const setChannelSoloed = useCallback((channelId, soloed) => {
    setSoloedChannels(prev => ({ ...prev, [channelId]: soloed }));
  }, []);

  // Recompute muteGainNode values whenever mute/solo state changes.
  // Channel mute/solo cascades to that channel's effect sends.
  // Effect strips have independent mute/solo via composite keys (e.g. "audio_channel_A_hpf").
  // All strips (channels + effect returns) participate in the same solo group.
  useEffect(() => {
    const anySoloed = Object.values(soloedChannels).some(Boolean);

    // Channel dry paths
    for (const [trackId, muteGain] of Object.entries(remoteTrackMuteGainsRef.current)) {
      const isMuted = mutedChannels[trackId] || false;
      const isSoloed = soloedChannels[trackId] || false;
      let gain;
      if (anySoloed) {
        gain = isSoloed ? 1.0 : 0.0;
      } else {
        gain = isMuted ? 0.0 : 1.0;
      }
      muteGain.gain.setValueAtTime(gain, muteGain.context.currentTime);
    }

    // Reverb send paths — only reverb has a sendMuteGain (HPF/LPF are inline inserts, no mute gate)
    for (const [trackId, inserts] of Object.entries(channelInsertEffectsRef.current)) {
      const channelMuted = mutedChannels[trackId] || false;

      const sendMuteGain = inserts.reverb?.sendMuteGain;
      if (!sendMuteGain) continue;

      const effectId = `${trackId}_reverb`;
      const effectMuted = mutedChannels[effectId] || false;
      const effectSoloed = soloedChannels[effectId] || false;

      let gain;
      if (anySoloed) {
        gain = (effectSoloed && !effectMuted) ? 1.0 : 0.0;
      } else {
        gain = (channelMuted || effectMuted) ? 0.0 : 1.0;
      }
      sendMuteGain.gain.setValueAtTime(gain, sendMuteGain.context.currentTime);
    }
  }, [mutedChannels, soloedChannels]);

  // Active fade transitions state
  const [activeFades, setActiveFades] = useState({}); // { trackId: { type, startTime, duration, startGain, targetGain, operation } }
  const activeFadeRafsRef = useRef({}); // { [trackId]: animationId } — rAF IDs stored outside state to avoid per-frame re-renders

  // Per-channel insert effects — each channel owns its own HPF, LPF, Reverb instances
  // { audio_channel_A: { hpf: { effectNode, wetGain }, lpf: {...}, reverb: {...} }, ... }
  const channelInsertEffectsRef = useRef({});
  // Master output analysers for master strip metering
  const masterAnalysersRef = useRef(null);
  // Cached reverb impulse response AudioBuffer (shared across per-channel ConvolverNodes)
  const impulseResponseBufferRef = useRef(null);
  // Per-channel effect state — enabled flags + mix levels
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

  // Create a stereo metering chain: upmix → splitter → [L,R analysers] → merger
  // Reusable for BGM channels, effect buses, and master output
  const createStereoMeteringChain = (ctx) => {
    const upmix = ctx.createGain();
    upmix.channelCount = 2;
    upmix.channelCountMode = 'explicit';
    upmix.channelInterpretation = 'speakers';

    const splitter = ctx.createChannelSplitter(2);
    const merger = ctx.createChannelMerger(2);
    const analyserL = ctx.createAnalyser();
    const analyserR = ctx.createAnalyser();
    analyserL.fftSize = 256;
    analyserL.smoothingTimeConstant = 0.8;
    analyserR.fftSize = 256;
    analyserR.smoothingTimeConstant = 0.8;

    upmix.connect(splitter);
    splitter.connect(analyserL, 0);
    splitter.connect(analyserR, 1);
    analyserL.connect(merger, 0, 0);
    analyserR.connect(merger, 0, 1);

    return { upmix, splitter, analyserL, analyserR, merger };
  };

  // Generate a reverb impulse response AudioBuffer at runtime.
  // Exponentially decaying stereo white noise — no static files needed.
  const createImpulseResponse = (ctx, duration, decay) => {
    const length = Math.floor(ctx.sampleRate * duration);
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return impulse;
  };

  // Initialize Web Audio API for remote tracks
  const initializeWebAudio = async () => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      try {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        const ctx = audioContextRef.current;

        // Create broadcast master gain node (DM-controlled, synced to all clients)
        masterGainRef.current = ctx.createGain();
        masterGainRef.current.gain.value = broadcastMasterVolume;

        // Create local listening gain node (per-client, private)
        localGainRef.current = ctx.createGain();
        localGainRef.current.gain.value = masterVolume;

        // Chain: channels → masterGain (broadcast) → metering → localGain (local) → destination
        // Metering reflects broadcast level, unaffected by local listening volume
        const masterMetering = createStereoMeteringChain(ctx);
        masterGainRef.current.connect(masterMetering.upmix);
        masterMetering.merger.connect(localGainRef.current);
        localGainRef.current.connect(ctx.destination);
        masterAnalysersRef.current = { left: masterMetering.analyserL, right: masterMetering.analyserR };

        // ── Shared reverb impulse response buffer (reused by all per-channel ConvolverNodes) ──
        const defaultPreset = REVERB_PRESETS[DEFAULT_EFFECTS.reverb.preset] || REVERB_PRESETS.room;
        impulseResponseBufferRef.current = createImpulseResponse(ctx, defaultPreset.duration, defaultPreset.decay);

        // ── Per-channel gain nodes, metering, and insert effects ──
        Object.keys(remoteTrackStates).forEach(trackId => {
          const gainNode = ctx.createGain();

          // Mute gain node (solo/mute gate)
          const muteGainNode = ctx.createGain();
          muteGainNode.gain.value = 1.0;

          // Stereo metering chain
          const metering = createStereoMeteringChain(ctx);

          gainNode.gain.value = remoteTrackStates[trackId]?.volume || 1.0;
          remoteTrackGainsRef.current[trackId] = gainNode;
          remoteTrackAnalysersRef.current[trackId] = { left: metering.analyserL, right: metering.analyserR };

          // BGM channels: HPF/LPF as inline inserts, reverb as post-EQ pre-fader send
          //
          // Signal chain:
          //   source → inputNode → hpfNode → lpfNode → postEqNode → gainNode (fader) → muteGain → metering → master
          //                                                        → convolver → reverbWetGain → reverbSendMuteGain → master
          //
          // HPF/LPF are always inline — "disabled" = pass-all frequency (HPF 20Hz, LPF 20kHz).
          // Their strip faders control cutoff frequency.
          // Reverb is a pre-fader post-EQ send — its strip fader controls wet/dry mix.
          if (trackId.startsWith('audio_channel_')) {
            // Pre-fader input node — sources connect here
            const inputNode = ctx.createGain();
            inputNode.gain.value = 1.0;
            remoteTrackInputNodesRef.current[trackId] = inputNode;

            // HPF insert (inline) — disabled = 20Hz (passes all audible)
            const hpfNode = ctx.createBiquadFilter();
            hpfNode.type = 'highpass';
            hpfNode.frequency.value = 20; // pass-all by default
            hpfNode.Q.value = 0.707;

            // LPF insert (inline) — disabled = 20kHz (passes all audible)
            const lpfNode = ctx.createBiquadFilter();
            lpfNode.type = 'lowpass';
            lpfNode.frequency.value = 20000; // pass-all by default
            lpfNode.Q.value = 0.707;

            // Post-EQ fan-out node — after inserts, before fader and reverb send
            const postEqNode = ctx.createGain();
            postEqNode.gain.value = 1.0;

            // Inline insert chain: inputNode → HPF → LPF → postEqNode
            inputNode.connect(hpfNode);
            hpfNode.connect(lpfNode);
            lpfNode.connect(postEqNode);

            // Dry path: postEqNode → gainNode (fader) → muteGain → metering → master
            postEqNode.connect(gainNode);
            gainNode.connect(muteGainNode);
            muteGainNode.connect(metering.upmix);
            metering.merger.connect(masterGainRef.current);
            remoteTrackMuteGainsRef.current[trackId] = muteGainNode;

            // Reverb send: postEqNode → convolver → reverbWetGain → reverbSendMuteGain → master
            // Pre-fader, post-EQ — reverb receives the EQ-shaped signal
            const convolver = ctx.createConvolver();
            convolver.buffer = impulseResponseBufferRef.current;
            const reverbMakeupGain = ctx.createGain();
            reverbMakeupGain.gain.value = 3.0; // fixed 3x boost to compensate for convolution attenuation
            const reverbWetGain = ctx.createGain();
            reverbWetGain.gain.value = 0.0; // disabled by default
            const reverbSendMuteGain = ctx.createGain();
            reverbSendMuteGain.gain.value = 1.0;
            // Reverb metering chain (stereo)
            const reverbMetering = createStereoMeteringChain(ctx);

            postEqNode.connect(convolver);
            convolver.connect(reverbMakeupGain);
            reverbMakeupGain.connect(reverbWetGain);
            reverbWetGain.connect(reverbSendMuteGain);
            reverbSendMuteGain.connect(reverbMetering.upmix);
            reverbMetering.merger.connect(masterGainRef.current);

            // Store reverb analysers with composite key
            remoteTrackAnalysersRef.current[`${trackId}_reverb`] = {
              left: reverbMetering.analyserL,
              right: reverbMetering.analyserR,
            };

            channelInsertEffectsRef.current[trackId] = {
              hpf: { effectNode: hpfNode },
              lpf: { effectNode: lpfNode },
              postEqNode,
              reverb: { effectNode: convolver, makeupGain: reverbMakeupGain, wetGain: reverbWetGain, sendMuteGain: reverbSendMuteGain },
            };
          } else {
            // Non-BGM tracks: simple gain → muteGain → metering → master
            gainNode.connect(muteGainNode);
            muteGainNode.connect(metering.upmix);
            metering.merger.connect(masterGainRef.current);
            remoteTrackMuteGainsRef.current[trackId] = muteGainNode;
          }
        });

        // Create lightweight gain nodes for SFX soundboard slots (no analysers, no effects)
        for (let i = 0; i < SFX_SLOT_COUNT; i++) {
          const slotGain = ctx.createGain();
          slotGain.connect(masterGainRef.current);
          slotGain.gain.value = 0.8;
          sfxSlotGainsRef.current[`sfx_slot_${i}`] = slotGain;
        }

        console.log('🎵 Web Audio API initialized for remote tracks + SFX soundboard + effects chains');
        return true;
      } catch (error) {
        console.warn('Web Audio API initialization failed:', error);
        return false;
      }
    }
    return true;
  };

  // Eagerly initialize AudioContext on mount (creates in 'suspended' state).
  // This allows loadRemoteAudioBuffer to decode audio even before user interaction,
  // fixing the bug where non-DM players can't load remote audio buffers.
  useEffect(() => {
    if (typeof window !== 'undefined' && !audioContextRef.current) {
      initializeWebAudio();
      console.log('🎵 AudioContext eagerly initialized (suspended state)');
    }
  }, []);

  // Load remote audio buffer
  const loadRemoteAudioBuffer = async (url, trackId, assetId) => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      await initializeWebAudio();
    }
    if (!audioContextRef.current) {
      console.warn('⚠️ loadRemoteAudioBuffer: AudioContext is null — cannot decode audio');
      return null;
    }

    try {
      console.log(`📁 Loading remote audio buffer: ${url}`);
      const blob = await assetManager.download(url, undefined, assetId);
      const arrayBuffer = await blob.arrayBuffer();
      const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);

      audioBuffersRef.current[`${trackId}_${url}`] = audioBuffer;
      console.log(`✅ Loaded remote audio buffer for ${trackId}: ${url}`);
      return audioBuffer;
    } catch (error) {
      console.warn(`❌ Failed to load remote audio: ${url}`, error);
      return null;
    }
  };

  // =====================================
  // FADE TRANSITION FUNCTIONS
  // =====================================
  
  // Start a fade transition for a track
  const startFade = (trackId, type, duration, startGain, targetGain, operation) => {
    // Cancel any existing fade for this track
    if (activeFadeRafsRef.current[trackId]) {
      cancelAnimationFrame(activeFadeRafsRef.current[trackId]);
      delete activeFadeRafsRef.current[trackId];
    }

    const startTime = performance.now();

    // Capture the reverb send's current wet gain at fade start so we can
    // scale it proportionally alongside the channel fader. This ensures
    // the send fades in lockstep with the dry signal rather than staying
    // at full level and cutting abruptly on stop.
    const inserts = channelInsertEffectsRef.current[trackId];
    const reverbWetGainAtStart = inserts?.reverb?.wetGain?.gain?.value ?? 0;
    // For fade-ins, wet gain starts at 0 — we need the target level to scale toward
    const effects = channelEffectsRef.current[trackId];
    const reverbEnabled = effects?.reverb ?? false;
    const reverbTargetLevel = reverbEnabled
      ? (effects?.reverb_mix ?? DEFAULT_EFFECTS.reverb.mix)
      : 0;

    console.log(`🌊 Starting ${type} fade for ${trackId}: ${startGain} → ${targetGain} over ${duration}ms`);

    // Set state ONCE at fade start — this is the only state update until fade ends
    setActiveFades(prev => ({
      ...prev,
      [trackId]: { type, startTime, duration, startGain, targetGain, operation }
    }));

    // Mark track as transitioning
    setRemoteTrackStates(prev => ({
      ...prev,
      [trackId]: { ...prev[trackId], playbackState: PlaybackState.TRANSITIONING }
    }));

    // Animation loop — only touches gain nodes and the ref, NOT React state
    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1.0);

      // Calculate current gain using linear interpolation
      const currentGain = startGain + (targetGain - startGain) * progress;

      // Apply gain to channel fader (dry path)
      if (remoteTrackGainsRef.current[trackId]) {
        remoteTrackGainsRef.current[trackId].gain.value = currentGain;
      }

      // Fade reverb send in proportion alongside the dry signal
      if (inserts?.reverb?.wetGain) {
        let fadeRatio;
        if (type === 'out') {
          fadeRatio = startGain > 0 ? currentGain / startGain : 0;
        } else if (type === 'in') {
          fadeRatio = targetGain > 0 ? currentGain / targetGain : 0;
        } else {
          fadeRatio = 1;
        }
        fadeRatio = Math.min(Math.max(fadeRatio, 0), 1);
        // Fade-out: scale down from current level. Fade-in: scale up toward target level.
        const reverbBase = type === 'in' ? reverbTargetLevel : reverbWetGainAtStart;
        inserts.reverb.wetGain.gain.value = reverbBase * fadeRatio;
      }

      if (progress < 1.0) {
        // Continue animation — store rAF ID in ref, not state
        activeFadeRafsRef.current[trackId] = requestAnimationFrame(animate);
      } else {
        // Fade complete
        console.log(`✅ Fade ${type} complete for ${trackId}`);
        delete activeFadeRafsRef.current[trackId];

        // Remove from active fades — second and final state update
        setActiveFades(prev => {
          const newFades = { ...prev };
          delete newFades[trackId];
          return newFades;
        });

        // Set final playback state
        if (type === 'out') {
          setTimeout(() => {
            stopRemoteTrack(trackId);
          }, 50); // Small delay to ensure fade is visually complete
        } else if (type === 'in') {
          setRemoteTrackStates(prev => ({
            ...prev,
            [trackId]: { ...prev[trackId], playbackState: PlaybackState.PLAYING }
          }));
        }
      }
    };

    // Start the animation — store rAF ID in ref
    activeFadeRafsRef.current[trackId] = requestAnimationFrame(animate);
  };
  
  // Cancel an active fade (for interruptions)
  const cancelFade = (trackId) => {
    // Cancel the rAF from the ref
    if (activeFadeRafsRef.current[trackId]) {
      cancelAnimationFrame(activeFadeRafsRef.current[trackId]);
      delete activeFadeRafsRef.current[trackId];
    }
    // Remove from state (if entry exists)
    setActiveFades(prev => {
      if (!prev[trackId]) return prev; // no-op if already removed
      const newFades = { ...prev };
      delete newFades[trackId];
      return newFades;
    });
    console.log(`🚫 Cancelled fade for ${trackId}`);
  };

  // Play remote track (triggered by WebSocket events)
  const playRemoteTrack = async (trackId, audioFile, loop = true, volume = null, resumeFromTime = null, completeTrackState = null, skipBufferLoad = false, syncStartTime = null, fade = false, fadeDuration = 1000) => {
    const operationId = `${trackId}_${Date.now()}`;
    console.log(`🎵 [${operationId}] Attempting to play remote track: ${trackId} - ${audioFile}`);
    
    // Check if a play operation is already in progress for this track
    if (playOperationsRef.current[trackId]) {
      console.warn(`⚠️ [${operationId}] Play operation already in progress for ${trackId}, ignoring duplicate`);
      return false;
    }
    
    // Mark this track as having an active play operation
    playOperationsRef.current[trackId] = operationId;
    console.log(`🔒 [${operationId}] Locked play operation for ${trackId}`);
    
    try {
      console.log(
        `🔧 Audio state - isUnlocked: ${isAudioUnlocked}, ` +
        `audioContext: ${audioContextRef.current ? 'exists' : 'null'}, ` +
        `state: ${audioContextRef.current?.state}`
      );
  
      // Debug the pause state detection
      const currentTrackState = remoteTrackStates[trackId];
      console.log(`🔍 Track state for ${trackId}:`, currentTrackState);
      console.log(
        `🔍 Playback state: ${currentTrackState?.playbackState}, ` +
        `currentTime=${currentTrackState?.currentTime}`
      );
  
      // Reinitialize if context was closed (e.g. React strict mode remount)
      if (
        !audioContextRef.current ||
        audioContextRef.current.state === 'closed'
      ) {
        await initializeWebAudio();
      }

      // Check if Web Audio context exists, is unlocked, and the user has clicked the gate overlay
      if (
        !audioContextRef.current ||
        audioContextRef.current.state === 'suspended' ||
        !isAudioUnlockedRef.current
      ) {
        console.warn('🕐 Audio not ready — queueing play operation for unlock');
        console.log(
          '💡 User needs to interact with the page to unlock audio ' +
          '(click volume slider, sit in seat, etc.)'
        );
        // Queue the play operation — will be drained when unlockAudio() runs
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
  
      // Ensure the context is initialized
      await initializeWebAudio();
  
      // Stop any existing source for this track
      if (activeSourcesRef.current[trackId]) {
        try {
          activeSourcesRef.current[trackId].stop();
          console.log(
            `🛑 Stopped existing source for ${trackId} before starting new one`
          );
        } catch (e) {
          console.warn(
            `Warning: Could not stop existing source for ${trackId}:`,
            e
          );
        }
        delete activeSourcesRef.current[trackId];
      }
  
      // Clean up any existing timer
      if (trackTimersRef.current[trackId]) {
        delete trackTimersRef.current[trackId];
        console.log(`🧹 Cleaned up existing timer for ${trackId}`);
      }
  
      // Load (or reuse) the AudioBuffer
      // Use asset_id for stable cache key (S3 URLs change on each presign), fall back to filename
      const trackState = remoteTrackStates[trackId];
      const assetId = completeTrackState?.asset_id || trackState?.asset_id;
      const bufferKey = `${trackId}_${assetId || audioFile}`;
      let audioBuffer = audioBuffersRef.current[bufferKey];

      // Resolve audio URL: prefer S3 URL from track state, fall back to /audio/ path
      const audioUrl = completeTrackState?.s3_url || trackState?.s3_url || `/audio/${audioFile}`;

      if (skipBufferLoad) {
        console.log(`⚡ [${operationId}] Skipping buffer load (synchronized playback) - using pre-loaded buffer`);
        if (!audioBuffer) {
          console.error(`❌ [${operationId}] Expected pre-loaded buffer not found for ${trackId}`);
          return false;
        }
      } else if (!audioBuffer) {
        console.log(
          `📁 [${operationId}] Loading remote audio buffer: ${audioUrl}`
        );
        audioBuffer = await loadRemoteAudioBuffer(audioUrl, trackId, assetId);
        if (!audioBuffer) return false;
        audioBuffersRef.current[bufferKey] = audioBuffer;
      } else {
        console.log(
          `♻️ [${operationId}] Using cached audio buffer for ${trackId}`
        );
      }
  
      // Create and configure the BufferSource
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
  
      // Determine looping - prefer complete track state if provided, then passed parameter
      const trackType = completeTrackState?.type || remoteTrackStates[trackId]?.type;
      const shouldLoop =
        trackType === 'sfx'
          ? false
          : completeTrackState?.looping ?? loop; // Use complete state first, then fallback to parameter
      source.loop = shouldLoop;
      
      console.log(`🔄 Loop determination: trackType=${trackType}, completeState.looping=${completeTrackState?.looping}, fallback.loop=${loop}, final.shouldLoop=${shouldLoop}`);
  
      // Connect source to pre-fader input node (BGM channels) or directly to gain node (others)
      // BGM channels use inputNode so effect sends tap the signal pre-fader
      const connectNode = remoteTrackInputNodesRef.current[trackId] || remoteTrackGainsRef.current[trackId];
      source.connect(connectNode);
  
      // Compute resume offset
      let startOffset;
      let resumeFromPause = false;
      const NETWORK_COMPENSATION = 0.4; // seconds to subtract for network/processing latency

      if (completeTrackState?.started_at && resumeFromTime === null) {
        // JIT offset calculation from started_at (late-joiner sync / visibility recovery)
        // Calculating at the last moment eliminates drift from buffer loading and context creation
        const elapsed = (Date.now() / 1000) - completeTrackState.started_at;
        const compensated = Math.max(0, elapsed - NETWORK_COMPENSATION);
        startOffset = shouldLoop
          ? (compensated % audioBuffer.duration)
          : Math.min(compensated, audioBuffer.duration);
        resumeFromPause = true; // treat JIT sync like a resume (timer needs the offset)
        console.log(
          `🎯 [${operationId}] JIT offset: elapsed=${elapsed.toFixed(2)}s, ` +
          `compensated=${compensated.toFixed(2)}s, offset=${startOffset.toFixed(2)}s`
        );
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
        console.log(
          `🔍 Resume logic: resumeFromTime=${resumeFromTime}, ` +
          `resumeFromPause=${resumeFromPause}, startOffset=${startOffset}` +
          `${syncStartTime ? `, syncStartTime=${syncStartTime}` : ''}`
        );
      }

      // Start playback (synchronized if syncStartTime provided)
      if (syncStartTime) {
        source.start(syncStartTime, startOffset);
        console.log(`🎵 [${operationId}] Scheduled synchronized start at audio time ${syncStartTime}`);
      } else {
        source.start(0, startOffset);
        console.log(`🎵 [${operationId}] Started immediately`);
      }
      activeSourcesRef.current[trackId] = source;
  
      // Grab duration from the buffer
      const duration = audioBuffer.duration;
  
      // Update React state
      const finalVolume = volume !== null ? volume : remoteTrackStates[trackId]?.volume ?? 0.7;
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
        console.log(`🌊 Starting fade-in for ${trackId}`);
        // Cancel any existing fade for this track first
        cancelFade(trackId);
        // Set initial gain to 0 and fade to target volume
        if (remoteTrackGainsRef.current[trackId]) {
          remoteTrackGainsRef.current[trackId].gain.value = 0;
        }
        startFade(trackId, 'in', fadeDuration, 0, finalVolume, 'play');
      } else if (remoteTrackGainsRef.current[trackId]) {
        // Set volume immediately for non-fade playback
        remoteTrackGainsRef.current[trackId].gain.value = finalVolume;
      }
  
      // Set up our time‐update loop
      const startTime = audioContextRef.current.currentTime;
      const pausedTime = resumeFromPause ? startOffset : 0;

      // DEBUG: Log timer setup to compare with source.start offset
      console.log(`⏱️ TIMER SETUP: startOffset=${startOffset}, pausedTime=${pausedTime}, resumeFromPause=${resumeFromPause}`);

      trackTimersRef.current[trackId] = {
        startTime,
        pausedTime,
        duration,
        loop: shouldLoop,
        lastUpdateTime: startTime
      };
  
      const updateTime = () => {
        const timer = trackTimersRef.current[trackId];
        if (!timer || activeSourcesRef.current[trackId] !== source) {
          return; // track stopped or replaced
        }
  
        const elapsed =
          audioContextRef.current.currentTime -
          timer.startTime +
          timer.pausedTime;
  
        let currentTime;
        let keepUpdating = true;
  
        if (timer.loop && timer.duration > 0) {
          currentTime = elapsed % timer.duration;
        } else {
          currentTime = Math.min(elapsed, timer.duration);
          if (elapsed >= timer.duration && timer.duration > 0) {
            console.log(`⏹️ ${trackId} finished, auto-stopping`);
            try {
              source.stop();
            } catch (_) {}
            delete activeSourcesRef.current[trackId];
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
            
            keepUpdating = false;
          }
        }
  
        if (keepUpdating) {
          // Throttle updates to avoid excessive re-renders (only update if time changed significantly)
          const timeDiff = Math.abs(currentTime - (timer.lastUpdateTime || 0));
          if (timeDiff > 0.1) { // Only update every 100ms
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
  
      console.log(
        `▶️ Playing remote ${trackId}: ${audioFile} (loop: ${shouldLoop})`
      );
      return true;
    } catch (error) {
      console.warn(`Failed to play remote ${trackId}:`, error);
      return false;
    } finally {
      // Always release the play operation lock
      if (playOperationsRef.current[trackId] === operationId) {
        delete playOperationsRef.current[trackId];
        console.log(
          `🔓 [${operationId}] Unlocked play operation for ${trackId}`
        );
      }
    }
  };
  const stopRemoteTrack = (trackId, fade = false, fadeDuration = 1000) => {
    if (activeSourcesRef.current[trackId]) {
      try {
        if (fade) {
          console.log(`🌊 Starting fade-out for ${trackId}`);
          // Cancel any existing fade for this track first
          cancelFade(trackId);
          // Get current gain and fade to 0
          const currentGain = remoteTrackGainsRef.current[trackId]?.gain.value || 0;
          startFade(trackId, 'out', fadeDuration, currentGain, 0, 'stop');
          // Note: actual stop() will be called by the fade completion handler
        } else {
          // Immediate stop
          activeSourcesRef.current[trackId].stop();
          delete activeSourcesRef.current[trackId];
          
          // Clean up timer
          delete trackTimersRef.current[trackId];
          
          // Cancel any active fade
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

          console.log(`⏹️ Stopped remote ${trackId}`);
        }
      } catch (error) {
        console.warn(`Failed to stop remote ${trackId}:`, error);
      }
    }
  };

  // Pause remote track (preserves playhead position)
  const pauseRemoteTrack = (trackId) => {
    if (activeSourcesRef.current[trackId] && trackTimersRef.current[trackId]) {
      try {
        // Calculate current position before stopping
        const timer = trackTimersRef.current[trackId];
        const elapsed = audioContextRef.current.currentTime - timer.startTime + timer.pausedTime;
        
        let currentTime;
        if (timer.loop && timer.duration > 0) {
          currentTime = elapsed % timer.duration;
        } else {
          currentTime = Math.min(elapsed, timer.duration);
        }
        
        // Stop the source
        activeSourcesRef.current[trackId].stop();
        delete activeSourcesRef.current[trackId];
        
        // Update state to paused with preserved position
        setRemoteTrackStates(prev => ({
          ...prev,
          [trackId]: {
            ...prev[trackId],
            playbackState: PlaybackState.PAUSED,
            currentTime: currentTime,
            remaining: null
          }
        }));

        console.log(`⏸️ Paused remote ${trackId} at ${currentTime.toFixed(2)}s`);
        return true;
      } catch (error) {
        console.warn(`Failed to pause remote ${trackId}:`, error);
        return false;
      }
    }
    return false;
  };

  // Toggle remote track looping (SFX tracks are hardcoded to false)
  const toggleRemoteTrackLooping = (trackId, looping) => {
    // SFX tracks cannot be looped
    const trackType = remoteTrackStates[trackId]?.type;
    if (trackType === 'sfx') {
      console.warn('🚫 SFX tracks cannot be looped - ignoring toggle request');
      return;
    }
    
    // Check if track is currently playing BEFORE updating state
    // Prioritize actual audio state over potentially stale React state
    const hasActiveSource = !!activeSourcesRef.current[trackId];
    const currentState = remoteTrackStates[trackId];
    const playbackState = currentState?.playbackState;
    const wasPlaying = hasActiveSource; // If there's an active source, consider it playing
    
    console.log(`🔄 Toggle loop for ${trackId}: ${looping ? 'enabled' : 'disabled'}`);
    console.log(`🔍 Debug state: hasActiveSource=${hasActiveSource}, playbackState=${playbackState}, wasPlaying=${wasPlaying}`);
    
    // Update the state
    setRemoteTrackStates(prev => ({
      ...prev,
      [trackId]: {
        ...prev[trackId],
        looping
      }
    }));
    
    // If track was playing, restart it with new loop setting while preserving playback position
    if (wasPlaying && currentState) {
      const { filename } = currentState;
      
      console.log(`🔄 Restarting ${trackId} with looping ${looping ? 'enabled' : 'disabled'} (preserving position)`);
      
      // Get the actual current volume from the Web Audio gain node (not React state)
      const actualVolume = remoteTrackGainsRef.current[trackId]?.gain.value || currentState.volume;
      console.log(`🔊 Preserving actual volume: ${actualVolume} (state volume: ${currentState.volume})`);
      
      // Calculate current playback position before stopping
      let currentPlaybackTime = 0;
      const timer = trackTimersRef.current[trackId];
      if (timer && audioContextRef.current) {
        const elapsed = audioContextRef.current.currentTime - timer.startTime + timer.pausedTime;
        if (timer.loop && timer.duration > 0) {
          currentPlaybackTime = elapsed % timer.duration;
        } else {
          currentPlaybackTime = Math.min(elapsed, timer.duration);
        }
        console.log(`📍 Preserving playback position: ${currentPlaybackTime.toFixed(2)}s`);
      }
      
      // Stop current playback
      try {
        activeSourcesRef.current[trackId].stop();
        delete activeSourcesRef.current[trackId];
        delete trackTimersRef.current[trackId];
      } catch (e) {
        console.warn(`Warning stopping ${trackId} for loop change:`, e);
      }
      
      // Restart with new loop setting and preserved position - create complete track state
      const completeTrackState = {
        ...currentState,
        looping,
        channelId: trackId,
        filename,
        volume: actualVolume // Use the actual Web Audio volume, not React state
      };
      
      // Restart immediately - no delay needed
      playRemoteTrack(trackId, filename, looping, actualVolume, currentPlaybackTime, completeTrackState);
    }
    
    console.log(`🔄 Set remote ${trackId} looping to ${looping ? 'enabled' : 'disabled'}`);
  };


  // Set callback to clear pending operations when tracks auto-stop
  const setClearPendingOperationCallback = (callback) => {
    clearPendingOperationCallbackRef.current = callback;
  };

  // Set remote track volume
  const setRemoteTrackVolume = (trackId, volume) => {
    if (remoteTrackGainsRef.current[trackId]) {
      remoteTrackGainsRef.current[trackId].gain.value = volume;
      setRemoteTrackStates(prev => ({
        ...prev,
        [trackId]: {
          ...prev[trackId],
          volume
        }
      }));
      // Removed logging to avoid confusion with WebSocket debouncing
      // Only WebSocket sends should be logged for clarity
    }
  };

  // Update local listening volume (per-client)
  useEffect(() => {
    if (localGainRef.current) {
      localGainRef.current.gain.value = masterVolume;
    }

    // Save to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('rollplay_master_volume', masterVolume.toString());
    }
  }, [masterVolume]);

  // Update broadcast master volume (DM-controlled, synced to all clients)
  useEffect(() => {
    if (masterGainRef.current) {
      masterGainRef.current.gain.value = broadcastMasterVolume;
    }
  }, [broadcastMasterVolume]);

  // ── Shared unlock helpers ────────────────────────────────────────────
  // These are called by both unlockDesktop and unlockMobile strategies.

  // Re-apply channel effects to current Web Audio nodes.
  // syncAudioState populates channelEffects React state before unlock,
  // so re-applying ensures the audio graph matches the stored state.
  const reapplyEffects = () => {
    for (const [trackId, effects] of Object.entries(channelEffects)) {
      if (channelInsertEffectsRef.current[trackId]) {
        applyChannelEffects(trackId, effects);
        console.log(`🔄 Re-applied effects for ${trackId}`);
      }
    }
  };

  // Drain play operations that were queued while context was suspended.
  // On mobile: these are the syncAudioState → playRemoteTrack calls that
  // couldn't play because the context was suspended.
  // On desktop: typically empty (context was running), but handled for safety.
  const drainPendingOps = async () => {
    const pending = pendingPlayOpsRef.current;
    pendingPlayOpsRef.current = [];
    if (pending.length === 0) return;

    console.log(`🔓 Draining ${pending.length} pending play operation(s)...`);
    for (const op of pending) {
      let offset = op.resumeFromTime ?? null;
      // If started_at is available, let playRemoteTrack do JIT offset calculation
      if (op.completeTrackState?.started_at) {
        offset = null;
      } else if (offset != null && op.queuedAt) {
        // Non-sync operations (DM resume etc.) — recalculate for wait time
        const waitSeconds = (Date.now() - op.queuedAt) / 1000;
        offset = offset + waitSeconds;
        if (op.loop) {
          const assetId = op.completeTrackState?.asset_id;
          const bufferKey = `${op.trackId}_${assetId || op.audioFile}`;
          const buffer = audioBuffersRef.current[bufferKey];
          if (buffer) {
            offset = offset % buffer.duration;
          }
        }
        console.log(`🕐 Recalculated offset for ${op.trackId}: ${op.resumeFromTime?.toFixed(1)}s → ${offset.toFixed(1)}s (waited ${waitSeconds.toFixed(1)}s)`);
      }
      await playRemoteTrack(op.trackId, op.audioFile, op.loop, op.volume, offset, op.completeTrackState, op.skipBufferLoad);
    }
    console.log('✅ All pending play operations drained');
  };

  // Reconcile: start any channels from pendingAudioStateRef that should be
  // playing but have no active source. Catches the race where the user clicked
  // "Enter Session" before syncAudioState finished loading all buffers.
  const reconcileAudioState = async () => {
    const pendingState = pendingAudioStateRef.current;
    if (!pendingState) return;

    pendingAudioStateRef.current = null;
    for (const [channelId, channelState] of Object.entries(pendingState)) {
      if (channelId === '__master_volume') continue;
      if (!channelState?.filename) continue;
      if (channelState.playback_state !== 'playing' || !channelState.started_at) continue;
      if (channelId.startsWith('sfx_slot_')) continue;

      // Skip channels that already have an active source
      if (activeSourcesRef.current[channelId]) continue;

      console.log(`🔄 Reconciling ${channelId} — should be playing but has no active source`);
      const audioUrl = channelState.s3_url || `/audio/${channelState.filename}`;
      const assetId = channelState.asset_id || channelState.filename;
      const bufferKey = `${channelId}_${assetId}`;
      let buffer = audioBuffersRef.current[bufferKey];

      if (!buffer) {
        buffer = await loadRemoteAudioBuffer(audioUrl, channelId, channelState.asset_id);
        if (buffer) audioBuffersRef.current[bufferKey] = buffer;
      }

      if (buffer) {
        const elapsed = (Date.now() / 1000) - channelState.started_at;
        if (!channelState.looping && elapsed >= buffer.duration) continue;

        // playRemoteTrack will do JIT offset calc from started_at
        await playRemoteTrack(channelId, channelState.filename, channelState.looping,
          channelState.volume, null, { ...channelState, channelId }, true);
      }
    }
  };

  // ── Desktop unlock strategy ────────────────────────────────────────
  // The eager-init AudioContext started 'running' (desktop browsers allow
  // this when the origin has prior user interaction). syncAudioState may
  // have already started real playback on this context. We keep it alive
  // — no close, no recreate, no silent MP3.
  const unlockDesktop = async () => {
    console.log('🖥️ Desktop unlock — keeping existing AudioContext');

    // Defensive: resume if somehow suspended
    if (audioContextRef.current?.state === 'suspended') {
      await audioContextRef.current.resume();
    }

    isAudioUnlockedRef.current = true;
    setIsAudioUnlocked(true);
    reapplyEffects();
    await drainPendingOps();
    await reconcileAudioState();
  };

  // ── Mobile unlock strategy ─────────────────────────────────────────
  // On iOS the eager-init context is 'suspended' — it can decode audio
  // but cannot produce output. We must:
  //   1. Activate the iOS audio session (base64 silent MP3 within gesture)
  //   2. Close the stale context
  //   3. Create a fresh context within the gesture
  const unlockMobile = async () => {
    console.log('📱 Mobile unlock — close/recreate AudioContext within gesture');

    // 1. Activate iOS audio session via HTML5 Audio.play() within user gesture.
    //    Uses inline base64 MP3 — no network fetch, preserving the gesture timing
    //    window for both Safari (needs MP3) and Chrome iOS (needs no network delay).
    const silentAudio = new Audio('data:audio/mp3;base64,SUQzBAAAAAAAIlRTU0UAAAAOAAADTGF2ZjYxLjcuMTAwAAAAAAAAAAAAAAD/+0DAAAAAAAAAAAAAAAAAAAAAAABJbmZvAAAADwAAAAUAAAK+AGhoaGhoaGhoaGhoaGhoaGhoaGiOjo6Ojo6Ojo6Ojo6Ojo6Ojo6OjrS0tLS0tLS0tLS0tLS0tLS0tLS02tra2tra2tra2tra2tra2tra2tr//////////////////////////wAAAABMYXZjNjEuMTkAAAAAAAAAAAAAAAAkAwYAAAAAAAACvhC6DYoAAAAAAP/7EMQAA8AAAaQAAAAgAAA0gAAABExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQxCmDwAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+xDEUwPAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7EMR8g8AAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQxKYDwAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU=');
    silentAudio.volume = 0;
    await silentAudio.play().catch((err) => {
      console.warn('⚠️ silentAudio.play() rejected:', err);
    });
    console.log('✅ HTML5 audio session activated');

    // 2. Close the eager-init context — it can never produce audio on iOS.
    //    AudioBuffers in audioBuffersRef are context-independent (raw PCM)
    //    and survive this replacement.
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      console.log('🔄 Closing stale eager-init AudioContext...');
      await audioContextRef.current.close();
    }
    audioContextRef.current = null;

    // 3. Clear stale refs — sources died with the old context.
    //    On iOS these should be empty (context was suspended, nothing played),
    //    but clear defensively in case of edge cases.
    activeSourcesRef.current = {};
    trackTimersRef.current = {};
    playOperationsRef.current = {};

    // 4. Create fresh AudioContext + full audio graph within user gesture.
    console.log('🎵 Creating fresh Web Audio context within gesture...');
    const webAudioSuccess = await initializeWebAudio();
    if (!webAudioSuccess) {
      throw new Error('Failed to initialize Web Audio API');
    }

    // 5. Resume if still suspended (defensive — context created within a
    //    gesture should start 'running', but resume() is harmless if already running).
    if (audioContextRef.current?.state === 'suspended') {
      console.log('🔄 Resuming suspended Web Audio context...');
      await audioContextRef.current.resume();
    }

    // 6. Mark unlocked + finish
    isAudioUnlockedRef.current = true;
    setIsAudioUnlocked(true);
    reapplyEffects();
    await drainPendingOps();
    await reconcileAudioState();
  };

  // ── Unlock orchestrator ────────────────────────────────────────────
  // Picks the right strategy based on AudioContext state. No UA sniffing —
  // the context state is the authoritative signal:
  //   'running'   → desktop (keep context, sources stay alive)
  //   'suspended' → mobile/iOS (close + recreate within gesture)
  const unlockAudio = async () => {
    if (unlockInProgressRef.current) {
      console.log('🔓 Audio unlock already in progress, skipping');
      return false;
    }
    unlockInProgressRef.current = true;
    try {
      const contextState = audioContextRef.current?.state;
      console.log(`🔓 Audio unlock — context state: ${contextState}`);

      if (contextState === 'running') {
        await unlockDesktop();
      } else {
        await unlockMobile();
      }

      console.log('🔊 Audio system unlocked successfully');
      return true;
    } catch (error) {
      console.warn('Audio unlock failed:', error);
      return false;
    } finally {
      unlockInProgressRef.current = false;
    }
  };

  // Resume remote track from paused position
  const resumeRemoteTrack = async (trackId) => {
    console.log(`🔄 Resume requested for ${trackId}`);
    
    // Check if a resume operation is already in progress for this track
    if (resumeOperationsRef.current[trackId]) {
      console.warn(`⚠️ Resume operation already in progress for ${trackId}, ignoring duplicate`);
      return false;
    }
    
    // Mark this track as having an active resume operation
    resumeOperationsRef.current[trackId] = true;
    
    console.log(`🔍 Current remoteTrackStates:`, remoteTrackStates);
    
    try {
      // Use a callback to get the most current state
      return await new Promise((resolve) => {
        setRemoteTrackStates(currentState => {
          const trackState = currentState[trackId];
          console.log(`🔍 Current state for ${trackId}:`, trackState);
          
          if (!trackState) {
            console.warn(`❌ No track state found for ${trackId}`);
            resolve(false);
            return currentState; // Don't modify state
          }
          
          if (trackState.playbackState !== PlaybackState.PAUSED) {
            console.warn(`❌ Track ${trackId} is not paused (state=${trackState.playbackState}), cannot resume`);
            resolve(false);
            return currentState; // Don't modify state
          }
          
          const { filename, currentTime, looping, volume } = trackState;
          console.log(`🔄 Resuming ${trackId} from ${currentTime}s`);

          // DEBUG: Log exactly what we're passing to playRemoteTrack
          console.log(`📤 RESUME: calling playRemoteTrack with currentTime=${currentTime} for ${trackId}`);

          // Call playRemoteTrack with the explicit resume time
          playRemoteTrack(trackId, filename, looping, volume, currentTime).then(resolve);
          
          return currentState; // Don't modify state here, playRemoteTrack will do it
        });
      });
    } finally {
      // Clear the resume operation flag when done
      delete resumeOperationsRef.current[trackId];
    }
  };

  // Apply effect toggles to a BGM channel's insert/send effects.
  // HPF/LPF are inline inserts — toggle changes frequency (pass-all vs configured).
  // Reverb is a send — toggle ramps wet gain to mix level or 0.0.
  // Accepts: { hpf: true/false, lpf: true/false, reverb: true/false, hpf_mix: 0.5, reverb_mix: 0.6, ... }
  const applyChannelEffects = useCallback((trackId, effects) => {
    // Always update React state so UI toggles reflect correct values immediately,
    // even if Web Audio chains aren't ready yet (e.g. during initial sync)
    setChannelEffects(prev => ({
      ...prev,
      [trackId]: { ...prev[trackId], ...effects },
    }));

    const inserts = channelInsertEffectsRef.current[trackId];
    if (!inserts) return;

    const ctx = audioContextRef.current;
    if (!ctx) return;

    const RAMP_TIME = 0.02; // 20ms to avoid clicks
    const now = ctx.currentTime;

    // Resolve the effective eq state after merging incoming effects
    const mergedState = { ...channelEffects[trackId], ...effects };
    const eqActive = mergedState.eq ?? false;

    // EQ master bypass — when eq toggles, re-evaluate both filters against stored state
    if (effects.eq !== undefined) {
      const hpfEnabled = mergedState.hpf ?? false;
      const hpfMix = mergedState.hpf_mix ?? DEFAULT_EFFECTS.hpf.mix;
      const hpfTarget = (eqActive && hpfEnabled) ? mapHpfFrequency(hpfMix) : 20;
      inserts.hpf.effectNode.frequency.setValueAtTime(inserts.hpf.effectNode.frequency.value, now);
      inserts.hpf.effectNode.frequency.linearRampToValueAtTime(hpfTarget, now + RAMP_TIME);

      const lpfEnabled = mergedState.lpf ?? false;
      const lpfMix = mergedState.lpf_mix ?? DEFAULT_EFFECTS.lpf.mix;
      const lpfTarget = (eqActive && lpfEnabled) ? mapLpfFrequency(lpfMix) : 20000;
      inserts.lpf.effectNode.frequency.setValueAtTime(inserts.lpf.effectNode.frequency.value, now);
      inserts.lpf.effectNode.frequency.linearRampToValueAtTime(lpfTarget, now + RAMP_TIME);
    }

    // HPF insert — only apply if eq bypass is active
    if (effects.hpf !== undefined && effects.eq === undefined) {
      const enabled = typeof effects.hpf === 'boolean' ? effects.hpf : !!effects.hpf;
      const mixLevel = effects.hpf_mix ?? channelEffects[trackId]?.hpf_mix ?? DEFAULT_EFFECTS.hpf.mix;
      const targetFreq = (eqActive && enabled) ? mapHpfFrequency(mixLevel) : 20;
      inserts.hpf.effectNode.frequency.setValueAtTime(inserts.hpf.effectNode.frequency.value, now);
      inserts.hpf.effectNode.frequency.linearRampToValueAtTime(targetFreq, now + RAMP_TIME);
    }
    // HPF frequency update from fader — only apply if eq active and hpf enabled
    if (effects.hpf_mix !== undefined && effects.hpf === undefined && effects.eq === undefined) {
      const isEnabled = channelEffects[trackId]?.hpf ?? false;
      if (eqActive && isEnabled) {
        const targetFreq = mapHpfFrequency(effects.hpf_mix);
        inserts.hpf.effectNode.frequency.setValueAtTime(inserts.hpf.effectNode.frequency.value, now);
        inserts.hpf.effectNode.frequency.linearRampToValueAtTime(targetFreq, now + RAMP_TIME);
      }
    }

    // LPF insert — only apply if eq bypass is active
    if (effects.lpf !== undefined && effects.eq === undefined) {
      const enabled = typeof effects.lpf === 'boolean' ? effects.lpf : !!effects.lpf;
      const mixLevel = effects.lpf_mix ?? channelEffects[trackId]?.lpf_mix ?? DEFAULT_EFFECTS.lpf.mix;
      const targetFreq = (eqActive && enabled) ? mapLpfFrequency(mixLevel) : 20000;
      inserts.lpf.effectNode.frequency.setValueAtTime(inserts.lpf.effectNode.frequency.value, now);
      inserts.lpf.effectNode.frequency.linearRampToValueAtTime(targetFreq, now + RAMP_TIME);
    }
    // LPF frequency update from fader — only apply if eq active and lpf enabled
    if (effects.lpf_mix !== undefined && effects.lpf === undefined && effects.eq === undefined) {
      const isEnabled = channelEffects[trackId]?.lpf ?? false;
      if (eqActive && isEnabled) {
        const targetFreq = mapLpfFrequency(effects.lpf_mix);
        inserts.lpf.effectNode.frequency.setValueAtTime(inserts.lpf.effectNode.frequency.value, now);
        inserts.lpf.effectNode.frequency.linearRampToValueAtTime(targetFreq, now + RAMP_TIME);
      }
    }

    // Reverb send — toggle ramps wet gain
    if (effects.reverb !== undefined) {
      const enabled = typeof effects.reverb === 'boolean' ? effects.reverb : !!effects.reverb;
      const mixLevel = effects.reverb_mix ?? channelEffects[trackId]?.reverb_mix ?? DEFAULT_EFFECTS.reverb.mix;
      const targetGain = enabled ? mixLevel : 0.0;
      inserts.reverb.wetGain.gain.setValueAtTime(inserts.reverb.wetGain.gain.value, now);
      inserts.reverb.wetGain.gain.linearRampToValueAtTime(targetGain, now + RAMP_TIME);
    }
    // Reverb mix level update from fader — only apply if enabled
    if (effects.reverb_mix !== undefined && effects.reverb === undefined) {
      const isEnabled = channelEffects[trackId]?.reverb ?? false;
      if (isEnabled) {
        inserts.reverb.wetGain.gain.setValueAtTime(inserts.reverb.wetGain.gain.value, now);
        inserts.reverb.wetGain.gain.linearRampToValueAtTime(effects.reverb_mix, now + RAMP_TIME);
      }
    }

    // Reverb preset change — regenerate impulse response buffer on the channel's ConvolverNode
    if (effects.reverb_preset !== undefined) {
      const currentPreset = inserts.reverb.currentPreset || 'room';
      if (effects.reverb_preset !== currentPreset) {
        const presetConfig = REVERB_PRESETS[effects.reverb_preset] || REVERB_PRESETS.room;
        inserts.reverb.effectNode.buffer = createImpulseResponse(ctx, presetConfig.duration, presetConfig.decay);
        inserts.reverb.currentPreset = effects.reverb_preset;
      }
    }
  }, [channelEffects]);

  // Set the mix level for a specific effect on a specific channel.
  // HPF/LPF: fader controls cutoff frequency (via logarithmic mapping).
  // Reverb: fader controls wet gain level.
  const setEffectMixLevel = useCallback((trackId, effectName, mixLevel) => {
    setChannelEffects(prev => ({
      ...prev,
      [trackId]: { ...prev[trackId], [`${effectName}_mix`]: mixLevel },
    }));

    const inserts = channelInsertEffectsRef.current[trackId];
    if (!inserts?.[effectName]) return;

    const ctx = audioContextRef.current;
    if (!ctx) return;

    const isEnabled = channelEffects[trackId]?.[effectName] ?? false;
    if (!isEnabled) return;

    const now = ctx.currentTime;

    if (effectName === 'hpf') {
      const targetFreq = mapHpfFrequency(mixLevel);
      inserts.hpf.effectNode.frequency.setValueAtTime(inserts.hpf.effectNode.frequency.value, now);
      inserts.hpf.effectNode.frequency.linearRampToValueAtTime(targetFreq, now + 0.02);
    } else if (effectName === 'lpf') {
      const targetFreq = mapLpfFrequency(mixLevel);
      inserts.lpf.effectNode.frequency.setValueAtTime(inserts.lpf.effectNode.frequency.value, now);
      inserts.lpf.effectNode.frequency.linearRampToValueAtTime(targetFreq, now + 0.02);
    } else if (effectName === 'reverb') {
      inserts.reverb.wetGain.gain.setValueAtTime(inserts.reverb.wetGain.gain.value, now);
      inserts.reverb.wetGain.gain.linearRampToValueAtTime(mixLevel, now + 0.02);
    }
  }, [channelEffects]);

  // Cleanup function to stop all audio (called on unmount)
  const cleanupAllAudio = useCallback(() => {
    console.log('🧹 Cleaning up all audio on unmount...');

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

    // Stop all remote audio sources
    Object.keys(activeSourcesRef.current).forEach(trackId => {
      try {
        if (activeSourcesRef.current[trackId]) {
          activeSourcesRef.current[trackId].stop();
        }
      } catch (e) {
        console.warn(`Error stopping remote track ${trackId}:`, e);
      }
    });

    // Stop all SFX soundboard sources
    Object.keys(sfxSlotSourcesRef.current).forEach(trackId => {
      try {
        if (sfxSlotSourcesRef.current[trackId]) {
          sfxSlotSourcesRef.current[trackId].stop();
        }
      } catch (e) {
        console.warn(`Error stopping SFX slot ${trackId}:`, e);
      }
    });

    // Clear all refs
    activeSourcesRef.current = {};
    trackTimersRef.current = {};
    resumeOperationsRef.current = {};
    playOperationsRef.current = {};
    sfxSlotSourcesRef.current = {};

    // Clear insert effect refs
    channelInsertEffectsRef.current = {};
    remoteTrackInputNodesRef.current = {};
    masterAnalysersRef.current = null;
    impulseResponseBufferRef.current = null;

    // Cancel all active fades
    Object.keys(activeFades).forEach(trackId => {
      if (activeFades[trackId]?.animationId) {
        cancelAnimationFrame(activeFades[trackId].animationId);
      }
    });

    // Close audio context
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().then(() => {
        console.log('✅ Audio context closed');
      }).catch(e => {
        console.warn('Error closing audio context:', e);
      });
    }

    console.log('✅ All audio cleanup complete');
  }, [activeFades]);

  // Recover audio playback after page visibility change (phone lock, tab switch)
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const handleVisibilityChange = async () => {
      if (document.visibilityState !== 'visible') return;
      if (!isAudioUnlocked || !audioContextRef.current) return;

      console.log('👁️ Page became visible — checking audio recovery...');

      // Resume AudioContext if it was suspended/interrupted by OS
      if (audioContextRef.current.state === 'suspended') {
        try {
          await audioContextRef.current.resume();
          console.log('✅ AudioContext resumed after visibility change');
        } catch (e) {
          console.warn('❌ Failed to resume AudioContext:', e);
          return;
        }
      }

      if (audioContextRef.current.state !== 'running') {
        console.warn('⚠️ AudioContext not running after resume attempt:', audioContextRef.current.state);
        return;
      }

      // Check each track that should be playing but has a dead/missing source
      const currentStates = { ...remoteTrackStatesRef.current };
      for (const [trackId, trackState] of Object.entries(currentStates)) {
        if (trackState.playbackState !== PlaybackState.PLAYING) continue;

        // Check if source is still alive
        const source = activeSourcesRef.current[trackId];
        if (source && trackTimersRef.current[trackId]) continue; // Source + timer alive, likely fine

        const { filename, s3_url, asset_id, volume, looping, currentTime: lastKnownTime, duration } = trackState;
        if (!filename) continue;

        // Restart from last known position
        let offset = lastKnownTime || 0;
        if (looping && duration > 0) {
          offset = offset % duration;
        }

        console.log(`🔄 Restarting ${trackId} at offset ${offset.toFixed(1)}s after visibility recovery`);
        await playRemoteTrack(trackId, filename, looping, volume, offset, {
          asset_id, s3_url, looping
        }, false);
      }

      // Re-apply channel effects to ensure audio graph is correct
      for (const [trackId, effects] of Object.entries(channelEffectsRef.current)) {
        if (channelInsertEffectsRef.current[trackId]) {
          applyChannelEffects(trackId, effects);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isAudioUnlocked]);

  // Sync audio state from server (called on initial_state for late-joiners)
  const syncAudioState = async (audioState) => {
    if (!audioState || typeof audioState !== 'object') return;

    // Store for post-unlock reconciliation (handles race where user clicks
    // "Enter Session" before buffer loads finish — unlockAudio can re-sync)
    pendingAudioStateRef.current = audioState;

    console.log('🔄 Syncing audio state from server:', Object.keys(audioState));

    // Ensure audio graph exists before syncing effects — on re-entry, the eager
    // init useEffect may not have fired yet when the WebSocket initial_state arrives.
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      await initializeWebAudio();
    }

    // Restore broadcast master volume if present
    if (audioState.__master_volume !== undefined) {
      setBroadcastMasterVolume(audioState.__master_volume);
      console.log(`🔊 Sync: restored broadcast master volume to ${audioState.__master_volume}`);
    }

    for (const [channelId, channelState] of Object.entries(audioState)) {
      if (channelId === '__master_volume') continue; // Already handled above
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
          const buffer = await loadRemoteAudioBuffer(channelState.s3_url, channelId, channelState.asset_id);
          if (buffer) {
            sfxSlotBuffersRef.current[`${channelId}_${channelState.asset_id || channelState.filename}`] = buffer;
          }
        }
        console.log(`🔊 Sync: restored SFX slot ${slotIndex} — ${channelState.filename}`);
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
        // Backward compat: old sessions without eq field — derive from hpf || lpf
        if (syncEffects.eq === undefined) {
          syncEffects.eq = !!(syncEffects.hpf || syncEffects.lpf);
        }
        // Backward compat: old sessions without reverb_preset — default to 'room'
        if (syncEffects.reverb !== undefined && syncEffects.reverb_preset === undefined) {
          syncEffects.reverb_preset = 'room';
        }
        applyChannelEffects(channelId, syncEffects);
      }

      // Restore mute/solo state if present (channel-level, from MongoDB)
      if (channelState.muted) {
        setMutedChannels(prev => ({ ...prev, [channelId]: true }));
      }
      if (channelState.soloed) {
        setSoloedChannels(prev => ({ ...prev, [channelId]: true }));
      }

      if (playback_state === 'playing' && started_at) {
        // Load buffer and start playback at calculated offset
        const audioUrl = s3_url || `/audio/${filename}`;
        const buffer = await loadRemoteAudioBuffer(audioUrl, channelId, asset_id);

        if (buffer) {
          // Store buffer with stable key
          const bufferKey = `${channelId}_${asset_id || filename}`;
          audioBuffersRef.current[bufferKey] = buffer;

          // If non-looping track has already finished, don't play
          const elapsed = (Date.now() / 1000) - started_at;
          if (!looping && elapsed >= buffer.duration) {
            console.log(`⏹️ Sync: ${channelId} has already finished (non-looping)`);
            continue;
          }

          // Pass resumeFromTime=null so playRemoteTrack calculates offset JIT
          // from started_at (in completeTrackState) right before source.start()
          console.log(`▶️ Sync: starting ${channelId} (elapsed: ${elapsed.toFixed(1)}s, duration: ${buffer.duration.toFixed(1)}s)`);

          await playRemoteTrack(channelId, filename, looping, volume, null, {
            ...channelState,
            channelId,
          }, true);
        }
      } else if (playback_state === 'paused' && paused_elapsed != null) {
        // Load buffer to get duration for normalizing paused position
        const audioUrl = s3_url || `/audio/${filename}`;
        const buffer = await loadRemoteAudioBuffer(audioUrl, channelId, asset_id);

        // For looping tracks, normalize paused_elapsed within buffer duration
        // (server stores raw elapsed time which can exceed buffer length after multiple loops)
        let normalizedTime = paused_elapsed;
        if (buffer && looping && buffer.duration > 0 && paused_elapsed > buffer.duration) {
          normalizedTime = paused_elapsed % buffer.duration;
          console.log(`🔄 Sync: wrapped paused position ${paused_elapsed.toFixed(1)}s → ${normalizedTime.toFixed(1)}s (buffer: ${buffer.duration.toFixed(1)}s)`);
        }

        // Cache buffer for future resume
        if (buffer) {
          const bufferKey = `${channelId}_${asset_id || filename}`;
          audioBuffersRef.current[bufferKey] = buffer;
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
        console.log(`⏸️ Sync: ${channelId} paused at ${normalizedTime.toFixed(1)}s`);
      }
      // "stopped" channels with filename are already handled by the metadata update above
    }

    // If audio is already unlocked, sync succeeded with running context —
    // no need for post-unlock reconciliation
    if (isAudioUnlocked) {
      pendingAudioStateRef.current = null;
    }

    console.log('✅ Audio state sync complete');
  };

  // Load an asset from the library into a channel (DM selects via AudioTrackSelector)
  // Volume and effects travel with the audio file — restored from session config (via backend)
  // or falling back to asset-level defaults for first-time loads.
  // System-level guarantee: if the asset changes (including to null for clear),
  // stop the current audio source so no orphaned playback continues.
  const loadAssetIntoChannel = (channelId, asset) => {
    const volume = asset.default_volume ?? 0.8;

    setRemoteTrackStates(prev => {
      const prevAssetId = prev[channelId]?.asset_id;
      const newAssetId = asset.id ?? null;

      // Stop currently playing source when the asset changes
      if (prevAssetId !== newAssetId) {
        if (activeSourcesRef.current[channelId]) {
          try { activeSourcesRef.current[channelId].stop(); } catch (_) {}
          delete activeSourcesRef.current[channelId];
        }
        delete trackTimersRef.current[channelId];
        cancelFade(channelId);
      }

      if (remoteTrackGainsRef.current[channelId]) {
        remoteTrackGainsRef.current[channelId].gain.value = volume;
      }

      return {
        ...prev,
        [channelId]: {
          ...prev[channelId],
          filename: asset.filename,
          asset_id: newAssetId,
          s3_url: asset.s3_url,
          volume,
          // Reset playback state when asset changes
          ...(prevAssetId !== newAssetId ? {
            playbackState: PlaybackState.STOPPED,
            currentTime: 0,
            duration: 0,
          } : {}),
        }
      };
    });

    // Apply effects — full state from backend broadcast or asset-level defaults from PostgreSQL.
    if (asset.effects && typeof asset.effects === 'object') {
      // Backend broadcast carries full effects object
      const syncEffects = { ...asset.effects };
      if (syncEffects.eq === undefined) {
        syncEffects.eq = !!(syncEffects.hpf || syncEffects.lpf);
      }
      applyChannelEffects(channelId, syncEffects);
    } else if (asset.effect_hpf_enabled !== undefined || asset.effect_lpf_enabled !== undefined || asset.effect_reverb_enabled !== undefined) {
      // DM's local load — asset has individual fields from PostgreSQL
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
      // No effects data — apply all-off defaults
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

  // Load an asset into a soundboard slot and pre-fetch its buffer
  // Volume travels with the audio file — use the asset's default_volume
  const loadSfxSlot = async (slotIndex, asset) => {
    const volume = asset.default_volume ?? 0.8;
    const trackId = `sfx_slot_${slotIndex}`;
    if (sfxSlotGainsRef.current[trackId]) {
      sfxSlotGainsRef.current[trackId].gain.value = volume;
    }
    setSfxSlots(prev => prev.map((s, i) =>
      i === slotIndex ? { ...s, asset_id: asset.id, filename: asset.filename, s3_url: asset.s3_url, volume } : s
    ));
    console.log(`🔊 Loaded SFX "${asset.filename}" into slot ${slotIndex} (volume: ${volume})`);

    // Pre-fetch buffer for instant trigger response
    if (asset.s3_url) {
      const buffer = await loadRemoteAudioBuffer(asset.s3_url, trackId, asset.id);
      if (buffer) {
        sfxSlotBuffersRef.current[`${trackId}_${asset.id || asset.filename}`] = buffer;
        console.log(`✅ Pre-loaded SFX buffer for slot ${slotIndex}`);
      }
    }
  };

  // Fire-and-forget SFX playback
  const playSfxSlot = async (slotIndex) => {
    const slot = sfxSlots[slotIndex];
    if (!slot?.s3_url || !audioContextRef.current) return false;

    // If context is suspended, drop silently — one-shot SFX would be stale by unlock time
    if (audioContextRef.current.state === 'suspended') {
      console.warn(`🔇 SFX slot ${slotIndex} dropped — AudioContext suspended`);
      return false;
    }

    const trackId = `sfx_slot_${slotIndex}`;

    // Re-trigger: stop any currently playing source on this slot
    if (sfxSlotSourcesRef.current[trackId]) {
      try { sfxSlotSourcesRef.current[trackId].stop(); } catch (_) {}
      delete sfxSlotSourcesRef.current[trackId];
    }

    // Load or reuse buffer (keyed by asset_id for stable caching)
    const bufferKey = `${trackId}_${slot.asset_id || slot.filename}`;
    let buffer = sfxSlotBuffersRef.current[bufferKey];
    if (!buffer) {
      buffer = await loadRemoteAudioBuffer(slot.s3_url, trackId, slot.asset_id);
      if (!buffer) return false;
      sfxSlotBuffersRef.current[bufferKey] = buffer;
    }

    // Ensure slot gain node exists
    if (!sfxSlotGainsRef.current[trackId]) {
      console.warn(`⚠️ SFX gain node missing for ${trackId} — reinitializing`);
      const slotGain = audioContextRef.current.createGain();
      slotGain.connect(masterGainRef.current);
      slotGain.gain.value = slot.volume;
      sfxSlotGainsRef.current[trackId] = slotGain;
    }

    // Create source, connect to slot gain, play
    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.loop = false;
    source.connect(sfxSlotGainsRef.current[trackId]);
    source.start(0);
    sfxSlotSourcesRef.current[trackId] = source;

    // Mark as playing, auto-clear when done
    setSfxSlots(prev => prev.map((s, i) => i === slotIndex ? { ...s, isPlaying: true } : s));
    source.onended = () => {
      delete sfxSlotSourcesRef.current[trackId];
      setSfxSlots(prev => prev.map((s, i) => i === slotIndex ? { ...s, isPlaying: false } : s));
    };

    console.log(`🔊 Playing SFX slot ${slotIndex}: ${slot.filename}`);
    return true;
  };

  // Immediate stop for a soundboard slot
  const stopSfxSlot = (slotIndex) => {
    const trackId = `sfx_slot_${slotIndex}`;
    if (sfxSlotSourcesRef.current[trackId]) {
      try { sfxSlotSourcesRef.current[trackId].stop(); } catch (_) {}
      delete sfxSlotSourcesRef.current[trackId];
    }
    setSfxSlots(prev => prev.map((s, i) => i === slotIndex ? { ...s, isPlaying: false } : s));
  };

  // Per-slot volume control
  const setSfxSlotVolume = (slotIndex, volume) => {
    const trackId = `sfx_slot_${slotIndex}`;
    if (sfxSlotGainsRef.current[trackId]) {
      sfxSlotGainsRef.current[trackId].gain.value = volume;
    }
    setSfxSlots(prev => prev.map((s, i) => i === slotIndex ? { ...s, volume } : s));
  };

  // Clear a soundboard slot — stop playback, reset state, drop cached buffer
  const clearSfxSlot = (slotIndex) => {
    const trackId = `sfx_slot_${slotIndex}`;

    // Stop any playing source
    if (sfxSlotSourcesRef.current[trackId]) {
      try { sfxSlotSourcesRef.current[trackId].stop(); } catch (_) {}
      delete sfxSlotSourcesRef.current[trackId];
    }

    // Drop cached buffer for this slot (keys are `sfx_slot_N_assetId`)
    Object.keys(sfxSlotBuffersRef.current).forEach(key => {
      if (key.startsWith(`${trackId}_`)) {
        delete sfxSlotBuffersRef.current[key];
      }
    });

    // Reset slot state
    setSfxSlots(prev => prev.map((s, i) =>
      i === slotIndex
        ? { ...s, asset_id: null, filename: null, s3_url: null, isPlaying: false }
        : s
    ));

    console.log(`🗑️ Cleared SFX slot ${slotIndex}`);
  };

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