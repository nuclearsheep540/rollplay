/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import React, { useRef, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlay, faPause, faStop } from '@fortawesome/free-solid-svg-icons';
import { PlaybackState } from '../types';
import {
  DM_SUB_HEADER,
  DM_CHILD,
  DM_CHILD_LAST,
  MIXER_FADER,
  AUDIO_INDICATOR_BASE,
  AUDIO_INDICATOR_SYNCED,
  AUDIO_INDICATOR_UNSYNCED,
  AUDIO_INDICATOR_NORMAL
} from '../../styles/constants';

// Helper: format seconds → MM:SS
const formatTime = (seconds) => {
  if (!seconds || isNaN(seconds)) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

// Helper: format remaining seconds → -MM:SS
const formatTimeRemaining = (remaining) => {
  if (!remaining || isNaN(remaining) || remaining <= 0) return '-00:00';
  const m = Math.floor(remaining / 60);
  const s = Math.floor(remaining % 60);
  return `-${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

// RMS → dB → percentage for meter display
const DB_FLOOR = -60;
const DB_CEIL = 0;
function rmsToPct(rms) {
  if (rms < 0.001) return 0;
  const dB = 20 * Math.log10(rms);
  const clamped = Math.max(DB_FLOOR, Math.min(DB_CEIL, dB));
  return ((clamped - DB_FLOOR) / (DB_CEIL - DB_FLOOR)) * 100;
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
  isMuted = false,
  isSoloed = false,
  onMuteToggle,
  onSoloToggle,
  syncMode = false,
  pendingOperations = { play: false, pause: false, stop: false, loop: false },
  isLast = false,
  effects = {},
  onToggleEffect = null,
}) {
  const { trackId, type, icon, label, analysers, isRouted, track, isDisabled } = config;
  const {
    playbackState = PlaybackState.STOPPED,
    volume = 1.0,
    filename,
    currentTime = 0,
    duration = 0,
    remaining,
    looping = true
  } = trackState;

  // refs for debouncing volume send
  const volumeDebounceTimer = useRef(null);

  // refs for stereo meter bars
  const sliderRef = useRef(null);
  const meterLRef = useRef(null);
  const meterRRef = useRef(null);
  const rafRef = useRef(null);

  // cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (volumeDebounceTimer.current) clearTimeout(volumeDebounceTimer.current);
    };
  }, []);

  // ——————————————————————————————————————
  // Stereo RMS meter loop (dB-scaled)
  useEffect(() => {
    if (!analysers?.left || !analysers?.right) return;

    const dataL = new Uint8Array(analysers.left.frequencyBinCount);
    const dataR = new Uint8Array(analysers.right.frequencyBinCount);
    let lastL = 0;
    let lastR = 0;

    const computeRms = (data) => {
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const norm = (data[i] - 128) / 128;
        sum += norm * norm;
      }
      return Math.sqrt(sum / data.length);
    };

    const applyMeter = (ref, pct) => {
      if (!ref.current) return;
      const color = pct >= 90 ? '#FF0000' : pct >= 70 ? '#FFD700' : '#04AA6D';
      ref.current.style.background = `linear-gradient(to right, ${color} 0%, ${color} ${pct}%, #1e293b ${pct}%, #1e293b 100%)`;
    };

    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);

      analysers.left.getByteTimeDomainData(dataL);
      analysers.right.getByteTimeDomainData(dataR);

      const smoothL = lastL * 0.8 + computeRms(dataL) * 0.2;
      const smoothR = lastR * 0.8 + computeRms(dataR) * 0.2;
      lastL = smoothL;
      lastR = smoothR;

      applyMeter(meterLRef, rmsToPct(smoothL));
      applyMeter(meterRRef, rmsToPct(smoothR));
    };

    tick();
    return () => cancelAnimationFrame(rafRef.current);
  }, [analysers]);

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
      {/* Channel label - always visible */}
      {track && (
        <div className="flex-none w-[18px] mr-2 flex">
          <div className={`text-center text-xs px-1 rounded-sm font-bold w-full flex items-center justify-center ${AUDIO_INDICATOR_BASE} ${
            filename
              ? (syncMode
                  ? (isRouted ? AUDIO_INDICATOR_SYNCED : AUDIO_INDICATOR_UNSYNCED)
                  : AUDIO_INDICATOR_NORMAL)
              : 'bg-gray-700/50 text-gray-500'
          } ${isLast ? 'mb-4' : ''}`} style={{ writingMode: 'vertical-rl' }}>
            {track}
          </div>
        </div>
      )}
      <div className={`${isLast ? DM_CHILD_LAST : DM_CHILD} ${isDisabled ? 'opacity-40 pointer-events-none' : ''} flex-1`}>
        {/* Header */}
        <div className="flex justify-between items-center mb-2">
          <div className={`font-mono text-sm truncate min-w-0 w-0 flex-grow mr-2 ${filename ? 'text-white' : 'text-gray-500 italic'}`}>
            {filename || label || trackId}
          </div>
          {filename && (
            <div className="text-gray-400 font-mono text-sm">
              {formatTimeRemaining(remaining != null ? remaining : duration - currentTime)} / {formatTime(duration)}
            </div>
          )}
        </div>

        {/* Transport - only show when file is loaded */}
        {filename && (
          <div className="flex gap-2 items-center mb-3">
            {/* Play button - shown when stopped, or for SFX when playing (to restart) */}
            {(playbackState === PlaybackState.STOPPED || (type === 'sfx' && playbackState === PlaybackState.PLAYING)) && (
              <button
                className={`bg-green-600 hover:bg-green-700 text-white w-8 h-6 rounded text-xs flex items-center justify-center ${
                  pendingOperations.play ? 'opacity-50 cursor-not-allowed' : ''
                }`}
                onClick={onPlay}
                disabled={pendingOperations.play}
                title="Play from beginning"
              >
                <FontAwesomeIcon icon={faPlay} size="xs" />
              </button>
            )}

            {/* Pause button - shown when playing BGM only (SFX cannot be paused) */}
            {playbackState === PlaybackState.PLAYING && type !== 'sfx' && (
              <button
                className={`bg-orange-600 hover:bg-orange-700 text-white w-8 h-6 rounded text-xs flex items-center justify-center ${
                  pendingOperations.pause ? 'opacity-50 cursor-not-allowed' : ''
                }`}
                onClick={onPause}
                disabled={pendingOperations.pause}
                title="Pause"
              >
                <FontAwesomeIcon icon={faPause} size="xs" />
              </button>
            )}

            {/* Resume button - shown when paused */}
            {playbackState === PlaybackState.PAUSED && (
              <button
                className={`bg-blue-600 hover:bg-blue-700 text-white w-8 h-6 rounded text-xs flex items-center justify-center ${
                  pendingOperations.play ? 'opacity-50 cursor-not-allowed' : ''
                }`}
                onClick={onPlay}
                disabled={pendingOperations.play}
                title="Resume from paused position"
              >
                <FontAwesomeIcon icon={faPlay} size="xs" />
              </button>
            )}
            <button
              className={`bg-red-600 hover:bg-red-700 text-white w-8 h-6 rounded text-xs flex items-center justify-center ${
                pendingOperations.stop ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              onClick={onStop}
              disabled={pendingOperations.stop}
              title="Stop"
            >
              <FontAwesomeIcon icon={faStop} size="xs" />
            </button>
            {type !== 'sfx' && (
              <button
                className={`p-0 rounded ml-2 transition-all duration-200 flex items-center h-6 ${
                  pendingOperations.loop
                    ? 'opacity-50 cursor-not-allowed bg-gray-500'
                    : looping
                      ? 'bg-blue-600 hover:bg-blue-700'
                      : 'bg-gray-600 hover:bg-gray-700'
                }`}
                onClick={() =>
                  onLoopToggle && onLoopToggle(trackId, !looping)
                }
                disabled={pendingOperations.loop}
                title={pendingOperations.loop ? 'Updating loop setting...' : (looping ? 'Disable looping' : 'Enable looping')}
              >
                <img
                  src="/ico/loop.png"
                  alt="Loop"
                  className={`w-6 h-6 filter brightness-0 invert ${
                    pendingOperations.loop
                      ? 'opacity-30'
                      : looping
                        ? 'opacity-100'
                        : 'opacity-60'
                  }`}
                />
              </button>
            )}
            {/* Solo/Mute/Effects — channel-level controls */}
            {type !== 'sfx' && (
              <>
                <button
                  className={`px-2 h-6 rounded text-xs font-bold transition-colors flex items-center justify-center ${
                    isSoloed ? 'bg-yellow-500 text-black' : 'bg-gray-600 text-gray-400 hover:bg-gray-500'
                  }`}
                  onClick={onSoloToggle}
                  title={isSoloed ? 'Unsolo' : 'Solo'}
                >S</button>
                <button
                  className={`px-2 h-6 rounded text-xs font-bold transition-colors flex items-center justify-center ${
                    isMuted ? 'bg-red-600 text-white' : 'bg-gray-600 text-gray-400 hover:bg-gray-500'
                  }`}
                  onClick={onMuteToggle}
                  title={isMuted ? 'Unmute' : 'Mute'}
                >M</button>
                {onToggleEffect && (
                  <>
                    <button
                      className={`px-2 h-6 rounded text-[10px] font-bold transition-colors border flex items-center justify-center ${
                        effects?.hpf ? 'bg-rose-600 text-white border-rose-500 hover:bg-rose-700' : 'bg-gray-700 text-gray-400 border-gray-600 hover:bg-gray-600'
                      }`}
                      onClick={() => onToggleEffect(trackId, 'hpf')}
                      title="High-Pass Filter (removes low-end rumble)"
                    >HPF</button>
                    <button
                      className={`px-2 h-6 rounded text-[10px] font-bold transition-colors border flex items-center justify-center ${
                        effects?.lpf ? 'bg-rose-600 text-white border-rose-500 hover:bg-rose-700' : 'bg-gray-700 text-gray-400 border-gray-600 hover:bg-gray-600'
                      }`}
                      onClick={() => onToggleEffect(trackId, 'lpf')}
                      title="Low-Pass Filter (muffled / distant sound)"
                    >LPF</button>
                    <button
                      className={`px-2 h-6 rounded text-[10px] font-bold transition-colors border flex items-center justify-center ${
                        effects?.reverb ? 'bg-rose-600 text-white border-rose-500 hover:bg-rose-700' : 'bg-gray-700 text-gray-400 border-gray-600 hover:bg-gray-600'
                      }`}
                      onClick={() => onToggleEffect(trackId, 'reverb')}
                      title="Reverb (room ambiance)"
                    >RVB</button>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* Stereo RMS meter bars + Volume slider - only show when file is loaded */}
        {filename && (
          <>
            {/* L/R meter bars */}
            <div className="flex flex-col gap-[1px] px-1 mb-1">
              <div className="flex items-center gap-1 h-[8px]">
                <span className="text-[11px] leading-none w-3 font-mono" style={{ color: '#F7F4F3' }}>L</span>
                <div ref={meterLRef} className="h-full flex-1 rounded-sm bg-slate-800" />
              </div>
              <div className="flex items-center gap-1 h-[8px]">
                <span className="text-[11px] leading-none w-3 font-mono" style={{ color: '#F7F4F3' }}>R</span>
                <div ref={meterRRef} className="h-full flex-1 rounded-sm bg-slate-800" />
              </div>
            </div>
            {/* Volume fader */}
            <div className="flex items-center gap-1">
              <span className="mt-3 font-mono">dB</span>
              <div className="flex-1 font-mono">
                <datalist id="markers">
                  <option value="0.00" label="-∞" />
                  <option value="0.03" label="-30" />
                  <option value="0.10" label="-20" />
                  <option value="0.25" label="-12" />
                  <option value="0.50" label="-6" />
                  <option value="1.00" label="0" />
                  <option value="1.30" label="+2" />
                </datalist>

                <input
                  ref={sliderRef}
                  type="range"
                  min="0.0"
                  max="1.3"
                  step="0.01"
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
          </>
        )}
      </div>
    </div>
  );
}