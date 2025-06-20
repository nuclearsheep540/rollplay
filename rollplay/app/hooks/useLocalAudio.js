/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState, useEffect, useRef } from 'react';

export const useLocalAudio = () => {
  const [isAudioUnlocked, setIsAudioUnlocked] = useState(false);
  const [masterVolume, setMasterVolume] = useState(() => {
    // Load from localStorage or default to 0.5
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('rollplay_master_volume');
      return saved ? parseFloat(saved) : 0.5;
    }
    return 0.5;
  });

  // Audio elements for local sounds
  const audioElements = useRef({
    combatStart: null,
    seatClick: null,
  });

  // Initialize audio elements
  useEffect(() => {
    if (typeof window !== 'undefined') {
      audioElements.current = {
        combatStart: new Audio('/audio/sword.mp3'),
      };

      // Preload audio files
      Object.values(audioElements.current).forEach(audio => {
        if (audio) {
          audio.preload = 'auto';
          audio.volume = masterVolume;
        }
      });
    }
  }, []);

  // Update volume when masterVolume changes
  useEffect(() => {
    Object.values(audioElements.current).forEach(audio => {
      if (audio) {
        audio.volume = masterVolume;
      }
    });

    // Save to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('rollplay_master_volume', masterVolume.toString());
    }
  }, [masterVolume]);

  const unlockAudio = async () => {
    try {
      // Play silent audio to unlock audio context
      const silentAudio = new Audio();
      silentAudio.src = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmzhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmzhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmzhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmzhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhGS2Q1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+Dy';
      silentAudio.volume = 0;
      await silentAudio.play();
      
      setIsAudioUnlocked(true);
      console.log('🔊 Audio unlocked successfully');
      return true;
    } catch (error) {
      console.warn('Audio unlock failed:', error);
      return false;
    }
  };

  const playLocalSFX = (soundName, volume = null) => {
    if (!isAudioUnlocked) {
      console.warn('Audio not unlocked yet');
      return;
    }

    const audio = audioElements.current[soundName];
    if (audio) {
      try {
        // Use custom volume or master volume
        audio.volume = volume !== null ? volume * masterVolume : masterVolume;
        audio.currentTime = 0; // Reset to start
        audio.play().catch(e => console.warn('Audio play failed:', e));
      } catch (error) {
        console.warn(`Failed to play ${soundName}:`, error);
      }
    } else {
      console.warn(`Audio '${soundName}' not found`);
    }
  };

  return {
    isAudioUnlocked,
    masterVolume,
    setMasterVolume,
    unlockAudio,
    playLocalSFX
  };
};