/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import React from 'react';
import { DM_HEADER, DM_ARROW } from '../styles/constants';
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
  
  // Audio track configurations - each track needs a unique trackId
  const trackConfigs = [
    {
      trackId: 'music_boss',
      type: 'music',
      icon: '🎵',
      label: 'Music Channel', 
      filename: 'boss.mp3'
    },
    {
      trackId: 'ambient_storm',
      type: 'ambient',
      icon: '🌧️',
      label: 'Ambient',
      filename: 'storm.mp3'
    },
    {
      trackId: 'sfx_sword',
      type: 'sfx',
      icon: '⚔️',
      label: 'Combat SFX',
      filename: 'sword.mp3'
    },
    {
      trackId: 'sfx_enemy_hit',
      type: 'sfx',
      icon: '💥',
      label: 'Enemy Hit SFX',
      filename: 'enemy_hit_cinematic.mp3'
    }
  ];

  return (
    <div className="flex-shrink-0">
      <div 
        className={DM_HEADER}
        onClick={onToggle}
      >
        🎵 Audio Tracks
        <span className={`${DM_ARROW} ${isExpanded ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </div>
      {isExpanded && (
        <div>
          {trackConfigs.map((config, index) => (
            <AudioTrack
              key={config.trackId}
              config={config}
              trackState={remoteTrackStates[config.trackId] || { 
                playing: false, 
                volume: 0.7, 
                currentTime: 0, 
                duration: 0, 
                looping: config.type === 'sfx' ? false : true 
              }}
              onPlay={() => {
                console.log(`🎵 Play ${config.trackId} (${config.filename}) button clicked - sending to ALL players`);
                if (sendRemoteAudioPlay) {
                  const trackState = remoteTrackStates[config.trackId] || {};
                  sendRemoteAudioPlay(config.trackId, config.filename, trackState.looping ?? (config.type === 'sfx' ? false : true), trackState.volume);
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
                if (setRemoteTrackVolume) {
                  setRemoteTrackVolume(config.trackId, newVolume);
                }
                if (sendRemoteAudioVolume) {
                  sendRemoteAudioVolume(config.trackId, newVolume);
                }
              }}
              onLoopToggle={(trackId, looping) => {
                if (toggleRemoteTrackLooping) {
                  toggleRemoteTrackLooping(trackId, looping);
                }
              }}
              isLast={index === trackConfigs.length - 1}
            />
          ))}
          
          {!remoteTrackStates.music && (
            <div className="text-yellow-400 text-xs mt-2">
              💡 Expand this panel to unlock audio
            </div>
          )}
        </div>
      )}
    </div>
  );
}