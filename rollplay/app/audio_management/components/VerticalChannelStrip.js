/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import React, { useRef, useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlay, faPause, faStop } from '@fortawesome/free-solid-svg-icons';
import { PlaybackState } from '../types';
import { MAX_VOLUME } from '../engine/constants';

// ── Fader taper ────────────────────────────────────────────────────────────
// The slider is dB-linear: equal travel = equal dB change. Gain nodes expect
// linear amplitude, so we convert on the boundary only.
// Range is −60 dB → MAX_VOLUME (in dB). The floor (−60 dB = gain ≈ 0.001) is
// effectively silent; the ceiling is whatever MAX_VOLUME permits.
const FADER_DB_MIN = -60;
const FADER_DB_MAX = 20 * Math.log10(MAX_VOLUME); // ≈ +3.52 dB at MAX_VOLUME=1.5
const FADER_DB_RANGE = FADER_DB_MAX - FADER_DB_MIN;

// ── Meter scaling ──────────────────────────────────────────────────────────
// Meter floor and ceiling match the fader's dB range exactly so the bar
// fill and pip labels agree at every height — a signal at any dB fills
// the same fractional height as the fader's pip label at that dB. CLIP
// still fires at 0 dBFS (peak >= 1.0), which now lines up visually with
// the 0 dB pip, and signals between 0 and +3.5 dB show as bar extending
// above the 0 pip (the fader's boost region).
const DB_FLOOR = FADER_DB_MIN;
const DB_CEIL = FADER_DB_MAX;
function rmsToPct(rms) {
  if (rms < 0.001) return 0;
  const dB = 20 * Math.log10(rms);
  const clamped = Math.max(DB_FLOOR, Math.min(DB_CEIL, dB));
  return ((clamped - DB_FLOOR) / (DB_CEIL - DB_FLOOR)) * 100;
}

function linearToDb(linear) {
  if (!linear || linear <= 0) return FADER_DB_MIN;
  const dB = 20 * Math.log10(linear);
  return Math.max(FADER_DB_MIN, Math.min(FADER_DB_MAX, dB));
}

function dbToLinear(dB) {
  if (dB <= FADER_DB_MIN) return 0;
  return Math.min(MAX_VOLUME, Math.pow(10, dB / 20));
}

