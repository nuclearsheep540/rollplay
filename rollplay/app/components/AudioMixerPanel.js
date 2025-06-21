/*
 * AudioMixerPanel.jsx
 *
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import React from 'react';
import AudioTrack from './AudioTrack';
import { PlaybackState } from '../hooks/useUnifiedAudio';
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
  setRemoteTrackVolume,
  toggleRemoteTrackLooping,
  remoteTrackAnalysers = {},
  trackRouting = {},
  syncMode = false,
  setSyncMode,
  switchTrackRouting,
  unlockAudio = null,
  isAudioUnlocked = false
}) {
  
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

  // Clean play handler with unified sync logic
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
    
    console.log(`🔍 Play clicked: ${channel.channelId}, syncMode=${syncMode}`);
    console.log(`🔍 Current routing:`, trackRouting);
    console.log(`🔍 Track state: playbackState=${channelState?.playbackState}`);
    
    // Check if this track (or sync pair) is paused and should resume instead of play fresh
    const isTrackPaused = channelState?.playbackState === PlaybackState.PAUSED;
    
    // Check if sync mode is enabled and this is a music/ambient track
    if (syncMode && channel.channelGroup && 
        (channel.channelGroup === 'music' || channel.channelGroup === 'ambient')) {
      
      const { channelGroup } = channel;
      const otherGroup = channelGroup === 'music' ? 'ambient' : 'music';
      const otherGroupTrack = trackRouting[otherGroup];
      
      // Find the pair track
      const syncChannelId = Object.keys(remoteTrackStates).find(id => 
        remoteTrackStates[id].channelGroup === otherGroup && 
        remoteTrackStates[id].track === otherGroupTrack
      );
      
      if (syncChannelId) {
        const syncChannelState = remoteTrackStates[syncChannelId];
        const isSyncChannelPaused = syncChannelState?.playbackState === PlaybackState.PAUSED;
        
        // Determine if this should be a resume or fresh play
        const shouldResume = isTrackPaused || isSyncChannelPaused;
        
        console.log(`🔗 Sync ${shouldResume ? 'resume' : 'play'}: ${channelGroup}=${trackRouting[channelGroup]} + ${otherGroup}=${trackRouting[otherGroup]}`);
        
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
            looping: true,
            volume: syncChannelState.volume
          });
        }
        
        if (shouldResume) {
          console.log(`📡 Sending synchronized resume tracks:`, tracks);
          sendRemoteAudioResumeTracks?.(tracks);
        } else {
          console.log(`📡 Sending synchronized play tracks:`, tracks);
          sendRemoteAudioPlayTracks?.(tracks);
        }
        return;
      }
    }
    
    // Individual track play (sync disabled or SFX)
    if (isTrackPaused) {
      console.log(`🎵 Resuming individual track: ${channel.channelId}`);
      sendRemoteAudioResume?.(channel.channelId);
    } else {
      console.log(`🎵 Playing individual track: ${channel.channelId}`);
      sendRemoteAudioPlay?.(
        channel.channelId,
        filename,
        channel.type !== 'sfx',
        channelState?.volume
      );
    }
  };
  // Enhanced pause handler with synchronized control
  const handlePause = (channel) => {
    sendRemoteAudioPause?.(channel.channelId);
    
    // If sync is enabled and this is a music/ambient A/B track, pause the corresponding sync track
    if (syncMode && channel.channelGroup && channel.track) {
      const { channelGroup, track } = channel;
      
      // Only trigger sync for music/ambient tracks
      if (channelGroup === 'music' || channelGroup === 'ambient') {
        // Find the corresponding track in the other group
        const otherGroup = channelGroup === 'music' ? 'ambient' : 'music';
        const syncChannelId = Object.keys(remoteTrackStates).find(id => 
          remoteTrackStates[id].channelGroup === otherGroup && 
          remoteTrackStates[id].track === track
        );
        
        if (syncChannelId && remoteTrackStates[syncChannelId]?.playbackState === PlaybackState.PLAYING) {
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
    if (syncMode && channel.channelGroup && channel.track) {
      const { channelGroup, track } = channel;
      
      // Only trigger sync for music/ambient tracks
      if (channelGroup === 'music' || channelGroup === 'ambient') {
        // Find the corresponding track in the other group
        const otherGroup = channelGroup === 'music' ? 'ambient' : 'music';
        const syncChannelId = Object.keys(remoteTrackStates).find(id => 
          remoteTrackStates[id].channelGroup === otherGroup && 
          remoteTrackStates[id].track === track
        );
        
        if (syncChannelId && remoteTrackStates[syncChannelId]?.playbackState === PlaybackState.PLAYING) {
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
                const isRouted = trackRouting.ambient === channel.track;
                const isDisabled = syncMode && !isRouted;
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