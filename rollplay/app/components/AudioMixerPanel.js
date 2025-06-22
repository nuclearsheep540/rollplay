/*
 * AudioMixerPanel.jsx
 *
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import React, { useState, useEffect, useCallback } from 'react';
import AudioTrack from './AudioTrack';
import { PlaybackState, getSyncTargets } from '../hooks/useUnifiedAudio';
import {
  DM_HEADER,
  DM_ARROW,
  DM_CHILD,
} from '../styles/constants';

export default function AudioMixerPanel({
  isExpanded,
  onToggle,
  remoteTrackStates = {},
  sendRemoteAudioBatch,
  remoteTrackAnalysers = {},
  trackRouting = {},
  syncMode = false,
  setSyncMode,
  switchTrackRouting,
  unlockAudio = null,
  isAudioUnlocked = false,
  clearPendingOperation = null
}) {
  
  // Track pending audio operations to disable buttons
  const [pendingOperations, setPendingOperations] = useState(new Set());
  
  // Cue system state
  const [currentCue, setCurrentCue] = useState(null); // { tracksToStart: [], tracksToStop: [], cueId: string }
  const [fadeDurationMs, setFadeDurationMs] = useState(500); // Default 1 second
  
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
  
  // Clean unified routing function
  const handleTrackRoutingChange = (channelGroup, newTrack) => {
    console.log(`🔀 Setting ${channelGroup} routing to ${newTrack} (enabling sync)`);
    
    // Enable sync mode when any routing change happens
    setSyncMode?.(true);
    
    // Update the routing for this channel group
    switchTrackRouting?.(channelGroup, newTrack);
  };

  // Sync mode control functions
  const enableMatchedSync = (track) => {
    console.log(`🔗 Enabling matched sync: ${track}${track}`);
    setSyncMode?.(true);
    switchTrackRouting?.('music', track);
    switchTrackRouting?.('ambient', track);
  };

  // Crossfade execution function (memoized to prevent re-renders)
  const executeCrossfade = useCallback(async () => {
    if (!currentCue?.targetTracks?.length) return;
    
    console.log(`🎚️ Executing seamless crossfade transition: PGM → PFL (${fadeDurationMs}ms)`);
    
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
    
    const currentMusicChannels = currentChannels.filter(ch => ch.type === 'music');
    const currentAmbientChannels = currentChannels.filter(ch => ch.type === 'ambient');
    
    // Get tracks that need to start and stop
    const tracksToStart = [...currentMusicChannels, ...currentAmbientChannels].filter(channel => {
      const isCurrentlyPlaying = remoteTrackStates[channel.channelId]?.playbackState === 'playing';
      const isSelectedInPFL = currentCue.targetTracks.includes(channel.channelId);
      return isSelectedInPFL && !isCurrentlyPlaying; // Will start
    });
    
    const tracksToStop = [...currentMusicChannels, ...currentAmbientChannels].filter(channel => {
      const isCurrentlyPlaying = remoteTrackStates[channel.channelId]?.playbackState === 'playing';
      const isSelectedInPFL = currentCue.targetTracks.includes(channel.channelId);
      return !isSelectedInPFL && isCurrentlyPlaying; // Will stop
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
        console.log(`🎚️ Executing batch audio operations: ${batchOperations.length} operations`);
        sendRemoteAudioBatch?.(batchOperations);
      }
      
    } catch (error) {
      console.error(`❌ Crossfade failed:`, error);
      
      // Fallback: If new tracks fail to start, don't stop old ones
      console.log(`⚠️ Keeping current tracks playing due to crossfade error`);
    }
    
    // Clear the cue after execution
    setCurrentCue(null);
  }, [currentCue, fadeDurationMs, remoteTrackStates, sendRemoteAudioBatch]);

  const disableSync = () => {
    console.log(`🔓 Disabling sync mode`);
    setSyncMode?.(false);
  };

  // Cue system functions
  const createCue = (targetRouting) => {
    // Use getSyncTargets to determine what tracks would be affected by this routing
    const musicTrackId = Object.keys(remoteTrackStates).find(id => 
      remoteTrackStates[id].channelGroup === 'music' && 
      remoteTrackStates[id].track === targetRouting.music
    );
    
    if (!musicTrackId) {
      console.warn(`No music track found for ${targetRouting.music}`);
      return;
    }
    
    // Get targets for the new routing
    const targets = getSyncTargets(musicTrackId, targetRouting, true, remoteTrackStates);
    
    // Determine what needs to start vs stop
    const tracksToStart = targets.filter(track => 
      track.playbackState !== PlaybackState.PLAYING
    ).map(track => track.channelId);
    
    const tracksToStop = Object.keys(remoteTrackStates).filter(trackId => {
      const track = remoteTrackStates[trackId];
      // Stop tracks that are playing but not in the new target list
      return track.playbackState === PlaybackState.PLAYING && 
             !targets.some(t => t.channelId === trackId);
    });
    
    const cueId = `cue_${Date.now()}`;
    const newCue = {
      cueId,
      tracksToStart,
      tracksToStop,
      targetRouting
    };
    
    setCurrentCue(newCue);
    console.log(`🎯 Cue created:`, newCue);
  };

  const executeCut = () => {
    if (!currentCue) return;
    
    console.log(`✂️ Executing CUT transition:`, currentCue);
    
    // Create batch operations for cut transition
    const batchOperations = [];
    
    // Add stop operations
    currentCue.tracksToStop?.forEach(trackId => {
      batchOperations.push({
        trackId,
        operation: 'stop'
      });
    });
    
    // Add play operations
    if (currentCue.tracksToStart.length > 0) {
      currentCue.tracksToStart.forEach(trackId => {
        const track = remoteTrackStates[trackId];
        batchOperations.push({
          trackId,
          operation: 'play',
          filename: track.filename,
          looping: track.looping ?? (track.type !== 'sfx'),
          volume: track.volume,
          type: track.type,
          channelGroup: track.channelGroup,
          track: track.track
        });
      });
    }
    
    // Execute all operations simultaneously
    if (batchOperations.length > 0) {
      console.log(`✂️ Executing ${batchOperations.length} cut operations:`, batchOperations);
      sendRemoteAudioBatch?.(batchOperations);
    }
    
    // Update routing to match the cue
    if (currentCue.targetRouting) {
      setSyncMode?.(true);
      switchTrackRouting?.('music', currentCue.targetRouting.music);
      switchTrackRouting?.('ambient', currentCue.targetRouting.ambient);
    }
    
    // Clear the cue
    setCurrentCue(null);
  };

  const executeFade = () => {
    if (!currentCue) return;
    
    console.log(`🌊 Executing FADE transition:`, currentCue, `Duration: ${fadeDurationMs}ms`);
    
    // TODO: Implement client-side fade logic
    // For now, just do a cut (we'll implement fade in next step)
    executeCut();
  };

  const clearCue = () => {
    setCurrentCue(null);
    console.log(`🗑️ Cue cleared`);
  };

  // Stop all tracks function using batch operation
  const stopAllTracks = () => {
    const allTrackIds = channels.map(channel => channel.channelId);
    console.log(`🛑 Stopping all tracks:`, allTrackIds);
    
    // Create batch operations to stop all tracks
    const stopOperations = allTrackIds.map(trackId => ({
      trackId,
      operation: 'stop'
    }));
    
    // Send batch stop command
    sendRemoteAudioBatch?.(stopOperations);
  };

  // Volume change handler using batch operation
  const handleVolumeChange = (channelId, volume) => {
    const volumeOperation = [{
      trackId: channelId,
      operation: 'volume',
      volume
    }];
    sendRemoteAudioBatch?.(volumeOperation);
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
  // Dynamically generate channels from remoteTrackStates
  const channels = Object.keys(remoteTrackStates).map(channelId => {
    const trackState = remoteTrackStates[channelId];
    const { type, channelGroup, track } = trackState;
    
    // Generate appropriate label based on channel properties
    let label;
    if (channelGroup && track) {
      label = `${channelGroup.charAt(0).toUpperCase() + channelGroup.slice(1)} Track ${track}`;
    } else if (type === 'sfx') {
      // Extract number from channelId for SFX labeling
      const channelNum = channelId.replace('audio_channel_', '');
      label = `SFX Channel ${channelNum}`;
    } else {
      label = `${type.charAt(0).toUpperCase() + type.slice(1)} Channel`;
    }
    
    return {
      channelId,
      type,
      channelGroup,
      track,
      label
    };
  });

  // Organize channels by type for UI organization
  const musicChannels = channels.filter(ch => ch.type === 'music');
  const ambientChannels = channels.filter(ch => ch.type === 'ambient');
  const sfxChannels = channels.filter(ch => ch.type === 'sfx');

  // Check which channel groups have A/B tracks for routing controls
  const hasABTracks = {
    music: musicChannels.some(ch => ch.track === 'A') && musicChannels.some(ch => ch.track === 'B'),
    ambient: ambientChannels.some(ch => ch.track === 'A') && ambientChannels.some(ch => ch.track === 'B')
  };

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
    
    // Use centralized sync logic to determine what tracks to affect
    const targets = getSyncTargets(
      channel.channelId,
      trackRouting,
      syncMode,
      remoteTrackStates
    );
    
    if (targets.length === 0) {
      console.warn(`❌ No targets returned for ${channel.channelId}`);
      clearPendingOperationLocal(operationKey);
      return;
    }
    
    // Determine if any tracks are paused (should resume instead of fresh play)
    const shouldResume = targets.some(track => track.playbackState === PlaybackState.PAUSED);
    
    if (shouldResume) {
      if (targets.length === 1) {
        // Single track resume - use batch API
        const resumeOperation = [{
          trackId: targets[0].channelId,
          operation: 'resume'
        }];
        sendRemoteAudioBatch?.(resumeOperation);
      } else {
        // Multi-track resume - use batch API
        const resumeOperations = targets.map(target => ({
          trackId: target.channelId,
          operation: 'resume'
        }));
        sendRemoteAudioBatch?.(resumeOperations);
      }
    } else {
      // Multi-track play - use batch API
      const playOperations = targets.map(target => ({
        trackId: target.channelId,
        operation: 'play',
        filename: target.filename,
        looping: target.looping,
        volume: target.volume,
        type: target.type,
        channelGroup: target.channelGroup,
        track: target.track
      }));
      sendRemoteAudioBatch?.(playOperations);
    }
  };
  // Simplified pause handler using centralized sync logic
  const handlePause = (channel) => {
    const operationKey = `pause_${channel.channelId}`;
    
    // Don't allow if operation is already pending
    if (pendingOperations.has(operationKey)) {
      console.log(`⏳ Pause operation already pending for ${channel.channelId}`);
      return;
    }
    
    // Mark operation as pending
    addPendingOperation(operationKey);
    
    // Use centralized sync logic to determine what tracks to pause
    const targets = getSyncTargets(
      channel.channelId,
      trackRouting,
      syncMode,
      remoteTrackStates
    );
    
    // Pause all target tracks using batch operation
    const pauseOperations = targets
      .filter(target => target.playbackState === PlaybackState.PLAYING)
      .map(target => ({
        trackId: target.channelId,
        operation: 'pause'
      }));
    
    if (pauseOperations.length > 0) {
      sendRemoteAudioBatch?.(pauseOperations);
    }
  };
  // Simplified stop handler using centralized sync logic
  const handleStop = (channel) => {
    const operationKey = `stop_${channel.channelId}`;
    
    // Don't allow if operation is already pending
    if (pendingOperations.has(operationKey)) {
      console.log(`⏳ Stop operation already pending for ${channel.channelId}`);
      return;
    }
    
    // Mark operation as pending
    addPendingOperation(operationKey);
    
    // Use centralized sync logic to determine what tracks to stop
    const targets = getSyncTargets(
      channel.channelId,
      trackRouting,
      syncMode,
      remoteTrackStates
    );
    
    // Stop all target tracks using batch operation
    const stopOperations = targets
      .filter(target => target.playbackState === PlaybackState.PLAYING || target.playbackState === PlaybackState.PAUSED)
      .map(target => ({
        trackId: target.channelId,
        operation: 'stop'
      }));
    
    if (stopOperations.length > 0) {
      sendRemoteAudioBatch?.(stopOperations);
    }
  };

  return (
    <div className="flex-shrink-0">
      <div className={DM_HEADER} onClick={onToggle}>
        🎵 Audio Management
        <span className={`${DM_ARROW} ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
      </div>

      {isExpanded && (
        <>
          {/* A/B Routing Controls - Only show if any channel groups have A/B tracks */}
          {(hasABTracks.music || hasABTracks.ambient) && (
            <div className={DM_CHILD}>
              <div className="text-white font-bold mb-2">🎛️ Channel Sync</div>
              
              {/* Explicit Sync Buttons - Only show if both music and ambient have A/B tracks */}
              {hasABTracks.music && hasABTracks.ambient && (
                <div className="mb-3">
                Select a sync mode to determine what tracks play at the same time
                  <div className="text-white text-sm mb-2 font-mono">
                    Matched = Matching channels play <br />
                    __Mixed = Mix an A ↔ B combination for play <br />
                    ____Off = Play all tracks individually
                    </div>
                  <div className="flex items-center gap-2">
                    <button
                      className={`text-xs px-3 py-1 rounded transition-all duration-200 ${
                        syncMode && trackRouting.music === 'A' && trackRouting.ambient === 'A'
                          ? 'bg-green-600 hover:bg-green-700 text-white'
                          : 'bg-gray-600 hover:bg-gray-700 text-gray-300'
                      }`}
                      onClick={() => enableMatchedSync('A')}
                      title="Enable matched sync: Music A + Ambient A"
                    >
                      🔗 Sync A
                    </button>
                    
                    <button
                      className={`text-xs px-3 py-1 rounded transition-all duration-200 ${
                        syncMode && trackRouting.music === 'B' && trackRouting.ambient === 'B'
                          ? 'bg-green-600 hover:bg-green-700 text-white'
                          : 'bg-gray-600 hover:bg-gray-700 text-gray-300'
                      }`}
                      onClick={() => enableMatchedSync('B')}
                      title="Enable matched sync: Music B + Ambient B"
                    >
                      🔗 Sync B
                    </button>

                    <button
                      className={`text-xs px-2 py-1 rounded transition-all duration-200 ${
                        !syncMode
                          ? 'bg-orange-600 hover:bg-orange-700 text-white'
                          : 'bg-gray-600 hover:bg-gray-700 text-gray-300'
                      }`}
                      onClick={disableSync}
                      title="Disable sync - play individual tracks"
                    >
                      🔓 Off
                    </button>
                  </div>
                  <div className="text-gray-400 text-xs mt-1">
                    {!syncMode 
                      ? 'Individual tracks' 
                      : trackRouting.music === trackRouting.ambient
                        ? `Matched sync: ${trackRouting.music}${trackRouting.ambient}`
                        : `Mixed sync: ${trackRouting.music}${trackRouting.ambient}`}
                  </div>
                </div>
              )}

              {/* Music A/B Selector */}
              {hasABTracks.music && (
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-white text-sm w-16">Music:</span>
                  <div className="flex bg-gray-700 rounded overflow-hidden">
                    <button
                      className={`px-3 py-1 text-xs transition-all duration-200 ${
                        trackRouting.music === 'A'
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-600 hover:bg-gray-500 text-gray-300'
                      }`}
                      onClick={() => handleTrackRoutingChange('music', 'A')}
                    >
                      A
                    </button>
                    <button
                      className={`px-3 py-1 text-xs transition-all duration-200 ${
                        trackRouting.music === 'B'
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-600 hover:bg-gray-500 text-gray-300'
                      }`}
                      onClick={() => handleTrackRoutingChange('music', 'B')}
                    >
                      B
                    </button>
                  </div>
                </div>
              )}

              {/* Ambient A/B Selector */}
              {hasABTracks.ambient && (
                <div className="flex items-center gap-2">
                  <span className="text-white text-sm w-16">Ambient:</span>
                  <div className="flex bg-gray-700 rounded overflow-hidden">
                    <button
                      className={`px-3 py-1 text-xs transition-all duration-200 ${
                        trackRouting.ambient === 'A'
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-600 hover:bg-gray-500 text-gray-300'
                      }`}
                      onClick={() => handleTrackRoutingChange('ambient', 'A')}
                    >
                      A
                    </button>
                    <button
                      className={`px-3 py-1 text-xs transition-all duration-200 ${
                        trackRouting.ambient === 'B'
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-600 hover:bg-gray-500 text-gray-300'
                      }`}
                      onClick={() => handleTrackRoutingChange('ambient', 'B')}
                    >
                      B
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* DJ Cue System - Only show if both music and ambient have A/B tracks */}
          {hasABTracks.music && hasABTracks.ambient && (
            <div className={DM_CHILD}>
              <div className="text-white font-bold mb-3">🎧 Channel Cue </div>
              <p>Easily cut/fade to a combination of tracks</p>
              {/* DJ Cue System Layout matching cue.png exactly */}
              <div className="mb-4">
                {/* Header Row */}
                <div className="flex items-center gap-8 mb-2">
                  <div className="text-white text-sm font-bold w-16">PGM</div>
                  <div className="text-white text-sm font-bold w-32">Transition</div>
                  <div className="text-white text-sm font-bold flex-1 text-center">PFL</div>
                  <div className="text-white text-sm font-bold w-16 text-center">Preview</div>
                </div>
                
                {/* Tracks Layout */}
                <div className="flex items-start gap-8">
                  {/* PGM Column - Show ALL track IDs that exist in state */}
                  <div className="flex flex-col gap-1 w-16">
                    {/* All Music channels */}
                    {musicChannels.map((channel) => {
                      const isPlaying = remoteTrackStates[channel.channelId]?.playbackState === 'playing';
                      return (
                        <div 
                          key={`pgm-${channel.channelId}`}
                          className={`w-8 h-8 rounded text-center text-xs transition-all duration-200 flex items-center justify-center ${
                            isPlaying ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-300'
                          }`}
                        >
                          {channel.channelId.replace('audio_channel_', '')}
                        </div>
                      );
                    })}
                    {/* All Ambient channels */}
                    {ambientChannels.map((channel) => {
                      const isPlaying = remoteTrackStates[channel.channelId]?.playbackState === 'playing';
                      return (
                        <div 
                          key={`pgm-${channel.channelId}`}
                          className={`w-8 h-8 rounded text-center text-xs transition-all duration-200 flex items-center justify-center ${
                            isPlaying ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-300'
                          }`}
                        >
                          {channel.channelId.replace('audio_channel_', '')}
                        </div>
                      );
                    })}
                  </div>

                  {/* Transition Buttons Column - CUT and FADE button for each track */}
                  <div className="flex flex-col gap-1 w-32">
                    {/* Music channel buttons */}
                    {musicChannels.map((channel) => (
                      <div key={`transition-${channel.channelId}`} className="flex gap-1">
                        <button 
                          className="w-12 h-8 bg-cyan-500 text-black text-xs font-bold rounded"
                          onClick={executeCut}
                          disabled={!currentCue}
                        >
                          CUT
                        </button>
                        <button 
                          className="w-12 h-8 bg-cyan-500 text-black text-xs font-bold rounded"
                          onClick={executeFade}
                          disabled={!currentCue}
                        >
                          FADE
                        </button>
                      </div>
                    ))}
                    {/* Ambient channel buttons */}
                    {ambientChannels.map((channel) => (
                      <div key={`transition-${channel.channelId}`} className="flex gap-1">
                        <button 
                          className="w-12 h-8 bg-cyan-500 text-black text-xs font-bold rounded"
                          onClick={executeCut}
                          disabled={!currentCue}
                        >
                          CUT
                        </button>
                        <button 
                          className="w-12 h-8 bg-cyan-500 text-black text-xs font-bold rounded"
                          onClick={executeFade}
                          disabled={!currentCue}
                        >
                          FADE
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* PFL Column - Same data source as PGM, showing selection state */}
                  <div className="flex-1">
                    <div className="flex flex-col gap-1">
                      {/* Music channels */}
                      {musicChannels.map((channel) => (
                        <div 
                          key={`pfl-${channel.channelId}`}
                          className={`w-8 h-8 rounded text-center text-xs transition-all duration-200 cursor-pointer flex items-center justify-center ${
                            currentCue?.targetTracks?.includes?.(channel.channelId) 
                              ? 'bg-green-600 text-white' 
                              : 'bg-gray-600 hover:bg-gray-500 text-gray-300'
                          }`}
                          onClick={() => {
                            setCurrentCue(prev => {
                              const currentTargets = prev?.targetTracks || [];
                              const channelId = channel.channelId;
                              
                              // Toggle selection
                              if (Array.isArray(currentTargets)) {
                                const isSelected = currentTargets.includes(channelId);
                                return {
                                  ...prev,
                                  targetTracks: isSelected 
                                    ? currentTargets.filter(id => id !== channelId)
                                    : [...currentTargets, channelId]
                                };
                              } else {
                                // Convert to array format
                                return {
                                  ...prev,
                                  targetTracks: [channelId]
                                };
                              }
                            });
                          }}
                        >
                          {channel.channelId.replace('audio_channel_', '')}
                        </div>
                      ))}
                      {/* Ambient channels */}
                      {ambientChannels.map((channel) => (
                        <div 
                          key={`pfl-${channel.channelId}`}
                          className={`w-8 h-8 rounded text-center text-xs transition-all duration-200 cursor-pointer flex items-center justify-center ${
                            currentCue?.targetTracks?.includes?.(channel.channelId)
                              ? 'bg-green-600 text-white' 
                              : 'bg-gray-600 hover:bg-gray-500 text-gray-300'
                          }`}
                          onClick={() => {
                            setCurrentCue(prev => {
                              const currentTargets = prev?.targetTracks || [];
                              const channelId = channel.channelId;
                              
                              // Toggle selection
                              if (Array.isArray(currentTargets)) {
                                const isSelected = currentTargets.includes(channelId);
                                return {
                                  ...prev,
                                  targetTracks: isSelected 
                                    ? currentTargets.filter(id => id !== channelId)
                                    : [...currentTargets, channelId]
                                };
                              } else {
                                // Convert to array format
                                return {
                                  ...prev,
                                  targetTracks: [channelId]
                                };
                              }
                            });
                          }}
                        >
                          {channel.channelId.replace('audio_channel_', '')}
                        </div>
                      ))}
                    </div>

                    {/* Arrow */}
                    <div className="text-center text-gray-400 text-lg mt-2">⇒</div>
                  </div>

                  {/* Preview Column - Show the differential result of the transition */}
                  <div className="flex flex-col gap-1 w-16">
                    {[...musicChannels, ...ambientChannels].map((channel) => {
                      const trackState = remoteTrackStates[channel.channelId];
                      const isCurrentlyPlaying = trackState?.playbackState === 'playing';
                      const isSelectedInPFL = currentCue?.targetTracks?.includes?.(channel.channelId);
                      
                      // Calculate what will change (no hooks here)
                      let changeType = null;
                      let displayText = '-';
                      let colorClass = 'bg-gray-600 text-gray-300';
                      
                      if (isSelectedInPFL && !isCurrentlyPlaying) {
                        // Track will start playing (coming in)
                        changeType = 'start';
                        displayText = channel.channelId.replace('audio_channel_', '');
                        colorClass = 'bg-green-500 text-white'; // Green for starting
                      } else if (!isSelectedInPFL && isCurrentlyPlaying) {
                        // Track will stop playing (going out)  
                        changeType = 'stop';
                        displayText = channel.channelId.replace('audio_channel_', '');
                        colorClass = 'bg-red-500 text-white'; // Red for stopping
                      }
                      
                      return (
                        <div 
                          key={`preview-${channel.channelId}`}
                          className={`w-8 h-8 rounded text-center text-xs transition-all duration-200 flex items-center justify-center ${colorClass}`}
                          title={
                            changeType === 'start' ? `${displayText} will start playing` :
                            changeType === 'stop' ? `${displayText} will stop playing` :
                            'No change'
                          }
                        >
                          {displayText}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Crossfade Control */}
              <div className="flex items-center justify-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-white text-xs">Fade:</label>
                  <input
                    type="number"
                    min="100"
                    max="3000"
                    step="100"
                    value={fadeDurationMs}
                    onChange={(e) => setFadeDurationMs(parseInt(e.target.value) || 1000)}
                    className="bg-gray-700 text-white text-xs px-2 py-1 rounded w-16"
                  />
                  <span className="text-gray-400 text-xs">ms</span>
                </div>
                
                <button
                  className={`px-6 py-2 rounded text-sm font-bold transition-all duration-200 ${
                    currentCue?.targetTracks?.length > 0 
                      ? 'bg-purple-600 hover:bg-purple-700 text-white' 
                      : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  }`}
                  onClick={executeCrossfade} // TODO: Also call disableSync() 
                  disabled={!currentCue?.targetTracks?.length}
                  title={`Execute crossfade transition (${fadeDurationMs}ms)`}
                >
                  ⚡ CROSSFADE
                </button>
                
                <button
                  className="px-6 py-2 rounded text-sm font-bold transition-all duration-200 bg-red-600 hover:bg-red-700 text-white ml-4"
                  onClick={stopAllTracks}
                  title="Stop all playing tracks immediately"
                >
                  🛑 STOP ALL
                </button>
              </div>
              </div>
          )}

          {/* Music Channels */}
          {musicChannels.length > 0 && (
            <>
              <div className="text-white font-bold mt-4">Music</div>
              {musicChannels.map((channel) => {
                const isRouted = trackRouting.music === channel.track;
                const isDisabled = syncMode && !isRouted;
                const pendingOps = {
                  play: pendingOperations.has(`play_${channel.channelId}`),
                  pause: pendingOperations.has(`pause_${channel.channelId}`),
                  stop: pendingOperations.has(`stop_${channel.channelId}`),
                  loop: pendingOperations.has(`loop_${channel.channelId}`)
                };
                return (
                  <AudioTrack
                    key={channel.channelId}
                    config={{
                      trackId: channel.channelId,
                      type: channel.type,
                      label: channel.label,
                      analyserNode: remoteTrackAnalysers[channel.channelId],
                      isRouted: isRouted,
                      track: channel.track,
                      isDisabled: isDisabled
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
                      handleVolumeChange(channel.channelId, v)
                    }
                    onVolumeChangeDebounced={(v) =>
                      handleVolumeChange(channel.channelId, v)
                    }
                    onLoopToggle={(id, loop) =>
                      handleLoopToggle(id, loop)
                    }
                    syncMode={syncMode}
                    isLast={false}
                  />
                );
              })}
            </>
          )}

          {/* Ambient Channels */}
          {ambientChannels.length > 0 && (
            <>
              <div className="text-white font-bold mt-4">Ambience</div>
              {ambientChannels.map((channel) => {
                const isRouted = trackRouting.ambient === channel.track;
                const isDisabled = syncMode && !isRouted;
                const pendingOps = {
                  play: pendingOperations.has(`play_${channel.channelId}`),
                  pause: pendingOperations.has(`pause_${channel.channelId}`),
                  stop: pendingOperations.has(`stop_${channel.channelId}`),
                  loop: pendingOperations.has(`loop_${channel.channelId}`)
                };
                return (
                  <AudioTrack
                    key={channel.channelId}
                    config={{
                      trackId: channel.channelId,
                      type: channel.type,
                      label: channel.label,
                      analyserNode: remoteTrackAnalysers[channel.channelId],
                      isRouted: isRouted,
                      track: channel.track,
                      isDisabled: isDisabled
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
                      handleVolumeChange(channel.channelId, v)
                    }
                    onVolumeChangeDebounced={(v) =>
                      handleVolumeChange(channel.channelId, v)
                    }
                    onLoopToggle={(id, loop) =>
                      handleLoopToggle(id, loop)
                    }
                    syncMode={syncMode}
                    isLast={false}
                  />
                );
              })}
            </>
          )}

          {/* Sound Effects Channels */}
          {sfxChannels.length > 0 && (
            <>
              <div className="text-white font-bold mt-6">Sound Effects</div>
              {sfxChannels.map((channel, idx) => {
                const pendingOps = {
                  play: pendingOperations.has(`play_${channel.channelId}`),
                  pause: pendingOperations.has(`pause_${channel.channelId}`),
                  stop: pendingOperations.has(`stop_${channel.channelId}`),
                  loop: pendingOperations.has(`loop_${channel.channelId}`)
                };
                return (
                  <AudioTrack
                    key={channel.channelId}
                    config={{
                      trackId: channel.channelId,
                      type: channel.type,
                      label: channel.label,
                      analyserNode: remoteTrackAnalysers[channel.channelId],
                      track: "SFX"
                    }}
                    pendingOperations={pendingOps}
                    trackState={
                      remoteTrackStates[channel.channelId] || {
                        playbackState: PlaybackState.STOPPED,
                        volume: 1.0,
                        filename: null,
                        currentTime: 0,
                        duration: 0,
                        looping: false
                      }
                    }
                  onPlay={() => handlePlay(channel)}
                  onPause={() => handlePause(channel)}
                  onStop={() => handleStop(channel)}
                  onVolumeChange={(v) =>
                    handleVolumeChange(channel.channelId, v)
                  }
                  onVolumeChangeDebounced={(v) =>
                    handleVolumeChange(channel.channelId, v)
                  }
                  onLoopToggle={() => {}}
                  syncMode={syncMode}
                  isLast={idx === sfxChannels.length - 1}
                />
                );
              })}
            </>
          )}
        </>
      )}
    </div>
  );
}