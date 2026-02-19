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

/**
 * ImageControlsPanel — DM drawer tab for loading images into the game view.
 *
 * Follows the MapControlsPanel pattern but simplified:
 * - No grid editing (images are non-interactive)
 * - Select IMAGE assets from campaign library
 * - Load/clear buttons
 */
export default function ImageControlsPanel({
  roomId,
  campaignId = null,
  activeImage = null,
  setActiveImage = null,
  sendImageLoad = null,
  sendImageClear = null,
}) {
  const [isImageExpanded, setIsImageExpanded] = useState(true);

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
