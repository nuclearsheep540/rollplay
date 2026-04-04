/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import React, { useState, useRef } from 'react';
import {
  DM_CHILD,
  DM_CHILD_LAST,
  DM_ARROW,
  ACTIVE_BACKGROUND,
} from '../../styles/constants';
import ImageSelectionSection from './ImageSelectionSection';

const IMAGE_FITS = [
  { id: 'float', label: 'Float' },
  { id: 'wrap', label: 'Wrap' },
  { id: 'letterbox', label: 'Letterbox' },
];

const ASPECT_RATIO_PRESETS = [
  { id: '2.39:1', label: '2.39:1', description: 'Ultrawide' },
  { id: '1.85:1', label: '1.85:1', description: 'Widescreen' },
  { id: '16:9', label: '16:9', description: 'HD' },
  { id: '4:3', label: '4:3', description: 'Classic' },
  { id: '1:1', label: '1:1', description: 'Square' },
];

/**
 * ImageControlsPanel — DM drawer tab for loading images and configuring display.
 *
 * Image fit (float/wrap/letterbox) and display mode (standard/cine) are independent.
 * Visual effects (overlays, motion) are workshop-authored and read-only at runtime.
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
  const [stagedImage, setStagedImage] = useState(null);
  const preStagedImageRef = useRef(null);

  // Original server state captured when Display Settings is opened — for cancel/revert
  const [originalFit, setOriginalFit] = useState(null);
  const [originalDisplayMode, setOriginalDisplayMode] = useState(null);
  const [originalRatio, setOriginalRatio] = useState(null);
  const [originalPositionX, setOriginalPositionX] = useState(null);
  const [originalPositionY, setOriginalPositionY] = useState(null);

  const ic = activeImage?.image_config;
  const currentFit = ic?.image_fit || 'float';
  const currentDisplayMode = ic?.display_mode || 'standard';
  const currentRatio = ic?.aspect_ratio || '2.39:1';
  const currentPositionX = ic?.image_position_x ?? 50;
  const currentPositionY = ic?.image_position_y ?? 50;

  const hasChanges = originalFit !== null && (
    currentFit !== originalFit
    || currentDisplayMode !== originalDisplayMode
    || (currentFit === 'letterbox' && (
      currentRatio !== (originalRatio || '2.39:1')
      || currentPositionX !== (originalPositionX ?? 50)
      || currentPositionY !== (originalPositionY ?? 50)
    ))
    || (currentFit === 'wrap' && (
      currentPositionX !== (originalPositionX ?? 50)
      || currentPositionY !== (originalPositionY ?? 50)
    ))
  );

  const handleImageSelection = (imageData) => {
    if (!stagedImage) {
      preStagedImageRef.current = activeImage || null;
    }
    setStagedImage(imageData);
    if (setActiveImage) {
      setActiveImage(imageData);
    }
  };

  const activateStagedImage = () => {
    if (!stagedImage || !sendImageLoad) return;
    sendImageLoad(stagedImage);
    setStagedImage(null);
    preStagedImageRef.current = null;
  };

  const cancelStagedImage = () => {
    setStagedImage(null);
    if (setActiveImage) {
      setActiveImage(preStagedImageRef.current);
    }
    preStagedImageRef.current = null;
  };

  // Optimistic preview helpers
  const previewFit = (newFit) => {
    if (!setActiveImage || !activeImage) return;
    setActiveImage((prev) => ({
      ...prev,
      image_config: {
        ...prev.image_config,
        image_fit: newFit,
        aspect_ratio: newFit === 'letterbox' ? (prev.image_config?.aspect_ratio || '2.39:1') : null,
      },
    }));
  };

  const previewDisplayMode = (newMode) => {
    if (!setActiveImage || !activeImage) return;
    setActiveImage((prev) => ({
      ...prev,
      image_config: { ...prev.image_config, display_mode: newMode },
    }));
  };

  const previewRatio = (newRatio) => {
    if (!setActiveImage || !activeImage) return;
    setActiveImage((prev) => ({
      ...prev,
      image_config: { ...prev.image_config, aspect_ratio: newRatio },
    }));
  };

  const previewPositionX = (x) => {
    if (!setActiveImage || !activeImage) return;
    setActiveImage((prev) => ({
      ...prev,
      image_config: { ...prev.image_config, image_position_x: x },
    }));
  };
  const previewPositionY = (y) => {
    if (!setActiveImage || !activeImage) return;
    setActiveImage((prev) => ({
      ...prev,
      image_config: { ...prev.image_config, image_position_y: y },
    }));
  };

  const openDisplaySettings = () => {
    setOriginalFit(currentFit);
    setOriginalDisplayMode(currentDisplayMode);
    setOriginalRatio(ic?.aspect_ratio || null);
    setOriginalPositionX(ic?.image_position_x ?? 50);
    setOriginalPositionY(ic?.image_position_y ?? 50);
    setIsDisplayExpanded(true);
  };

  const applyDisplayConfig = () => {
    if (!sendImageConfigUpdate || !activeImage) return;

    sendImageConfigUpdate({
      image_fit: currentFit,
      display_mode: currentDisplayMode,
      aspect_ratio: currentFit === 'letterbox' ? currentRatio : null,
      image_position_x: (currentFit === 'letterbox' || currentFit === 'wrap') ? currentPositionX : null,
      image_position_y: (currentFit === 'letterbox' || currentFit === 'wrap') ? currentPositionY : null,
    });

    setOriginalFit(null);
    setOriginalDisplayMode(null);
    setOriginalRatio(null);
    setOriginalPositionX(null);
    setOriginalPositionY(null);
    setIsDisplayExpanded(false);
  };

  const cancelDisplayConfig = () => {
    if (setActiveImage && activeImage && originalFit !== null) {
      setActiveImage((prev) => ({
        ...prev,
        image_config: {
          ...prev.image_config,
          image_fit: originalFit,
          display_mode: originalDisplayMode,
          aspect_ratio: originalRatio,
          image_position_x: originalPositionX,
          image_position_y: originalPositionY,
        },
      }));
    }
    setOriginalFit(null);
    setOriginalDisplayMode(null);
    setOriginalRatio(null);
    setOriginalPositionX(null);
    setOriginalPositionY(null);
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
        isStaged={!!stagedImage}
      />

      {/* Staged image — Activate / Cancel */}
      {stagedImage && (
        <>
          <button
            className={`${DM_CHILD} bg-emerald-700/40 hover:bg-emerald-600/50 text-emerald-300 font-semibold`}
            onClick={activateStagedImage}
          >
            ▶ Activate Image
          </button>
          <button
            className={`${DM_CHILD}`}
            onClick={cancelStagedImage}
          >
            ✕ Cancel
          </button>
        </>
      )}

      {/* Clear Image — only when live (not staged) */}
      {activeImage && !stagedImage && (
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
          {/* Image Fit Selector */}
          <div className="mb-3">
            <label className="block text-xs text-gray-400 mb-1">Image Fit</label>
            <div className="flex gap-1">
              {IMAGE_FITS.map((fit) => (
                <button
                  key={fit.id}
                  onClick={() => previewFit(fit.id)}
                  className={`flex-1 px-2 py-1.5 text-xs font-medium rounded transition-colors ${
                    currentFit === fit.id
                      ? 'bg-rose-600/80 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {fit.label}
                </button>
              ))}
            </div>
          </div>

          {/* Display Mode — Standard / Cine */}
          <div className="mb-3">
            <label className="block text-xs text-gray-400 mb-1">Display Mode</label>
            <div className="flex gap-1">
              <button
                onClick={() => previewDisplayMode('standard')}
                className={`flex-1 px-2 py-1.5 text-xs font-medium rounded transition-colors ${
                  currentDisplayMode === 'standard'
                    ? 'bg-rose-600/80 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                Standard
              </button>
              <button
                onClick={() => previewDisplayMode('cine')}
                className={`flex-1 px-2 py-1.5 text-xs font-medium rounded transition-colors ${
                  currentDisplayMode === 'cine'
                    ? 'bg-rose-600/80 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                Cine
              </button>
            </div>
            <div className="text-[10px] text-gray-500 mt-1">
              Cine hides player UI
            </div>
          </div>

          {/* Aspect Ratio Presets — letterbox only */}
          {currentFit === 'letterbox' && (
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

          {/* Image Position — letterbox and wrap */}
          {(currentFit === 'letterbox' || currentFit === 'wrap') && (
            <div className="mb-3">
              <label className="block text-xs text-gray-400 mb-2">Image Position</label>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-6">X</span>
                  <input
                    type="range" min="0" max="100" step="1"
                    value={currentPositionX}
                    onChange={(e) => previewPositionX(Number(e.target.value))}
                    className="flex-1 h-1 accent-rose-500"
                  />
                  <span className="text-xs text-gray-400 w-8 text-right">{currentPositionX}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-6">Y</span>
                  <input
                    type="range" min="0" max="100" step="1"
                    value={currentPositionY}
                    onChange={(e) => previewPositionY(Number(e.target.value))}
                    className="flex-1 h-1 accent-rose-500"
                  />
                  <span className="text-xs text-gray-400 w-8 text-right">{currentPositionY}%</span>
                </div>
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
