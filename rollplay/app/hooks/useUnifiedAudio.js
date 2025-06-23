/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState, useEffect, useRef } from 'react';

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

// Playback state enum to avoid boolean conflicts
export const PlaybackState = {
  STOPPED: 'stopped',
  PLAYING: 'playing', 
  PAUSED: 'paused'
};


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


  // Remote track states (for DM-controlled audio) - A/B/C/D BGM + SFX channels
  const [remoteTrackStates, setRemoteTrackStates] = useState({
    // BGM Channels
    audio_channel_A: { playbackState: PlaybackState.STOPPED, volume: 0.8, filename: 'boss.mp3', type: 'bgm', channelGroup: 'bgm', track: 'A', currentTime: 0, duration: 0, looping: true },
    audio_channel_B: { playbackState: PlaybackState.STOPPED, volume: 0.8, filename: 'shop.mp3', type: 'bgm', channelGroup: 'bgm', track: 'B', currentTime: 0, duration: 0, looping: true },
    audio_channel_C: { playbackState: PlaybackState.STOPPED, volume: 0.8, filename: 'storm.mp3', type: 'bgm', channelGroup: 'bgm', track: 'C', currentTime: 0, duration: 0, looping: true },
    audio_channel_D: { playbackState: PlaybackState.STOPPED, volume: 0.8, filename: 'zelda_night_loop.mp3', type: 'bgm', channelGroup: 'bgm', track: 'D', currentTime: 0, duration: 0, looping: true },
    // SFX Channels (unchanged)
    audio_channel_3: { playbackState: PlaybackState.STOPPED, volume: 0.8, filename: 'sword.mp3', type: 'sfx', currentTime: 0, duration: 0, looping: false },
    audio_channel_4: { playbackState: PlaybackState.STOPPED, volume: 0.8, filename: 'enemy_hit_cinematic.mp3', type: 'sfx', currentTime: 0, duration: 0, looping: false },
    audio_channel_5: { playbackState: PlaybackState.STOPPED, volume: 0.8, filename: 'link_attack.mp3', type: 'sfx', currentTime: 0, duration: 0, looping: false },
    audio_channel_6: { playbackState: PlaybackState.STOPPED, volume: 0.8, filename: 'link_fall.mp3', type: 'sfx', currentTime: 0, duration: 0, looping: false }

  });

  // Initialize Web Audio API for remote tracks
  const initializeWebAudio = async () => {
    if (!audioContextRef.current) {
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

        console.log('🎵 Web Audio API initialized for remote tracks');
        return true;
      } catch (error) {
        console.warn('Web Audio API initialization failed:', error);
        return false;
      }
    }
    return true;
  };

  // Load remote audio buffer
  const loadRemoteAudioBuffer = async (url, trackId) => {
    if (!audioContextRef.current) return null;

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

  // Play remote track (triggered by WebSocket events)
  const playRemoteTrack = async (trackId, audioFile, loop = true, volume = null, resumeFromTime = null, completeTrackState = null, skipBufferLoad = false, syncStartTime = null) => {
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
  
      // Check if Web Audio context exists and is unlocked
      if (
        !audioContextRef.current ||
        audioContextRef.current.state === 'suspended'
      ) {
        console.warn('Web Audio context not ready - cannot play remote audio');
        console.log(
          '💡 User needs to interact with the page to unlock audio ' +
          '(click volume slider, sit in seat, etc.)'
        );
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
      const bufferKey = `${trackId}_${audioFile}`;
      let audioBuffer = audioBuffersRef.current[bufferKey];
      
      if (skipBufferLoad) {
        console.log(`⚡ [${operationId}] Skipping buffer load (synchronized playback) - using pre-loaded buffer`);
        if (!audioBuffer) {
          console.error(`❌ [${operationId}] Expected pre-loaded buffer not found for ${trackId}`);
          return false;
        }
      } else if (!audioBuffer) {
        console.log(
          `📁 [${operationId}] Loading remote audio buffer: /audio/${audioFile}`
        );
        audioBuffer = await loadRemoteAudioBuffer(`/audio/${audioFile}`, trackId);
        if (!audioBuffer) return false;
        audioBuffersRef.current[bufferKey] = audioBuffer;
      } else {
        console.log(
          `♻️ [${operationId}] Using cached audio buffer: /audio/${audioFile}`
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
  
      // Connect to the track’s gain node
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
      setRemoteTrackStates((prev) => ({
        ...prev,
        [trackId]: {
          ...prev[trackId],
          playbackState: PlaybackState.PLAYING,
          filename: audioFile,
          volume:
            volume !== null ? volume : prev[trackId]?.volume ?? 0.7,
          currentTime: startOffset,
          duration
        }
      }));
  
      // Set up our time‐update loop
      const startTime = audioContextRef.current.currentTime;
      const pausedTime = resumeFromPause ? startOffset : 0;
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
  const stopRemoteTrack = (trackId) => {
    if (activeSourcesRef.current[trackId]) {
      try {
        activeSourcesRef.current[trackId].stop();
        delete activeSourcesRef.current[trackId];
        
        // Clean up timer
        delete trackTimersRef.current[trackId];
        
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
      silentAudio.src = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmzhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmzhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmzhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+Dy';
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
    
    // Pending operation management
    setClearPendingOperationCallback,
    
    // Unified functions
    unlockAudio
  };
};