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
 * 2. REMOTE AUDIO: DM-controlled audio (music, ambient, custom SFX)
 *    - Triggered by WebSocket events from DM
 *    - Uses Web Audio API for precise mixing
 * 
 * Both audio types respect the master volume slider
 */

export const useUnifiedAudio = () => {
  const [isAudioUnlocked, setIsAudioUnlocked] = useState(false);
  
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

  // A/B routing state - controls which track is sent to mix
  const [abRouting, setAbRouting] = useState({
    music: 'A',    // Either 'A' or 'B'
    ambient: 'A'   // Either 'A' or 'B'
  });

  // A/B sync state - when enabled, switching one group switches both
  const [abSyncEnabled, setAbSyncEnabled] = useState(false);

  // Remote track states (for DM-controlled audio) - A/B channel structure
  const [remoteTrackStates, setRemoteTrackStates] = useState({
    // Music A/B Channels
    audio_channel_1A: { playing: false, paused: false, volume: 0.9, filename: 'boss.mp3', type: 'music', channelGroup: 'music', track: 'A', currentTime: 0, duration: 0, looping: true },
    audio_channel_1B: { playing: false, paused: false, volume: 0.7, filename: 'shop.mp3', type: 'music', channelGroup: 'music', track: 'B', currentTime: 0, duration: 0, looping: true },
    // Ambient A/B Channels  
    audio_channel_2A: { playing: false, paused: false, volume: 0.9, filename: 'storm.mp3', type: 'ambient', channelGroup: 'ambient', track: 'A', currentTime: 0, duration: 0, looping: true },
    audio_channel_2B: { playing: false, paused: false, volume: 0.7, filename: 'zelda_night_loop.mp3', type: 'ambient', channelGroup: 'ambient', track: 'B', currentTime: 0, duration: 0, looping: true },
    // SFX Channels (unchanged)
    audio_channel_3: { playing: false, paused: false, volume: 0.9, filename: 'sword.mp3', type: 'sfx', currentTime: 0, duration: 0, looping: false },
    audio_channel_4: { playing: false, paused: false, volume: 0.9, filename: 'enemy_hit_cinematic.mp3', type: 'sfx', currentTime: 0, duration: 0, looping: false },
    audio_channel_5: { playing: false, paused: false, volume: 0.9, filename: 'link_attack.mp3', type: 'sfx', currentTime: 0, duration: 0, looping: false },
    audio_channel_6: { playing: false, paused: false, volume: 0.9, filename: 'link_fall.mp3', type: 'sfx', currentTime: 0, duration: 0, looping: false }

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
  const playRemoteTrack = async (trackId, audioFile, loop = true, volume = null) => {
    console.log(`🎵 Attempting to play remote track: ${trackId} - ${audioFile}`);
    console.log(`🔧 Audio state - isUnlocked: ${isAudioUnlocked}, audioContext: ${audioContextRef.current ? 'exists' : 'null'}, state: ${audioContextRef.current?.state}`);
    
    // Check if Web Audio context exists and is unlocked
    if (!audioContextRef.current || audioContextRef.current.state === 'suspended') {
      console.warn('Web Audio context not ready - cannot play remote audio');
      console.log('💡 User needs to interact with the page to unlock audio (click volume slider, sit in seat, etc.)');
      return false;
    }

    await initializeWebAudio();
    
    // Stop current track of this ID
    if (activeSourcesRef.current[trackId]) {
      activeSourcesRef.current[trackId].stop();
      delete activeSourcesRef.current[trackId];
    }

    // Load audio buffer if not already loaded
    const bufferKey = `${trackId}_${audioFile}`;
    let audioBuffer = audioBuffersRef.current[bufferKey];
    
    if (!audioBuffer) {
      // For testing, use /audio/ path, but in production this would be a remote URL
      audioBuffer = await loadRemoteAudioBuffer(`/audio/${audioFile}`, trackId);
      if (!audioBuffer) return false;
    }

    try {
      // Create and configure source
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      
      // SFX tracks (channels 3,4) are hardcoded to never loop
      const trackType = remoteTrackStates[trackId]?.type;
      const shouldLoop = trackType === 'sfx' ? false : (remoteTrackStates[trackId]?.looping ?? loop);
      source.loop = shouldLoop;
      source.connect(remoteTrackGainsRef.current[trackId]);
      
      // Handle resume from pause vs fresh start
      const resumeFromPause = remoteTrackStates[trackId]?.paused && remoteTrackStates[trackId]?.currentTime > 0;
      const startOffset = resumeFromPause ? remoteTrackStates[trackId].currentTime : 0;
      
      // Start playback (for Web Audio, we need to start from beginning and track offset)
      source.start(0, startOffset);
      activeSourcesRef.current[trackId] = source;

      // Get duration from audio buffer
      const duration = audioBuffer.duration;

      // Update state with duration
      setRemoteTrackStates(prev => ({
        ...prev,
        [trackId]: {
          ...prev[trackId],
          playing: true,
          filename: audioFile,
          volume: volume !== null ? volume : prev[trackId]?.volume || 0.7,
          currentTime: 0,
          duration: duration
        }
      }));

      // Initialize timing for this track
      const startTime = audioContextRef.current.currentTime;
      const pausedTime = resumeFromPause ? startOffset : 0;
      
      trackTimersRef.current[trackId] = {
        startTime,
        pausedTime,
        duration,
        loop: shouldLoop, // Use the same shouldLoop value as the source
        lastUpdateTime: startTime
      };

      // Start time tracking with proper loop handling
      const updateTime = () => {
        if (activeSourcesRef.current[trackId] === source && trackTimersRef.current[trackId]) {
          const timer = trackTimersRef.current[trackId];
          const elapsed = audioContextRef.current.currentTime - timer.startTime + timer.pausedTime;
          
          let currentTime;
          let shouldContinueUpdating = true;
          
          if (timer.loop && timer.duration > 0) {
            // For looping tracks, use modulo to cycle through the duration
            currentTime = elapsed % timer.duration;
          } else {
            // For non-looping tracks, clamp to duration
            currentTime = Math.min(elapsed, timer.duration);
            
            // Check if non-looped track has finished
            if (elapsed >= timer.duration && timer.duration > 0) {
              console.log(`⏹️ Non-looped ${trackId} track finished, auto-stopping`);
              shouldContinueUpdating = false;
              
              // Auto-stop the track
              if (activeSourcesRef.current[trackId]) {
                try {
                  activeSourcesRef.current[trackId].stop();
                  delete activeSourcesRef.current[trackId];
                } catch (e) {
                  console.warn('Error auto-stopping finished track:', e);
                }
              }
              
              // Clean up timer
              delete trackTimersRef.current[trackId];
              
              // Update state to stopped and reset time for next play
              setRemoteTrackStates(prev => ({
                ...prev,
                [trackId]: {
                  ...prev[trackId],
                  playing: false,
                  paused: false,
                  currentTime: 0, // Reset to start for next playback
                  duration: 0 // Reset duration as well
                }
              }));
              
              return; // Stop the update loop
            }
          }
          
          // Update current time if track is still playing
          setRemoteTrackStates(prev => ({
            ...prev,
            [trackId]: {
              ...prev[trackId],
              currentTime: currentTime,
              paused: false
            }
          }));

          // Continue updating if track is still active and should continue
          if (activeSourcesRef.current[trackId] === source && shouldContinueUpdating) {
            requestAnimationFrame(updateTime);
          }
        }
      };
      requestAnimationFrame(updateTime);

      console.log(`▶️ Playing remote ${trackId}: ${audioFile} (loop: ${shouldLoop})`);
      return true;
    } catch (error) {
      console.warn(`Failed to play remote ${trackId}:`, error);
      return false;
    }
  };

  // Stop remote track
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
            playing: false,
            paused: false,
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
            playing: false,
            paused: true,
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
    
    setRemoteTrackStates(prev => ({
      ...prev,
      [trackId]: {
        ...prev[trackId],
        looping
      }
    }));
    console.log(`🔄 Set remote ${trackId} looping to ${looping ? 'enabled' : 'disabled'}`);
  };

  // Switch A/B routing for a channel group (state only)
  const switchABRouting = (channelGroup, newTrack) => {
    console.log(`🔀 Updating routing state: ${channelGroup} to ${newTrack}`);
    
    if (abSyncEnabled && (channelGroup === 'music' || channelGroup === 'ambient')) {
      // Sync mode: switch both music and ambient together
      setAbRouting(prev => ({
        ...prev,
        music: newTrack,
        ambient: newTrack
      }));
      console.log(`🔗 Sync enabled: routing both music and ambient to ${newTrack}`);
    } else {
      // Independent mode: switch only the requested channel group
      setAbRouting(prev => ({
        ...prev,
        [channelGroup]: newTrack
      }));
    }
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
    pauseRemoteTrack,
    stopRemoteTrack,
    setRemoteTrackVolume,
    toggleRemoteTrackLooping,
    
    // A/B routing functions
    abRouting,
    abSyncEnabled,
    setAbSyncEnabled,
    switchABRouting,
    
    // Unified functions
    unlockAudio
  };
};