/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import React from 'react';
import { DM_HEADER, DM_ARROW, DM_SUB_HEADER, DM_CHILD, DM_CHILD_LAST, MIXER_FADER, PANEL_HEADER} from '../styles/constants';

import AudioTrack from './AudioTrack';

export default function AudioMixerPanel({
  isExpanded,
  onToggle,
  remoteTrackStates = {},
  sendRemoteAudioPlay = null,
  sendRemoteAudioPause = null,
  sendRemoteAudioStop = null,
  sendRemoteAudioVolume = null,
  setRemoteTrackVolume = null,
  toggleRemoteTrackLooping = null
}) {
  
  // Single audio tracks (Music & Ambient)
  const singleTracks = [
    {
      trackId: 'music_boss',
      type: 'music',
      filename: 'boss.mp3'
    },
    {
      trackId: 'ambient_storm',
      type: 'ambient',
      filename: 'storm.mp3'
    }
  ];

  // SFX collection - scalable list of sound effects
  const sfxTracks = [
    {
      trackId: 'sfx_sword',
      filename: 'sword.mp3'
    },
    {
      trackId: 'sfx_enemy_hit',
      filename: 'enemy_hit_cinematic.mp3'
    }
  ];

  return (
    <div className="flex-shrink-0">
      <div 
        className={DM_HEADER}
        onClick={onToggle}
      >
        🎵 Audio Management
        <span className={`${DM_ARROW} ${isExpanded ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </div>
      {isExpanded && (
        <div>
          {/* Single Audio Tracks (Music & Ambient) */}
          {singleTracks.map((config) => (

            <>
              <div className={PANEL_HEADER + "-"}>{config.type === 'music' ? 'Music' : 'Ambience'}</div>
              <AudioTrack
                className="slider"
                key={config.trackId}
                config={{...config}}
                trackState={remoteTrackStates[config.trackId] || { 
                  playing: false, 
                  volume: 0.7, 
                  currentTime: 0, 
                  duration: 0, 
                  looping: true 
                }}
                onPlay={() => {
                  console.log(`🎵 Play ${config.trackId} (${config.filename}) button clicked - sending to ALL players`);
                  if (sendRemoteAudioPlay) {
                    const trackState = remoteTrackStates[config.trackId] || {};
                    sendRemoteAudioPlay(config.trackId, config.filename, trackState.looping ?? true, trackState.volume);
                  }
                }}
                onPause={() => {
                  console.log(`⏸️ Pause ${config.trackId} button clicked - sending to ALL players`);
                  if (sendRemoteAudioPause) {
                    sendRemoteAudioPause(config.trackId);
                  }
                }}
                onStop={() => {
                  console.log(`🛑 Stop ${config.trackId} button clicked - sending to ALL players`);
                  if (sendRemoteAudioStop) {
                    sendRemoteAudioStop(config.trackId);
                  }
                }}
                onVolumeChange={(newVolume) => {
                  // Immediate local state update for responsive UI
                  if (setRemoteTrackVolume) {
                    setRemoteTrackVolume(config.trackId, newVolume);
                  }
                }}
                onVolumeChangeDebounced={(newVolume) => {
                  // Debounced WebSocket send to reduce API calls
                  if (sendRemoteAudioVolume) {
                    sendRemoteAudioVolume(config.trackId, newVolume);
                  }
                }}
                onLoopToggle={(trackId, looping) => {
                  if (toggleRemoteTrackLooping) {
                    toggleRemoteTrackLooping(trackId, looping);
                  }
                }}
                isLast={false}
              />
            </>
          ))}

          {/* SFX Collection */}
          <div className={PANEL_HEADER + "mb-0"}>Sound Effects</div>
          {sfxTracks.map((sfxConfig, index) => (
            <>
              <AudioTrack
                key={sfxConfig.trackId}
                config={{
                  ...sfxConfig,
                  type: 'sfx',
                }}
                trackState={remoteTrackStates[sfxConfig.trackId] || { 
                  playing: false, 
                  volume: 0.8, 
                  currentTime: 0, 
                  duration: 0, 
                  looping: false 
                }}
                onPlay={() => {
                  console.log(`🔊 Play SFX ${sfxConfig.trackId} (${sfxConfig.filename}) button clicked - sending to ALL players`);
                  if (sendRemoteAudioPlay) {
                    const trackState = remoteTrackStates[sfxConfig.trackId] || {};
                    sendRemoteAudioPlay(sfxConfig.trackId, sfxConfig.filename, false, trackState.volume);
                  }
                }}
                onPause={() => {
                  console.log(`⏸️ Pause SFX ${sfxConfig.trackId} button clicked - sending to ALL players`);
                  if (sendRemoteAudioPause) {
                    sendRemoteAudioPause(sfxConfig.trackId);
                  }
                }}
                onStop={() => {
                  console.log(`🛑 Stop SFX ${sfxConfig.trackId} button clicked - sending to ALL players`);
                  if (sendRemoteAudioStop) {
                    sendRemoteAudioStop(sfxConfig.trackId);
                  }
                }}
                onVolumeChange={(newVolume) => {
                  // Immediate local state update for responsive UI
                  if (setRemoteTrackVolume) {
                    setRemoteTrackVolume(sfxConfig.trackId, newVolume);
                  }
                }}
                onVolumeChangeDebounced={(newVolume) => {
                  // Debounced WebSocket send to reduce API calls
                  if (sendRemoteAudioVolume) {
                    sendRemoteAudioVolume(sfxConfig.trackId, newVolume);
                  }
                }}
                onLoopToggle={(trackId, looping) => {
                  // SFX tracks don't support loop toggle - this won't be called
                  if (toggleRemoteTrackLooping) {
                    toggleRemoteTrackLooping(trackId, looping);
                  }
                }}
                isLast={index === sfxTracks.length - 1}
              />
            </>
          ))}
          
          {!remoteTrackStates.music_boss && (
            <div className="text-yellow-400 text-xs mt-2">
              💡 Expand this panel to unlock audio
            </div>
          )}
        </div>
      )}
    </div>
  );
}