/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState, useEffect, useRef, useCallback } from 'react';
import { PlaybackState, ChannelType } from '../types';

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
  
  // Callback to clear pending operations when tracks auto-stop
  const clearPendingOperationCallbackRef = useRef(null);
  
  // Master volume (client-controlled)
  const [masterVolume, setMasterVolume] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('rollplay_master_volume');
      return saved ? parseFloat(saved) : 0.5;
    }
    return 0.5;
  });

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
  const masterGainRef = useRef(null);
  const remoteTrackGainsRef = useRef({});
  const remoteTrackAnalysersRef = useRef({});
  const audioBuffersRef = useRef({});
  const activeSourcesRef = useRef({});
  const trackTimersRef = useRef({}); // Store timing info for each track
  const resumeOperationsRef = useRef({}); // Track active resume operations to prevent duplicates
  const playOperationsRef = useRef({}); // Track active play operations to prevent duplicates
  const pendingPlayOpsRef = useRef([]); // Queue play ops when AudioContext is suspended (non-DM players)

  // Remote track states (for DM-controlled BGM audio)
  // Channels start empty — DM loads audio from asset library via AudioTrackSelector
  // SFX is handled separately by the lightweight soundboard system below
  const [remoteTrackStates, setRemoteTrackStates] = useState({
    audio_channel_A: { playbackState: PlaybackState.STOPPED, volume: 0.8, filename: null, asset_id: null, s3_url: null, type: ChannelType.BGM, channelGroup: ChannelType.BGM, track: 'A', currentTime: 0, duration: 0, looping: true },
    audio_channel_B: { playbackState: PlaybackState.STOPPED, volume: 0.8, filename: null, asset_id: null, s3_url: null, type: ChannelType.BGM, channelGroup: ChannelType.BGM, track: 'B', currentTime: 0, duration: 0, looping: true },
    audio_channel_C: { playbackState: PlaybackState.STOPPED, volume: 0.8, filename: null, asset_id: null, s3_url: null, type: ChannelType.BGM, channelGroup: ChannelType.BGM, track: 'C', currentTime: 0, duration: 0, looping: true },
    audio_channel_D: { playbackState: PlaybackState.STOPPED, volume: 0.8, filename: null, asset_id: null, s3_url: null, type: ChannelType.BGM, channelGroup: ChannelType.BGM, track: 'D', currentTime: 0, duration: 0, looping: true },
  });

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

  // Active fade transitions state
  const [activeFades, setActiveFades] = useState({}); // { trackId: { type, startTime, duration, startGain, targetGain, operation, animationId } }

  // Initialize Web Audio API for remote tracks
  const initializeWebAudio = async () => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      try {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        
        // Create master gain node
        masterGainRef.current = audioContextRef.current.createGain();
        masterGainRef.current.connect(audioContextRef.current.destination);
        masterGainRef.current.gain.value = masterVolume;

        // Create gain nodes and analyser nodes for each remote track (dynamic)
        Object.keys(remoteTrackStates).forEach(trackId => {
          const gainNode = audioContextRef.current.createGain();
          const analyserNode = audioContextRef.current.createAnalyser();
          
          // Configure analyser
          analyserNode.fftSize = 256;
          analyserNode.smoothingTimeConstant = 0.9;
          
          // Connect: gain → analyser → master
          gainNode.connect(analyserNode);
          analyserNode.connect(masterGainRef.current);
          
          gainNode.gain.value = remoteTrackStates[trackId]?.volume || 1.0;
          remoteTrackGainsRef.current[trackId] = gainNode;
          remoteTrackAnalysersRef.current[trackId] = analyserNode;
        });

        // Create lightweight gain nodes for SFX soundboard slots (no analysers)
        for (let i = 0; i < SFX_SLOT_COUNT; i++) {
          const slotGain = audioContextRef.current.createGain();
          slotGain.connect(masterGainRef.current);
          slotGain.gain.value = 0.8;
          sfxSlotGainsRef.current[`sfx_slot_${i}`] = slotGain;
        }

        console.log('🎵 Web Audio API initialized for remote tracks + SFX soundboard');
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
  const loadRemoteAudioBuffer = async (url, trackId) => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      await initializeWebAudio();
    }
    if (!audioContextRef.current) {
      console.warn('⚠️ loadRemoteAudioBuffer: AudioContext is null — cannot decode audio');
      return null;
    }

    try {
      console.log(`📁 Loading remote audio buffer: ${url}`);
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
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
    if (activeFades[trackId]) {
      cancelAnimationFrame(activeFades[trackId].animationId);
    }
    
    const startTime = performance.now();
    const fadeConfig = {
      type, // 'in' or 'out'
      startTime,
      duration,
      startGain,
      targetGain,
      operation,
      animationId: null
    };
    
    console.log(`🌊 Starting ${type} fade for ${trackId}: ${startGain} → ${targetGain} over ${duration}ms`);
    
    // Start the animation loop
    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1.0);
      
      // Calculate current gain using linear interpolation
      const currentGain = startGain + (targetGain - startGain) * progress;
      
      // Apply gain if track's gain node exists
      if (remoteTrackGainsRef.current[trackId]) {
        remoteTrackGainsRef.current[trackId].gain.value = currentGain;
      }
      
      if (progress < 1.0) {
        // Continue animation
        const animationId = requestAnimationFrame(animate);
        setActiveFades(prev => ({
          ...prev,
          [trackId]: { ...fadeConfig, animationId }
        }));
      } else {
        // Fade complete
        console.log(`✅ Fade ${type} complete for ${trackId}`);
        
        // Remove from active fades
        setActiveFades(prev => {
          const newFades = { ...prev };
          delete newFades[trackId];
          return newFades;
        });
        
        // If fade out completed, stop the track
        if (type === 'out') {
          setTimeout(() => {
            stopRemoteTrack(trackId);
          }, 50); // Small delay to ensure fade is visually complete
        }
      }
    };
    
    // Start the animation
    const animationId = requestAnimationFrame(animate);
    setActiveFades(prev => ({
      ...prev,
      [trackId]: { ...fadeConfig, animationId }
    }));
  };
  
  // Cancel an active fade (for interruptions)
  const cancelFade = (trackId) => {
    if (activeFades[trackId]) {
      cancelAnimationFrame(activeFades[trackId].animationId);
      setActiveFades(prev => {
        const newFades = { ...prev };
        delete newFades[trackId];
        return newFades;
      });
      console.log(`🚫 Cancelled fade for ${trackId}`);
    }
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

      // Check if Web Audio context exists and is unlocked
      if (
        !audioContextRef.current ||
        audioContextRef.current.state === 'suspended'
      ) {
        console.warn('🕐 Audio context suspended — queueing play operation for unlock');
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
        audioBuffer = await loadRemoteAudioBuffer(audioUrl, trackId);
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
  
      // Connect to the track's gain node
      source.connect(remoteTrackGainsRef.current[trackId]);
  
      // Compute resume offset
      const resumeFromPause =
        resumeFromTime !== null ||
        (remoteTrackStates[trackId]?.playbackState === PlaybackState.PAUSED &&
          remoteTrackStates[trackId]?.currentTime > 0);
      const startOffset =
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

      // DEBUG: Log exact values passed to Web Audio API
      console.log(`🔊 SOURCE.START DEBUG: offset=${startOffset}, resumeFromTime=${resumeFromTime}, resumeFromPause=${resumeFromPause}`);

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
                duration: 0
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
              duration: 0
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
            currentTime: currentTime
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

  // Update master volume for both systems
  useEffect(() => {
    // Update Web Audio master gain
    if (masterGainRef.current) {
      masterGainRef.current.gain.value = masterVolume;
    }
    
    // Save master volume to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('rollplay_master_volume', masterVolume.toString());
    }
    
    // Local audio volumes are updated in separate useEffect above
  }, [masterVolume]);

  // Unlock both audio systems
  const unlockAudio = async () => {
    try {
      console.log('🔓 Starting audio unlock process...');
      
      // Unlock HTML5 audio with silent audio
      const silentAudio = new Audio();
      silentAudio.src = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmzhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmzhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmzhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmzhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+Dy';
      silentAudio.volume = 0;
      await silentAudio.play();
      console.log('✅ HTML5 audio unlocked');

      // Unlock Web Audio API
      console.log('🎵 Initializing Web Audio API...');
      const webAudioSuccess = await initializeWebAudio();
      if (!webAudioSuccess) {
        throw new Error('Failed to initialize Web Audio API');
      }
      
      console.log(`🔧 Web Audio context state: ${audioContextRef.current?.state}`);
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        console.log('🔄 Resuming suspended Web Audio context...');
        await audioContextRef.current.resume();
        console.log(`✅ Web Audio context resumed, new state: ${audioContextRef.current.state}`);
      }
      
      setIsAudioUnlocked(true);
      console.log('🔊 Unified audio system unlocked successfully');

      // Drain pending play operations that were queued while context was suspended
      const pending = pendingPlayOpsRef.current;
      pendingPlayOpsRef.current = [];
      if (pending.length > 0) {
        console.log(`🔓 Draining ${pending.length} pending play operation(s)...`);
        for (const op of pending) {
          // Recalculate offset to account for time spent waiting for unlock
          let offset = op.resumeFromTime ?? null;
          if (offset != null && op.queuedAt) {
            const waitSeconds = (Date.now() - op.queuedAt) / 1000;
            offset = offset + waitSeconds;
            // Wrap for looping tracks using cached buffer duration
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
      }

      return true;
    } catch (error) {
      console.warn('Unified audio unlock failed:', error);
      return false;
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

  // Sync audio state from server (called on initial_state for late-joiners)
  const syncAudioState = async (audioState) => {
    if (!audioState || typeof audioState !== 'object') return;

    console.log('🔄 Syncing audio state from server:', Object.keys(audioState));

    for (const [channelId, channelState] of Object.entries(audioState)) {
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
          const buffer = await loadRemoteAudioBuffer(channelState.s3_url, channelId);
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

      if (playback_state === 'playing' && started_at) {
        // Load buffer and start playback at calculated offset
        const audioUrl = s3_url || `/audio/${filename}`;
        const buffer = await loadRemoteAudioBuffer(audioUrl, channelId);

        if (buffer) {
          // Store buffer with stable key
          const bufferKey = `${channelId}_${asset_id || filename}`;
          audioBuffersRef.current[bufferKey] = buffer;

          // Calculate offset: elapsed time modulo track duration for looping
          const elapsed = (Date.now() / 1000) - started_at;
          const offset = looping ? (elapsed % buffer.duration) : Math.min(elapsed, buffer.duration);

          // If non-looping track has already finished, don't play
          if (!looping && elapsed >= buffer.duration) {
            console.log(`⏹️ Sync: ${channelId} has already finished (non-looping)`);
            continue;
          }

          console.log(`▶️ Sync: starting ${channelId} at offset ${offset.toFixed(1)}s (elapsed: ${elapsed.toFixed(1)}s, duration: ${buffer.duration.toFixed(1)}s)`);

          await playRemoteTrack(channelId, filename, looping, volume, offset, {
            ...channelState,
            channelId,
          }, true);
        } else {
          console.warn(`⚠️ Sync: failed to load buffer for ${channelId}`);
        }
      } else if (playback_state === 'paused' && paused_elapsed != null) {
        // Load buffer to get duration for normalizing paused position
        const audioUrl = s3_url || `/audio/${filename}`;
        const buffer = await loadRemoteAudioBuffer(audioUrl, channelId);

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
          }
        }));
        console.log(`⏸️ Sync: ${channelId} paused at ${normalizedTime.toFixed(1)}s`);
      }
      // "stopped" channels with filename are already handled by the metadata update above
    }

    console.log('✅ Audio state sync complete');
  };

  // Load an asset from the library into a channel (DM selects via AudioTrackSelector)
  const loadAssetIntoChannel = (channelId, asset) => {
    setRemoteTrackStates(prev => ({
      ...prev,
      [channelId]: {
        ...prev[channelId],
        filename: asset.filename,
        asset_id: asset.id,
        s3_url: asset.s3_url,
      }
    }));
    console.log(`🎵 Loaded asset "${asset.filename}" into channel ${channelId}`);
  };

  // =====================================
  // SFX SOUNDBOARD FUNCTIONS
  // =====================================

  // Load an asset into a soundboard slot and pre-fetch its buffer
  const loadSfxSlot = async (slotIndex, asset) => {
    setSfxSlots(prev => prev.map((s, i) =>
      i === slotIndex ? { ...s, asset_id: asset.id, filename: asset.filename, s3_url: asset.s3_url } : s
    ));
    console.log(`🔊 Loaded SFX "${asset.filename}" into slot ${slotIndex}`);

    // Pre-fetch buffer for instant trigger response
    if (asset.s3_url) {
      const trackId = `sfx_slot_${slotIndex}`;
      const buffer = await loadRemoteAudioBuffer(asset.s3_url, trackId);
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
      buffer = await loadRemoteAudioBuffer(slot.s3_url, trackId);
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

  return {
    // Audio state
    isAudioUnlocked,
    masterVolume,
    setMasterVolume,

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

    // Late-joiner sync
    syncAudioState,

    // SFX Soundboard
    sfxSlots,
    playSfxSlot,
    stopSfxSlot,
    setSfxSlotVolume,
    loadSfxSlot,

    // Unified functions
    unlockAudio,
    cleanupAllAudio
  };
};