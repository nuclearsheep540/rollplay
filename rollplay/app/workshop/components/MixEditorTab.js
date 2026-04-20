/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlay, faStop } from '@fortawesome/free-solid-svg-icons';
import { MixerStrips } from '@/app/audio_management/components';
import { useListPresets } from '../hooks/usePresets';
import { useWorkshopMixEngine } from '../hooks/useWorkshopMixEngine';
import { COLORS } from '@/app/styles/colorTheme';

/**
 * Mix Editor — standalone equivalent of the game's bottom-mixer drawer.
 * User picks a preset, hears the tracks through a local engine, and tweaks
 * volume / effects / mute / solo per channel. Every change debounce-PATCHes
 * to `/api/library/{id}/audio-config` so the asset's defaults update.
 *
 * `selectedPresetId` / `onSelectPreset` are lifted to the parent Audio
 * Workstation shell so the Presets tab's "Mix" hot-link can pre-select.
 */
export default function MixEditorTab({ selectedPresetId, onSelectPreset }) {
  const { data: presets = [], isLoading } = useListPresets();

  const selectedPreset = useMemo(
    () => presets.find(p => p.id === selectedPresetId) ?? null,
    [presets, selectedPresetId]
  );

  const mix = useWorkshopMixEngine(selectedPreset);

  return (
    <div className="flex flex-col h-full border border-border bg-surface-secondary overflow-hidden">
      {/* Preset picker bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-surface-secondary flex-shrink-0">
        <span className="text-xs font-bold uppercase tracking-wider text-content-on-dark">
          Preset:
        </span>
        <select
          value={selectedPresetId ?? ''}
          onChange={(e) => onSelectPreset(e.target.value || null)}
          disabled={isLoading || presets.length === 0}
          className="px-3 py-1.5 text-sm bg-surface-primary border border-border rounded-sm focus:outline-none focus:border-border-active"
          style={{ color: COLORS.onyx }}
        >
          <option value="">
            {isLoading
              ? 'Loading...'
              : presets.length === 0
                ? 'No presets — create one in the Presets tab'
                : 'Select a preset...'}
          </option>
          {presets.map(preset => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
              {preset.slots.length > 0 ? ` (${preset.slots.length})` : ''}
            </option>
          ))}
        </select>
        {selectedPreset && (
          <>
            <div className="flex items-center gap-1.5 ml-auto">
              <button
                onClick={mix.onPlayAll}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-sm border border-border text-content-secondary hover:border-border-active hover:text-content-on-dark transition-colors"
                title="Play all loaded channels"
              >
                <FontAwesomeIcon icon={faPlay} className="text-[10px]" />
                Play all
              </button>
              <button
                onClick={mix.onStopAll}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-sm border border-border text-content-secondary hover:border-border-active hover:text-content-on-dark transition-colors"
                title="Stop all channels"
              >
                <FontAwesomeIcon icon={faStop} className="text-[10px]" />
                Stop all
              </button>
            </div>
            <span className="text-[10px] uppercase tracking-wider text-content-secondary">
              Changes save to each asset's defaults.
            </span>
          </>
        )}
      </div>

      {/* Mixer body */}
      <div className="flex-1 min-h-0" style={{ backgroundColor: COLORS.carbon }}>
        {!selectedPreset ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-sm text-content-secondary">
              Pick a preset above to mix.
            </div>
          </div>
        ) : (
          <div className="mixer-strips-layout">
            <MixerStrips
              trackStates={mix.trackStates}
              trackAnalysers={mix.trackAnalysers}
              setTrackVolume={mix.setTrackVolume}
              onVolumeCommit={mix.onVolumeCommit}
              onPlay={mix.onPlay}
              onPause={mix.onPause}
              onStop={mix.onStop}
              onLoopCommit={mix.onLoopCommit}
              channelEffects={mix.channelEffects}
              applyChannelEffects={mix.applyChannelEffects}
              setEffectMixLevel={mix.setEffectMixLevel}
              onEffectsChange={mix.onEffectsChange}
              mutedChannels={mix.mutedChannels}
              soloedChannels={mix.soloedChannels}
              setChannelMuted={mix.setChannelMuted}
              setChannelSoloed={mix.setChannelSoloed}
              masterAnalysers={mix.masterAnalysers}
              masterVolume={mix.masterVolume}
              onMasterVolumeChange={mix.onMasterVolumeChange}
              onMasterVolumeCommit={mix.onMasterVolumeCommit}
            />
          </div>
        )}
      </div>
    </div>
  );
}
