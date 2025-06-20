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
  remoteTrackAnalysers = {}
}) {
  // Channel definitions - now using fixed channel numbers with dynamic content
  const channels = [
    { channelId: 'audio_channel_1', type: 'music', label: 'Music Channel' },
    { channelId: 'audio_channel_2', type: 'ambient', label: 'Ambient Channel' },
    { channelId: 'audio_channel_3', type: 'sfx', label: 'SFX Channel 1' },
    { channelId: 'audio_channel_4', type: 'sfx', label: 'SFX Channel 2' }
  ];

  // Separate channels by type for UI organization
  const musicChannels = channels.filter(ch => ch.type === 'music');
  const ambientChannels = channels.filter(ch => ch.type === 'ambient');
  const sfxChannels = channels.filter(ch => ch.type === 'sfx');

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
          {/* Music Channels */}
          {musicChannels.length > 0 && (
            <>
              <div className="text-white font-bold mt-4">Music</div>
              {musicChannels.map((channel) => (
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
              ))}
            </>
          )}

          {/* Ambient Channels */}
          {ambientChannels.length > 0 && (
            <>
              <div className="text-white font-bold mt-4">Ambience</div>
              {ambientChannels.map((channel) => (
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
              ))}
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