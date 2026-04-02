/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faVideo, faVideoSlash } from '@fortawesome/free-solid-svg-icons';

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

const OVERLAY_TYPES = [
  { id: 'film_grain', label: 'Film Grain' },
  { id: 'color_filter', label: 'Color Filter' },
];

const GRAIN_STYLES = [
  { id: 'vintage', label: 'Vintage' },
  { id: 'grain', label: 'Grain' },
  { id: 'light_particles', label: 'Light Particles' },
];

const GRAIN_BLEND_MODES = [
  { id: 'overlay', label: 'Overlay' },
  { id: 'screen', label: 'Screen' },
  { id: 'soft-light', label: 'Soft Light' },
  { id: 'multiply', label: 'Multiply' },
  { id: 'luminosity', label: 'Luminosity' },
];

const COLOR_BLEND_MODES = [
  { id: 'multiply', label: 'Multiply' },
  { id: 'overlay', label: 'Overlay' },
  { id: 'screen', label: 'Screen' },
  { id: 'color', label: 'Color' },
];

function createOverlay(type) {
  if (type === 'film_grain') {
    return { type, enabled: true, opacity: 0.5, style: 'vintage', blend_mode: 'overlay' };
  }
  if (type === 'color_filter') {
    return { type, enabled: true, opacity: 0.5, color: '#1a0a2e', blend_mode: 'multiply' };
  }
  return { type, enabled: true, opacity: 0.5 };
}

