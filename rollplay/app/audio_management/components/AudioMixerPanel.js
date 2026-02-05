/*
 * AudioMixerPanel.jsx
 *
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import React, { useState, useEffect, useCallback } from 'react';
import AudioTrack from './AudioTrack';
import AudioTrackSelector from './AudioTrackSelector';
import { PlaybackState, ChannelType } from '../types';
import {
  DM_HEADER,
  DM_ARROW,
  DM_CHILD,
  PANEL_CHILD,
} from '../../styles/constants';

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
}) {
  
  // Track pending audio operations to disable buttons
  const [pendingOperations, setPendingOperations] = useState(new Set());
  
  // Wrap loadAssetIntoChannel to also persist to server via WebSocket
  const handleAssetSelected = useCallback((channelId, asset) => {
    // Load locally into audio state
    if (loadAssetIntoChannel) {
      loadAssetIntoChannel(channelId, asset);
    }
    // Broadcast + persist to MongoDB via batch operation
    if (sendRemoteAudioBatch) {
      sendRemoteAudioBatch([{
        trackId: channelId,
        operation: 'load',
        filename: asset.filename,
        asset_id: asset.id,
        s3_url: asset.s3_url,
      }]);
    }
  }, [loadAssetIntoChannel, sendRemoteAudioBatch]);

  // Cue system state
  const [currentCue, setCurrentCue] = useState(null); // { tracksToStart: [], tracksToStop: [], cueId: string }
  const [trackFadeStates, setTrackFadeStates] = useState({}); // Per-track fade configuration { trackId: boolean }
  const [fadeDuration, setFadeDuration] = useState(1000); // Global fade duration in ms
  
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
      const isCurrentlyPlaying = remoteTrackStates[channel.channelId]?.playbackState === 'playing';
      const isSelectedInPFL = currentCue.targetTracks.includes(channel.channelId);
      return isSelectedInPFL && !isCurrentlyPlaying; // Will start
    });
    
    const tracksToStop = currentBgmChannels.filter(channel => {
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
    
    // Clear the cue after execution
    setCurrentCue(null);
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
    
    // Clear the cue
    setCurrentCue(null);
  };


  // Stop all tracks function using batch operation
  const stopAllTracks = () => {
    const allTrackIds = channels.filter((channel)=> channel.type === ChannelType.BGM).map(channel => channel.channelId);
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
  const bgmChannels = channels.filter(ch => ch.type === ChannelType.BGM);
  const sfxChannels = channels.filter(ch => ch.type === ChannelType.SFX);


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
    <div className="flex-shrink-0">
      <div className={DM_HEADER} onClick={onToggle}>
        🎵 Audio Management
        <span className={`${DM_ARROW} ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
      </div>

      {isExpanded && (
        <>

          {/* Track Selector — load audio from asset library */}
          <AudioTrackSelector
            remoteTrackStates={remoteTrackStates}
            onAssetSelected={handleAssetSelected}
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
                    {bgmChannels.map((channel) => (
                      <div 
                        key={`pfl-${channel.channelId}`}
                        className={`w-10 h-8 rounded text-center text-xs transition-all duration-200 cursor-pointer flex items-center justify-center border ${
                          currentCue?.targetTracks?.includes?.(channel.channelId) 
                            ? 'bg-green-600 text-white border-green-500' 
                            : 'bg-gray-600 hover:bg-gray-500 text-gray-300 border-gray-500'
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

                  {/* Transition Controls */}
                  <div className="flex flex-col gap-1 items-center">                   
                    {/* Individual Fade Configuration Buttons for BGM Channels */}
                    {bgmChannels.map((channel) => {
                      const isFadeArmed = trackFadeStates[channel.channelId] || false;
                      return (
                        <button 
                          key={`fade-config-${channel.channelId}`}
                          className={`w-full h-8 text-xs font-bold rounded transition-all duration-200 border ${
                            isFadeArmed 
                              ? 'bg-blue-600 text-white border-blue-500 hover:bg-blue-700' 
                              : 'bg-gray-600 text-gray-300 border-gray-500 hover:bg-gray-500'
                          }`}
                          onClick={() => {
                            setTrackFadeStates(prev => ({
                              ...prev,
                              [channel.channelId]: !isFadeArmed
                            }));
                          }}
                          title={`${isFadeArmed ? 'Armed for fade' : 'Armed for cut'} - ${channel.label}`}
                        >
                          FADE
                        </button>
                      );
                    })}
                  </div>

                  {/* PGM Column - Show what's currently playing */}
                  <div className="flex flex-col gap-1 items-center">
                    {/* All BGM channels */}
                    {bgmChannels.map((channel) => {
                      const isPlaying = remoteTrackStates[channel.channelId]?.playbackState === 'playing';
                      return (
                        <div 
                          key={`pgm-${channel.channelId}`}
                          className={`w-10 h-8 rounded text-center text-xs transition-all duration-200 flex items-center justify-center border ${
                            isPlaying ? 'bg-green-600 text-white border-green-500' : 'bg-gray-600 text-gray-300 border-gray-500'
                          }`}
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
                      const isCurrentlyPlaying = trackState?.playbackState === 'playing';
                      const isSelectedInPFL = currentCue?.targetTracks?.includes?.(channel.channelId);
                      
                      // Calculate what will change (no hooks here)
                      let changeType = null;
                      let displayText = '-';
                      
                      if (isSelectedInPFL && !isCurrentlyPlaying) {
                        // Track will start playing (coming in)
                        changeType = 'start';
                        displayText = channel.channelId.replace('audio_channel_', '');
                      } else if (!isSelectedInPFL && isCurrentlyPlaying) {
                        // Track will stop playing (going out)  
                        changeType = 'stop';
                        displayText = channel.channelId.replace('audio_channel_', '');
                      }
                      
                      return (
                        <div 
                          key={`preview-${channel.channelId}`}
                          className={`w-10 h-8 rounded text-center text-xs transition-all duration-200 flex items-center justify-center border ${
                            changeType === 'start' ? 'bg-green-500 text-white border-green-400' :
                            changeType === 'stop' ? 'bg-red-500 text-white border-red-400' :
                            'bg-gray-600 text-gray-300 border-gray-500'
                          }`}
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

              {/* Fade Duration Control */}
              <div className="flex items-center justify-center gap-2 mt-3 mb-2">
                <label className="text-white text-sm font-medium">Fade Duration:</label>
                <input
                  type="number"
                  min="100"
                  max="10000"
                  step="100"
                  value={fadeDuration}
                  onChange={(e) => setFadeDuration(Number(e.target.value))}
                  className={`${DM_CHILD} w-20 text-center`}
                />
                <span className="text-white text-sm">ms</span>
              </div>

              {/* Cut and Stop All Buttons */}
              <div className="flex items-center justify-center gap-4 mt-4">
                <button
                  className={`px-6 py-2 rounded text-sm font-bold transition-all duration-200 ${
                    currentCue?.targetTracks?.length > 0 
                      ? 'bg-red-600 hover:bg-red-700 text-white' 
                      : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  }`}
                  onClick={() => {
                    console.log(`🎚️ CUT button clicked. currentCue:`, currentCue);
                    
                    // Calculate tracks that will be affected by this operation
                    const targetTracks = currentCue?.targetTracks || [];
                    
                    const tracksToStart = targetTracks.filter(trackId => 
                      remoteTrackStates[trackId]?.playbackState !== PlaybackState.PLAYING
                    );
                    
                    const tracksToStop = Object.keys(remoteTrackStates).filter(trackId => {
                      const track = remoteTrackStates[trackId];
                      return track.playbackState === PlaybackState.PLAYING && 
                             !targetTracks.includes(trackId);
                    });
                    
                    // Check if any tracks that will be affected are armed for fade
                    const allAffectedTracks = [...tracksToStart, ...tracksToStop];
                    const hasFadeTracks = allAffectedTracks.some(trackId => trackFadeStates[trackId]);

                    
                    if (hasFadeTracks) {
                      console.log(`🌊 Calling executeFade()`);
                      executeFade();
                    } else {
                      console.log(`✂️ Calling executeCrossfade()`);
                      executeCrossfade();
                    }
                  }}
                  disabled={
                    !currentCue?.targetTracks?.length && 
                    !Object.keys(remoteTrackStates).some(trackId => 
                      remoteTrackStates[trackId]?.playbackState === PlaybackState.PLAYING
                    )
                  }
                  title={`Execute transition (${currentCue?.targetTracks?.some(trackId => trackFadeStates[trackId]) ? 'some tracks will fade' : 'all tracks will cut'})`}
                >
                  CUT
                </button>
                
                <button
                  className="px-6 py-2 rounded text-sm font-bold transition-all duration-200 bg-red-600 hover:bg-red-700 text-white"
                  onClick={stopAllTracks}
                  title="Stop all playing tracks immediately"
                >
                  STOP ALL
                </button>
              </div>
              </div>
          )}

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
                  <AudioTrack
                    key={channel.channelId}
                    config={{
                      trackId: channel.channelId,
                      type: channel.type,
                      label: channel.label,
                      analyserNode: remoteTrackAnalysers[channel.channelId],
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
                      handleVolumeChange(channel.channelId, v)
                    }
                    onVolumeChangeDebounced={(v) =>
                      handleVolumeChange(channel.channelId, v)
                    }
                    onLoopToggle={(id, loop) =>
                      handleLoopToggle(id, loop)
                    }
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