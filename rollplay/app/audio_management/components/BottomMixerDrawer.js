/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import React, { useCallback, useRef } from 'react';
import VerticalChannelStrip from './VerticalChannelStrip';
import { PlaybackState, EFFECT_STRIP_DEFS, DEFAULT_EFFECTS } from '../types';

/**
 * Bottom mixer drawer — renders vertical channel strips for BGM channels,
 * per-channel effect inserts (wet/dry faders), and master output.
 *
 * DM-only. Overlaps side drawers when open (z-index 35).
 */
export default function BottomMixerDrawer({
  isOpen,
  onToggle,
  // BGM channel data
  remoteTrackStates = {},
  remoteTrackAnalysers = {},
  // Volume
  setRemoteTrackVolume,
  sendRemoteAudioBatch,
  // Playback
  onPlay,
  onPause,
  onStop,
  pendingOperations = new Set(),
  // Effect toggles + mix levels
  channelEffects = {},
  applyChannelEffects,
  setEffectMixLevel,
  // Solo/mute
  mutedChannels = {},
  soloedChannels = {},
  setChannelMuted,
  setChannelSoloed,
  // Master
  masterAnalysers,
  masterVolume = 1.0,
  onMasterVolumeChange,
}) {
  const volumeDebounceTimers = useRef({});

  // Get BGM channels sorted
  const bgmChannels = Object.keys(remoteTrackStates)
    .filter(id => id.startsWith('audio_channel_'))
    .sort();

  // Debounced volume handler for channels
  const handleVolumeChange = useCallback((trackId, newVol) => {
    setRemoteTrackVolume?.(trackId, newVol);
  }, [setRemoteTrackVolume]);

  const handleVolumeChangeDebounced = useCallback((trackId, newVol) => {
    if (volumeDebounceTimers.current[trackId]) {
      clearTimeout(volumeDebounceTimers.current[trackId]);
    }
    sendRemoteAudioBatch?.([{
      trackId,
      operation: 'volume',
      volume: newVol,
    }]);
  }, [sendRemoteAudioBatch]);

  // Effect toggle handler — toggles enabled state and broadcasts
  const handleToggleSend = useCallback((trackId, effectName) => {
    const currentEffects = channelEffects[trackId] || {};
    const newEnabled = !currentEffects[effectName];
    const updatedEffects = { ...currentEffects, [effectName]: newEnabled };

    applyChannelEffects?.(trackId, updatedEffects);
    sendRemoteAudioBatch?.([{
      trackId,
      operation: 'effects',
      effects: updatedEffects,
    }]);
  }, [channelEffects, applyChannelEffects, sendRemoteAudioBatch]);

  // Effect mix level handler — updates wet/dry fader
  const handleEffectMixChange = useCallback((trackId, effectName, mixLevel) => {
    setEffectMixLevel?.(trackId, effectName, mixLevel);
  }, [setEffectMixLevel]);

  // Effect mix level debounced — broadcasts to other clients
  const handleEffectMixChangeDebounced = useCallback((trackId, effectName, mixLevel) => {
    const currentEffects = channelEffects[trackId] || {};
    sendRemoteAudioBatch?.([{
      trackId,
      operation: 'effects',
      effects: { ...currentEffects, [`${effectName}_mix`]: mixLevel },
    }]);
  }, [channelEffects, sendRemoteAudioBatch]);

  return (
    <div
      className="bottom-mixer-drawer"
      style={{ transform: isOpen ? 'translateY(0)' : 'translateY(100%)' }}
    >
      {/* Toggle tab */}
      <button
        className={`bottom-mixer-tab ${isOpen ? 'active' : ''}`}
        onClick={onToggle}
      >
        AUDIO MIXER
      </button>

      {/* Mixer content */}
      <div className="drawer-content">
        {/* BGM Channel groups — each channel + its enabled effect strips */}
        {bgmChannels.map((trackId, idx) => {
          const channelLabel = trackId.replace('audio_channel_', '');
          const trackState = remoteTrackStates[trackId] || {};
          const effects = channelEffects[trackId] || {};
          const enabledEffects = EFFECT_STRIP_DEFS.filter(fx => effects[fx.key]);

          return (
            <React.Fragment key={trackId}>
              {/* Group separator (between channel groups, not before first) */}
              {idx > 0 && <div className="mixer-group-separator" />}

              {/* Channel strip */}
              <VerticalChannelStrip
                stripType="channel"
                label={channelLabel}
                color="rose"
                trackId={trackId}
                trackState={trackState}
                analysers={remoteTrackAnalysers[trackId]}
                volume={trackState.volume || 1.0}
                onVolumeChange={(vol) => handleVolumeChange(trackId, vol)}
                onVolumeChangeDebounced={(vol) => handleVolumeChangeDebounced(trackId, vol)}
                onPlay={() => onPlay?.(trackId)}
                onPause={() => onPause?.(trackId)}
                onStop={() => onStop?.(trackId)}
                pendingOperations={{
                  play: pendingOperations.has?.(`play_${trackId}`) || false,
                  pause: pendingOperations.has?.(`pause_${trackId}`) || false,
                  stop: pendingOperations.has?.(`stop_${trackId}`) || false,
                }}
                sends={effects}
                onToggleSend={handleToggleSend}
                isMuted={mutedChannels[trackId] || false}
                isSoloed={soloedChannels[trackId] || false}
                onMuteToggle={() => setChannelMuted?.(trackId, !mutedChannels[trackId])}
                onSoloToggle={() => setChannelSoloed?.(trackId, !soloedChannels[trackId])}
              />

              {/* Effect insert strips — only shown when enabled */}
              {enabledEffects.map(fx => (
                <VerticalChannelStrip
                  key={`${trackId}_${fx.key}`}
                  stripType="effect"
                  label={fx.label}
                  color={fx.color}
                  trackId={trackId}
                  volume={effects[`${fx.key}_mix`] ?? DEFAULT_EFFECTS[fx.key].mix}
                  onVolumeChange={(vol) => handleEffectMixChange(trackId, fx.key, vol)}
                  onVolumeChangeDebounced={(vol) => handleEffectMixChangeDebounced(trackId, fx.key, vol)}
                />
              ))}
            </React.Fragment>
          );
        })}

        {/* Separator before master */}
        <div className="mixer-separator" />

        {/* Master strip */}
        <VerticalChannelStrip
          stripType="master"
          label="MST"
          color="silver"
          trackId="master"
          analysers={masterAnalysers?.current || null}
          volume={masterVolume}
          onVolumeChange={onMasterVolumeChange}
          onVolumeChangeDebounced={(vol) => {
            sendRemoteAudioBatch?.([{
              trackId: 'master',
              operation: 'master_volume',
              volume: vol,
            }]);
          }}
          isMuted={false}
          onMuteToggle={() => {}}
        />
      </div>
    </div>
  );
}
