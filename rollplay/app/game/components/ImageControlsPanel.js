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
 * - Select IMAGE assets from campaign library
 * - Configure display mode (float / wrap / cine)
 * - Configure aspect ratio presets for cine mode
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
  const [isDisplayExpanded, setIsDisplayExpanded] = useState(true);

  const currentMode = activeImage?.display_mode || 'float';
  const currentRatio = activeImage?.aspect_ratio || '2.39:1';

  const handleImageSelection = (imageData) => {
    console.log('🖼️ Image selected:', imageData);

    if (sendImageLoad) {
      sendImageLoad(imageData);
      console.log('🖼️ Selected image load sent via WebSocket:', imageData);
    } else {
      if (setActiveImage) {
        setActiveImage(imageData);
        console.log('🖼️ Selected image loaded locally (WebSocket unavailable):', imageData);
      }
    }
  };

  const handleModeChange = (newMode) => {
    if (newMode === currentMode) return;

    const update = {
      display_mode: newMode,
      aspect_ratio: newMode === 'cine' ? currentRatio : null,
    };

    if (sendImageConfigUpdate) {
      sendImageConfigUpdate(update);
    }
  };

  const handleRatioChange = (newRatio) => {
    if (newRatio === currentRatio) return;

    if (sendImageConfigUpdate) {
      sendImageConfigUpdate({
        display_mode: 'cine',
        aspect_ratio: newRatio,
      });
    }
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col">
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

      {/* Display Settings — only shown when an image is active */}
      {activeImage && (
        <>
          <button
            className={`${DM_CHILD} ${isDisplayExpanded ? ACTIVE_BACKGROUND : ''}`}
            onClick={() => setIsDisplayExpanded(!isDisplayExpanded)}
          >
            <span className={`${DM_ARROW} transform transition-transform ${isDisplayExpanded ? 'rotate-180' : ''}`}>
              ▼
            </span>
            🎬 Display Settings
          </button>

          {isDisplayExpanded && (
            <div className="px-3 py-2 space-y-3">
              {/* Display Mode Selector */}
              <div>
                <div className="text-xs text-content-secondary mb-1.5 font-medium">Mode</div>
                <div className="flex gap-1">
                  {DISPLAY_MODES.map((mode) => (
                    <button
                      key={mode.id}
                      onClick={() => handleModeChange(mode.id)}
                      className={`flex-1 px-2 py-1.5 text-xs font-medium rounded transition-colors ${
                        currentMode === mode.id
                          ? 'bg-rose-600/80 text-white'
                          : 'bg-surface-tertiary text-content-secondary hover:bg-surface-quaternary hover:text-content-primary'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Aspect Ratio Presets — only shown in cine mode */}
              {currentMode === 'cine' && (
                <div>
                  <div className="text-xs text-content-secondary mb-1.5 font-medium">Aspect Ratio</div>
                  <div className="flex flex-wrap gap-1">
                    {ASPECT_RATIO_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => handleRatioChange(preset.id)}
                        className={`px-2 py-1.5 text-xs font-medium rounded transition-colors ${
                          currentRatio === preset.id
                            ? 'bg-rose-600/80 text-white'
                            : 'bg-surface-tertiary text-content-secondary hover:bg-surface-quaternary hover:text-content-primary'
                        }`}
                        title={preset.description}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {activeImage && (
        <button
          className={`${DM_CHILD} ${ACTIVE_BACKGROUND}`}
          onClick={() => {
            if (sendImageClear) {
              sendImageClear();
              console.log('🖼️ Image clear sent via WebSocket');
            } else {
              if (setActiveImage) {
                setActiveImage(null);
                console.log('🖼️ Image cleared locally (WebSocket unavailable)');
              }
            }
          }}
        >
          🗑️ Clear Image
        </button>
      )}
    </div>
  );
}
