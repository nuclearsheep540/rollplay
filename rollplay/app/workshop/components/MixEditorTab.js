/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlay, faStop, faFolderOpen, faXmark, faFileCircleXmark, faSliders } from '@fortawesome/free-solid-svg-icons';
import { MixerStrips } from '@/app/audio_management/components';
import { useListPresets } from '../hooks/usePresets';
import { useWorkshopMixEngine } from '../hooks/useWorkshopMixEngine';
import FileMenuBar from './FileMenuBar';
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
  const [showOpenModal, setShowOpenModal] = useState(false);

  const selectedPreset = useMemo(
    () => presets.find(p => p.id === selectedPresetId) ?? null,
    [presets, selectedPresetId]
  );

  const mix = useWorkshopMixEngine(selectedPreset);

  return (
    <div className="flex flex-col h-full border border-border bg-surface-secondary overflow-hidden">
      <FileMenuBar
        items={[
          {
            label: 'Open Preset',
            icon: faFolderOpen,
            onClick: () => setShowOpenModal(true),
            disabled: isLoading || presets.length === 0,
          },
          {
            label: 'Close Preset',
            icon: faFileCircleXmark,
            onClick: () => onSelectPreset(null),
            disabled: !selectedPreset,
          },
        ]}
      />

      {/* Context bar — active preset + transport */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-surface-secondary flex-shrink-0">
        <span className="text-xs font-bold uppercase tracking-wider text-content-on-dark">
          Preset:
        </span>
        <span className="text-sm text-content-on-dark truncate">
          {isLoading
            ? 'Loading…'
            : selectedPreset
              ? selectedPreset.name
              : presets.length === 0
                ? 'No presets — create one in the Presets tab'
                : 'No preset open — File → Open Preset'}
        </span>
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
              <button
                onClick={mix.onResetAll}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-sm border border-border text-content-secondary hover:border-border-active hover:text-content-on-dark transition-colors"
                title="Reset levels, EQ, and reverb to defaults on every loaded channel"
              >
                <FontAwesomeIcon icon={faSliders} className="text-[10px]" />
                Reset mix
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
              Pick a preset via File → Open Preset to start mixing.
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

      {/* Open Preset modal */}
      {showOpenModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(11, 10, 9, 0.8)' }}
          onClick={() => setShowOpenModal(false)}
        >
          <div
            className="w-full max-w-md max-h-[70vh] rounded border border-border bg-surface-secondary p-6 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-content-on-dark uppercase tracking-wider">
                Open Preset
              </h2>
              <button
                onClick={() => setShowOpenModal(false)}
                className="text-content-secondary hover:text-content-on-dark"
                aria-label="Close"
              >
                <FontAwesomeIcon icon={faXmark} className="text-sm" />
              </button>
            </div>
            {presets.length === 0 ? (
              <div className="text-xs text-content-secondary py-4">
                No presets yet. Create one in the Presets tab.
              </div>
            ) : (
              <ul className="flex flex-col gap-1">
                {presets.map(preset => {
                  const isActive = preset.id === selectedPresetId;
                  return (
                    <li key={preset.id}>
                      <button
                        onClick={() => {
                          onSelectPreset(preset.id);
                          setShowOpenModal(false);
                        }}
                        className="w-full text-left px-3 py-2 rounded-sm border border-border transition-colors"
                        style={{
                          backgroundColor: isActive ? COLORS.smoke : 'transparent',
                          color: isActive ? COLORS.onyx : COLORS.smoke,
                        }}
                      >
                        <div className="text-sm" style={{ fontWeight: isActive ? 600 : 500 }}>
                          {preset.name}
                        </div>
                        <div
                          className="text-[10px] mt-0.5"
                          style={{ color: isActive ? COLORS.graphite : COLORS.silver }}
                        >
                          {preset.slots.length} {preset.slots.length === 1 ? 'track' : 'tracks'}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
