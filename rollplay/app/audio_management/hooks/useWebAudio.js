/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState, useEffect, useRef } from 'react';

export const useWebAudio = (externalMasterVolume = null) => {
  const [isAudioUnlocked, setIsAudioUnlocked] = useState(false);
  
  // Use external master volume if provided, otherwise use internal
  const masterVolume = externalMasterVolume !== null ? externalMasterVolume : (() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('rollplay_master_volume');
      return saved ? parseFloat(saved) : 0.5;
    }
    return 0.5;
  })();

  // Web Audio API context and nodes
  const audioContextRef = useRef(null);
  const masterGainRef = useRef(null);
  const trackGainsRef = useRef({});
  const audioBuffersRef = useRef({});
  const activeSourcesRef = useRef({});

  // Track states
  const [trackStates, setTrackStates] = useState({
    bgm: { playing: false, volume: 0.7, currentTrack: null },
    sfx: { playing: false, volume: 0.8, currentTrack: null }
  });

  // Initialize Web Audio API
  const initializeAudioContext = async () => {
    if (!audioContextRef.current) {
      try {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        
        // Create master gain node
        masterGainRef.current = audioContextRef.current.createGain();
        masterGainRef.current.connect(audioContextRef.current.destination);
        masterGainRef.current.gain.value = masterVolume;

        // Create gain nodes for each track type
        ['bgm', 'sfx'].forEach(type => {
          const gainNode = audioContextRef.current.createGain();
          gainNode.connect(masterGainRef.current);
          gainNode.gain.value = trackStates[type].volume;
          trackGainsRef.current[type] = gainNode;
        });

        console.log('🎵 Web Audio API initialized');
        return true;
      } catch (error) {
        console.warn('Web Audio API initialization failed:', error);
        return false;
      }
    }
    return true;
  };

  // Load audio file into buffer
  const loadAudioBuffer = async (url, trackType) => {
    if (!audioContextRef.current) return null;

    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
      
      audioBuffersRef.current[`${trackType}_${url}`] = audioBuffer;
      console.log(`📁 Loaded audio buffer for ${trackType}: ${url}`);
      return audioBuffer;
    } catch (error) {
      console.warn(`Failed to load audio: ${url}`, error);
      return null;
    }
  };

  // Play audio track
  const playTrack = async (trackType, audioFile, loop = true) => {
    if (!isAudioUnlocked) {
      console.warn('Audio context not unlocked yet');
      return false;
    }

    await initializeAudioContext();
    
    // Stop current track of this type
    if (activeSourcesRef.current[trackType]) {
      activeSourcesRef.current[trackType].stop();
      delete activeSourcesRef.current[trackType];
    }

    // Load audio buffer if not already loaded
    const bufferKey = `${trackType}_${audioFile}`;
    let audioBuffer = audioBuffersRef.current[bufferKey];
    
    if (!audioBuffer) {
      audioBuffer = await loadAudioBuffer(`/audio/${audioFile}`, trackType);
      if (!audioBuffer) return false;
    }

    try {
      // Create and configure source
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.loop = loop;
      source.connect(trackGainsRef.current[trackType]);
      
      // Start playback
      source.start(0);
      activeSourcesRef.current[trackType] = source;

      // Update state
      setTrackStates(prev => ({
        ...prev,
        [trackType]: {
          ...prev[trackType],
          playing: true,
          currentTrack: audioFile
        }
      }));

      console.log(`▶️ Playing ${trackType}: ${audioFile}`);
      return true;
    } catch (error) {
      console.warn(`Failed to play ${trackType}:`, error);
      return false;
    }
  };

  // Stop audio track
  const stopTrack = (trackType) => {
    if (activeSourcesRef.current[trackType]) {
      try {
        activeSourcesRef.current[trackType].stop();
        delete activeSourcesRef.current[trackType];
        
        setTrackStates(prev => ({
          ...prev,
          [trackType]: {
            ...prev[trackType],
            playing: false,
            currentTrack: null
          }
        }));

        console.log(`⏹️ Stopped ${trackType}`);
      } catch (error) {
        console.warn(`Failed to stop ${trackType}:`, error);
      }
    }
  };

  // Set track volume
  const setTrackVolume = (trackType, volume) => {
    if (trackGainsRef.current[trackType]) {
      trackGainsRef.current[trackType].gain.value = volume;
      setTrackStates(prev => ({
        ...prev,
        [trackType]: {
          ...prev[trackType],
          volume
        }
      }));
    }
  };

  // Update master volume
  useEffect(() => {
    if (masterGainRef.current) {
      masterGainRef.current.gain.value = masterVolume;
    }
    
    if (typeof window !== 'undefined') {
      localStorage.setItem('rollplay_master_volume', masterVolume.toString());
    }
  }, [masterVolume]);

  // Unlock audio context
  const unlockAudio = async () => {
    try {
      const success = await initializeAudioContext();
      if (success && audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      
      setIsAudioUnlocked(true);
      console.log('🔊 Web Audio unlocked successfully');
      return true;
    } catch (error) {
      console.warn('Web Audio unlock failed:', error);
      return false;
    }
  };

  return {
    isAudioUnlocked,
    unlockAudio,
    trackStates,
    playTrack,
    stopTrack,
    setTrackVolume
  };
};