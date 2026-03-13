/*
 * AudioMixerPanel.jsx
 *
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import React, { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import AudioTrack from './AudioTrack';
import AudioTrackSelector from './AudioTrackSelector';
import SfxSoundboard from './SfxSoundboard';
import { PlaybackState, ChannelType, DEFAULT_EFFECTS } from '../types';
import {
  DM_CHILD,
  PANEL_CHILD,
} from '../../styles/constants';

const FADE_ANIMATION_THRESHOLD = 1000; // ms — don't animate progress for fades shorter than this

const FadeProgressButton = memo(function FadeProgressButton({ isFadeArmed, fadeInfo, onToggle, label, title }) {
  const [progress, setProgress] = useState(0);
  const rafRef = useRef(null);

  const showProgress = fadeInfo && fadeInfo.duration >= FADE_ANIMATION_THRESHOLD;

  useEffect(() => {
    if (!showProgress) {
      setProgress(0);
      return;
    }

    const animate = () => {
      const elapsed = performance.now() - fadeInfo.startTime;
      const p = Math.min(elapsed / fadeInfo.duration, 1.0);
      setProgress(p);
      if (p < 1.0) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [showProgress, fadeInfo]);

  return (
    <button
      className={`relative w-full h-8 text-xs font-bold rounded transition-colors border overflow-hidden ${
        showProgress
          ? 'bg-gray-700 text-white border-yellow-500'
          : isFadeArmed
            ? 'bg-yellow-600 text-white border-yellow-500 hover:bg-yellow-700'
            : 'bg-gray-600 text-gray-300 border-gray-500 hover:bg-gray-500'
      }`}
      onClick={onToggle}
      title={title}
    >
      {showProgress && (
        <div
          className="absolute inset-0 bg-yellow-600 origin-left"
          style={{ width: `${progress * 100}%` }}
        />
      )}
      <span className="relative z-10">{label}</span>
    </button>
  );
});

export default function AudioMixerPanel({
  isExpanded,
  onToggle,
  remoteTrackStates = {},
  sendRemoteAudioBatch,
  remoteTrackAnalysers = {},
  unlockAudio = null,
  isAudioUnlocked = false,
  clearPendingOperation = null,
  loadAssetIntoChannel = null,
  campaignId = null,
  // SFX Soundboard
  sfxSlots = [],
  loadSfxSlot = null,
  clearSfxSlot = null,
  setSfxSlotVolume = null,
  setRemoteTrackVolume = null,
  activeFades = {},
  // Channel effects (HPF, LPF, Reverb)
  channelEffects = {},
  applyChannelEffects = null,
  // Channel mute/solo
  mutedChannels = {},
  soloedChannels = {},
  setChannelMuted = null,
  setChannelSoloed = null,
}) {
  


  // Track pending audio operations to disable buttons
  const [pendingOperations, setPendingOperations] = useState(new Set());
  
  // Wrap loadAssetIntoChannel to also persist to server via WebSocket
  // Backend handles config restoration: if this track was previously used in the session,
  // saved config (volume, effects, looping) is restored from audio_track_config in MongoDB.
  // Asset defaults are sent as fallback for first-time loads.
  const handleAssetSelected = useCallback((channelId, asset) => {
    // Load locally into audio state (applies asset defaults for immediate responsiveness;
    // backend broadcast will correct with restored config if available)
    if (loadAssetIntoChannel) {
      loadAssetIntoChannel(channelId, asset);
    }
    // Single load operation — backend decides whether to use these defaults or restore saved config
    if (sendRemoteAudioBatch) {
      const effects = (asset.effect_hpf_enabled !== undefined || asset.effect_lpf_enabled !== undefined || asset.effect_reverb_enabled !== undefined)
        ? {
            hpf: asset.effect_hpf_enabled || false,
            lpf: asset.effect_lpf_enabled || false,
            reverb: asset.effect_reverb_enabled || false,
          }
        : {};

      sendRemoteAudioBatch([{
        trackId: channelId,
        operation: 'load',
        filename: asset.filename,
        asset_id: asset.id,
        s3_url: asset.s3_url,
        volume: asset.default_volume ?? 0.8,
        looping: asset.default_looping ?? true,
        effects,
      }]);
    }
  }, [loadAssetIntoChannel, sendRemoteAudioBatch]);

  // Clear a BGM channel — stop audio, reset asset, effects, mute/solo
  const handleBgmClear = useCallback((channelId) => {
    if (loadAssetIntoChannel) {
      loadAssetIntoChannel(channelId, { id: null, filename: null, s3_url: null });
    }
    // Reset effects to all-off
    if (applyChannelEffects) {
      applyChannelEffects(channelId, { hpf: false, lpf: false, reverb: false });
    }
    // Reset mute/solo
    if (setChannelMuted) setChannelMuted(channelId, false);
    if (setChannelSoloed) setChannelSoloed(channelId, false);
    sendRemoteAudioBatch?.([{ trackId: channelId, operation: 'clear' }]);
  }, [loadAssetIntoChannel, applyChannelEffects, setChannelMuted, setChannelSoloed, sendRemoteAudioBatch]);

  // Collect asset IDs currently loaded in any BGM channel (for filtering the selection modal)
  const loadedAssetIds = useMemo(() => {
    const ids = new Set();
    Object.values(remoteTrackStates).forEach(state => {
      if (state?.asset_id) ids.add(state.asset_id);
    });
    return ids;
  }, [remoteTrackStates]);

  // Cue system state
  const [currentCue, setCurrentCue] = useState(null); // { targetTracks: [channelId, ...] }
  const [trackFadeStates, setTrackFadeStates] = useState({}); // Per-track fade configuration { trackId: boolean }
  const [fadeDuration, setFadeDuration] = useState(1000); // Global fade duration in ms
  const fadeRepeatRef = useRef(null);

  const startFadeRepeat = useCallback((delta) => {
    setFadeDuration(prev => Math.min(10000, Math.max(100, prev + delta)));
    const timeout = setTimeout(() => {
      fadeRepeatRef.current = setInterval(() => {
        setFadeDuration(prev => Math.min(10000, Math.max(100, prev + delta)));
      }, 75);
    }, 400);
    fadeRepeatRef.current = timeout;
  }, []);

  const stopFadeRepeat = useCallback(() => {
    clearTimeout(fadeRepeatRef.current);
    clearInterval(fadeRepeatRef.current);
    fadeRepeatRef.current = null;
  }, []);

  // Effective cue: when null, mirrors PGM (currently playing tracks)
  const pgmTargetTracks = useMemo(() =>
    Object.keys(remoteTrackStates).filter(id => {
      const state = remoteTrackStates[id]?.playbackState;
      return state === PlaybackState.PLAYING || state === PlaybackState.TRANSITIONING;
    }),
    [remoteTrackStates]
  );
  const effectiveCueTargets = currentCue?.targetTracks ?? pgmTargetTracks;

  // Auto-reset cue once PGM catches up to the intended state
  useEffect(() => {
    if (!currentCue?.targetTracks) return;
    const cue = currentCue.targetTracks;
    if (cue.length === pgmTargetTracks.length && cue.every(id => pgmTargetTracks.includes(id))) {
      setCurrentCue(null);
    }
  }, [currentCue, pgmTargetTracks]);

  // Helper to add pending operation
  const addPendingOperation = (operation) => {
    setPendingOperations(prev => new Set(prev).add(operation));
    
    // Auto-clear after 5 seconds (timeout fallback)
    setTimeout(() => {
      setPendingOperations(prev => {
        const newSet = new Set(prev);
        newSet.delete(operation);
        return newSet;
      });
    }, 5000);
  };
  
  // Helper to clear pending operation (memoized to prevent unnecessary re-renders)
  const clearPendingOperationLocal = useCallback((operation) => {
    setPendingOperations(prev => {
      const newSet = new Set(prev);
      newSet.delete(operation);
      return newSet;
    });
  }, []);
  
  // Expose clear function to parent component
  useEffect(() => {
    if (clearPendingOperation) {
      clearPendingOperation(clearPendingOperationLocal);
    }
  }, [clearPendingOperation, clearPendingOperationLocal]);
  
  // Auto-clear pending operations when track states change (WebSocket responses)
  useEffect(() => {
    // Clear pending operations when tracks reach their expected final state
    Object.keys(remoteTrackStates).forEach(trackId => {
      const trackState = remoteTrackStates[trackId];
      
      // Clear play operation when track starts playing
      if (trackState.playbackState === PlaybackState.PLAYING) {
        clearPendingOperationLocal(`play_${trackId}`);
      }
      
      // Clear pause operation when track is paused
      if (trackState.playbackState === PlaybackState.PAUSED) {
        clearPendingOperationLocal(`pause_${trackId}`);
      }
      
      // Clear stop operation when track is stopped
      if (trackState.playbackState === PlaybackState.STOPPED) {
        clearPendingOperationLocal(`stop_${trackId}`);
      }
    });
  }, [remoteTrackStates]);

  

  // Crossfade execution function (memoized to prevent re-renders)
  const executeCrossfade = useCallback(async () => {
    if (!currentCue?.targetTracks?.length) return;
    
    console.log(`🎚️ Executing seamless crossfade transition: PGM → PFL`);
    
    // Get channels arrays (recalculated from current remoteTrackStates)
    const currentChannels = Object.keys(remoteTrackStates).map(channelId => {
      const trackState = remoteTrackStates[channelId];
      return {
        channelId,
        type: trackState.type,
        channelGroup: trackState.channelGroup,
        track: trackState.track
      };
    });
    
    const currentBgmChannels = currentChannels.filter(ch => ch.type === 'bgm');
    
    // Get tracks that need to start and stop
    const tracksToStart = currentBgmChannels.filter(channel => {
      const state = remoteTrackStates[channel.channelId]?.playbackState;
      const isActive = state === PlaybackState.PLAYING || state === PlaybackState.TRANSITIONING;
      const isSelectedInPFL = currentCue.targetTracks.includes(channel.channelId);
      return isSelectedInPFL && !isActive; // Will start
    });

    const tracksToStop = currentBgmChannels.filter(channel => {
      const state = remoteTrackStates[channel.channelId]?.playbackState;
      const isActive = state === PlaybackState.PLAYING || state === PlaybackState.TRANSITIONING;
      const isSelectedInPFL = currentCue.targetTracks.includes(channel.channelId);
      return !isSelectedInPFL && isActive; // Will stop
    });
    
    console.log(`🎚️ Tracks to start:`, tracksToStart.map(t => t.channelId));
    console.log(`🎚️ Tracks to stop:`, tracksToStop.map(t => t.channelId));
    
    try {
      // Create batch operations for seamless crossfade
      const batchOperations = [];
      
      // Add play operations for tracks to start
      tracksToStart.forEach(channel => {
        const track = remoteTrackStates[channel.channelId];
        batchOperations.push({
          trackId: channel.channelId,
          operation: 'play',
          filename: track.filename,
          asset_id: track.asset_id,
          s3_url: track.s3_url,
          looping: track.looping ?? (track.type !== 'sfx'),
          volume: track.volume,
          type: track.type,
          channelGroup: track.channelGroup,
          track: track.track
        });
      });
      
      // Add stop operations for tracks to stop (with slight delay for seamless handoff)
      if (tracksToStop.length > 0 && tracksToStart.length > 0) {
        // For crossfade: start new tracks first, then stop old ones after brief delay
        console.log(`🎚️ Executing batch crossfade: ${tracksToStart.length} starting, ${tracksToStop.length} stopping after delay`);
        
        // Send start operations first
        const startOperations = batchOperations.filter(op => op.operation === 'play');
        if (startOperations.length > 0) {
          sendRemoteAudioBatch?.(startOperations);
        }
        
        // Stop old tracks after brief delay for seamless handoff
        setTimeout(() => {
          const stopOperations = tracksToStop.map(channel => ({
            trackId: channel.channelId,
            operation: 'stop'
          }));
          sendRemoteAudioBatch?.(stopOperations);
          console.log(`✅ Seamless crossfade completed`);
        }, 100); // 100ms delay for audio buffer stabilization
      } else {
        // No crossfade needed, just execute all operations at once
        // Add stop operations for tracks to stop (when no tracks are starting)
        tracksToStop.forEach(channel => {
          batchOperations.push({
            trackId: channel.channelId,
            operation: 'stop'
          });
        });
        
        console.log(`🎚️ Executing batch audio operations: ${batchOperations.length} operations`);
        if (batchOperations.length > 0) {
          sendRemoteAudioBatch?.(batchOperations);
        }
      }
      
    } catch (error) {
      console.error(`❌ Crossfade failed:`, error);
      
      // Fallback: If new tracks fail to start, don't stop old ones
      console.log(`⚠️ Keeping current tracks playing due to crossfade error`);
    }
    
    // Keep cue as-is — optimistic render until PGM catches up
  }, [currentCue, remoteTrackStates, sendRemoteAudioBatch]);


  const executeFade = () => {
    if (!currentCue) return;
    
    console.log(`🌊 Executing FADE transition with ${fadeDuration}ms duration:`, currentCue);
    
    // Calculate tracks to start/stop based on targetTracks (same logic as createCue)
    const targetTracks = currentCue.targetTracks || [];
    
    const tracksToStart = targetTracks.filter(trackId => 
      remoteTrackStates[trackId]?.playbackState !== PlaybackState.PLAYING
    );
    
    const tracksToStop = Object.keys(remoteTrackStates).filter(trackId => {
      const track = remoteTrackStates[trackId];
      // Stop tracks that are playing but not in the new target list
      return track.playbackState === PlaybackState.PLAYING && 
             !targetTracks.includes(trackId);
    });
    
    console.log(`🌊 Fade tracks to start:`, tracksToStart);
    console.log(`🌊 Fade tracks to stop:`, tracksToStop);
    
    // Create batch operations with fade flags
    const batchOperations = [];
    
    // Add stop operations (fade out)
    tracksToStop.forEach(trackId => {
      const hasFade = trackFadeStates[trackId];
      console.log(`🌊 Track ${trackId} fade state:`, hasFade, `trackFadeStates:`, trackFadeStates);
      const stopOp = {
        trackId,
        operation: 'stop',
        fade: hasFade || false
      };
      console.log(`🌊 Creating stop operation:`, stopOp);
      batchOperations.push(stopOp);
    });
    
    // Add play operations (fade in)
    tracksToStart.forEach(trackId => {
      const track = remoteTrackStates[trackId];
      const hasFade = trackFadeStates[trackId];
      console.log(`🌊 Track ${trackId} fade state:`, hasFade);
      batchOperations.push({
        trackId,
        operation: 'play',
        filename: track.filename,
        asset_id: track.asset_id,
        s3_url: track.s3_url,
        looping: track.looping ?? (track.type !== 'sfx'),
        volume: track.volume,
        type: track.type,
        channelGroup: track.channelGroup,
        track: track.track,
        fade: hasFade || false
      });
    });
    
    // Execute with fade duration
    if (batchOperations.length > 0) {
      console.log(`🌊 Executing ${batchOperations.length} fade operations:`, batchOperations);
      sendRemoteAudioBatch?.(batchOperations, fadeDuration);
    }
    
    // Keep cue as-is — optimistic render until PGM catches up
  };


  // Stop all BGM tracks using batch operation
  const stopAllTracks = () => {
    const allTrackIds = Object.keys(remoteTrackStates);
    console.log(`🛑 Stopping all BGM tracks:`, allTrackIds);
    
    // Create batch operations to stop all tracks
    const stopOperations = allTrackIds.map(trackId => ({
      trackId,
      operation: 'stop'
    }));
    
    // Send batch stop command
    sendRemoteAudioBatch?.(stopOperations);
  };

  // Volume change handler — WebSocket only, asset persistence handled by ETL on session pause/finish
  const handleVolumeChange = (channelId, volume) => {
    sendRemoteAudioBatch?.([{ trackId: channelId, operation: 'volume', volume }]);
  };

  // Handle loop toggle with WebSocket broadcast (server-authoritative)
  const handleLoopToggle = (trackId, looping) => {
    const operationKey = `loop_${trackId}`;
    
    // Don't allow if operation is already pending
    if (pendingOperations.has(operationKey)) {
      console.log(`⏳ Loop operation already pending for ${trackId}`);
      return;
    }
    
    // Mark operation as pending
    addPendingOperation(operationKey);
    
    // Only broadcast to server - no local state update
    // Server response will update state via handleRemoteAudioLoop
    const loopOperation = [{
      trackId,
      operation: 'loop',
      looping
    }];
    sendRemoteAudioBatch?.(loopOperation);
  };

  // Channel effects toggle handler
  // Effects shape is slim: { hpf: true/false, lpf: true/false, reverb: true/false }
  // Parameters (frequency, mix, preset) are app-defined in DEFAULT_EFFECTS — never stored in DB.
  const handleEffectToggle = useCallback((trackId, effectType) => {
    const currentEffects = channelEffects[trackId] || {
      hpf: DEFAULT_EFFECTS.hpf.enabled,
      lpf: DEFAULT_EFFECTS.lpf.enabled,
      reverb: DEFAULT_EFFECTS.reverb.enabled,
    };
    const newEnabled = !currentEffects[effectType];

    const updatedEffects = {
      ...currentEffects,
      [effectType]: newEnabled,
    };

    // Apply locally (applyChannelEffects merges flags with DEFAULT_EFFECTS internally)
    if (applyChannelEffects) {
      applyChannelEffects(trackId, updatedEffects);
    }

    // Broadcast slim flags to all clients
    sendRemoteAudioBatch?.([{
      trackId,
      operation: 'effects',
      effects: updatedEffects,
    }]);
  }, [channelEffects, applyChannelEffects, sendRemoteAudioBatch]);

  // Channel mute/solo handlers — toggle locally + broadcast via WebSocket
  const handleMuteToggle = useCallback((channelId) => {
    const newMuted = !mutedChannels[channelId];
    if (setChannelMuted) setChannelMuted(channelId, newMuted);
    sendRemoteAudioBatch?.([{
      trackId: channelId,
      operation: 'mute',
      muted: newMuted,
    }]);
  }, [mutedChannels, sendRemoteAudioBatch, setChannelMuted]);

  const handleSoloToggle = useCallback((channelId) => {
    const newSoloed = !soloedChannels[channelId];
    if (setChannelSoloed) setChannelSoloed(channelId, newSoloed);
    sendRemoteAudioBatch?.([{
      trackId: channelId,
      operation: 'solo',
      soloed: newSoloed,
    }]);
  }, [soloedChannels, sendRemoteAudioBatch, setChannelSoloed]);

  // SFX Soundboard handlers
  const handleSfxTrigger = async (slotIndex) => {
    if (!isAudioUnlocked) {
      const unlocked = await unlockAudio();
      if (!unlocked) return;
    }
    const slot = sfxSlots[slotIndex];
    if (!slot?.filename) return;

    sendRemoteAudioBatch?.([{
      trackId: `sfx_slot_${slotIndex}`,
      operation: 'play',
      filename: slot.filename,
      asset_id: slot.asset_id,
      s3_url: slot.s3_url,
      volume: slot.volume,
      looping: false,
    }]);
  };

  // SFX volume — WebSocket only, asset persistence handled by ETL on session pause/finish
  const handleSfxVolumeChange = (slotIndex, volume) => {
    sendRemoteAudioBatch?.([{ trackId: `sfx_slot_${slotIndex}`, operation: 'volume', volume }]);
  };

  const handleSfxAssetSelected = useCallback((slotIndex, asset) => {
    if (loadSfxSlot) loadSfxSlot(slotIndex, asset);
    sendRemoteAudioBatch?.([{
      trackId: `sfx_slot_${slotIndex}`,
      operation: 'load',
      filename: asset.filename,
      asset_id: asset.id,
      s3_url: asset.s3_url,
      volume: asset.default_volume ?? 0.8,
    }]);
  }, [loadSfxSlot, sendRemoteAudioBatch]);

  const handleSfxClear = useCallback((slotIndex) => {
    if (clearSfxSlot) clearSfxSlot(slotIndex);
    sendRemoteAudioBatch?.([{
      trackId: `sfx_slot_${slotIndex}`,
      operation: 'clear',
    }]);
  }, [clearSfxSlot, sendRemoteAudioBatch]);

  // Dynamically generate BGM channels from remoteTrackStates
  const bgmChannels = Object.keys(remoteTrackStates).map(channelId => {
    const trackState = remoteTrackStates[channelId];
    const { channelGroup, track } = trackState;
    const label = channelGroup && track
      ? `${channelGroup.charAt(0).toUpperCase() + channelGroup.slice(1)} Track ${track}`
      : 'BGM Channel';
    return { channelId, type: ChannelType.BGM, channelGroup, track, label };
  });


  // Simplified play handler using centralized sync logic
  const handlePlay = async (channel) => {
    const operationKey = `play_${channel.channelId}`;
    
    // Don't allow if operation is already pending
    if (pendingOperations.has(operationKey)) {
      console.log(`⏳ Play operation already pending for ${channel.channelId}`);
      return;
    }
    
    // Mark operation as pending
    addPendingOperation(operationKey);
    
    // Ensure audio is unlocked before playing
    if (!isAudioUnlocked) {
      console.log('🔓 Unlocking audio for play action...');
      const unlocked = await unlockAudio();
      if (!unlocked) {
        console.warn('❌ Failed to unlock audio - cannot play');
        clearPendingOperationLocal(operationKey);
        return;
      }
    }
    
    const channelState = remoteTrackStates[channel.channelId];
    if (!channelState?.filename) {
      console.warn(`No audio file loaded in ${channel.channelId}`);
      clearPendingOperationLocal(operationKey);
      return;
    }
    
    // Simple individual track operation (sync removed - use cue system for multi-track)
    const trackState = remoteTrackStates[channel.channelId];
    
    if (!trackState) {
      console.warn(`❌ No track state found for ${channel.channelId}`);
      clearPendingOperationLocal(operationKey);
      return;
    }
    
    // Determine if track is paused (should resume instead of fresh play)
    const shouldResume = trackState.playbackState === PlaybackState.PAUSED;
    
    if (shouldResume) {
      // Resume single track
      const resumeOperation = [{
        trackId: channel.channelId,
        operation: 'resume'
      }];
      sendRemoteAudioBatch?.(resumeOperation);
    } else {
      // Play single track
      const playOperation = [{
        trackId: channel.channelId,
        operation: 'play',
        filename: trackState.filename,
        asset_id: trackState.asset_id,
        s3_url: trackState.s3_url,
        looping: trackState.looping,
        volume: trackState.volume,
        type: trackState.type,
        channelGroup: trackState.channelGroup,
        track: trackState.track
      }];
      sendRemoteAudioBatch?.(playOperation);
    }
  };
  // Simplified pause handler for individual tracks
  const handlePause = (channel) => {
    const operationKey = `pause_${channel.channelId}`;
    
    // Don't allow if operation is already pending
    if (pendingOperations.has(operationKey)) {
      console.log(`⏳ Pause operation already pending for ${channel.channelId}`);
      return;
    }
    
    // Mark operation as pending
    addPendingOperation(operationKey);
    
    // Simple individual track pause (sync removed - use cue system for multi-track)
    const trackState = remoteTrackStates[channel.channelId];
    
    if (trackState && trackState.playbackState === PlaybackState.PLAYING) {
      const pauseOperation = [{
        trackId: channel.channelId,
        operation: 'pause'
      }];
      sendRemoteAudioBatch?.(pauseOperation);
    }
  };
  // Simplified stop handler for individual tracks
  const handleStop = (channel) => {
    const operationKey = `stop_${channel.channelId}`;
    
    // Don't allow if operation is already pending
    if (pendingOperations.has(operationKey)) {
      console.log(`⏳ Stop operation already pending for ${channel.channelId}`);
      return;
    }
    
    // Mark operation as pending
    addPendingOperation(operationKey);
    
    // Simple individual track stop (sync removed - use cue system for multi-track)
    const trackState = remoteTrackStates[channel.channelId];
    
    if (trackState && (trackState.playbackState === PlaybackState.PLAYING || trackState.playbackState === PlaybackState.PAUSED)) {
      const stopOperation = [{
        trackId: channel.channelId,
        operation: 'stop'
      }];
      sendRemoteAudioBatch?.(stopOperation);
    }
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col">

          {/* Preset Section */}
          <div className={DM_CHILD}>
            <div className="flex items-center gap-3">
              <span className="text-white font-medium">Preset:</span>

              <select
                value="Default"
                disabled
                className={`${DM_CHILD} bg-slate-800 text-gray-100 cursor-not-allowed`}
              >
                <option value="Default">Default</option>
              </select>
            </div>
          </div>

          {/* Track Selector — load audio from asset library */}
          <AudioTrackSelector
            remoteTrackStates={remoteTrackStates}
            onAssetSelected={handleAssetSelected}
            onClear={handleBgmClear}
            loadedAssetIds={loadedAssetIds}
            campaignId={campaignId}
          />

          {/* DJ Cue System - Show when multiple BGM channels are available */}
          {bgmChannels.length > 1 && (
            <div className={DM_CHILD}>
              <div className="text-white font-bold mb-3">🎧 Channel Cue</div>
              {/* DJ Cue System Layout matching cue2.png exactly */}
              <div className="mb-4">
                {/* Header Row */}
                <div className="grid grid-cols-4 gap-4 mb-2">
                  <div className="text-white text-sm font-bold text-center">Cue</div>
                  <div className="text-white text-sm font-bold text-center">Transition</div>
                  <div className="text-white text-sm font-bold text-center">PGM</div>
                  <div className="text-white text-sm font-bold text-center">Preview</div>
                </div>
                
                {/* Tracks Layout - 4 equal columns */}
                <div className="grid grid-cols-4 gap-4 items-center">
                  {/* PFL Column - Channel selection */}
                  <div className="flex flex-col gap-1 items-center">
                    {/* BGM channels */}
                    {bgmChannels.map((channel) => {
                      const isLongTransition = remoteTrackStates[channel.channelId]?.playbackState === PlaybackState.TRANSITIONING
                        && activeFades[channel.channelId]?.duration >= FADE_ANIMATION_THRESHOLD;
                      return (
                      <div
                        key={`pfl-${channel.channelId}`}
                        className={`w-10 h-8 rounded text-center text-xs transition-all duration-200 cursor-pointer flex items-center justify-center border ${
                          effectiveCueTargets.includes(channel.channelId)
                            ? 'bg-blue-600 text-white border-blue-500'
                            : 'bg-gray-600 hover:bg-gray-500 text-gray-300 border-gray-500'
                        } ${isLongTransition ? 'animate-pulse' : ''}`}
                        onClick={() => {
                          setCurrentCue(prev => {
                            // Initialize from PGM when cue hasn't been touched
                            const currentTargets = prev?.targetTracks ?? pgmTargetTracks;
                            const channelId = channel.channelId;
                            const isSelected = currentTargets.includes(channelId);
                            return {
                              ...prev,
                              targetTracks: isSelected
                                ? currentTargets.filter(id => id !== channelId)
                                : [...currentTargets, channelId]
                            };
                          });
                        }}
                      >
                        {channel.channelId.replace('audio_channel_', '')}
                      </div>
                      );
                    })}
                  </div>

                  {/* Transition Controls */}
                  <div className="flex flex-col gap-1 items-center">                   
                    {/* Individual Fade Configuration Buttons for BGM Channels */}
                    {bgmChannels.map((channel) => {
                      const isFadeArmed = trackFadeStates[channel.channelId] || false;
                      return (
                        <FadeProgressButton
                          key={`fade-config-${channel.channelId}`}
                          isFadeArmed={isFadeArmed}
                          fadeInfo={activeFades[channel.channelId]}
                          onToggle={() => {
                            setTrackFadeStates(prev => ({
                              ...prev,
                              [channel.channelId]: !isFadeArmed
                            }));
                          }}
                          label="FADE"
                          title={`${isFadeArmed ? 'Armed for fade' : 'Armed for cut'} - ${channel.label}`}
                        />
                      );
                    })}
                  </div>

                  {/* PGM Column - Show what's currently playing */}
                  <div className="flex flex-col gap-1 items-center">
                    {/* All BGM channels */}
                    {bgmChannels.map((channel) => {
                      const pgmState = remoteTrackStates[channel.channelId]?.playbackState;
                      const isPlaying = pgmState === PlaybackState.PLAYING || pgmState === PlaybackState.TRANSITIONING;
                      const isLongTransition = pgmState === PlaybackState.TRANSITIONING
                        && activeFades[channel.channelId]?.duration >= FADE_ANIMATION_THRESHOLD;
                      return (
                        <div
                          key={`pgm-${channel.channelId}`}
                          className={`w-10 h-8 rounded text-center text-xs transition-all duration-200 flex items-center justify-center border ${
                            isPlaying ? 'bg-green-600 text-white border-green-500' : 'bg-gray-600 text-gray-300 border-gray-500'
                          } ${isLongTransition ? 'animate-pulse' : ''}`}
                        >
                          {channel.channelId.replace('audio_channel_', '')}
                        </div>
                      );
                    })}
                  </div>

                  {/* Preview Column - Show the differential result of the transition */}
                  <div className="flex flex-col gap-1 items-center">
                    {bgmChannels.map((channel) => {
                      const trackState = remoteTrackStates[channel.channelId];
                      const hasAudio = !!trackState?.filename;
                      const isSelectedInPFL = effectiveCueTargets.includes(channel.channelId);
                      const channelLabel = channel.channelId.replace('audio_channel_', '');

                      // Preview shows resulting PGM state after cut, with red highlighting stops
                      const pgmState = trackState?.playbackState;
                      const isCurrentlyPlaying = pgmState === PlaybackState.PLAYING || pgmState === PlaybackState.TRANSITIONING;

                      let previewState = 'off'; // off and staying off, or no audio
                      if (hasAudio && isSelectedInPFL) previewState = 'on';
                      else if (hasAudio && !isSelectedInPFL && isCurrentlyPlaying) previewState = 'stopping';

                      return (
                        <div
                          key={`preview-${channel.channelId}`}
                          className={`w-10 h-8 rounded text-center text-xs transition-all duration-200 flex items-center justify-center border ${
                            previewState === 'on' ? 'bg-green-500 text-white border-green-400' :
                            previewState === 'stopping' ? 'bg-red-500 text-white border-red-400' :
                            'bg-gray-600 text-gray-300 border-gray-500'
                          }`}
                          title={
                            previewState === 'on' ? `${channelLabel} will be playing` :
                            previewState === 'stopping' ? `${channelLabel} will be stopped` :
                            hasAudio ? `${channelLabel} off` : 'No audio loaded'
                          }
                        >
                          {hasAudio ? channelLabel : '-'}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Fade control + action buttons — side by side */}
              <div className="flex items-stretch gap-4 mt-3 mb-2">
                {/* Fade duration (left) */}
                <div className="flex flex-col items-center gap-1.5 flex-1">
                  <span className="text-white text-sm font-medium">Fade</span>
                  <div className="flex items-center gap-2">
                    <button
                      onMouseDown={() => startFadeRepeat(-100)}
                      onMouseUp={stopFadeRepeat}
                      onMouseLeave={stopFadeRepeat}
                      onTouchStart={() => startFadeRepeat(-100)}
                      onTouchEnd={stopFadeRepeat}
                      className="px-4 py-1.5 text-base font-bold bg-gray-700 text-gray-300 rounded border border-gray-500 hover:bg-gray-500 transition-colors select-none"
                    >
                      −
                    </button>
                    <span className="px-4 py-1.5 text-base font-bold text-white bg-gray-700 border border-gray-500 rounded min-w-[4.5rem] text-center">
                      {(fadeDuration / 1000).toFixed(1)}s
                    </span>
                    <button
                      onMouseDown={() => startFadeRepeat(100)}
                      onMouseUp={stopFadeRepeat}
                      onMouseLeave={stopFadeRepeat}
                      onTouchStart={() => startFadeRepeat(100)}
                      onTouchEnd={stopFadeRepeat}
                      className="px-4 py-1.5 text-base font-bold bg-gray-700 text-gray-300 rounded border border-gray-500 hover:bg-gray-500 transition-colors select-none"
                    >
                      +
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5 w-full">
                    <span className="text-xs text-gray-400">0.1</span>
                    <div
                      className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden cursor-pointer"
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                        const ms = Math.round((100 + ratio * 9900) / 100) * 100;
                        setFadeDuration(Math.max(100, Math.min(10000, ms)));
                      }}
                    >
                      <div
                        className="h-full bg-blue-500/60 rounded-full transition-all duration-100 pointer-events-none"
                        style={{ width: `${((fadeDuration - 100) / 9900) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-400">10s</span>
                  </div>
                </div>

                {/* Divider */}
                <div className="w-px bg-gray-600/50" />

                {/* Action buttons (right) */}
                <div className="flex flex-col gap-2 justify-center">
                  <button
                    className={`w-24 py-2 rounded text-sm font-bold transition-all duration-200 ${
                      currentCue !== null
                        ? 'bg-red-600 hover:bg-red-700 text-white'
                        : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    }`}
                    onClick={() => {
                      const targetTracks = currentCue?.targetTracks || [];
                      const tracksToStart = targetTracks.filter(trackId =>
                        remoteTrackStates[trackId]?.playbackState !== PlaybackState.PLAYING
                      );
                      const tracksToStop = Object.keys(remoteTrackStates).filter(trackId => {
                        const track = remoteTrackStates[trackId];
                        return track.playbackState === PlaybackState.PLAYING &&
                               !targetTracks.includes(trackId);
                      });
                      const allAffectedTracks = [...tracksToStart, ...tracksToStop];
                      const hasFadeTracks = allAffectedTracks.some(trackId => trackFadeStates[trackId]);
                      if (hasFadeTracks) {
                        executeFade();
                      } else {
                        executeCrossfade();
                      }
                    }}
                    disabled={currentCue === null}
                    title={`Execute transition (${currentCue?.targetTracks?.some(trackId => trackFadeStates[trackId]) ? 'some tracks will fade' : 'all tracks will cut'})`}
                  >
                    CUT
                  </button>
                  <button
                    className="w-24 py-2 rounded text-sm font-bold transition-all duration-200 bg-red-600 hover:bg-red-700 text-white"
                    onClick={stopAllTracks}
                    title="Stop all playing tracks immediately"
                  >
                    STOP ALL
                  </button>
                </div>
              </div>
              </div>
          )}

          {/* BGM Channels */}
          {bgmChannels.length > 0 && (
            <>
              <div className="text-white font-bold mt-4">Background Music</div>
              {bgmChannels.map((channel) => {
                const pendingOps = {
                  play: pendingOperations.has(`play_${channel.channelId}`),
                  pause: pendingOperations.has(`pause_${channel.channelId}`),
                  stop: pendingOperations.has(`stop_${channel.channelId}`),
                  loop: pendingOperations.has(`loop_${channel.channelId}`)
                };
                return (
                  <React.Fragment key={channel.channelId}>
                    <AudioTrack
                      config={{
                        trackId: channel.channelId,
                        type: channel.type,
                        label: channel.label,
                        analysers: remoteTrackAnalysers[channel.channelId],
                        track: channel.track
                      }}
                      pendingOperations={pendingOps}
                      trackState={
                        remoteTrackStates[channel.channelId] || {
                          playbackState: PlaybackState.STOPPED,
                          volume: 1.0,
                          filename: null,
                          currentTime: 0,
                          duration: 0,
                          looping: true
                        }
                      }
                      onPlay={() => handlePlay(channel)}
                      onPause={() => handlePause(channel)}
                      onStop={() => handleStop(channel)}
                      onVolumeChange={(v) =>
                        setRemoteTrackVolume?.(channel.channelId, v)
                      }
                      onVolumeChangeDebounced={(v) =>
                        handleVolumeChange(channel.channelId, v)
                      }
                      onLoopToggle={(id, loop) =>
                        handleLoopToggle(id, loop)
                      }
                      isMuted={mutedChannels[channel.channelId] || false}
                      isSoloed={soloedChannels[channel.channelId] || false}
                      onMuteToggle={() => handleMuteToggle(channel.channelId)}
                      onSoloToggle={() => handleSoloToggle(channel.channelId)}
                      effects={channelEffects[channel.channelId]}
                      onToggleEffect={handleEffectToggle}
                      isLast={false}
                    />
                  </React.Fragment>
                );
              })}
            </>
          )}

          {/* SFX Soundboard */}
          <div className="text-white font-bold mt-6">Sound Effects</div>
          <SfxSoundboard
            sfxSlots={sfxSlots}
            onTrigger={handleSfxTrigger}
            onVolumeChange={handleSfxVolumeChange}
            onVolumeChangeLocal={setSfxSlotVolume}
            onAssetSelected={handleSfxAssetSelected}
            onClear={handleSfxClear}
            campaignId={campaignId}
            isAudioUnlocked={isAudioUnlocked}
            unlockAudio={unlockAudio}
          />
    </div>
  );
}