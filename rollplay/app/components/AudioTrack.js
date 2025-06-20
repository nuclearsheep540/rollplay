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

// Read out to DB in the track level
function volumeToDb(volume) {
  if (volume === 0) return -Infinity;
  return 40 * Math.log10(volume);
}

export default function AudioTrack({
  config,
  trackState,
  onPlay,
  onPause,
  onStop,
  onVolumeChange,
  onVolumeChangeDebounced,
  onLoopToggle,
  isLast = false
}) {
  
  const { trackId, type, icon, label, filename } = config;
  const { playing, volume = 0.7, currentTime = 0, duration = 0, looping = true } = trackState;
  
  // Debounce timer for volume changes
  const volumeDebounceTimer = useRef(null);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (volumeDebounceTimer.current) {
        clearTimeout(volumeDebounceTimer.current);
      }
    };
  }, []);

  // Debounced volume change handler
  const handleVolumeChange = (newVolume) => {
    console.log(`🎛️ [LOCAL] Volume changed to ${Math.round(newVolume * 100)}% for ${trackId}`);
    
    // Immediately update local UI (onVolumeChange updates local state)
    onVolumeChange(newVolume);
    
    // Clear existing timer
    if (volumeDebounceTimer.current) {
      clearTimeout(volumeDebounceTimer.current);
    }
    
    // Set new timer to delay the WebSocket send
    volumeDebounceTimer.current = setTimeout(() => {
      console.log(`⏰ [TIMEOUT] Sending debounced volume for ${trackId} after 500ms`);
      // This should trigger the WebSocket send after 500ms of no changes
      if (onVolumeChangeDebounced) {
        onVolumeChangeDebounced(newVolume);
      }
    }, 500);
  };

  // Handle slider release (immediate send like color picker close)
  const handleVolumeRelease = (newVolume) => {
    console.log(`🖱️ [RELEASE] Slider released at ${Math.round(newVolume * 100)}% for ${trackId}, sending immediately`);
    
    // Clear any pending debounced calls
    if (volumeDebounceTimer.current) {
      clearTimeout(volumeDebounceTimer.current);
      volumeDebounceTimer.current = null;
    }
    
    // Immediately send the final volume when slider is released
    if (onVolumeChangeDebounced) {
      onVolumeChangeDebounced(newVolume);
    }
  };

  return (
    <div key={config.filename}>
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
        <div className="flex items-center gap-1">
          <span className='mt-3'>dB</span>
          <div className="flex-1">
            <datalist id="markers">
              <option value="0" label="-inf"></option>
              <option value="15" label="-24"></option>
              <option value="30" label="-12"></option>
              <option value="60" label="-6"></option>
              <option value="70" label="-3"></option>
              <option value="100" label="-0" className='mr-6'></option>
              <option value="130" label="+3"></option>
            </datalist>
            <input
              type="range"
              min="0"
              max="1.3"
              step="0.05"
              value={volume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              onMouseUp={(e) => handleVolumeRelease(parseFloat(e.target.value))}
              onTouchEnd={(e) => handleVolumeRelease(parseFloat(e.target.value))}
              className="slider bg-slate-800"
              list="markers"
            />
          </div>
        </div>
      </div>
    </div>
  );
}