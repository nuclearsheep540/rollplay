/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import React, { useRef, useEffect } from 'react';
import { PlaybackState } from '../hooks/useUnifiedAudio';
import {
  DM_SUB_HEADER,
  DM_CHILD,
  DM_CHILD_LAST,
  MIXER_FADER,
  AUDIO_INDICATOR_BASE,
  AUDIO_INDICATOR_SYNCED,
  AUDIO_INDICATOR_UNSYNCED,
  AUDIO_INDICATOR_NORMAL
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
  syncMode = false,
  pendingOperations = { play: false, pause: false, stop: false, loop: false },
  isLast = false
}) {
  const { trackId, type, icon, label, analyserNode, isRouted, track, isDisabled } = config;
  const {
    playbackState = PlaybackState.STOPPED,
    volume = 1.0,
    filename,
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
      const smoothed = lastRms * 0.85 + rms * 0.15;
      lastRms = smoothed;
  
      // convert to percentage
      let pct = Math.min(1, smoothed) * 100;
      pct = (pct * 3) * (trackState.volume)

      // fake a 15% boost based off our smoothness
      pct > 5 ? pct = pct * 1.15 : null
  
      // defend against missing ref in mid-cleanup
      const rms_hot = 40;
      const rms_peak = 60;
      
      const fillColor =
        pct >= rms_peak ? '#FF0000'
        : pct >= rms_hot ? '#FFD700'
        : '#04AA6D';

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
    <div key={trackId} className='flex'>
      {filename && (
        <div className="flex-none w-[18px] mr-2 flex">
          {track && (
          <div className={`text-center text-xs px-1 rounded-sm font-bold w-full flex items-center justify-center ${AUDIO_INDICATOR_BASE} ${
            syncMode 
              ? (isRouted ? AUDIO_INDICATOR_SYNCED : AUDIO_INDICATOR_UNSYNCED)
              : AUDIO_INDICATOR_NORMAL
          } ${isLast ? 'mb-4' : ''}`} style={{ writingMode: 'vertical-rl' }}>
            {track}
          </div>
        )}
        </div>
      )}
      <div className={`${isLast ? DM_CHILD_LAST : DM_CHILD} ${isDisabled ? 'opacity-40 pointer-events-none' : ''} flex-1`}>
        {/* Header */}
        <div className="flex justify-between items-center mb-2">
          <div className="text-white font-mono text-sm">
            <div className="flex items-center gap-2">
              {filename || label || trackId}
              {/* A/B Routing Indicator */}

              {isRouted && (
                <span className="text-green-400 text-xs">🔊 LIVE</span>
              )}
              {isDisabled && (
                <span className="text-gray-500 text-xs">🚫 DISABLED</span>
              )}
            </div>
          </div>
          <div className="text-gray-400 font-mono text-xs">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>
        </div>

        {/* Transport */}
        <div className="flex gap-2 items-center mb-3">
          {playbackState === PlaybackState.PLAYING ? (
            <button
              className={`bg-orange-600 hover:bg-orange-700 text-white px-3 py-1 rounded text-xs flex items-center gap-1 ${
                pendingOperations.pause ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              onClick={onPause}
              disabled={pendingOperations.pause}
            >
              ⏸ {pendingOperations.pause ? 'PAUSING...' : 'PAUSE'}
            </button>
          ) : playbackState === PlaybackState.PAUSED ? (
            <button
              className={`bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs flex items-center gap-1 ${
                pendingOperations.play ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              onClick={onPlay}
              disabled={pendingOperations.play}
              title="Resume from paused position"
            >
              ▶ {pendingOperations.play ? 'RESUMING...' : 'RESUME'}
            </button>
          ) : (
            <button
              className={`bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-xs flex items-center gap-1 ${
                pendingOperations.play ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              onClick={onPlay}
              disabled={pendingOperations.play}
              title="Play from beginning"
            >
              ▶ {pendingOperations.play ? 'PLAYING...' : 'PLAY'}
            </button>
          )}
          <button
            className={`bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-xs flex items-center gap-1 ${
              pendingOperations.stop ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            onClick={onStop}
            disabled={pendingOperations.stop}
          >
            ⏹ {pendingOperations.stop ? 'STOPPING...' : 'STOP'}
          </button>
          {type !== 'sfx' && (
            <button
              className={`text-xs px-2 py-1 rounded ml-2 transition-all duration-200 ${
                pendingOperations.loop 
                  ? 'opacity-50 cursor-not-allowed bg-gray-500 text-gray-300'
                  : looping
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-gray-600 hover:bg-gray-700 text-gray-300'
              }`}
              onClick={() =>
                onLoopToggle && onLoopToggle(trackId, !looping)
              }
              disabled={pendingOperations.loop}
              title={pendingOperations.loop ? 'Updating loop setting...' : (looping ? 'Disable looping' : 'Enable looping')}
            >
              🔄 {pendingOperations.loop ? 'UPDATING...' : (looping ? 'LOOP' : 'ONCE')}
            </button>
          )}
        </div>

        {/* Level Slider w/ Analyser-driven fill */}
        <div className="flex items-center gap-1">
          <span className="mt-3 font-mono">dB</span>
          <div className="flex-1 font-mono">
            <datalist id="markers">
              <option value="15" label="-48" />
              <option value="30" label="-36" />
              <option value="40" label="-24" />
              <option value="50" label="-12" />
              <option value="60" label="-3" />
              <option value="70" label="-0" className='mr-12' />
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