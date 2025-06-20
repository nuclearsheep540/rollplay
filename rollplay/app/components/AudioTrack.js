/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import React, { useRef, useEffect } from 'react';
import {
  DM_SUB_HEADER,
  DM_CHILD,
  DM_CHILD_LAST,
  MIXER_FADER
} from '../styles/constants';

// Helper: format seconds → MM:SS
const formatTime = (seconds) => {
  if (!seconds || isNaN(seconds)) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

// dB converter (unused for visualizer, but left in)
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
  const { trackId, type, icon, label, filename, analyserNode } = config;
  const {
    playing,
    volume = 0.7,
    currentTime = 0,
    duration = 0,
    looping = true
  } = trackState;

  // refs for debouncing volume send
  const volumeDebounceTimer = useRef(null);

  // refs for slider fill
  const sliderRef = useRef(null);
  const rafRef = useRef(null);

  // cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (volumeDebounceTimer.current) clearTimeout(volumeDebounceTimer.current);
    };
  }, []);

  // ——————————————————————————————————————
  // 1) Setup RAF loop for real-time fill using existing analyser
  useEffect(() => {
    const analyser = analyserNode;          // from props.config.analyserNode
    const sliderEl = sliderRef.current;
    if (!analyser || !sliderEl) return;     // bail early if no analyser or no DOM
  
    const data = new Uint8Array(analyser.frequencyBinCount);
    let lastRms = 0;                        // remember between frames
  
    const tick = () => {
      // schedule next frame first (so we can bail on cleanup)
      rafRef.current = requestAnimationFrame(tick);
  
      // pull raw waveform
      analyser.getByteTimeDomainData(data);
  
      // compute RMS 0→1
      let sumSquares = 0;
      for (let i = 0; i < data.length; i++) {
        const norm = (data[i] - 128) / 128; // normalize -1→1
        sumSquares += norm * norm;
      }
      const rms = Math.sqrt(sumSquares / data.length);
  
      // simple low-pass in JS: smooth out jagged changes
      const smoothed = lastRms * 0.95 + rms * 0.05;
      lastRms = smoothed;
  
      // convert to percentage
      let pct = Math.min(1, smoothed) * 400;
      pct = (pct * 2) * (trackState.volume) + 6
  
      // defend against missing ref in mid-cleanup
      const threshold1 = 65;
      const threshold2 = 70;
      
      const fillColor =
        pct >= threshold2 ? '#FF0000'                // red above 80
        : pct >= threshold1 ? '#FFD700'              // yellow 60–79
        : '#04AA6D';                                 // green below 60

      if (sliderRef.current) {
        // a "flat" gradient: fillColor up to pct, then grey
        sliderRef.current.style.background = `
          linear-gradient(
            to right,
            ${fillColor} 0%,
            ${fillColor} ${pct}%,
            #555 ${pct}%,
            #555 100%
          )
        `;
      }
    };
  
    // kick it off
    tick();
  
    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [analyserNode, trackState.volume]);

  // debounced volume handler
  const handleVolumeChange = (newVol) => {
    console.log(`🎛️ [LOCAL] Volume ${Math.round(newVol * 100)}% for ${trackId}`);
    onVolumeChange(newVol);

    if (volumeDebounceTimer.current) clearTimeout(volumeDebounceTimer.current);
    volumeDebounceTimer.current = setTimeout(() => {
      console.log(`⏰ [TIMEOUT] Debounced send ${Math.round(newVol * 100)}% for ${trackId}`);
      onVolumeChangeDebounced?.(newVol);
    }, 500);
  };

  // send immediately on release
  const handleVolumeRelease = (newVol) => {
    console.log(`🖱️ [RELEASE] Final volume ${Math.round(newVol * 100)}% for ${trackId}`);
    if (volumeDebounceTimer.current) {
      clearTimeout(volumeDebounceTimer.current);
      volumeDebounceTimer.current = null;
    }
    onVolumeChangeDebounced?.(newVol);
  };

  return (
    <div key={filename}>
      <div className={isLast ? DM_CHILD_LAST : DM_CHILD}>
        {/* Header */}
        <div className="flex justify-between items-center mb-2">
          <div className="text-white font-mono text-sm">{filename}</div>
          <div className="text-gray-400 font-mono text-xs">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>
        </div>

        {/* Transport */}
        <div className="flex gap-2 items-center mb-3">
          {!playing ? (
            <button
              className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-xs flex items-center gap-1"
              onClick={onPlay}
            >
              ▶ PLAY
            </button>
          ) : (
            <button
              className="bg-orange-600 hover:bg-orange-700 text-white px-3 py-1 rounded text-xs flex items-center gap-1"
              onClick={onPause}
            >
              ⏸ PAUSE
            </button>
          )}
          <button
            className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-xs flex items-center gap-1"
            onClick={onStop}
          >
            ⏹ STOP
          </button>
          {type !== 'sfx' && (
            <button
              className={`text-xs px-2 py-1 rounded ml-2 transition-all duration-200 ${
                looping
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-gray-600 hover:bg-gray-700 text-gray-300'
              }`}
              onClick={() =>
                onLoopToggle && onLoopToggle(trackId, !looping)
              }
              title={looping ? 'Disable looping' : 'Enable looping'}
            >
              🔄 {looping ? 'LOOP' : 'ONCE'}
            </button>
          )}
        </div>

        {/* Level Slider w/ Analyser-driven fill */}
        <div className="flex items-center gap-1">
          <span className="mt-3 font-mono">dB</span>
          <div className="flex-1 font-mono">
            <datalist id="markers">
              <option value="0" label="-inf" />
              <option value="15" label="-48" />
              <option value="30" label="-36" />
              <option value="40" label="-24" />
              <option value="50" label="-12" />
              <option value="60" label="-3" />
              <option value="70" label="-0" className='mr-6' />
              <option value="130" label="+3" />
            </datalist>

            <input
              ref={sliderRef}
              type="range"
              min="0.0"
              max="1.3"
              step="0.05"
              value={volume}
              onChange={(e) =>
                handleVolumeChange(parseFloat(e.target.value))
              }
              onMouseUp={(e) =>
                handleVolumeRelease(parseFloat(e.target.value))
              }
              onTouchEnd={(e) =>
                handleVolumeRelease(parseFloat(e.target.value))
              }
              className="slider bg-slate-800"
              list="markers"
            />
          </div>
        </div>
      </div>
    </div>
  );
}