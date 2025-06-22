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
  DM_CHILD_LAST
} from '../styles/constants';

export default function AudioMixerPanel({
  isExpanded,
  onToggle,
  remoteTrackStates = {},
  sendRemoteAudioPlay,
  sendRemoteAudioPlayTracks,
  sendRemoteAudioResume,
  sendRemoteAudioResumeTracks,
  sendRemoteAudioPause,
  sendRemoteAudioStop,
  sendRemoteAudioVolume,
  sendRemoteAudioLoop,
  setRemoteTrackVolume,
  toggleRemoteTrackLooping,
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

  const disableSync = () => {
    console.log(`🔓 Disabling sync mode`);
    setSyncMode?.(false);
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
    sendRemoteAudioLoop?.(trackId, looping);
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
        // Single track resume - use existing single-track API
        sendRemoteAudioResume?.(targets[0].channelId);
      } else {
        // Multi-track resume - use batch API
        sendRemoteAudioResumeTracks?.(targets);
      }
    } else {
      // Always use batch API for consistency (works for single tracks too)
      sendRemoteAudioPlayTracks?.(targets);
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
    
    // Pause all target tracks
    targets.forEach(target => {
      // Only pause if the track is actually playing
      if (target.playbackState === PlaybackState.PLAYING) {
        sendRemoteAudioPause?.(target.channelId);
      }
    });
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
    
    // Stop all target tracks
    targets.forEach(target => {
      // Only stop if the track is actually playing or paused
      if (target.playbackState === PlaybackState.PLAYING || target.playbackState === PlaybackState.PAUSED) {
        sendRemoteAudioStop?.(target.channelId);
      }
    });
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
                      setRemoteTrackVolume?.(channel.channelId, v)
                    }
                    onVolumeChangeDebounced={(v) =>
                      sendRemoteAudioVolume?.(channel.channelId, v)
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
                      setRemoteTrackVolume?.(channel.channelId, v)
                    }
                    onVolumeChangeDebounced={(v) =>
                      sendRemoteAudioVolume?.(channel.channelId, v)
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
                    setRemoteTrackVolume?.(channel.channelId, v)
                  }
                  onVolumeChangeDebounced={(v) =>
                    sendRemoteAudioVolume?.(channel.channelId, v)
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