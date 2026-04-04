/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRepeat, faRotateRight, faBan, faFloppyDisk, faArrowRotateLeft, faTrash } from '@fortawesome/free-solid-svg-icons';

/**
 * Loop Points tab content for the Audio Workstation.
 *
 * Sections: Loop Mode, Loop Region, Save/Reset.
 * BPM is managed from the transport bar in the arrangement view.
 * Pure presentation — all state is owned by AudioWorkstationTool.
 */
export default function AudioWorkstationControls({
  loopMode,
  onLoopModeChange,
  loopStart,
  loopEnd,
  onClearRegion,
  onSave,
  onReset,
  isSaving,
  saveSuccess,
  error,
  hasChanges,
}) {
  const hasRegion = loopStart != null && loopEnd != null;

  return (
    <div className="flex flex-col gap-5">
      {/* Loop Mode */}
      <div className="rounded border border-border bg-surface-secondary p-4">
        <h3 className="text-xs font-semibold text-content-secondary uppercase tracking-wider mb-3">Loop Mode</h3>
        <div className="flex gap-1.5">
          {[
            { mode: 'off', label: 'Off', icon: faBan },
            { mode: 'full', label: 'Full', icon: faRepeat },
            { mode: 'region', label: 'Region', icon: faRotateRight, disabled: !hasRegion },
          ].map(({ mode, label, icon, disabled }) => (
            <button
              key={mode}
              onClick={() => !disabled && onLoopModeChange(mode)}
              disabled={disabled}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-sm border transition-colors ${
                loopMode === mode
                  ? 'bg-interactive-active border-border-active text-content-on-dark'
                  : disabled
                    ? 'bg-surface-primary/40 border-border/20 text-content-secondary/30 cursor-not-allowed'
                    : 'bg-surface-primary border-border text-content-secondary hover:border-border-active hover:text-content-on-dark'
              }`}
            >
              <FontAwesomeIcon icon={icon} className="text-[10px]" />
              {label}
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
              </div>
              <div>
                <div className="text-[10px] text-content-secondary uppercase mb-1">End</div>
                <div className="text-sm text-content-on-dark font-mono">{formatTime(loopEnd)}</div>
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

      {/* Save / Reset */}
      <div className="flex gap-2">
        <button
          onClick={onReset}
          disabled={!hasChanges || isSaving}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-medium rounded-sm border border-border text-content-secondary hover:border-border-active hover:text-content-on-dark transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <FontAwesomeIcon icon={faArrowRotateLeft} className="text-[10px]" />
          Reset
        </button>
        <button
          onClick={onSave}
          disabled={!hasChanges || isSaving}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-medium rounded-sm border transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
            saveSuccess
              ? 'bg-feedback-success/20 border-feedback-success text-feedback-success'
              : 'bg-interactive-active border-border-active text-content-on-dark hover:opacity-90'
          }`}
        >
          <FontAwesomeIcon icon={faFloppyDisk} className="text-[10px]" />
          {isSaving ? 'Saving...' : saveSuccess ? 'Saved' : 'Save'}
        </button>
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
