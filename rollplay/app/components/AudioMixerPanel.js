/*
 * AudioMixerPanel.jsx
 *
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import React from 'react';
import AudioTrack from './AudioTrack';
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
  sendRemoteAudioPause,
  sendRemoteAudioStop,
  sendRemoteAudioVolume,
  setRemoteTrackVolume,
  toggleRemoteTrackLooping,
  remoteTrackAnalysers = {},
  abRouting = {},
  abSyncEnabled = false,
  setAbSyncEnabled,
  switchABRouting,
  unlockAudio = null,
  isAudioUnlocked = false
}) {
  
  // Individual A/B selector - disables sync to allow mixed routing (AB, BA)
  const handleIndividualABSwitch = (channelGroup, newTrack) => {
    console.log(`🔀 Individual selector: ${channelGroup} to ${newTrack} (disabling sync for mixed routing)`);
    
    // Disable sync to allow mixed combinations
    setAbSyncEnabled?.(false);
    
    // Set only the specific channel group with forceIndependent flag
    switchABRouting?.(channelGroup, newTrack, true);
  };

  // Enhanced A/B switching with actual audio control (used by other functions)
  const handleABSwitch = (channelGroup, newTrack) => {
    console.log(`🔀 Switching ${channelGroup} from ${abRouting[channelGroup]} to ${newTrack}`);
    
    const channelGroupsToSwitch = [];
    
    if (abSyncEnabled && (channelGroup === 'music' || channelGroup === 'ambient')) {
      // Sync mode: switch both music and ambient together
      channelGroupsToSwitch.push('music', 'ambient');
      console.log(`🔗 Sync enabled: switching both music and ambient to ${newTrack}`);
    } else {
      // Independent mode: switch only the requested channel group
      channelGroupsToSwitch.push(channelGroup);
    }

    // For each channel group to switch, handle the track transition
    channelGroupsToSwitch.forEach(group => {
      const oldTrack = abRouting[group];
      
      if (oldTrack !== newTrack) {
        // Find the old and new channel IDs
        const oldChannelId = Object.keys(remoteTrackStates).find(id => 
          remoteTrackStates[id].channelGroup === group && remoteTrackStates[id].track === oldTrack
        );
        const newChannelId = Object.keys(remoteTrackStates).find(id => 
          remoteTrackStates[id].channelGroup === group && remoteTrackStates[id].track === newTrack
        );

        // Stop the currently playing track (if any)
        if (oldChannelId && remoteTrackStates[oldChannelId]?.playing) {
          console.log(`⏹️ Stopping ${group} track ${oldTrack} (${oldChannelId})`);
          sendRemoteAudioStop?.(oldChannelId);
        }

        // Start the new track (if it has a filename and isn't already playing)
        if (newChannelId && remoteTrackStates[newChannelId]?.filename && !remoteTrackStates[newChannelId]?.playing) {
          console.log(`▶️ Starting ${group} track ${newTrack} (${newChannelId})`);
          const trackState = remoteTrackStates[newChannelId];
          sendRemoteAudioPlay?.(
            newChannelId, 
            trackState.filename, 
            trackState.looping, 
            trackState.volume
          );
        }
      }
    });

    // Update the routing state using the original function
    switchABRouting?.(channelGroup, newTrack);
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

  // Enhanced play handler with synchronized playback
  const handlePlay = async (channel) => {
    // Ensure audio is unlocked before playing
    if (!isAudioUnlocked) {
      console.log('🔓 Unlocking audio for play action...');
      const unlocked = await unlockAudio();
      if (!unlocked) {
        console.warn('❌ Failed to unlock audio - cannot play');
        return;
      }
    }
    
    const channelState = remoteTrackStates[channel.channelId];
    const filename = channelState?.filename;
    
    if (!filename) {
      console.warn(`No audio file loaded in ${channel.channelId}`);
      return;
    }
    
    // Check if this is a music/ambient A/B track that should sync playback
    console.log(`🔍 Play button clicked: channel=${channel.channelId}, group=${channel.channelGroup}, track=${channel.track}, syncEnabled=${abSyncEnabled}`);
    console.log(`🔍 Current routing:`, abRouting);
    
    // Always attempt synchronized playback for music/ambient tracks, regardless of sync mode
    if (channel.channelGroup && channel.track && 
        (channel.channelGroup === 'music' || channel.channelGroup === 'ambient')) {
      
      const { channelGroup, track } = channel;
      
      // Find the corresponding track in the other group based on current routing
      const otherGroup = channelGroup === 'music' ? 'ambient' : 'music';
      const otherGroupTrack = abRouting[otherGroup]; // Use routing state, not same track letter
      
      console.log(`🔍 Looking for sync pair: ${otherGroup} track ${otherGroupTrack}`);
      
      const syncChannelId = Object.keys(remoteTrackStates).find(id => 
        remoteTrackStates[id].channelGroup === otherGroup && 
        remoteTrackStates[id].track === otherGroupTrack
      );
      
      console.log(`🔍 Found sync channel:`, syncChannelId);
      
      if (syncChannelId) {
        const syncChannelState = remoteTrackStates[syncChannelId];
        
        // Use tracks array to start both tracks simultaneously
        console.log(`🔗 Sync play: Starting ${channelGroup} ${track} + ${otherGroup} ${otherGroupTrack} (routing: ${channelGroup}=${abRouting[channelGroup]}, ${otherGroup}=${abRouting[otherGroup]})`);
        
        const tracks = [{
          channelId: channel.channelId,
          filename: filename,
          looping: channel.type !== 'sfx',
          volume: channelState.volume
        }];
        
        if (syncChannelState?.filename) {
          tracks.push({
            channelId: syncChannelId,
            filename: syncChannelState.filename,
            looping: true, // music/ambient always loop
            volume: syncChannelState.volume
          });
        }
        
        console.log(`📡 About to send WebSocket event with tracks:`, tracks);
        sendRemoteAudioPlayTracks?.(tracks);
        console.log(`📡 WebSocket event sent`);
        return;
      }
    }
    
    // Fallback to regular play for non-sync tracks or when sync is disabled
    sendRemoteAudioPlay?.(
      channel.channelId,
      filename,
      channel.type !== 'sfx',             // looping for music/ambient
      channelState?.volume
    );
  };
  // Enhanced pause handler with synchronized control
  const handlePause = (channel) => {
    sendRemoteAudioPause?.(channel.channelId);
    
    // If sync is enabled and this is a music/ambient A/B track, pause the corresponding sync track
    if (abSyncEnabled && channel.channelGroup && channel.track) {
      const { channelGroup, track } = channel;
      
      // Only trigger sync for music/ambient tracks
      if (channelGroup === 'music' || channelGroup === 'ambient') {
        // Find the corresponding track in the other group
        const otherGroup = channelGroup === 'music' ? 'ambient' : 'music';
        const syncChannelId = Object.keys(remoteTrackStates).find(id => 
          remoteTrackStates[id].channelGroup === otherGroup && 
          remoteTrackStates[id].track === track
        );
        
        if (syncChannelId && remoteTrackStates[syncChannelId]?.playing) {
          console.log(`🔗 Sync pause: Pausing ${otherGroup} track ${track} (${syncChannelId})`);
          sendRemoteAudioPause?.(syncChannelId);
        }
      }
    }
  };
  // Enhanced stop handler with synchronized control
  const handleStop = (channel) => {
    sendRemoteAudioStop?.(channel.channelId);
    
    // If sync is enabled and this is a music/ambient A/B track, stop the corresponding sync track
    if (abSyncEnabled && channel.channelGroup && channel.track) {
      const { channelGroup, track } = channel;
      
      // Only trigger sync for music/ambient tracks
      if (channelGroup === 'music' || channelGroup === 'ambient') {
        // Find the corresponding track in the other group
        const otherGroup = channelGroup === 'music' ? 'ambient' : 'music';
        const syncChannelId = Object.keys(remoteTrackStates).find(id => 
          remoteTrackStates[id].channelGroup === otherGroup && 
          remoteTrackStates[id].track === track
        );
        
        if (syncChannelId && remoteTrackStates[syncChannelId]?.playing) {
          console.log(`🔗 Sync stop: Stopping ${otherGroup} track ${track} (${syncChannelId})`);
          sendRemoteAudioStop?.(syncChannelId);
        }
      }
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
              <div className="text-white font-bold mb-2">🎛️ Track Mix</div>
              
              {/* Explicit Sync Buttons - Only show if both music and ambient have A/B tracks */}
              {hasABTracks.music && hasABTracks.ambient && (
                <div className="mb-3">
                  <div className="text-white text-sm mb-2">Sync Music ↔ Ambient:</div>
                  <div className="flex items-center gap-2">
                    <button
                      className={`text-xs px-3 py-1 rounded transition-all duration-200 ${
                        abSyncEnabled && abRouting.music === 'A' && abRouting.ambient === 'A'
                          ? 'bg-green-600 hover:bg-green-700 text-white'
                          : 'bg-gray-600 hover:bg-gray-700 text-gray-300'
                      }`}
                      onClick={() => {
                        console.log('🔗 Syncing to A tracks');
                        
                        // Enable sync first
                        setAbSyncEnabled?.(true);
                        
                        // Directly set both routes to ensure sync works
                        setTimeout(() => {
                          console.log('🔄 Manually setting both routes to A');
                          switchABRouting?.('music', 'A');
                          switchABRouting?.('ambient', 'A');
                        }, 10); // Slightly longer delay to ensure state propagation
                        
                        console.log(`🔗 Sync enabled and routing to A`);
                      }}
                      title="Sync both music and ambient to A tracks"
                    >
                      🔗 Sync A
                    </button>
                    
                    <button
                      className={`text-xs px-3 py-1 rounded transition-all duration-200 ${
                        abSyncEnabled && abRouting.music === 'B' && abRouting.ambient === 'B'
                          ? 'bg-green-600 hover:bg-green-700 text-white'
                          : 'bg-gray-600 hover:bg-gray-700 text-gray-300'
                      }`}
                      onClick={() => {
                        console.log('🔗 Syncing to B tracks');
                        
                        // Enable sync first
                        setAbSyncEnabled?.(true);
                        
                        // Directly set both routes to ensure sync works
                        setTimeout(() => {
                          console.log('🔄 Manually setting both routes to B');
                          switchABRouting?.('music', 'B');
                          switchABRouting?.('ambient', 'B');
                        }, 10); // Slightly longer delay to ensure state propagation
                        
                        console.log(`🔗 Sync enabled and routing to B`);
                      }}
                      title="Sync both music and ambient to B tracks"
                    >
                      🔗 Sync B
                    </button>

                    <button
                      className={`text-xs px-2 py-1 rounded transition-all duration-200 ${
                        !abSyncEnabled
                          ? 'bg-orange-600 hover:bg-orange-700 text-white'
                          : 'bg-gray-600 hover:bg-gray-700 text-gray-300'
                      }`}
                      onClick={() => {
                        console.log('🔗 Disabling sync');
                        setAbSyncEnabled?.(false);
                      }}
                      title="Disable sync - independent control"
                    >
                      🔓 Off
                    </button>
                  </div>
                  <div className="text-gray-400 text-xs mt-1">
                    {abSyncEnabled 
                      ? `Synced to ${abRouting.music} tracks` 
                      : 'Independent control'}
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
                        abRouting.music === 'A'
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-600 hover:bg-gray-500 text-gray-300'
                      }`}
                      onClick={() => handleIndividualABSwitch('music', 'A')}
                    >
                      A
                    </button>
                    <button
                      className={`px-3 py-1 text-xs transition-all duration-200 ${
                        abRouting.music === 'B'
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-600 hover:bg-gray-500 text-gray-300'
                      }`}
                      onClick={() => handleIndividualABSwitch('music', 'B')}
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
                        abRouting.ambient === 'A'
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-600 hover:bg-gray-500 text-gray-300'
                      }`}
                      onClick={() => handleIndividualABSwitch('ambient', 'A')}
                    >
                      A
                    </button>
                    <button
                      className={`px-3 py-1 text-xs transition-all duration-200 ${
                        abRouting.ambient === 'B'
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-600 hover:bg-gray-500 text-gray-300'
                      }`}
                      onClick={() => handleIndividualABSwitch('ambient', 'B')}
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
                const isRouted = abRouting.music === channel.track;
                const isDisabled = abSyncEnabled && !isRouted;
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
                    trackState={
                      remoteTrackStates[channel.channelId] || {
                        playing: false,
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
                      toggleRemoteTrackLooping?.(id, loop)
                    }
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
                const isRouted = abRouting.ambient === channel.track;
                const isDisabled = abSyncEnabled && !isRouted;
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
                    trackState={
                      remoteTrackStates[channel.channelId] || {
                        playing: false,
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
                      toggleRemoteTrackLooping?.(id, loop)
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
              {sfxChannels.map((channel, idx) => (
                <AudioTrack
                  key={channel.channelId}
                  config={{
                    trackId: channel.channelId,
                    type: channel.type,
                    label: channel.label,
                    analyserNode: remoteTrackAnalysers[channel.channelId]
                  }}
                  trackState={
                    remoteTrackStates[channel.channelId] || {
                      playing: false,
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
                  isLast={idx === sfxChannels.length - 1}
                />
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}