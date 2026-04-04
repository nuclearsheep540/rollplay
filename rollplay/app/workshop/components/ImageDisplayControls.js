/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faVideo, faVideoSlash } from '@fortawesome/free-solid-svg-icons';

const IMAGE_FITS = [
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
  { id: 'lens_flare_leak', label: 'Lens Flare Leak' },
  { id: 'bokeh_light_glow', label: 'Bokeh Light Glow' },
  { id: 'sun_glow', label: 'Sun Glow' },
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
  imageFit,
  aspectRatio,
  displayMode,
  imagePositionX,
  imagePositionY,
  visualOverlays,
  motion,
  onImageFitChange,
  onAspectRatioChange,
  onDisplayModeChange,
  onImagePositionChange,
  onVisualOverlaysChange,
  onMotionChange,
  onSave,
  isSaving,
  saveSuccess,
  hasChanges,
  error,
}) {
  const [addMenuIndex, setAddMenuIndex] = useState(null);
  const overlays = visualOverlays || [];

  const updateOverlays = (newOverlays) => {
    onVisualOverlaysChange(newOverlays.length > 0 ? newOverlays : null);
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

  // --- Motion helpers ---
  const handHeld = motion?.hand_held;

  const toggleHandHeld = () => {
    if (handHeld) {
      const newMotion = { ...(motion || {}), hand_held: null };
      const motionHasContent = newMotion.ken_burns != null;
      onMotionChange(motionHasContent ? newMotion : null);
    } else {
      onMotionChange({
        ...(motion || {}),
        hand_held: { enabled: true, track_points: 4, distance: 10, speed: 3, x_bias: 0, randomness: 0 },
      });
    }
  };

  const updateHandHeld = (changes) => {
    onMotionChange({
      ...(motion || {}),
      hand_held: { ...handHeld, ...changes },
    });
  };

  const speedToDuration = (s) => Math.round(60 - (s - 1) * (54 / 14));

  return (
    <div className="flex flex-col gap-5 h-full">
      <h3 className="text-base font-bold text-content-bold">Image Settings</h3>

      {/* Image Fit */}
      <div>
        <label className="block text-xs text-content-secondary mb-2 font-medium">Image Fit</label>
        <div className="flex flex-col gap-1.5">
          {IMAGE_FITS.map((fit) => (
            <button
              key={fit.id}
              onClick={() => {
                onImageFitChange(fit.id);
                if (fit.id !== 'letterbox') onAspectRatioChange(null);
                if (fit.id === 'letterbox' && !aspectRatio) onAspectRatioChange('2.39:1');
              }}
              className={`w-full px-3 py-2 text-left text-xs rounded border transition-colors ${
                imageFit === fit.id
                  ? 'bg-surface-elevated text-content-on-dark border-content-on-dark'
                  : 'bg-border text-content-secondary border-border hover:border-border-active hover:text-content-on-dark'
              }`}
            >
              <div className="font-medium">{fit.label}</div>
              <div className="text-[10px] opacity-70 mt-0.5">{fit.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Aspect Ratio — only for letterbox */}
      {imageFit === 'letterbox' && (
        <div>
          <label className="block text-xs text-content-secondary mb-2 font-medium">Aspect Ratio</label>
          <div className="flex flex-wrap gap-1.5">
            {ASPECT_RATIO_PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => onAspectRatioChange(preset.id)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded border transition-colors ${
                  aspectRatio === preset.id
                    ? 'bg-surface-elevated text-content-on-dark border-content-on-dark'
                    : 'bg-border text-content-secondary border-border hover:border-border-active'
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
      {(imageFit === 'letterbox' || imageFit === 'wrap') && (
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
              type="range" min="0" max="100" step="1"
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
              type="range" min="0" max="100" step="1"
              value={imagePositionY ?? 50}
              onChange={(e) => onImagePositionChange(imagePositionX ?? 50, parseFloat(e.target.value))}
              className="w-full h-1.5 bg-surface-tertiary rounded-lg appearance-none cursor-pointer"
            />
          </div>
        </div>
      )}

      {/* Display Mode — Standard / Cine */}
      <div className="border-t border-border pt-4">
        <label className="block text-xs text-content-secondary mb-2 font-medium">Display Mode</label>
        <div className="flex gap-1.5">
          <button
            onClick={() => onDisplayModeChange('standard')}
            className={`flex-1 px-3 py-2 text-xs font-medium rounded border transition-colors ${
              displayMode === 'standard'
                ? 'bg-surface-elevated text-content-on-dark border-content-on-dark'
                : 'bg-border text-content-secondary border-border hover:border-border-active hover:text-content-on-dark'
            }`}
          >
            Standard
          </button>
          <button
            onClick={() => onDisplayModeChange('cine')}
            className={`flex-1 px-3 py-2 text-xs font-medium rounded border transition-colors flex items-center justify-center gap-2 ${
              displayMode === 'cine'
                ? 'bg-surface-elevated text-content-on-dark border-content-on-dark'
                : 'bg-border text-content-secondary border-border hover:border-border-active hover:text-content-on-dark'
            }`}
          >
            <FontAwesomeIcon
              icon={displayMode === 'cine' ? faVideo : faVideoSlash}
              className="text-xs"
            />
            Cine
          </button>
        </div>
        <div className="text-[10px] text-content-secondary/50 mt-1">
          Cine hides player UI when image is displayed
        </div>
      </div>

      {/* Visual Effects */}
      <div className="border-t border-border pt-4">
        <label className="block text-xs text-content-secondary mb-2 font-medium">Visual Effects</label>

        {/* Visual Overlays */}
        <div>
          <label className="block text-[10px] text-content-secondary mb-2 font-medium">Overlays</label>

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
                        className="w-3 h-3 rounded accent-content-on-dark"
                      />
                      <span className="text-[10px] font-medium text-content-on-dark">
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
                      type="range" min="0" max="100" step="1"
                      value={Math.round(overlay.opacity * 100)}
                      onChange={(e) => updateOverlay(index, { opacity: parseInt(e.target.value) / 100 })}
                      className="w-full h-1 bg-surface-tertiary rounded-lg appearance-none cursor-pointer"
                    />
                  </div>

                  {/* Film grain controls */}
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

                  {/* Color filter controls */}
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

              {/* Placeholder add button */}
              <div className="relative">
                <button
                  onClick={() => setAddMenuIndex(addMenuIndex === 'overlay' ? null : 'overlay')}
                  className="w-full px-3 py-2 text-left text-xs rounded border border-dashed border-border text-content-secondary/50 hover:border-border-active hover:text-content-secondary transition-colors"
                >
                  + Add
                </button>
                {addMenuIndex === 'overlay' && (
                  <div className="absolute left-0 top-full mt-1 bg-surface-secondary border border-border rounded shadow-lg z-10 w-full">
                    {OVERLAY_TYPES.map((type) => (
                      <button
                        key={type.id}
                        onClick={() => { addOverlay(type.id); setAddMenuIndex(null); }}
                        className="block w-full px-3 py-1.5 text-left text-xs text-content-secondary hover:text-content-on-dark hover:bg-surface-tertiary whitespace-nowrap"
                      >
                        {type.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
        </div>

        {/* Motion */}
        <div className="mt-4">
          <label className="block text-[10px] text-content-secondary mb-2 font-medium">Motion</label>

          <button
            onClick={toggleHandHeld}
            className={`w-full px-3 py-2 text-left text-xs rounded border transition-colors mb-2 ${
              handHeld
                ? 'bg-surface-elevated text-content-on-dark border-content-on-dark'
                : 'bg-border text-content-secondary border-border hover:border-border-active hover:text-content-on-dark'
            }`}
          >
            <div className="font-medium">Hand Held</div>
            <div className="text-[10px] opacity-70 mt-0.5">Gentle camera drift through random waypoints</div>
          </button>

          {handHeld && (
            <div className="rounded border bg-surface-secondary border-border-active p-2.5 flex flex-col gap-2">
              {/* Track Points */}
              <div>
                <div className="flex justify-between text-[10px] text-content-secondary mb-0.5">
                  <span>Track Points: {handHeld.track_points}</span>
                </div>
                <input
                  type="range" min="2" max="30" step="1"
                  value={handHeld.track_points}
                  onChange={(e) => updateHandHeld({ track_points: parseInt(e.target.value) })}
                  className="w-full h-1 bg-surface-tertiary rounded-lg appearance-none cursor-pointer"
                />
              </div>

              {/* Distance */}
              <div>
                <div className="flex justify-between text-[10px] text-content-secondary mb-0.5">
                  <span>Distance: {handHeld.distance}</span>
                </div>
                <input
                  type="range" min="2" max="20" step="1"
                  value={handHeld.distance}
                  onChange={(e) => updateHandHeld({ distance: parseInt(e.target.value) })}
                  className="w-full h-1 bg-surface-tertiary rounded-lg appearance-none cursor-pointer"
                />
              </div>

              {/* Speed */}
              <div>
                <div className="flex justify-between text-[10px] text-content-secondary mb-0.5">
                  <span>Speed: {handHeld.speed}</span>
                  <span className="text-content-secondary/50">~{speedToDuration(handHeld.speed)}s per loop</span>
                </div>
                <input
                  type="range" min="1" max="15" step="1"
                  value={handHeld.speed}
                  onChange={(e) => updateHandHeld({ speed: parseInt(e.target.value) })}
                  className="w-full h-1 bg-surface-tertiary rounded-lg appearance-none cursor-pointer"
                />
              </div>

              {/* Drift Bias */}
              <div>
                <div className="flex justify-between text-[10px] text-content-secondary mb-0.5">
                  <span>Drift Bias: {handHeld.x_bias === 0 ? 'Even' : handHeld.x_bias > 0 ? `Horizontal ${handHeld.x_bias}%` : `Vertical ${Math.abs(handHeld.x_bias)}%`}</span>
                </div>
                <input
                  type="range" min="-100" max="100" step="1"
                  value={handHeld.x_bias}
                  onChange={(e) => updateHandHeld({ x_bias: parseInt(e.target.value) })}
                  className="w-full h-1 bg-surface-tertiary rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-content-secondary/40 mt-0.5">
                  <span>↕ More vertical drift</span>
                  <span>More horizontal drift ↔</span>
                </div>
              </div>

              {/* Randomness */}
              <div>
                <div className="flex justify-between text-[10px] text-content-secondary mb-0.5">
                  <span>Randomness: {handHeld.randomness}%</span>
                  <span className="text-content-secondary/50">{handHeld.randomness === 0 ? 'Uniform' : handHeld.randomness < 40 ? 'Subtle' : handHeld.randomness < 70 ? 'Varied' : 'Erratic'}</span>
                </div>
                <input
                  type="range" min="0" max="100" step="1"
                  value={handHeld.randomness}
                  onChange={(e) => updateHandHeld({ randomness: parseInt(e.target.value) })}
                  className="w-full h-1 bg-surface-tertiary rounded-lg appearance-none cursor-pointer"
                />
              </div>
            </div>
          )}

          {/* Ken Burns placeholder */}
          <div className="text-[10px] text-content-secondary/40 italic mt-2">
            Ken Burns coming soon
          </div>
        </div>

        {/* Future effects placeholder */}
        <div className="text-[10px] text-content-secondary/40 italic mt-3">
          Transitions and Text Overlays coming soon
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
