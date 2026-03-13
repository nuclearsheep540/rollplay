/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import React, { useRef, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlay, faPause, faStop } from '@fortawesome/free-solid-svg-icons';
import { PlaybackState } from '../types';

// RMS → dB → percentage for meter display
const DB_FLOOR = -60;
const DB_CEIL = 0;
function rmsToPct(rms) {
  if (rms < 0.001) return 0;
  const dB = 20 * Math.log10(rms);
  const clamped = Math.max(DB_FLOOR, Math.min(DB_CEIL, dB));
  return ((clamped - DB_FLOOR) / (DB_CEIL - DB_FLOOR)) * 100;
}

// Helper: format seconds → MM:SS
const formatTime = (seconds) => {
  if (!seconds || isNaN(seconds)) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

/**
 * Vertical channel strip for the bottom mixer drawer.
 * Shared component for BGM channels, per-channel effect inserts, and master output.
 *
 * stripType: 'channel' | 'effect' | 'master'
 */
export default function VerticalChannelStrip({
  stripType = 'channel',
  label,
  color = 'rose',
  footerLabel,
  // Audio state (channel strips)
  trackState = {},
  analysers,
  // Transport (channel strips only)
  onPlay,
  onPause,
  onStop,
  pendingOperations = { play: false, pause: false, stop: false },
  // Volume
  volume = 1.0,
  onVolumeChange,
  onVolumeChangeDebounced,
  // Solo / Mute
  isMuted = false,
  isSoloed = false,
  onMuteToggle,
  onSoloToggle,
  // Send toggles (channel strips only)
  sends = {},
  onToggleSend,
  // Loop toggle (channel strips only)
  isLooping = true,
  onLoopToggle,
  trackId,
}) {
  const {
    playbackState = PlaybackState.STOPPED,
    filename,
    currentTime = 0,
    duration = 0,
  } = trackState;

  const meterLRef = useRef(null);
  const meterRRef = useRef(null);
  const rafRef = useRef(null);
  const volumeDebounceTimer = useRef(null);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (volumeDebounceTimer.current) clearTimeout(volumeDebounceTimer.current);
    };
  }, []);

  // Stereo RMS meter loop (vertical)
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
      ref.current.style.background = `linear-gradient(to top, ${color} 0%, ${color} ${pct}%, #1e293b ${pct}%, #1e293b 100%)`;
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

  const handleVolumeChange = (newVol) => {
    onVolumeChange?.(newVol);
    if (volumeDebounceTimer.current) clearTimeout(volumeDebounceTimer.current);
    volumeDebounceTimer.current = setTimeout(() => {
      onVolumeChangeDebounced?.(newVol);
    }, 500);
  };

  const handleVolumeRelease = (newVol) => {
    if (volumeDebounceTimer.current) {
      clearTimeout(volumeDebounceTimer.current);
      volumeDebounceTimer.current = null;
    }
    onVolumeChangeDebounced?.(newVol);
  };

  // Color map for strip labels
  const colorMap = {
    rose: 'bg-rose-600 text-white',
    orange: 'bg-orange-600 text-white',
    cyan: 'bg-cyan-600 text-white',
    purple: 'bg-purple-600 text-white',
    silver: 'bg-gray-400 text-black',
  };

  const isEffect = stripType === 'effect';
  const isChannel = stripType === 'channel';
  const channelDisabled = isChannel && !filename;
  const disabledClass = channelDisabled ? 'opacity-30 pointer-events-none' : '';
  const stripWidth = isEffect ? 'w-[60px]' : 'w-[80px]';
  const isMaster = stripType === 'master';
  // All controls always render for layout consistency — invisible on strips that don't use them.
  // This ensures the fader container is always the same height, so pip lines align.
  const transportClass = isEffect || isMaster ? 'invisible' : disabledClass;
  const loopSendsClass = isEffect || isMaster ? 'invisible' : disabledClass;
  const showMeters = !isEffect || !!(analysers?.left && analysers?.right);
  const faderMax = '1.3';
  const faderMaxNum = 1.3;

  // dB pip marks — position as percentage from bottom of fader
  const dbPips = [
    { db: 0, gain: 1.0 },
    { db: -3, gain: 0.708 },
    { db: -6, gain: 0.501 },
    { db: -10, gain: 0.316 },
    { db: -20, gain: 0.1 },
  ]
    .map(({ db, gain }) => ({ db, pct: (gain / faderMaxNum) * 100 }))
    .filter(({ pct }) => pct <= 100 && pct >= 0);

  return (
    <div className={`flex flex-col items-center h-full ${stripWidth} flex-shrink-0 gap-1`}>
      {/* Channel label */}
      <div className={`w-full text-center text-xs font-bold py-1 rounded-t ${colorMap[color] || colorMap.rose}`}>
        {label}
      </div>

      {/* Transport — always rendered; invisible on non-channel strips for layout consistency */}
      <div className={`flex gap-1 ${transportClass}`}>
        {playbackState === PlaybackState.PLAYING ? (
          <button
            className={`w-7 h-6 rounded text-xs flex items-center justify-center bg-orange-600 hover:bg-orange-700 text-white ${
              pendingOperations.pause ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            onClick={onPause}
            disabled={pendingOperations.pause}
            title="Pause"
          >
            <FontAwesomeIcon icon={faPause} size="xs" />
          </button>
        ) : (
          <button
            className={`w-7 h-6 rounded text-xs flex items-center justify-center ${
              playbackState === PlaybackState.PAUSED
                ? 'bg-blue-600 hover:bg-blue-700'
                : 'bg-green-600 hover:bg-green-700'
            } text-white ${pendingOperations.play ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={onPlay}
            disabled={pendingOperations.play}
            title={playbackState === PlaybackState.PAUSED ? 'Resume' : 'Play'}
          >
            <FontAwesomeIcon icon={faPlay} size="xs" />
          </button>
        )}
        <button
          className={`w-7 h-6 rounded text-xs flex items-center justify-center bg-red-600 hover:bg-red-700 text-white ${
            pendingOperations.stop ? 'opacity-50 cursor-not-allowed' : ''
          }`}
          onClick={onStop}
          disabled={pendingOperations.stop}
          title="Stop"
        >
          <FontAwesomeIcon icon={faStop} size="xs" />
        </button>
      </div>

      {/* Loop — always rendered; invisible on non-channel strips */}
      <div className={`w-full px-1 ${loopSendsClass}`}>
        <button
          onClick={() => onLoopToggle?.(trackId, !isLooping)}
          className={`w-full h-5 rounded text-[11px] font-bold transition-colors ${
            isLooping
              ? 'bg-blue-600 text-white'
              : 'bg-gray-700 text-gray-500 hover:bg-gray-600'
          }`}
          title={isLooping ? 'Disable looping' : 'Enable looping'}
        >
          LOOP
        </button>
      </div>

      {/* Send toggles — always rendered; invisible on non-channel strips */}
      <div className={`flex flex-col gap-0.5 w-full px-1 ${loopSendsClass}`}>
        {['eq', 'reverb'].map(bus => (
          <button
            key={bus}
            onClick={() => onToggleSend?.(trackId, bus)}
            className={`w-full h-5 rounded text-[11px] font-bold transition-colors ${
              sends[bus]
                ? 'bg-rose-600 text-white'
                : 'bg-gray-700 text-gray-500 hover:bg-gray-600'
            }`}
            title={`${bus === 'eq' ? 'EQ' : 'RVB'} ${sends[bus] ? 'on' : 'off'}`}
          >
            {bus === 'reverb' ? 'RVB' : 'EQ'}
          </button>
        ))}
      </div>

      {/* Solo / Mute — always rendered; invisible when no callbacks provided */}
      <div className={`flex gap-1 ${!onMuteToggle && !onSoloToggle ? 'invisible' : ''} ${channelDisabled ? disabledClass : ''}`}>
        <button
          className={`w-7 h-6 rounded text-xs font-bold transition-colors flex items-center justify-center ${
            isSoloed ? 'bg-yellow-500 text-black' : 'bg-gray-600 text-gray-400 hover:bg-gray-500'
          }`}
          onClick={onSoloToggle}
          title={isSoloed ? 'Unsolo' : 'Solo'}
        >S</button>
        <button
          className={`w-7 h-6 rounded text-xs font-bold transition-colors flex items-center justify-center ${
            isMuted ? 'bg-red-600 text-white' : 'bg-gray-600 text-gray-400 hover:bg-gray-500'
          }`}
          onClick={onMuteToggle}
          title={isMuted ? 'Unmute' : 'Mute'}
        >M</button>
      </div>

      {/* Vertical fader + L/R meters — meters drive layout, fader overlaid */}
      <div className={`flex-1 relative flex items-stretch justify-center gap-[2px] w-full min-h-0 ${channelDisabled ? disabledClass : ''}`}>
        {/* L meter */}
        {showMeters && (
          <div ref={meterLRef} className="w-[6px] rounded-sm bg-slate-800 flex-shrink-0" />
        )}
        {/* Center track spacer (visible when no meters, e.g. effect strips) */}
        {!showMeters && <div className="w-[2px]" />}
        {/* R meter */}
        {showMeters && (
          <div ref={meterRRef} className="w-[6px] rounded-sm bg-slate-800 flex-shrink-0" />
        )}
        {/* dB pip lines — absolutely positioned over meters */}
        <div className="absolute inset-0 pointer-events-none z-[1]">
          {dbPips.map(({ db, pct }) => (
            <div
              key={db}
              className="absolute left-0 right-0 flex items-center"
              style={{ bottom: `${pct}%` }}
            >
              <div className={`flex-1 border-t ${db === 0 ? 'border-white/40' : 'border-white/20'}`} />
              <span className="text-[11px] text-white/40 pl-[2px] leading-none font-mono">
                {db}
              </span>
            </div>
          ))}
        </div>
        {/* Fader — absolutely positioned over the meters, thumb overlaps them */}
        <input
          type="range"
          min="0.0"
          max={faderMax}
          step="0.01"
          value={volume}
          onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
          onMouseUp={(e) => handleVolumeRelease(parseFloat(e.target.value))}
          onTouchEnd={(e) => handleVolumeRelease(parseFloat(e.target.value))}
          className="vertical-fader"
        />
      </div>

      {/* Footer — fixed height across all strip types for fader alignment */}
      <div className="w-full text-center px-1 pb-1 h-[28px] flex flex-col justify-end">
        {stripType === 'channel' && (
          <>
            <div className="text-[11px] text-gray-400 truncate font-mono" title={filename || ''}>
              {filename ? filename.replace(/\.[^.]+$/, '') : '—'}
            </div>
            {filename && (
              <div className="text-[10px] text-gray-500 font-mono">
                {formatTime(currentTime)}
              </div>
            )}
          </>
        )}
        {isEffect && (
          <div className="text-[11px] text-gray-500 font-mono">{footerLabel || 'Mix'}</div>
        )}
        {stripType === 'master' && (
          <div className="text-[11px] text-gray-500 font-mono">Out</div>
        )}
      </div>
    </div>
  );
}
