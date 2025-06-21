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
  sendRemoteAudioPause,
  sendRemoteAudioStop,
  sendRemoteAudioVolume,
  setRemoteTrackVolume,
  toggleRemoteTrackLooping,
  remoteTrackAnalysers = {},
  abRouting = {},
  abSyncEnabled = false,
  setAbSyncEnabled,
  switchABRouting
}) {
  
  // Enhanced A/B switching with actual audio control
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

  // Common play/pause/stop helpers:
  const handlePlay = (channel) => {
    const channelState = remoteTrackStates[channel.channelId];
    const filename = channelState?.filename;
    
    if (!filename) {
      console.warn(`No audio file loaded in ${channel.channelId}`);
      return;
    }
    
    sendRemoteAudioPlay?.(
      channel.channelId,
      filename,
      channel.type !== 'sfx',             // looping for music/ambient
      channelState?.volume
    );
  };
  const handlePause = (channel) => {
    sendRemoteAudioPause?.(channel.channelId);
  };
  const handleStop = (channel) => {
    sendRemoteAudioStop?.(channel.channelId);
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
              
              {/* Sync Toggle - Only show if both music and ambient have A/B tracks */}
              {hasABTracks.music && hasABTracks.ambient && (
                <div className="flex items-center gap-2 mb-3">
                  <button
                    className={`text-xs px-3 py-1 rounded transition-all duration-200 ${
                      abSyncEnabled
                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                        : 'bg-gray-600 hover:bg-gray-700 text-gray-300'
                    }`}
                    onClick={() => setAbSyncEnabled?.(!abSyncEnabled)}
                    title={abSyncEnabled ? 'Disable track sync' : 'Enable track sync'}
                  >
                    🔗 {abSyncEnabled ? 'SYNC ON' : 'SYNC OFF'}
                  </button>
                  <span className="text-gray-400 text-xs">
                    {abSyncEnabled ? 'Music ↔ Ambient synced' : 'Independent routing'}
                  </span>
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
                      onClick={() => handleABSwitch('music', 'A')}
                    >
                      A
                    </button>
                    <button
                      className={`px-3 py-1 text-xs transition-all duration-200 ${
                        abRouting.music === 'B'
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-600 hover:bg-gray-500 text-gray-300'
                      }`}
                      onClick={() => handleABSwitch('music', 'B')}
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
                      onClick={() => handleABSwitch('ambient', 'A')}
                    >
                      A
                    </button>
                    <button
                      className={`px-3 py-1 text-xs transition-all duration-200 ${
                        abRouting.ambient === 'B'
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-600 hover:bg-gray-500 text-gray-300'
                      }`}
                      onClick={() => handleABSwitch('ambient', 'B')}
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
                return (
                  <AudioTrack
                    key={channel.channelId}
                    config={{
                      trackId: channel.channelId,
                      type: channel.type,
                      label: channel.label,
                      analyserNode: remoteTrackAnalysers[channel.channelId],
                      isRouted: isRouted,
                      track: channel.track
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
                return (
                  <AudioTrack
                    key={channel.channelId}
                    config={{
                      trackId: channel.channelId,
                      type: channel.type,
                      label: channel.label,
                      analyserNode: remoteTrackAnalysers[channel.channelId],
                      isRouted: isRouted,
                      track: channel.track
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