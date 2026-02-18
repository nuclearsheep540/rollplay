/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import React, { useState, useRef } from 'react';

/**
 * ImageDisplay — Renders a DM-presented image in the game view.
 *
 * Unlike MapDisplay, images are non-interactive for players:
 * - No grid overlay
 * - No pan/zoom
 * - No player interaction
 *
 * Simply fills the game view with the image using object-fit: contain.
 */
const ImageDisplay = ({
  activeImage = null,
  className = "",
}) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const imageRef = useRef(null);

  const baseStyles = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    zIndex: 1,
    backgroundColor: '#1a1a2e',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  if (!activeImage) {
    return null;
  }

  return (
    <div
      className={`image-display ${className}`}
      style={{
        ...baseStyles,
        opacity: imageLoaded ? 1 : 0.5,
        transition: 'opacity 0.3s ease',
      }}
    >
      {/* Loading indicator */}
      {!imageLoaded && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: '#9ca3af',
          fontSize: '14px',
          fontWeight: '500',
          zIndex: 20,
        }}>
          Loading image...
        </div>
      )}

      <img
        ref={imageRef}
        src={activeImage.file_path}
        alt={activeImage.original_filename || activeImage.filename || 'Game image'}
        style={{
          maxWidth: '100%',
          maxHeight: '100%',
          width: 'auto',
          height: 'auto',
          objectFit: 'contain',
          pointerEvents: 'none',
          userSelect: 'none',
        }}
        onLoad={() => {
          setImageLoaded(true);
          const img = imageRef.current;
          if (img) {
            console.log('🖼️ Image loaded:', {
              natural: `${img.naturalWidth}x${img.naturalHeight}`,
              rendered: `${img.clientWidth}x${img.clientHeight}`
            });
          }
        }}
        onError={() => {
          console.error('🖼️ Failed to load image:', activeImage.file_path);
          setImageLoaded(false);
        }}
      />
    </div>
  );
};

export default React.memo(ImageDisplay);