// Helper: format remaining seconds → -MM:SS
const formatTimeRemaining = (remaining) => {
  if (!remaining || isNaN(remaining) || remaining <= 0) return '-00:00';
  const m = Math.floor(remaining / 60);
  const s = Math.floor(remaining % 60);
  return `-${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
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
  loopMode = null,
  hasLoopRegion = false,
  onLoopToggle,
  // Reverb preset (effect strips only)
  reverbPreset = 'room',
  onReverbPresetChange,
  trackId,
}) {
  const {
    playbackState = PlaybackState.STOPPED,
    filename,
    currentTime = 0,
    duration = 0,
    remaining,
  } = trackState;

  const meterLRef = useRef(null);
  const meterRRef = useRef(null);
  const lastColorLRef = useRef(null);
  const lastColorRRef = useRef(null);
  const peakLineLRef = useRef(null);
  const peakLineRRef = useRef(null);
  const lastPeakColorLRef = useRef(null);
  const lastPeakColorRRef = useRef(null);
  const dbReadoutRef = useRef(null);
  const rafRef = useRef(null);
  const volumeDebounceTimer = useRef(null);

  // Latching clip indicator — only rendered on the master strip, but the
  // detection runs in the meter tick. Stays lit until the user clicks.
  const [clipped, setClipped] = useState(false);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (volumeDebounceTimer.current) clearTimeout(volumeDebounceTimer.current);
    };
  }, []);

  // Stereo RMS meter loop (vertical)
  useEffect(() => {
    if (!analysers?.left || !analysers?.right) return;

    // Float32 time-domain data gives full-precision samples in [-1, 1]
    // (values can exceed ±1 when a signal is about to clip). Byte data
    // was 8-bit quantized, which put the meter's noise floor around
    // −53 dBFS and made any signal between −50 dB and silence look
    // identical. Float reads cleanly down to ~−100 dBFS and below.
    const dataL = new Float32Array(analysers.left.fftSize);
    const dataR = new Float32Array(analysers.right.fftSize);

    // ── RMS smoothing ────────────────────────────────────────────────────
    // Higher coefficient = slower, calmer bars. 0.9 gives ~160 ms time
    // constant — enough to tame transient jitter without laggy visuals.
    const RMS_SMOOTHING = 0.9;
    let lastL = 0;
    let lastR = 0;

    // ── Peak hold state ──────────────────────────────────────────────────
    // The peak indicator tracks the *raw* sample-level peak (unsmoothed)
    // so it catches transients the RMS window averages away. Holds for
    // HOLD_MS then snaps down to the current peak.
    const PEAK_HOLD_MS = 3000;
    let heldPeakL = 0;
    let heldPeakR = 0;
    let peakTimeL = 0;
    let peakTimeR = 0;

    const computeRms = (data) => {
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        sum += data[i] * data[i];
      }
      return Math.sqrt(sum / data.length);
    };

    const computePeak = (data) => {
      let max = 0;
      for (let i = 0; i < data.length; i++) {
        const abs = Math.abs(data[i]);
        if (abs > max) max = abs;
      }
      return max;
    };

    const peakColor = (pct) =>
      pct >= 90 ? '#FF0000' : pct >= 70 ? '#FFD700' : '#04AA6D';

    // GPU-composited meter update: scaleY is a transform (compositor-only, no repaint).
    // Color only updates when the threshold band changes (rare), not every frame.
    const applyMeter = (ref, colorRef, pct) => {
      if (!ref.current) return;
      const color = peakColor(pct);
      ref.current.style.transform = `scaleY(${pct / 100})`;
      if (color !== colorRef.current) {
        ref.current.style.backgroundColor = color;
        colorRef.current = color;
      }
    };

    // Peak line: absolutely positioned 2px line, placed via `bottom: X%`.
    // Color tracks the threshold band at the peak's level — green/yellow/red.
    const applyPeakLine = (ref, colorRef, pct) => {
      if (!ref.current) return;
      const color = peakColor(pct);
      ref.current.style.bottom = `${pct}%`;
      if (color !== colorRef.current) {
        ref.current.style.backgroundColor = color;
        colorRef.current = color;
      }
    };

    // Throttle dB readout text updates to ~10 Hz — any faster and the
    // number is unreadable, plus fewer DOM writes.
    let readoutFrame = 0;

    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      const now = performance.now();

      analysers.left.getFloatTimeDomainData(dataL);
      analysers.right.getFloatTimeDomainData(dataR);

      // RMS bar — heavily smoothed for calm visuals
      const rmsL = computeRms(dataL);
      const rmsR = computeRms(dataR);
      lastL = lastL * RMS_SMOOTHING + rmsL * (1 - RMS_SMOOTHING);
      lastR = lastR * RMS_SMOOTHING + rmsR * (1 - RMS_SMOOTHING);
      applyMeter(meterLRef, lastColorLRef, rmsToPct(lastL));
      applyMeter(meterRRef, lastColorRRef, rmsToPct(lastR));

      // Peak line + numeric readout — raw sample-level peak, held for 3s
      const peakL = computePeak(dataL);
      const peakR = computePeak(dataR);
      if (peakL > heldPeakL || now - peakTimeL > PEAK_HOLD_MS) {
        heldPeakL = peakL;
        peakTimeL = now;
      }
      if (peakR > heldPeakR || now - peakTimeR > PEAK_HOLD_MS) {
        heldPeakR = peakR;
        peakTimeR = now;
      }
      applyPeakLine(peakLineLRef, lastPeakColorLRef, rmsToPct(heldPeakL));
      applyPeakLine(peakLineRRef, lastPeakColorRRef, rmsToPct(heldPeakR));

      // Clip detection (master strip only). Float samples can legitimately
      // exceed ±1.0 before the destination's implicit clipper — any such
      // sample is a real clip. 1.0 is the strict threshold. Latching;
      // cleared only by the user clicking the indicator.
      if (stripType === 'master' && (peakL >= 1.0 || peakR >= 1.0)) {
        setClipped(true);
      }

      // Numeric readout — held peak of L/R, throttled to ~10 Hz. Cross-check
      // fader taper / summing against the pip scale.
      if (dbReadoutRef.current && (++readoutFrame % 6) === 0) {
        const peak = Math.max(heldPeakL, heldPeakR);
        if (peak < 0.001) {
          dbReadoutRef.current.textContent = '-∞';
        } else {
          const dB = 20 * Math.log10(peak);
          dbReadoutRef.current.textContent = dB.toFixed(1);
        }
      }
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

  const isEffect = stripType === 'effect';
  const isChannel = stripType === 'channel';
  const channelDisabled = isChannel && !filename;
  const disabledClass = channelDisabled ? 'opacity-30 pointer-events-none' : '';
  const stripWidth = isEffect ? 'w-[60px]' : 'w-[80px]';
  // All controls always render for layout consistency — visibility applied per-row.
  // This ensures the fader container is always the same height, so pip lines align.
  const showMeters = !isEffect || !!(analysers?.left && analysers?.right);

  // Fader expresses dB directly. Slider handle position = dB-linear so the
  // pip labels sit at their true fractional dB position — no more
  // "everything below −20 dB squashed into 8% of the strip."
  const faderDb = linearToDb(volume);

  // dB pip marks — position as percentage from bottom of fader, equal-
  // spaced in dB. Filtered to anything within the slider's dB range.
  const dbPips = [3, 0, -3, -6, -10, -20, -30, -40, -50]
    .filter(db => db >= FADER_DB_MIN && db <= FADER_DB_MAX)
    .map(db => ({ db, pct: ((db - FADER_DB_MIN) / FADER_DB_RANGE) * 100 }));

  return (
    <div className={`flex flex-col items-center h-full ${stripWidth} flex-shrink-0 gap-1`}>
      {/* Strip type label */}
      <div className="w-full text-center text-xs font-bold py-1 bg-gray-700 text-gray-300">
        {label}
      </div>

      {/* All controls — single flex-col, one gap-1 rule governs all spacing */}
      <div className="w-full px-1 flex flex-col gap-1">
        {/* Transport row — transport buttons on channel strips, CLIP
            indicator on master, invisible placeholder on effect strips.
            Kept as one row so meter / fader alignment matches across strips. */}
        {stripType === 'master' ? (
          <button
            onClick={() => setClipped(false)}
            disabled={!clipped}
            className={`w-full h-5 rounded text-[11px] font-bold tracking-wider transition-colors ${
              clipped
                ? 'bg-red-600 text-white hover:bg-red-500 cursor-pointer'
                : 'bg-gray-800 text-gray-600 border border-gray-700 cursor-default'
            }`}
            title={clipped ? 'Master clipped — click to clear' : 'Clip indicator (0 dBFS or over)'}
          >
            CLIP
          </button>
        ) : (
        <div className={`flex gap-1 ${isChannel ? disabledClass : 'invisible'}`}>
          {playbackState === PlaybackState.PLAYING ? (
            <button
              className={`flex-1 h-5 rounded text-[11px] font-bold flex items-center justify-center bg-orange-600 hover:bg-orange-700 text-white ${
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
              className={`flex-1 h-5 rounded text-[11px] font-bold flex items-center justify-center bg-green-600 hover:bg-green-700 text-white ${
                pendingOperations.play ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              onClick={onPlay}
              disabled={pendingOperations.play}
              title="Play"
            >
              <FontAwesomeIcon icon={faPlay} size="xs" />
            </button>
          )}
          <button
            className={`flex-1 h-5 rounded text-[11px] font-bold flex items-center justify-center bg-red-600 hover:bg-red-700 text-white ${
              pendingOperations.stop ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            onClick={onStop}
            disabled={pendingOperations.stop}
            title="Stop"
          >
            <FontAwesomeIcon icon={faStop} size="xs" />
          </button>
        </div>
        )}
        {/* Middle 3 buttons — content varies by strip type, always 3 rows for layout */}
        {isChannel ? (
          <>
            <button
              onClick={() => onLoopToggle?.(trackId)}
              className={`w-full h-5 rounded text-[11px] font-bold transition-colors ${
                loopMode === 'region'
                  ? 'bg-amber-600 text-white'
                  : loopMode === 'continuous'
                    ? 'bg-sky-600 text-white'
                    : isLooping
                      ? 'bg-rose-600 text-white'
                      : 'bg-gray-700 text-gray-500 hover:bg-gray-600'
              } ${disabledClass}`}
              title={
                loopMode === 'region' ? 'Loop — strictly within region'
                : loopMode === 'continuous' ? 'Loop — intro then region'
                : isLooping ? 'Loop — full track'
                : 'Loop off'
              }
            >
              {loopMode === 'region' ? 'REGION'
                : loopMode === 'continuous' ? 'CONT'
                : isLooping ? 'LOOP'
                : 'OFF'}
            </button>
            {['eq', 'reverb'].map(bus => (
              <button
                key={bus}
                onClick={() => onToggleSend?.(trackId, bus)}
                className={`w-full h-5 rounded text-[11px] font-bold transition-colors ${
                  sends[bus]
                    ? 'bg-rose-600 text-white'
                    : 'bg-gray-700 text-gray-500 hover:bg-gray-600'
                } ${disabledClass}`}
                title={`${bus === 'eq' ? 'EQ' : 'RVB'} ${sends[bus] ? 'on' : 'off'}`}
              >
                {bus === 'reverb' ? 'RVB' : 'EQ'}
              </button>
            ))}
          </>
        ) : isEffect ? (
          <>
            {['room', 'hall', 'cathedral'].map(preset => (
              <button
                key={preset}
                onClick={() => onReverbPresetChange?.(preset)}
                className={`w-full h-5 rounded text-[11px] font-bold transition-colors ${
                  reverbPreset === preset
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-700 text-gray-500 hover:bg-gray-600'
                }`}
                title={`${preset.charAt(0).toUpperCase() + preset.slice(1)} reverb`}
              >
                {preset === 'cathedral' ? 'CATH' : preset.toUpperCase()}
              </button>
            ))}
          </>
        ) : (
          <>
            <div className="invisible h-5" />
            <div className="invisible h-5" />
            <div className="invisible h-5" />
          </>
        )}
        {/* Solo / Mute */}
        <div className={`flex gap-1 ${!onMuteToggle && !onSoloToggle ? 'invisible' : ''} ${channelDisabled ? disabledClass : ''}`}>
          <button
            className={`flex-1 h-5 rounded text-[11px] font-bold transition-colors flex items-center justify-center ${
              isSoloed ? 'bg-yellow-500 text-black' : 'bg-gray-600 text-gray-400 hover:bg-gray-500'
            }`}
            onClick={onSoloToggle}
            title={isSoloed ? 'Unsolo' : 'Solo'}
          >S</button>
          <button
            className={`flex-1 h-5 rounded text-[11px] font-bold transition-colors flex items-center justify-center ${
              isMuted ? 'bg-red-600 text-white' : 'bg-gray-600 text-gray-400 hover:bg-gray-500'
            }`}
            onClick={onMuteToggle}
            title={isMuted ? 'Unmute' : 'Mute'}
          >M</button>
        </div>
      </div>

      {/* Vertical fader + L/R meters — meters drive layout, fader overlaid */}
      <div className={`flex-1 relative flex items-stretch justify-center gap-[2px] w-full min-h-0 mt-2 ${channelDisabled ? disabledClass : ''}`}>
        {/* L meter — container holds background, child fill uses GPU-composited scaleY.
            Peak line sits on top, positioned via bottom:X%. */}
        {showMeters && (
          <div className="w-[6px] rounded-sm bg-slate-800 flex-shrink-0 relative overflow-hidden">
            <div ref={meterLRef} className="absolute inset-0 will-change-transform origin-bottom" style={{ backgroundColor: '#04AA6D', transform: 'scaleY(0)' }} />
            <div ref={peakLineLRef} className="absolute inset-x-0 h-[2px] pointer-events-none" style={{ backgroundColor: '#04AA6D', bottom: '0%' }} />
          </div>
        )}
        {/* Center track spacer (visible when no meters, e.g. effect strips) */}
        {!showMeters && <div className="w-[2px]" />}
        {/* R meter */}
        {showMeters && (
          <div className="w-[6px] rounded-sm bg-slate-800 flex-shrink-0 relative overflow-hidden">
            <div ref={meterRRef} className="absolute inset-0 will-change-transform origin-bottom" style={{ backgroundColor: '#04AA6D', transform: 'scaleY(0)' }} />
            <div ref={peakLineRRef} className="absolute inset-x-0 h-[2px] pointer-events-none" style={{ backgroundColor: '#04AA6D', bottom: '0%' }} />
          </div>
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
              <span className="text-xs text-white/40 pl-[2px] leading-none font-mono">
                {db}
              </span>
            </div>
          ))}
        </div>
        {/* Fader — absolutely positioned over the meters, thumb overlaps them.
            Slider value is dB; converted to linear gain on the way out so
            callers (engine, PATCH adapter) still receive amplitude. */}
        <input
          type="range"
          min={FADER_DB_MIN}
          max={FADER_DB_MAX}
          step="0.1"
          value={faderDb}
          onChange={(e) => handleVolumeChange(dbToLinear(parseFloat(e.target.value)))}
          onMouseUp={(e) => handleVolumeRelease(dbToLinear(parseFloat(e.target.value)))}
          onTouchEnd={(e) => handleVolumeRelease(dbToLinear(parseFloat(e.target.value)))}
          className="vertical-fader"
        />
      </div>

      {/* Footer — fixed height across all strip types for fader alignment */}
      <div className="w-full text-center px-1 pb-1 h-[28px] flex flex-col justify-end gap-0.5">
        {/* dB readout — peak of L/R meters, ~10 Hz update. Hidden on strips
            without meters (empty channels). */}
        {showMeters && (
          <div className="text-[9px] leading-none text-white/50 font-mono">
            <span ref={dbReadoutRef}>-∞</span>
            <span className="text-white/30"> dB</span>
          </div>
        )}
        {stripType === 'channel' && filename && (
          <div className="text-xs text-gray-200 font-mono">
            {formatTimeRemaining(remaining != null ? remaining : duration - currentTime)}
          </div>
        )}
        {isEffect && (
          <div className="text-xs text-gray-200 font-mono">{footerLabel || 'Mix'}</div>
        )}
        {stripType === 'master' && (
          <div className="text-xs text-gray-200 font-mono">Out</div>
        )}
      </div>
    </div>
  );
}
