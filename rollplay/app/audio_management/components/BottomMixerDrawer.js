/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import React, { useCallback, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPowerOff } from '@fortawesome/free-solid-svg-icons';
import VerticalChannelStrip from './VerticalChannelStrip';
import FilterKnob from './FilterKnob';
import { PlaybackState, DEFAULT_EFFECTS } from '../types';

/**
 * Bottom mixer drawer — renders vertical channel strips for BGM channels,
 * per-channel effect inserts/sends, and master output.
 *
 * HPF/LPF are inline inserts (fader = cutoff frequency).
 * Reverb is a post-EQ send (fader = wet/dry mix, with solo/mute).
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
  // Loop toggle
  onLoopToggle,
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
  // 'eq' is a master bypass: off bypasses filters at audio graph level,
  // but preserves individual hpf/lpf enabled flags and mix values
  const handleToggleSend = useCallback((trackId, effectName) => {
    const currentEffects = channelEffects[trackId] || {};

    if (effectName === 'eq') {
      const newEnabled = !currentEffects.eq;
      const updatedEffects = { ...currentEffects, eq: newEnabled };
      applyChannelEffects?.(trackId, updatedEffects);
      sendRemoteAudioBatch?.([{
        trackId,
        operation: 'effects',
        effects: updatedEffects,
      }]);
    } else {
      const newEnabled = !currentEffects[effectName];
      const updatedEffects = { ...currentEffects, [effectName]: newEnabled };
      applyChannelEffects?.(trackId, updatedEffects);
      sendRemoteAudioBatch?.([{
        trackId,
        operation: 'effects',
        effects: updatedEffects,
      }]);
    }
  }, [channelEffects, applyChannelEffects, sendRemoteAudioBatch]);

  // Effect mix level handler — updates fader (frequency for HPF/LPF, wet gain for reverb)
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

  // Loop toggle handler — toggles looping and broadcasts
  const handleLoopToggle = useCallback((trackId, looping) => {
    onLoopToggle?.(trackId, looping);
    sendRemoteAudioBatch?.([{
      trackId,
      operation: 'loop',
      looping,
    }]);
  }, [onLoopToggle, sendRemoteAudioBatch]);

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

          return (
            <React.Fragment key={trackId}>
              {/* Group separator (between channel groups, not before first) */}
              {idx > 0 && <div className="mixer-group-separator" />}

              {/* Channel group wrapper — header spans all strips in the group */}
              <div className="flex flex-col h-full flex-shrink-0 min-w-0">
                <div className="text-center text-xs font-bold py-0.5 bg-rose-600 text-white rounded-t tracking-wider">
                  {channelLabel}
                </div>
                <div className="text-center px-1 h-4 flex items-center justify-center bg-gray-800/50 overflow-hidden w-0 min-w-full">
                  <span className="text-[10px] text-gray-200 font-mono truncate" title={trackState.filename || ''}>
                    {trackState.filename ? trackState.filename.replace(/\.[^.]+$/, '') : '—'}
                  </span>
                </div>
                <div className="flex flex-1 min-h-0">

              {/* Channel strip */}
              <VerticalChannelStrip
                stripType="channel"
                label="TRK"
                trackId={trackId}
                trackState={trackState}
                analysers={remoteTrackAnalysers[trackId]}
                volume={trackState.volume ?? 1.0}
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
                isLooping={trackState.looping ?? true}
                onLoopToggle={handleLoopToggle}
                isMuted={mutedChannels[trackId] || false}
                isSoloed={soloedChannels[trackId] || false}
                onMuteToggle={() => setChannelMuted?.(trackId, !mutedChannels[trackId])}
                onSoloToggle={() => setChannelSoloed?.(trackId, !soloedChannels[trackId])}
              />

              {/* EQ strip — shown when EQ is toggled on */}
              {effects.eq && (
                <div className="flex flex-col items-center h-full w-[60px] flex-shrink-0 gap-1">
                  <div className="w-full text-center text-xs font-bold py-1 bg-gray-700 text-gray-300">
                    EQ
                  </div>
                  {/* Control rows — aligned with channel strip rows */}
                  <div className="w-full px-1 flex flex-col gap-1">
                    {/* Row 1 (transport): HPF toggle with label */}
                    <button
                      onClick={() => handleToggleSend(trackId, 'hpf')}
                      className={`w-full h-5 rounded text-[11px] font-bold flex items-center justify-center transition-colors ${
                        effects.hpf ? 'bg-orange-500 text-white' : 'bg-gray-700 text-gray-500 hover:bg-gray-600'
                      }`}
                      title={effects.hpf ? 'Disable HPF' : 'Enable HPF'}
                    >
                      HPF
                    </button>
                    {/* Rows 2-4 (LOOP/EQ/RVB): HPF knob — height matches 3 button rows + 2 gaps */}
                    <div className="w-full" style={{ height: 'calc(3 * 1.25rem + 2 * 0.25rem)' }}>
                      <FilterKnob
                        filterType="hpf"
                        knobOnly
                        enabled={!!effects.hpf}
                        value={effects.hpf_mix ?? DEFAULT_EFFECTS.hpf.mix}
                        color="#f97316"
                        onChange={(val) => handleEffectMixChange(trackId, 'hpf', val)}
                        onChangeEnd={(val) => handleEffectMixChangeDebounced(trackId, 'hpf', val)}
                      />
                    </div>
                    {/* Row 5 (S/M): LPF toggle with label */}
                    <button
                      onClick={() => handleToggleSend(trackId, 'lpf')}
                      className={`w-full h-5 rounded text-[11px] font-bold flex items-center justify-center transition-colors ${
                        effects.lpf ? 'bg-cyan-500 text-white' : 'bg-gray-700 text-gray-500 hover:bg-gray-600'
                      }`}
                      title={effects.lpf ? 'Disable LPF' : 'Enable LPF'}
                    >
                      LPF
                    </button>
                  </div>
                  {/* LPF knob — in the fader area */}
                  <div className="flex-1 flex flex-col items-center justify-start w-full min-h-0">
                    <FilterKnob
                      filterType="lpf"
                      knobOnly
                      enabled={!!effects.lpf}
                      value={effects.lpf_mix ?? DEFAULT_EFFECTS.lpf.mix}
                      color="#06b6d4"
                      onChange={(val) => handleEffectMixChange(trackId, 'lpf', val)}
                      onChangeEnd={(val) => handleEffectMixChangeDebounced(trackId, 'lpf', val)}
                    />
                  </div>
                </div>
              )}

              {/* Reverb effect strip — only shown when reverb is enabled */}
              {effects.reverb && (() => {
                const reverbId = `${trackId}_reverb`;
                return (
                  <VerticalChannelStrip
                    key={reverbId}
                    stripType="effect"
                    label="RVB"
                    trackId={trackId}
                    footerLabel="Mix"
                    analysers={remoteTrackAnalysers[reverbId]}
                    volume={effects.reverb_mix ?? DEFAULT_EFFECTS.reverb.mix}
                    onVolumeChange={(vol) => handleEffectMixChange(trackId, 'reverb', vol)}
                    onVolumeChangeDebounced={(vol) => handleEffectMixChangeDebounced(trackId, 'reverb', vol)}
                    isMuted={mutedChannels[reverbId] || false}
                    isSoloed={soloedChannels[reverbId] || false}
                    onMuteToggle={() => setChannelMuted?.(reverbId, !mutedChannels[reverbId])}
                    onSoloToggle={() => setChannelSoloed?.(reverbId, !soloedChannels[reverbId])}
                    reverbPreset={effects.reverb_preset || 'room'}
                    onReverbPresetChange={(preset) => {
                      const updatedEffects = { ...effects, reverb_preset: preset };
                      applyChannelEffects?.(trackId, updatedEffects);
                      sendRemoteAudioBatch?.([{
                        trackId,
                        operation: 'effects',
                        effects: updatedEffects,
                      }]);
                    }}
                  />
                );
              })()}

                </div>
              </div>
            </React.Fragment>
          );
        })}

        {/* Separator before master */}
        <div className="mixer-separator" />

        {/* Master group wrapper — matching header height for strip alignment */}
        <div className="flex flex-col h-full flex-shrink-0">
          <div className="text-center text-xs font-bold py-0.5 bg-gray-400 text-black rounded-t tracking-wider">
            MASTER
          </div>
          <div className="h-4" />
          <div className="flex flex-1 min-h-0">
            <VerticalChannelStrip
              stripType="master"
              label="OUT"
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
      </div>
    </div>
  );
}
