/*
 * SfxSoundboard.js — 3x3 SFX trigger grid with inline Popover picker
 *
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import React, { useState, useRef, useCallback, useMemo } from 'react';
import { Popover, PopoverButton, PopoverPanel, PopoverGroup } from '@headlessui/react';
import { useAssets } from '@/app/asset_library/hooks/useAssets';
import { useUploadAsset } from '@/app/asset_library/hooks/useUploadAsset';
import { useAssociateAsset } from '@/app/asset_library/hooks/useAssociateAsset';
import { DM_CHILD } from '../../styles/constants';

const ACCEPTED_AUDIO_TYPES = ['audio/mpeg', 'audio/wav', 'audio/ogg'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

const stripExtension = (filename) => filename?.replace(/\.[^.]+$/, '') || '';

export default function SfxSoundboard({
  sfxSlots = [],
  onTrigger,
  onVolumeChange,
  onAssetSelected,
  onClear,
  campaignId,
  isAudioUnlocked,
  unlockAudio,
}) {
  const [showCampaignSfx, setShowCampaignSfx] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const fileInputRef = useRef(null);
  const uploadTargetSlot = useRef(null);
  const volumeDebounceTimers = useRef({});

  // Campaign SFX assets (fetched when Library is expanded)
  const { data: campaignAssets = [], isLoading: campaignLoading } = useAssets({
    assetType: 'sfx',
    campaignId,
    enabled: !!campaignId && showCampaignSfx,
  });

  // Full library (only when library sub-section is open)
  const { data: allAssets = [], isLoading: libraryLoading } = useAssets({
    assetType: 'sfx',
    enabled: showLibrary,
  });

  // Filter library to exclude assets already in campaign
  const libraryAssets = useMemo(() => {
    const ids = new Set(campaignAssets.map(a => a.id));
    return allAssets.filter(a => !ids.has(a.id));
  }, [allAssets, campaignAssets]);

  const uploadMutation = useUploadAsset();
  const associateMutation = useAssociateAsset();

  const handleTrigger = async (slotIndex) => {
    const slot = sfxSlots[slotIndex];
    if (!slot?.filename) return;

    if (!isAudioUnlocked && unlockAudio) {
      const unlocked = await unlockAudio();
      if (!unlocked) return;
    }

    onTrigger?.(slotIndex);
  };

  const handleVolumeChange = useCallback((slotIndex, volume) => {
    if (volumeDebounceTimers.current[slotIndex]) {
      clearTimeout(volumeDebounceTimers.current[slotIndex]);
    }
    volumeDebounceTimers.current[slotIndex] = setTimeout(() => {
      onVolumeChange?.(slotIndex, volume);
      delete volumeDebounceTimers.current[slotIndex];
    }, 300);
  }, [onVolumeChange]);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE || !ACCEPTED_AUDIO_TYPES.includes(file.type)) {
      console.warn('Invalid file: check type/size');
      e.target.value = '';
      return;
    }

    const slotIndex = uploadTargetSlot.current;
    if (slotIndex === null) return;

    try {
      const result = await uploadMutation.mutateAsync({
        file,
        assetType: 'sfx',
        campaignId,
      });
      if (result) {
        onAssetSelected?.(slotIndex, result);
      }
    } catch (err) {
      console.error('SFX upload failed:', err);
    }
    e.target.value = '';
  };

  const handleUploadClick = (slotIndex) => {
    uploadTargetSlot.current = slotIndex;
    fileInputRef.current?.click();
  };

  const handleAssociateAsset = async (asset) => {
    if (!campaignId || associateMutation.isPending) return;
    try {
      await associateMutation.mutateAsync({ assetId: asset.id, campaignId });
    } catch {
      // Error available via associateMutation.error
    }
  };


  return (
    <div className="mt-2">
      {/* Hidden file input for upload */}
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileChange}
        accept={ACCEPTED_AUDIO_TYPES.join(',')}
        className="hidden"
      />

      <PopoverGroup className="grid grid-cols-3 gap-2">
        {sfxSlots.map((slot, index) => {
          const hasAsset = !!slot.filename;
          const isPlaying = slot.isPlaying;

          return (
            <div
              key={slot.trackId}
              className={`${DM_CHILD} flex flex-col items-center p-2 rounded`}
            >
              {/* Label row: "Clear" CTA (loaded) or "Empty" static label (empty) */}
              {hasAsset ? (
                <button
                  className="w-full text-xs mb-1 px-1 py-0.5 rounded text-center transition-colors bg-gray-700/80 text-gray-300 hover:bg-red-700 hover:text-white"
                  onClick={() => onClear?.(index)}
                  title="Clear this slot"
                >
                  Clear
                </button>
              ) : (
                <span className="w-full text-xs mb-1 px-1 py-0.5 text-center text-gray-500">
                  Empty
                </span>
              )}

              {/* Trigger button — click to play (loaded) or open picker (empty) */}
              {hasAsset ? (
                <button
                  className={`w-full aspect-square rounded-md text-sm font-bold transition-all duration-150 flex items-center justify-center ${
                    isPlaying
                      ? 'bg-emerald-500 text-white ring-2 ring-emerald-300 shadow-lg shadow-emerald-500/30'
                      : 'bg-emerald-700 hover:bg-emerald-600 text-white active:bg-emerald-500'
                  }`}
                  onClick={() => handleTrigger(index)}
                  title={`Play ${slot.filename}`}
                >
                  <span className="text-[10px] leading-tight text-center w-full truncate px-1">
                    {stripExtension(slot.filename)}
                  </span>
                </button>
              ) : (
                <Popover className="relative w-full">
                  <PopoverButton
                    className="w-full aspect-square rounded-md text-sm font-bold transition-all duration-150 flex items-center justify-center bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-gray-200 focus:outline-none"
                    title="Click to load SFX"
                  >
                    {index + 1}
                  </PopoverButton>

                  <PopoverPanel
                    anchor="bottom start"
                    className="z-50 w-56 bg-gray-800 border border-gray-600 rounded shadow-xl [--anchor-gap:4px]"
                  >
                    {({ close }) => (
                      <div className="p-2 max-h-64 overflow-y-auto">
                        {/* Action buttons */}
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => setShowCampaignSfx(!showCampaignSfx)}
                            className={`flex-1 px-2 py-1.5 text-xs rounded transition-colors ${
                              showCampaignSfx ? 'bg-sky-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                            }`}
                          >
                            Library
                          </button>
                          <button
                            onClick={() => handleUploadClick(index)}
                            disabled={uploadMutation.isPending}
                            className="flex-1 px-2 py-1.5 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600 transition-colors disabled:opacity-50"
                          >
                            Upload
                          </button>
                        </div>

                        {/* Campaign SFX (shown when Library is toggled) */}
                        {showCampaignSfx && (
                          <div className="mt-2 pt-2 border-t border-gray-600">
                            {campaignLoading && (
                              <div className="text-center py-2">
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-sky-500 mx-auto" />
                              </div>
                            )}

                            {!campaignLoading && campaignAssets.length > 0 && (
                              <div className="space-y-0.5">
                                {campaignAssets.map((asset) => (
                                  <button
                                    key={asset.id}
                                    onClick={() => {
                                      onAssetSelected?.(index, asset);
                                      close();
                                    }}
                                    className="w-full text-left px-2 py-1.5 text-xs text-gray-200 rounded hover:bg-emerald-800/40 transition-colors truncate"
                                  >
                                    {asset.filename}
                                  </button>
                                ))}
                              </div>
                            )}

                            {!campaignLoading && campaignAssets.length === 0 && (
                              <p className="text-gray-500 text-xs text-center py-2">No SFX in campaign</p>
                            )}

                            {/* Full library sub-section */}
                            <div className="border-t border-gray-600 my-1.5" />
                            <button
                              onClick={() => setShowLibrary(!showLibrary)}
                              className={`w-full px-2 py-1.5 text-xs rounded transition-colors ${
                                showLibrary ? 'bg-sky-600/60 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                              }`}
                            >
                              Browse full library
                            </button>

                            {showLibrary && (
                              <div className="mt-1.5 space-y-0.5">
                                {libraryLoading && (
                                  <div className="text-center py-2">
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-sky-500 mx-auto" />
                                  </div>
                                )}

                                {!libraryLoading && libraryAssets.length === 0 && (
                                  <p className="text-gray-500 text-xs text-center py-1">No additional SFX in library</p>
                                )}

                                {associateMutation.error && (
                                  <p className="text-red-400 text-xs mb-1">{associateMutation.error.message}</p>
                                )}

                                {!libraryLoading && libraryAssets.length > 0 && (
                                  <div className="space-y-0.5">
                                    {libraryAssets.map((asset) => (
                                      <div key={asset.id} className="flex items-center gap-1 px-1 py-1 rounded hover:bg-gray-700/50">
                                        <span className="flex-1 text-xs text-gray-300 truncate">{asset.filename}</span>
                                        <button
                                          onClick={() => handleAssociateAsset(asset)}
                                          disabled={associateMutation.isPending}
                                          className="px-1.5 py-0.5 text-[10px] bg-sky-600 text-white rounded hover:bg-sky-500 disabled:opacity-50 flex-shrink-0"
                                        >
                                          Add
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </PopoverPanel>
                </Popover>
              )}

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
      </PopoverGroup>

      {/* Upload progress indicator */}
      {uploadMutation.isPending && (
        <div className="mt-2 px-2">
          <div className="h-1 bg-gray-600 rounded-full overflow-hidden">
            <div className="h-full bg-sky-500 transition-all" style={{ width: `${uploadMutation.progress}%` }} />
          </div>
          <p className="text-xs text-gray-400 text-center mt-1">Uploading...</p>
        </div>
      )}
    </div>
  );
}
