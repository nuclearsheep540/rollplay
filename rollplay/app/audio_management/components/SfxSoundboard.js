/*
 * SfxSoundboard.js — 3x3 SFX trigger grid
 *
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import React, { useState, useRef, useCallback } from 'react';
import AudioSelectionModal from './AudioSelectionModal';
import { ChannelType } from '../types';
import { DM_CHILD } from '../../styles/constants';

export default function SfxSoundboard({
  sfxSlots = [],
  onTrigger,
  onVolumeChange,
  onAssetSelected,
  campaignId,
  isAudioUnlocked,
  unlockAudio,
}) {
  const [activeSlot, setActiveSlot] = useState(null);
  const volumeDebounceTimers = useRef({});

  const handleTrigger = async (slotIndex) => {
    const slot = sfxSlots[slotIndex];
    if (!slot?.filename) {
      // No asset loaded — open selector instead
      setActiveSlot(slotIndex);
      return;
    }

    // Ensure audio is unlocked before playing
    if (!isAudioUnlocked && unlockAudio) {
      const unlocked = await unlockAudio();
      if (!unlocked) return;
    }

    onTrigger?.(slotIndex);
  };

  const handleVolumeChange = useCallback((slotIndex, volume) => {
    // Clear existing debounce for this slot
    if (volumeDebounceTimers.current[slotIndex]) {
      clearTimeout(volumeDebounceTimers.current[slotIndex]);
    }

    // Debounce WebSocket send
    volumeDebounceTimers.current[slotIndex] = setTimeout(() => {
      onVolumeChange?.(slotIndex, volume);
      delete volumeDebounceTimers.current[slotIndex];
    }, 300);
  }, [onVolumeChange]);

  const handleAssetSelected = (channelId, asset) => {
    if (activeSlot !== null) {
      onAssetSelected?.(activeSlot, asset);
      setActiveSlot(null);
    }
  };

  const handleModalClose = () => {
    setActiveSlot(null);
  };

  return (
    <div className="mt-2">
      <div className="grid grid-cols-3 gap-2">
        {sfxSlots.map((slot, index) => {
          const hasAsset = !!slot.filename;
          const isPlaying = slot.isPlaying;

          return (
            <div
              key={slot.trackId}
              className={`${DM_CHILD} flex flex-col items-center p-2 rounded`}
            >
              {/* Asset name / load button */}
              <button
                className="w-full text-xs truncate mb-1 px-1 py-0.5 rounded text-center transition-colors hover:bg-rose-800/50"
                onClick={() => setActiveSlot(index)}
                title={hasAsset ? `${slot.filename} — click to change` : 'Click to load SFX'}
              >
                {hasAsset ? slot.filename : 'Empty'}
              </button>

              {/* Trigger button */}
              <button
                className={`w-full aspect-square rounded-md text-sm font-bold transition-all duration-150 flex items-center justify-center ${
                  hasAsset
                    ? isPlaying
                      ? 'bg-emerald-500 text-white ring-2 ring-emerald-300 shadow-lg shadow-emerald-500/30'
                      : 'bg-emerald-700 hover:bg-emerald-600 text-white active:bg-emerald-500'
                    : 'bg-gray-700 text-gray-500 cursor-default'
                }`}
                onClick={() => handleTrigger(index)}
                disabled={!hasAsset && activeSlot === index}
                title={hasAsset ? `Play ${slot.filename}` : 'No SFX loaded'}
              >
                {index + 1}
              </button>

              {/* Volume slider */}
              {hasAsset && (
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={slot.volume}
                  onChange={(e) => handleVolumeChange(index, parseFloat(e.target.value))}
                  className="w-full h-1 mt-1 accent-emerald-500 cursor-pointer"
                  title={`Volume: ${Math.round(slot.volume * 100)}%`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Asset selection modal — shared instance */}
      {activeSlot !== null && (
        <AudioSelectionModal
          isOpen={true}
          onClose={handleModalClose}
          onSelectAsset={handleAssetSelected}
          channelId={`sfx_slot_${activeSlot}`}
          channelType={ChannelType.SFX}
          campaignId={campaignId}
        />
      )}
    </div>
  );
}
