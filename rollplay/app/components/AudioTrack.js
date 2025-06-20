/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import React, { useRef, useEffect } from 'react';
import { DM_SUB_HEADER, DM_CHILD, DM_CHILD_LAST, MIXER_FADER } from '../styles/constants';

// Helper function to format time in MM:SS format
const formatTime = (seconds) => {
  if (!seconds || isNaN(seconds)) return "00:00";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
};

export default function AudioTrack({
  config,
  trackState,
  onPlay,
  onPause,
  onStop,
  onVolumeChange,
  onLoopToggle,
  isLast = false
}) {
  
  const { trackId, type, icon, label, filename } = config;
  const { playing, volume = 0.7, currentTime = 0, duration = 0, looping = true } = trackState;

  return (
    <>
      <div className={DM_SUB_HEADER}>{icon} {label}</div>
      <div className={isLast ? DM_CHILD_LAST : DM_CHILD}>
        {/* Track Header with File Name and Time */}
        <div className="flex justify-between items-center mb-2">
          <div className="text-white font-mono text-sm">{filename}</div>
          <div className="text-gray-400 font-mono text-xs">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>
        </div>
        
        {/* Transport Controls */}
        <div className="flex gap-2 items-center mb-3">
          { !playing ? (
          <button 
            className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-xs flex items-center gap-1"
            onClick={onPlay}
          >
            ▶ PLAY
          </button>
          ) : 
   
            <button 
              className="bg-orange-600 hover:bg-orange-700 text-white px-3 py-1 rounded text-xs flex items-center gap-1"
              onClick={onPause}
            >
              ⏸ PAUSE
            </button>
          }
          <button 
            className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-xs flex items-center gap-1"
            onClick={onStop}
          >
            ⏹ STOP
          </button>
          
          {/* Loop Toggle Button - Only show for non-SFX tracks */}
          {type !== 'sfx' && (
            <button
              className={`text-xs px-2 py-1 rounded ml-2 transition-all duration-200 ${
                looping 
                  ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                  : 'bg-gray-600 hover:bg-gray-700 text-gray-300'
              }`}
              onClick={() => onLoopToggle && onLoopToggle(trackId, !looping)}
              title={looping ? 'Disable looping' : 'Enable looping'}
            >
              🔄 {looping ? 'LOOP' : 'ONCE'}
            </button>
          )}
          
          {/* SFX Fixed Label - Always shows ONCE for SFX */}
          {}
        </div>
        
        {/* Level Control - Mixer Style */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-300 font-semibold min-w-[40px]">LEVEL</span>
          <div className="flex-1">
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
              className={MIXER_FADER}
            />
          </div>
          <span className="text-xs text-gray-300 font-mono min-w-[35px]">
            {Math.round(volume * 100)}%
          </span>
        </div>
      </div>
    </>
  );
}