export default function ImageDisplayControls({
  displayMode,
  aspectRatio,
  imagePositionX,
  imagePositionY,
  cineConfig,
  onDisplayModeChange,
  onAspectRatioChange,
  onImagePositionChange,
  onCineConfigChange,
  onSave,
  isSaving,
  saveSuccess,
  hasChanges,
  error,
}) {
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  // Cine is "enabled" only if there's meaningful content — not just an empty scaffolding
  const cineEnabled = cineConfig && (
    cineConfig.visual_overlays?.length > 0
    || cineConfig.transition != null
    || cineConfig.ken_burns != null
    || cineConfig.text_overlays != null
  );

  const overlays = cineConfig?.visual_overlays || [];

  const updateOverlays = (newOverlays) => {
    onCineConfigChange({
      ...(cineConfig || { hide_player_ui: true }),
      visual_overlays: newOverlays,
    });
  };

  const addOverlay = (type) => {
    updateOverlays([...overlays, createOverlay(type)]);
  };

  const removeOverlay = (index) => {
    updateOverlays(overlays.filter((_, i) => i !== index));
  };

  const updateOverlay = (index, changes) => {
    updateOverlays(overlays.map((o, i) => i === index ? { ...o, ...changes } : o));
  };

  const moveOverlay = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= overlays.length) return;
    const next = [...overlays];
    [next[index], next[target]] = [next[target], next[index]];
    updateOverlays(next);
  };

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

      {/* Cine Mode */}
      <div className="border-t border-border pt-4">
        <button
          onClick={() => {
            if (cineConfig) {
              onCineConfigChange(null);
            } else {
              onCineConfigChange({ visual_overlays: [], hide_player_ui: true });
            }
          }}
          className={`w-full px-3 py-2 text-left text-xs rounded border transition-colors ${
            cineEnabled
              ? 'bg-rose-600/20 text-rose-300 border-rose-600/50'
              : 'bg-surface-secondary text-content-secondary border-border hover:border-border-active hover:text-content-on-dark'
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold">Cine Mode</div>
              <div className="text-[10px] opacity-70 mt-0.5">Cinematic effects &amp; overlays</div>
            </div>
            <FontAwesomeIcon
              icon={cineConfig ? faVideo : faVideoSlash}
              className={`text-sm transition-colors ${cineEnabled ? 'text-rose-400' : 'text-content-secondary/30'}`}
            />
          </div>
        </button>

        {/* Cine modules — visible when toggle is on OR when scaffolding exists (user just enabled) */}
        {cineConfig && (
          <div className="mt-3 flex flex-col gap-4">

            {/* Visual Overlays */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-content-secondary font-medium">Visual Overlays</label>
                <div className="relative">
                  <button
                    onClick={() => setAddMenuOpen(!addMenuOpen)}
                    className="text-[10px] text-rose-400 hover:text-rose-300 font-medium"
                  >
                    + Add
                  </button>
                  {addMenuOpen && (
                    <div className="absolute right-0 top-full mt-1 bg-surface-secondary border border-border rounded shadow-lg z-10">
                      {OVERLAY_TYPES.map((type) => (
                        <button
                          key={type.id}
                          onClick={() => { addOverlay(type.id); setAddMenuOpen(false); }}
                          className="block w-full px-3 py-1.5 text-left text-xs text-content-secondary hover:text-content-on-dark hover:bg-surface-tertiary whitespace-nowrap"
                        >
                          {type.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {overlays.length === 0 ? (
                <div className="text-[10px] text-content-secondary/50 italic">
                  No overlays configured
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {overlays.map((overlay, index) => (
                    <div
                      key={index}
                      className={`rounded border p-2.5 ${
                        overlay.enabled
                          ? 'bg-surface-secondary border-border-active'
                          : 'bg-surface-secondary/50 border-border opacity-60'
                      }`}
                    >
                      {/* Header row */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={overlay.enabled}
                            onChange={(e) => updateOverlay(index, { enabled: e.target.checked })}
                            className="w-3 h-3 rounded accent-rose-500"
                          />
                          <span className="text-[10px] font-medium text-content-primary">
                            {OVERLAY_TYPES.find(t => t.id === overlay.type)?.label || overlay.type}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => moveOverlay(index, -1)}
                            disabled={index === 0}
                            className="text-[10px] text-content-secondary hover:text-content-primary disabled:opacity-30 disabled:cursor-not-allowed px-0.5"
                            title="Move up"
                          >
                            ▲
                          </button>
                          <button
                            onClick={() => moveOverlay(index, 1)}
                            disabled={index === overlays.length - 1}
                            className="text-[10px] text-content-secondary hover:text-content-primary disabled:opacity-30 disabled:cursor-not-allowed px-0.5"
                            title="Move down"
                          >
                            ▼
                          </button>
                          <button
                            onClick={() => removeOverlay(index)}
                            className="text-[10px] text-content-secondary hover:text-feedback-error ml-1 px-0.5"
                            title="Remove"
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      {/* Opacity — shared by all types */}
                      <div className="mb-1">
                        <div className="flex justify-between text-[10px] text-content-secondary mb-0.5">
                          <span>Opacity: {Math.round(overlay.opacity * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="1"
                          value={Math.round(overlay.opacity * 100)}
                          onChange={(e) => updateOverlay(index, { opacity: parseInt(e.target.value) / 100 })}
                          className="w-full h-1 bg-surface-tertiary rounded-lg appearance-none cursor-pointer"
                        />
                      </div>

                      {/* Film grain blend mode */}
                      {overlay.type === 'film_grain' && (
                        <div className="flex flex-col gap-2 mt-2">
                          <select
                            value={overlay.style || 'vintage'}
                            onChange={(e) => updateOverlay(index, { style: e.target.value })}
                            className="w-full text-[10px] bg-surface-tertiary text-content-primary border border-border rounded px-2 py-1"
                          >
                            {GRAIN_STYLES.map((s) => (
                              <option key={s.id} value={s.id}>{s.label}</option>
                            ))}
                          </select>
                          <select
                            value={overlay.blend_mode || 'overlay'}
                            onChange={(e) => updateOverlay(index, { blend_mode: e.target.value })}
                            className="w-full text-[10px] bg-surface-tertiary text-content-primary border border-border rounded px-2 py-1"
                          >
                            {GRAIN_BLEND_MODES.map((bm) => (
                              <option key={bm.id} value={bm.id}>{bm.label}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Color filter params */}
                      {overlay.type === 'color_filter' && (
                        <div className="flex items-center gap-2 mt-2">
                          <input
                            type="color"
                            value={overlay.color || '#1a0a2e'}
                            onChange={(e) => updateOverlay(index, { color: e.target.value })}
                            className="w-6 h-6 rounded border border-border cursor-pointer bg-transparent"
                            title="Filter color"
                          />
                          <select
                            value={overlay.blend_mode || 'multiply'}
                            onChange={(e) => updateOverlay(index, { blend_mode: e.target.value })}
                            className="flex-1 text-[10px] bg-surface-tertiary text-content-primary border border-border rounded px-2 py-1"
                          >
                            {COLOR_BLEND_MODES.map((bm) => (
                              <option key={bm.id} value={bm.id}>{bm.label}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Placeholder for future cine modules */}
            <div className="text-[10px] text-content-secondary/40 italic">
              Transitions, Ken Burns, and Text Overlays coming soon
            </div>

          </div>
        )}
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
        className={`w-full px-4 py-2.5 rounded-sm text-sm font-semibold border transition-all mt-auto ${
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
