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
  // Your track definitions:
  const singleTracks = [
    { trackId: 'music_boss', type: 'music', filename: 'boss.mp3' },
    { trackId: 'ambient_storm', type: 'ambient', filename: 'storm.mp3' }
  ];
  const sfxTracks = [
    { trackId: 'sfx_sword', filename: 'sword.mp3' },
    { trackId: 'sfx_enemy_hit', filename: 'enemy_hit_cinematic.mp3' }
  ];

  // Common play/pause/stop helpers:
  const handlePlay = (cfg) => {
    sendRemoteAudioPlay?.(
      cfg.trackId,
      cfg.filename,
      cfg.type !== 'sfx',             // looping for music/ambient
      remoteTrackStates[cfg.trackId]?.volume
    );
  };
  const handlePause = (cfg) => {
    sendRemoteAudioPause?.(cfg.trackId);
  };
  const handleStop = (cfg) => {
    sendRemoteAudioStop?.(cfg.trackId);
  };

  return (
    <div className="flex-shrink-0">
      <div className={DM_HEADER} onClick={onToggle}>
        🎵 Audio Management
        <span className={`${DM_ARROW} ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
      </div>

      {isExpanded && (
        <>
          {/* Music & Ambience */}
          {singleTracks.map((cfg) => (
            <React.Fragment key={cfg.trackId}>
              <div className="text-white font-bold mt-4">
                {cfg.type === 'music' ? 'Music' : 'Ambience'}
              </div>
              <AudioTrack
                config={{
                  ...cfg,
                  analyserNode: remoteTrackAnalysers[cfg.trackId]
                }}
                trackState={
                  remoteTrackStates[cfg.trackId] || {
                    playing: false,
                    volume: 0.7,
                    currentTime: 0,
                    duration: 0,
                    looping: true
                  }
                }
                onPlay={() => handlePlay(cfg)}
                onPause={() => handlePause(cfg)}
                onStop={() => handleStop(cfg)}
                onVolumeChange={(v) =>
                  setRemoteTrackVolume?.(cfg.trackId, v)
                }
                onVolumeChangeDebounced={(v) =>
                  sendRemoteAudioVolume?.(cfg.trackId, v)
                }
                onLoopToggle={(id, loop) =>
                  toggleRemoteTrackLooping?.(id, loop)
                }
                isLast={false}
              />
            </React.Fragment>
          ))}

          {/* Sound Effects */}
          <div className="text-white font-bold mt-6">Sound Effects</div>
          {sfxTracks.map((cfg, idx) => (
            <AudioTrack
              key={cfg.trackId}
              config={{
                ...cfg,
                type: 'sfx',
                analyserNode: remoteTrackAnalysers[cfg.trackId]
              }}
              trackState={
                remoteTrackStates[cfg.trackId] || {
                  playing: false,
                  volume: 0.8,
                  currentTime: 0,
                  duration: 0,
                  looping: false
                }
              }
              onPlay={() => handlePlay(cfg)}
              onPause={() => handlePause(cfg)}
              onStop={() => handleStop(cfg)}
              onVolumeChange={(v) =>
                setRemoteTrackVolume?.(cfg.trackId, v)
              }
              onVolumeChangeDebounced={(v) =>
                sendRemoteAudioVolume?.(cfg.trackId, v)
              }
              onLoopToggle={() => {}}
              isLast={idx === sfxTracks.length - 1}
            />
          ))}
        </>
      )}
    </div>
  );
}