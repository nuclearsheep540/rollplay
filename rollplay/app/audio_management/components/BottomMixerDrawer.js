/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import React, { useCallback, useEffect, useRef } from 'react';
import VerticalChannelStrip from './VerticalChannelStrip';
import FilterKnob from './FilterKnob';
import { DEFAULT_EFFECTS } from '../types';

/**
 * MixerStrips — the pure rendering of BGM channel strips + per-channel
 * effect inserts/sends + master. No drawer chrome, no game/session/workshop
 * knowledge. Every user-initiated change routes through narrow callbacks:
 * the caller decides whether to broadcast over WebSocket, PATCH an asset,
 * or anything else.
 *
 * HPF/LPF are inline inserts (fader = cutoff frequency).
 * Reverb is a post-EQ send (fader = wet/dry mix, with solo/mute).
 */
export function MixerStrips({
  // BGM channel data
  trackStates = {},
  trackAnalysers = {},
  // Volume — live (every pixel) + commit (on drag-end)
  setTrackVolume,
  onVolumeCommit,
  // Playback
  onPlay,
  onPause,
  onStop,
  pendingOperations = new Set(),
  // Loop toggle
  onLoopCommit,
  // Effect state + commit
  channelEffects = {},
  applyChannelEffects,
  setEffectMixLevel,
  onEffectsChange,
  // Solo/mute
  mutedChannels = {},
  soloedChannels = {},
  setChannelMuted,
  setChannelSoloed,
  // Master
  masterAnalysers,
  masterVolume = 1.0,
  onMasterVolumeChange,
  onMasterVolumeCommit,
}) {
  const bgmChannels = Object.keys(trackStates)
    .filter(id => id.startsWith('audio_channel_'))
    .sort();

  const handleVolumeChange = useCallback((trackId, newVol) => {
    setTrackVolume?.(trackId, newVol);
  }, [setTrackVolume]);

  const handleVolumeChangeDebounced = useCallback((trackId, newVol) => {
    onVolumeCommit?.(trackId, newVol);
  }, [onVolumeCommit]);

  // Effect toggle — applies locally, fires commit callback with the new effects object.
  // 'eq' is a master bypass: off bypasses filters at audio graph level but
  // preserves individual hpf/lpf enabled flags and mix values.
  const handleToggleSend = useCallback((trackId, effectName) => {
    const currentEffects = channelEffects[trackId] || {};
    const key = effectName === 'eq' ? 'eq' : effectName;
    const updatedEffects = { ...currentEffects, [key]: !currentEffects[key] };
    applyChannelEffects?.(trackId, updatedEffects);
    onEffectsChange?.(trackId, updatedEffects);
  }, [channelEffects, applyChannelEffects, onEffectsChange]);

  const handleEffectMixChange = useCallback((trackId, effectName, mixLevel) => {
    setEffectMixLevel?.(trackId, effectName, mixLevel);
  }, [setEffectMixLevel]);

  const handleEffectMixChangeDebounced = useCallback((trackId, effectName, mixLevel) => {
    const currentEffects = channelEffects[trackId] || {};
    onEffectsChange?.(trackId, { ...currentEffects, [`${effectName}_mix`]: mixLevel });
  }, [channelEffects, onEffectsChange]);

  // Loop button on a channel strip is a binary toggle — Off ↔ "the loop
  // mode this track is configured with". We remember the last non-off
  // mode per track so toggling back on restores the DM's intent (they
  // saved this track with continuous or region looping; tapping the
  // button shouldn't forget which). Falls back to 'full' if we've never
  // seen anything other than 'off'.
  const lastNonOffModeRef = useRef({});
  useEffect(() => {
    for (const [id, state] of Object.entries(trackStates)) {
      if (state?.loop_mode && state.loop_mode !== 'off') {
        lastNonOffModeRef.current[id] = state.loop_mode;
      }
    }
  }, [trackStates]);

  const handleLoopToggle = useCallback((trackId) => {
    const current = trackStates[trackId]?.loop_mode
      || (trackStates[trackId]?.looping === false ? 'off' : 'full');
    const next = current === 'off'
      ? (lastNonOffModeRef.current[trackId] || 'full')
      : 'off';
    onLoopCommit?.(trackId, next !== 'off', next);
  }, [trackStates, onLoopCommit]);

  return (
    <>
      {/* BGM Channel groups — each channel + its enabled effect strips */}
      {bgmChannels.map((trackId, idx) => {
        const channelLabel = trackId.replace('audio_channel_', '');
        const trackState = trackStates[trackId] || {};
        const effects = channelEffects[trackId] || {};

        return (
          <React.Fragment key={trackId}>
            {idx > 0 && <div className="mixer-group-separator" />}

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
                  analysers={trackAnalysers[trackId]}
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
                  loopMode={trackState.loop_mode || null}
                  hasLoopRegion={trackState.loop_start != null && trackState.loop_end != null}
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
                    <div className="w-full px-1 flex flex-col gap-1">
                      <button
                        onClick={() => handleToggleSend(trackId, 'hpf')}
                        className={`w-full h-5 rounded text-[11px] font-bold flex items-center justify-center transition-colors ${
                          effects.hpf ? 'bg-orange-500 text-white' : 'bg-gray-700 text-gray-500 hover:bg-gray-600'
                        }`}
                        title={effects.hpf ? 'Disable HPF' : 'Enable HPF'}
                      >
                        HPF
                      </button>
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
                      analysers={trackAnalysers[reverbId]}
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
                        onEffectsChange?.(trackId, updatedEffects);
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

      {/* Master group wrapper */}
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
            onVolumeChangeDebounced={(vol) => onMasterVolumeCommit?.(vol)}
            isMuted={false}
            onMuteToggle={() => {}}
          />
        </div>
      </div>
    </>
  );
}

/**
 * BottomMixerDrawer — the game's drawer wrapper around MixerStrips.
 * Slides in/out via `isOpen`; renders `AUDIO MIXER` toggle tab and the
 * strip grid. Workshop uses `<MixerStrips>` directly without this chrome.
 */
export default function BottomMixerDrawer({ isOpen, onToggle, ...mixerProps }) {
  return (
    <div
      className="bottom-mixer-drawer"
      style={{ transform: isOpen ? 'translateY(0)' : 'translateY(100%)' }}
    >
      <button
        className={`bottom-mixer-tab ${isOpen ? 'active' : ''}`}
        onClick={onToggle}
      >
        AUDIO MIXER
      </button>
      <div className="drawer-content">
        <MixerStrips {...mixerProps} />
      </div>
    </div>
  );
}
