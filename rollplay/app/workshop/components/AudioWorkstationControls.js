/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRepeat, faRotateRight, faBan, faTrash, faArrowsSpin } from '@fortawesome/free-solid-svg-icons';

/**
 * Loop Points drawer content for the Audio Workstation.
 *
 * Auto-saves on every change — no explicit save button.
 * BPM is managed from the transport bar in the arrangement view.
 */
export default function AudioWorkstationControls({
  loopMode,
  onLoopModeChange,
  loopStart,
  loopEnd,
  bpm,
  timeSignature,
  onClearRegion,
  isSaving,
  saveSuccess,
  error,
}) {
  const hasRegion = loopStart != null && loopEnd != null;

  return (
    <div className="flex flex-col gap-5">
      {/* Loop Mode */}
      <div className="rounded border border-border bg-surface-secondary p-4">
        <h3 className="text-xs font-semibold text-content-secondary uppercase tracking-wider mb-3">Loop Mode</h3>
        <div className="flex gap-1.5">
          {[
            { mode: 'off', label: 'Off', icon: faBan, description: 'Play once, no loop' },
            { mode: 'full', label: 'Full', icon: faRepeat, description: 'Loop the whole track' },
            { mode: 'continuous', label: 'Continuous', icon: faArrowsSpin, disabled: !hasRegion, description: 'Play intro, then loop region' },
            { mode: 'region', label: 'Region', icon: faRotateRight, disabled: !hasRegion, description: 'Strictly inside the region' },
          ].map(({ mode, label, icon, disabled, description }) => (
            <button
              key={mode}
              onClick={() => !disabled && onLoopModeChange(mode)}
              disabled={disabled}
              className={`flex-1 flex flex-col items-center justify-start gap-1 px-3 py-2 text-xs font-medium rounded-sm border transition-colors ${
                loopMode === mode
                  ? 'bg-interactive-active border-border-active text-content-on-dark'
                  : disabled
                    ? 'bg-surface-primary/40 border-border/20 text-content-secondary/30 cursor-not-allowed'
                    : 'bg-surface-primary border-border text-content-secondary hover:border-border-active hover:text-content-on-dark'
              }`}
            >
              <div className="flex items-center justify-center gap-1.5">
                <FontAwesomeIcon icon={icon} className="text-[10px]" />
                <span>{label}</span>
              </div>
              <div
                className={`text-[10px] leading-tight text-center ${
                  loopMode === mode
                    ? 'text-content-secondary'
                    : disabled
                      ? 'text-content-secondary/40'
                      : 'text-content-secondary/70'
                }`}
              >
                {description}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Loop Region */}
      <div className="rounded border border-border bg-surface-secondary p-4">
        <h3 className="text-xs font-semibold text-content-secondary uppercase tracking-wider mb-3">Loop Region</h3>
        {hasRegion ? (
          <>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <div className="text-[10px] text-content-secondary uppercase mb-1">Start</div>
                <div className="text-sm text-content-on-dark font-mono">{formatTime(loopStart)}</div>
                <div className="text-[10px] text-content-secondary/70 font-mono mt-0.5">
                  {formatBarBeat(loopStart, bpm, timeSignature)}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-content-secondary uppercase mb-1">End</div>
                <div className="text-sm text-content-on-dark font-mono">{formatTime(loopEnd)}</div>
                <div className="text-[10px] text-content-secondary/70 font-mono mt-0.5">
                  {formatBarBeat(loopEnd, bpm, timeSignature)}
                </div>
              </div>
            </div>
            <button
              onClick={onClearRegion}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-sm border border-border text-content-secondary hover:border-feedback-error hover:text-feedback-error transition-colors"
            >
              <FontAwesomeIcon icon={faTrash} className="text-[10px]" />
              Clear Region
            </button>
          </>
        ) : (
          <p className="text-xs text-content-secondary/60">
            Drag on the waveform to set loop-in and loop-out points
          </p>
        )}
      </div>

      {/* Save status indicator */}
      <div className="text-[10px] text-content-secondary px-1">
        {isSaving ? 'Saving...' : saveSuccess ? 'Saved' : 'Changes save automatically'}
      </div>

      {error && (
        <div className="text-xs text-feedback-error px-1">{error}</div>
      )}
    </div>
  );
}

function formatTime(seconds) {
  if (seconds == null) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toFixed(2).padStart(5, '0')}`;
}

// Render a bar.beat label assuming t=0 is bar 1, beat 1. BPM + time
// signature drive the grid; without BPM we can't compute bars so we
// fall back to a dash.
function formatBarBeat(seconds, bpm, timeSignature) {
  if (seconds == null || !bpm || bpm <= 0) return '— · —';
  const beatSeconds = 60 / bpm;
  const beatsPerBar = (() => {
    if (!timeSignature || typeof timeSignature !== 'string') return 4;
    const top = parseInt(timeSignature.split('/')[0], 10);
    return Number.isFinite(top) && top > 0 ? top : 4;
  })();
  const totalBeats = seconds / beatSeconds;
  const bar = Math.floor(totalBeats / beatsPerBar) + 1;
  const beatInBar = (totalBeats % beatsPerBar) + 1;
  return `Bar ${bar} · Beat ${beatInBar.toFixed(2)}`;
}
