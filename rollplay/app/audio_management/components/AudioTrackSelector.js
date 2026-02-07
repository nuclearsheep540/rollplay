/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import React, { useState } from 'react';
import AudioSelectionModal from './AudioSelectionModal';
import { ChannelType } from '../types';
import { DM_CHILD } from '../../styles/constants';

// Channel definitions for track selector rows
const CHANNELS = [
  { id: 'audio_channel_A', label: 'Track A', type: ChannelType.BGM },
  { id: 'audio_channel_B', label: 'Track B', type: ChannelType.BGM },
  { id: 'audio_channel_C', label: 'Track C', type: ChannelType.BGM },
  { id: 'audio_channel_D', label: 'Track D', type: ChannelType.BGM },
  { id: 'audio_channel_3', label: 'SFX 1', type: ChannelType.SFX },
  { id: 'audio_channel_4', label: 'SFX 2', type: ChannelType.SFX },
  { id: 'audio_channel_5', label: 'SFX 3', type: ChannelType.SFX },
  { id: 'audio_channel_6', label: 'SFX 4', type: ChannelType.SFX },
];

/**
 * Audio track selector sub-section inside Audio Management.
 * Shows 8 channel rows (4 BGM + 4 SFX) with loaded filename and select button.
 * Lives inside AudioMixerPanel's expanded content.
 */
export default function AudioTrackSelector({
  remoteTrackStates,
  onAssetSelected,
  campaignId,
}) {
  const [activeChannel, setActiveChannel] = useState(null);

  const handleSelectClick = (channelId) => {
    setActiveChannel(activeChannel === channelId ? null : channelId);
  };

  const handleAssetSelected = (channelId, asset) => {
    onAssetSelected(channelId, asset);
    setActiveChannel(null);
  };

  const handleClose = () => {
    setActiveChannel(null);
  };

  return (
    <div className="mb-2">
      <div className="mt-2 space-y-1">
          {/* BGM Section */}
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Music</p>
          {CHANNELS.filter(c => c.type === ChannelType.BGM).map((channel) => {
            const trackState = remoteTrackStates[channel.id];
            const filename = trackState?.filename;
            const isActive = activeChannel === channel.id;

            return (
              <div key={channel.id}>
                <div className={`flex items-center gap-2 p-2 rounded ${DM_CHILD}`}>
                  <span className="text-xs text-gray-400 w-14 flex-shrink-0 font-mono">{channel.label}</span>
                  <span className={`flex-1 text-xs truncate ${filename ? 'text-gray-200' : 'text-gray-600'}`}>
                    {filename || 'Empty'}
                  </span>
                  <button
                    onClick={() => handleSelectClick(channel.id)}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      isActive ? 'bg-sky-500 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {isActive ? 'Cancel' : 'Select'}
                  </button>
                </div>
                {isActive && (
                  <AudioSelectionModal
                    isOpen={true}
                    onClose={handleClose}
                    onSelectAsset={handleAssetSelected}
                    channelId={channel.id}
                    channelType={channel.type}
                    campaignId={campaignId}
                  />
                )}
              </div>
            );
          })}

          {/* SFX Section */}
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1 mt-3">Sound Effects</p>
          {CHANNELS.filter(c => c.type === ChannelType.SFX).map((channel) => {
            const trackState = remoteTrackStates[channel.id];
            const filename = trackState?.filename;
            const isActive = activeChannel === channel.id;

            return (
              <div key={channel.id}>
                <div className={`flex items-center gap-2 p-2 rounded ${DM_CHILD}`}>
                  <span className="text-xs text-gray-400 w-14 flex-shrink-0 font-mono">{channel.label}</span>
                  <span className={`flex-1 text-xs truncate ${filename ? 'text-gray-200' : 'text-gray-600'}`}>
                    {filename || 'Empty'}
                  </span>
                  <button
                    onClick={() => handleSelectClick(channel.id)}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      isActive ? 'bg-sky-500 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {isActive ? 'Cancel' : 'Select'}
                  </button>
                </div>
                {isActive && (
                  <AudioSelectionModal
                    isOpen={true}
                    onClose={handleClose}
                    onSelectAsset={handleAssetSelected}
                    channelId={channel.id}
                    channelType={channel.type}
                    campaignId={campaignId}
                  />
                )}
              </div>
            );
          })}
        </div>
    </div>
  );
}
