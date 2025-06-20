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
  
  // Audio track configurations
  const trackConfigs = [
    {
      type: 'music',
      icon: '🎵',
      label: 'Music Channel', 
      filename: 'boss.mp3'
    },
    {
      type: 'ambient',
      icon: '🌧️',
      label: 'Ambient',
      filename: 'storm.mp3'
    },
    {
      type: 'sfx',
      icon: '⚔️',
      label: 'Sound Effects',
      filename: 'sword.mp3'
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
              key={config.type}
              config={config}
              trackState={remoteTrackStates[config.type] || { playing: false, volume: 0.7, currentTime: 0, duration: 0, looping: true }}
              onPlay={() => {
                console.log(`🎵 Play ${config.type} button clicked - sending to ALL players`);
                if (sendRemoteAudioPlay) {
                  const trackState = remoteTrackStates[config.type] || {};
                  sendRemoteAudioPlay(config.type, config.filename, trackState.looping ?? true, trackState.volume);
                }
              }}
              onPause={() => {
                console.log(`⏸️ Pause ${config.type} button clicked - sending to ALL players`);
                if (sendRemoteAudioPause) {
                  sendRemoteAudioPause(config.type);
                }
              }}
              onStop={() => {
                console.log(`🛑 Stop ${config.type} button clicked - sending to ALL players`);
                if (sendRemoteAudioStop) {
                  sendRemoteAudioStop(config.type);
                }
              }}
              onVolumeChange={(newVolume) => {
                if (setRemoteTrackVolume) {
                  setRemoteTrackVolume(config.type, newVolume);
                }
                if (sendRemoteAudioVolume) {
                  sendRemoteAudioVolume(config.type, newVolume);
                }
              }}
              onLoopToggle={(trackType, looping) => {
                if (toggleRemoteTrackLooping) {
                  toggleRemoteTrackLooping(trackType, looping);
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