/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import React, { useState } from 'react';
import {
  DM_CHILD,
  DM_CHILD_LAST,
  DM_ARROW,
  ACTIVE_BACKGROUND,
} from '../../styles/constants';
import ImageSelectionSection from './ImageSelectionSection';

const DISPLAY_MODES = [
  { id: 'float', label: 'Float' },
  { id: 'wrap', label: 'Wrap' },
  { id: 'cine', label: 'Cine' },
];

const ASPECT_RATIO_PRESETS = [
  { id: '2.39:1', label: '2.39:1', description: 'Ultrawide' },
  { id: '1.85:1', label: '1.85:1', description: 'Widescreen' },
  { id: '16:9', label: '16:9', description: 'HD' },
  { id: '4:3', label: '4:3', description: 'Classic' },
  { id: '1:1', label: '1:1', description: 'Square' },
];

/**
 * ImageControlsPanel — DM drawer tab for loading images and configuring display mode.
 *
 * Follows the MapControlsPanel pattern:
 * - Collapsible image selection (Load Image / Hide Images)
 * - Clear Image button
 * - Collapsible Display Settings with optimistic preview + apply flow:
 *   DM clicks mode/ratio → activeImage updates optimistically for live preview
 *   DM clicks Apply → saves to MongoDB + broadcasts to all clients
 *   DM clicks cancel → reverts to original server state stored on edit open
 */
export default function ImageControlsPanel({
  roomId,
  campaignId = null,
  activeImage = null,
  setActiveImage = null,
  sendImageLoad = null,
  sendImageClear = null,
  sendImageConfigUpdate = null,
}) {
  const [isImageExpanded, setIsImageExpanded] = useState(true);
  const [isDisplayExpanded, setIsDisplayExpanded] = useState(false);

  // Original server state captured when Display Settings is opened — for cancel/revert
  const [originalMode, setOriginalMode] = useState(null);
  const [originalRatio, setOriginalRatio] = useState(null);

  const currentMode = activeImage?.display_mode || 'float';
  const currentRatio = activeImage?.aspect_ratio || '2.39:1';

  // Whether the DM has changed anything from the original server state
  const hasChanges = originalMode !== null && (
    currentMode !== originalMode
    || (currentMode === 'cine' && currentRatio !== (originalRatio || '2.39:1'))
  );

  const handleImageSelection = (imageData) => {
    if (sendImageLoad) {
      sendImageLoad(imageData);
    } else if (setActiveImage) {
      setActiveImage(imageData);
    }
  };

  // Optimistically update activeImage so ImageDisplay previews immediately
  const previewMode = (newMode) => {
    if (!setActiveImage || !activeImage) return;
    setActiveImage((prev) => ({
      ...prev,
      display_mode: newMode,
      aspect_ratio: newMode === 'cine' ? (prev.aspect_ratio || '2.39:1') : null,
    }));
  };

  const previewRatio = (newRatio) => {
    if (!setActiveImage || !activeImage) return;
    setActiveImage((prev) => ({
      ...prev,
      aspect_ratio: newRatio,
    }));
  };

  // Open editing — snapshot current server state for cancel
  const openDisplaySettings = () => {
    setOriginalMode(currentMode);
    setOriginalRatio(activeImage?.aspect_ratio || null);
    setIsDisplayExpanded(true);
  };

  // Apply: save to MongoDB via WebSocket → broadcast replaces optimistic state with server truth
  const applyDisplayConfig = () => {
    if (!sendImageConfigUpdate || !activeImage) return;

    sendImageConfigUpdate({
      display_mode: currentMode,
      aspect_ratio: currentMode === 'cine' ? currentRatio : null,
    });

    setOriginalMode(null);
    setOriginalRatio(null);
    setIsDisplayExpanded(false);
  };

  // Cancel: revert optimistic preview to original server state
  const cancelDisplayConfig = () => {
    if (setActiveImage && activeImage && originalMode !== null) {
      setActiveImage((prev) => ({
        ...prev,
        display_mode: originalMode,
        aspect_ratio: originalRatio,
      }));
    }
    setOriginalMode(null);
    setOriginalRatio(null);
    setIsDisplayExpanded(false);
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col">
      {/* Load Image — collapsible */}
      <button
        className={`${DM_CHILD} ${isImageExpanded ? ACTIVE_BACKGROUND : ''}`}
        onClick={() => setIsImageExpanded(!isImageExpanded)}
      >
        <span className={`${DM_ARROW} transform transition-transform ${isImageExpanded ? 'rotate-180' : ''}`}>
          ▼
        </span>
        📁 {isImageExpanded ? 'Hide Images' : 'Load Image'}
      </button>

      <ImageSelectionSection
        isExpanded={isImageExpanded}
        onSelectImage={handleImageSelection}
        roomId={roomId}
        campaignId={campaignId}
        currentImage={activeImage}
      />

      {/* Clear Image */}
      {activeImage && (
        <button
          className={`${DM_CHILD} ${ACTIVE_BACKGROUND}`}
          onClick={() => {
            if (sendImageClear) {
              sendImageClear();
            } else if (setActiveImage) {
              setActiveImage(null);
            }
          }}
        >
          🗑️ Clear Image
        </button>
      )}

      {/* Display Settings — collapsible, only when image is active */}
      <button
        className={`${DM_CHILD} ${isDisplayExpanded ? ACTIVE_BACKGROUND : ''}`}
        onClick={() => {
          if (isDisplayExpanded) {
            cancelDisplayConfig();
          } else {
            openDisplaySettings();
          }
        }}
        disabled={!activeImage}
      >
        <span className={`${DM_ARROW} transform transition-transform ${isDisplayExpanded ? 'rotate-180' : ''}`}>
          ▼
        </span>
        🎬 {isDisplayExpanded ? 'Exit Display Settings' : 'Display Settings'}
      </button>

      {isDisplayExpanded && activeImage && (
        <div className="ml-4 mb-6">
          {/* Display Mode Selector */}
          <div className="mb-3">
            <label className="block text-xs text-gray-400 mb-1">Mode</label>
            <div className="flex gap-1">
              {DISPLAY_MODES.map((mode) => (
                <button
                  key={mode.id}
                  onClick={() => previewMode(mode.id)}
                  className={`flex-1 px-2 py-1.5 text-xs font-medium rounded transition-colors ${
                    currentMode === mode.id
                      ? 'bg-rose-600/80 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          {/* Aspect Ratio Presets — only shown in cine mode */}
          {currentMode === 'cine' && (
            <div className="mb-3">
              <label className="block text-xs text-gray-400 mb-1">Aspect Ratio</label>
              <div className="flex flex-wrap gap-1">
                {ASPECT_RATIO_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => previewRatio(preset.id)}
                    className={`px-2 py-1.5 text-xs font-medium rounded transition-colors ${
                      currentRatio === preset.id
                        ? 'bg-rose-600/80 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                    title={preset.description}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Apply button */}
          <button
            className={DM_CHILD_LAST}
            onClick={applyDisplayConfig}
            disabled={!hasChanges}
          >
            ✨ Apply Display Changes
          </button>
        </div>
      )}
    </div>
  );
}
