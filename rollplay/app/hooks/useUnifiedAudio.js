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
  const audioBuffersRef = useRef({});
  const activeSourcesRef = useRef({});

  // Remote track states (for DM-controlled audio)
  const [remoteTrackStates, setRemoteTrackStates] = useState({
    music: { playing: false, volume: 0.7, currentTrack: null },
    ambient: { playing: false, volume: 0.6, currentTrack: null },
    sfx: { playing: false, volume: 0.8, currentTrack: null }
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

        // Create gain nodes for each remote track type
        ['music', 'ambient', 'sfx'].forEach(type => {
          const gainNode = audioContextRef.current.createGain();
          gainNode.connect(masterGainRef.current);
          gainNode.gain.value = remoteTrackStates[type].volume;
          remoteTrackGainsRef.current[type] = gainNode;
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
  const loadRemoteAudioBuffer = async (url, trackType) => {
    if (!audioContextRef.current) return null;

    try {
      console.log(`📁 Loading remote audio buffer: ${url}`);
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
      
      audioBuffersRef.current[`${trackType}_${url}`] = audioBuffer;
      console.log(`✅ Loaded remote audio buffer for ${trackType}: ${url}`);
      return audioBuffer;
    } catch (error) {
      console.warn(`❌ Failed to load remote audio: ${url}`, error);
      return null;
    }
  };

  // Play remote track (triggered by WebSocket events)
  const playRemoteTrack = async (trackType, audioFile, loop = true, volume = null) => {
    console.log(`🎵 Attempting to play remote track: ${trackType} - ${audioFile}`);
    console.log(`🔧 Audio state - isUnlocked: ${isAudioUnlocked}, audioContext: ${audioContextRef.current ? 'exists' : 'null'}, state: ${audioContextRef.current?.state}`);
    
    // Check if Web Audio context exists and is unlocked
    if (!audioContextRef.current || audioContextRef.current.state === 'suspended') {
      console.warn('Web Audio context not ready - cannot play remote audio');
      console.log('💡 User needs to interact with the page to unlock audio (click volume slider, sit in seat, etc.)');
      return false;
    }

    await initializeWebAudio();
    
    // Stop current track of this type
    if (activeSourcesRef.current[trackType]) {
      activeSourcesRef.current[trackType].stop();
      delete activeSourcesRef.current[trackType];
    }

    // Load audio buffer if not already loaded
    const bufferKey = `${trackType}_${audioFile}`;
    let audioBuffer = audioBuffersRef.current[bufferKey];
    
    if (!audioBuffer) {
      // For testing, use /audio/ path, but in production this would be a remote URL
      audioBuffer = await loadRemoteAudioBuffer(`/audio/${audioFile}`, trackType);
      if (!audioBuffer) return false;
    }

    try {
      // Create and configure source
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.loop = loop;
      source.connect(remoteTrackGainsRef.current[trackType]);
      
      // Start playback
      source.start(0);
      activeSourcesRef.current[trackType] = source;

      // Update state
      setRemoteTrackStates(prev => ({
        ...prev,
        [trackType]: {
          ...prev[trackType],
          playing: true,
          currentTrack: audioFile,
          volume: volume !== null ? volume : prev[trackType].volume
        }
      }));

      console.log(`▶️ Playing remote ${trackType}: ${audioFile} (loop: ${loop})`);
      return true;
    } catch (error) {
      console.warn(`Failed to play remote ${trackType}:`, error);
      return false;
    }
  };

  // Stop remote track
  const stopRemoteTrack = (trackType) => {
    if (activeSourcesRef.current[trackType]) {
      try {
        activeSourcesRef.current[trackType].stop();
        delete activeSourcesRef.current[trackType];
        
        setRemoteTrackStates(prev => ({
          ...prev,
          [trackType]: {
            ...prev[trackType],
            playing: false,
            currentTrack: null
          }
        }));

        console.log(`⏹️ Stopped remote ${trackType}`);
      } catch (error) {
        console.warn(`Failed to stop remote ${trackType}:`, error);
      }
    }
  };

  // Set remote track volume
  const setRemoteTrackVolume = (trackType, volume) => {
    if (remoteTrackGainsRef.current[trackType]) {
      remoteTrackGainsRef.current[trackType].gain.value = volume;
      setRemoteTrackStates(prev => ({
        ...prev,
        [trackType]: {
          ...prev[trackType],
          volume
        }
      }));
      console.log(`🔊 Set remote ${trackType} volume to ${Math.round(volume * 100)}%`);
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
    playRemoteTrack,
    stopRemoteTrack,
    setRemoteTrackVolume,
    
    // Unified functions
    unlockAudio
  };
};