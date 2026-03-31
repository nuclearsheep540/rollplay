/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

const DISPLAY_MODES = [
  { id: 'float', label: 'Float', description: 'Centred, natural size' },
  { id: 'wrap', label: 'Wrap', description: 'Fill viewport, crop edges' },
  { id: 'letterbox', label: 'Letterbox', description: 'Aspect ratio with bars' },
];

const ASPECT_RATIO_PRESETS = [
  { id: '2.39:1', label: '2.39:1', description: 'Ultrawide' },
  { id: '1.85:1', label: '1.85:1', description: 'Widescreen' },
  { id: '16:9', label: '16:9', description: 'HD' },
  { id: '4:3', label: '4:3', description: 'Classic' },
  { id: '1:1', label: '1:1', description: 'Square' },
];

export default function ImageDisplayControls({
  displayMode,
  aspectRatio,
  imagePositionX,
  imagePositionY,
  onDisplayModeChange,
  onAspectRatioChange,
  onImagePositionChange,
  onSave,
  isSaving,
  saveSuccess,
  hasChanges,
  error,
}) {
  return (
    <div className="flex flex-col gap-5 h-full">
      <h3 className="text-sm font-semibold text-content-on-dark">Display Settings</h3>

      {/* Display Mode */}
      <div>
        <label className="block text-xs text-content-secondary mb-2 font-medium">Display Mode</label>
        <div className="flex flex-col gap-1.5">
          {DISPLAY_MODES.map((mode) => (
            <button
              key={mode.id}
              onClick={() => {
                onDisplayModeChange(mode.id);
                if (mode.id !== 'letterbox') onAspectRatioChange(null);
                if (mode.id === 'letterbox' && !aspectRatio) onAspectRatioChange('2.39:1');
              }}
              className={`w-full px-3 py-2 text-left text-xs rounded border transition-colors ${
                displayMode === mode.id
                  ? 'bg-rose-600/20 text-rose-300 border-rose-600/50'
                  : 'bg-surface-secondary text-content-secondary border-border hover:border-border-active hover:text-content-primary'
              }`}
            >
              <div className="font-medium">{mode.label}</div>
              <div className="text-[10px] opacity-70 mt-0.5">{mode.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Aspect Ratio — only for letterbox */}
      {displayMode === 'letterbox' && (
        <div>
          <label className="block text-xs text-content-secondary mb-2 font-medium">Aspect Ratio</label>
          <div className="flex flex-wrap gap-1.5">
            {ASPECT_RATIO_PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => onAspectRatioChange(preset.id)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded border transition-colors ${
                  aspectRatio === preset.id
                    ? 'bg-rose-600/20 text-rose-300 border-rose-600/50'
                    : 'bg-surface-secondary text-content-secondary border-border hover:border-border-active'
                }`}
                title={preset.description}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Image Position — nudge the image within the frame (cover modes only) */}
      {(displayMode === 'letterbox' || displayMode === 'wrap') && (
        <div>
          <label className="block text-xs text-content-secondary mb-2 font-medium">Image Position</label>

          <div className="mb-2">
            <div className="flex justify-between text-[10px] text-content-secondary mb-1">
              <span>X: {imagePositionX ?? 50}%</span>
              <button
                onClick={() => onImagePositionChange(50, imagePositionY ?? 50)}
                className="text-content-secondary/50 hover:text-content-primary"
              >
                Reset
              </button>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={imagePositionX ?? 50}
              onChange={(e) => onImagePositionChange(parseFloat(e.target.value), imagePositionY ?? 50)}
              className="w-full h-1.5 bg-surface-tertiary rounded-lg appearance-none cursor-pointer"
            />
          </div>

          <div className="mb-2">
            <div className="flex justify-between text-[10px] text-content-secondary mb-1">
              <span>Y: {imagePositionY ?? 50}%</span>
              <button
                onClick={() => onImagePositionChange(imagePositionX ?? 50, 50)}
                className="text-content-secondary/50 hover:text-content-primary"
              >
                Reset
              </button>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={imagePositionY ?? 50}
              onChange={(e) => onImagePositionChange(imagePositionX ?? 50, parseFloat(e.target.value))}
              className="w-full h-1.5 bg-surface-tertiary rounded-lg appearance-none cursor-pointer"
            />
          </div>
        </div>
      )}

      {/* Cine section placeholder */}
      <div className="border-t border-border pt-4 mt-auto">
        <div className="text-xs text-content-secondary/50 italic">
          Cinematic effects coming soon
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-2 rounded bg-feedback-error/10 border border-feedback-error/30">
          <p className="text-xs text-feedback-error">{error}</p>
        </div>
      )}

      {/* Save button */}
      <button
        onClick={onSave}
        disabled={isSaving || !hasChanges}
        className={`w-full px-4 py-2.5 rounded-sm text-sm font-semibold border transition-all ${
          saveSuccess
            ? 'bg-feedback-success/20 text-feedback-success border-feedback-success'
            : 'bg-surface-secondary text-content-on-dark border-border-active hover:opacity-90'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {isSaving ? 'Saving...' : saveSuccess ? 'Saved' : 'Save Image Config'}
      </button>
    </div>
  );
}
