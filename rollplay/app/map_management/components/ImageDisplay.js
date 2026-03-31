/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import React, { useState, useRef, useMemo } from 'react';

/**
 * Parse "W:H" string into a numeric ratio for CSS aspect-ratio.
 */
function parseAspectRatio(ratioStr) {
  if (!ratioStr) return null;
  const parts = ratioStr.split(':');
  if (parts.length !== 2) return null;
  const w = parseFloat(parts[0]);
  const h = parseFloat(parts[1]);
  if (!w || !h) return null;
  return w / h;
}

/**
 * ImageDisplay — Renders a DM-presented image in the game view.
 *
 * Three display modes:
 *   - float: Image centered with contain fit (default)
 *   - wrap:  Image fills entire viewport with cover fit, cropping edges
 *   - letterbox: Full-width image, height constrained by aspect ratio,
 *                black background creates natural letterbox bars
 */
const ImageDisplay = ({
  activeImage = null,
  className = "",
}) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const imageRef = useRef(null);

  const displayMode = activeImage?.display_mode || 'float';
  const cineRatio = useMemo(
    () => parseAspectRatio(activeImage?.aspect_ratio),
    [activeImage?.aspect_ratio]
  );

  if (!activeImage) {
    return null;
  }

  const isLetterbox = displayMode === 'letterbox';

  // Image position within frame (object-position) — only meaningful for cover modes
  const posX = activeImage?.image_position_x ?? 50;
  const posY = activeImage?.image_position_y ?? 50;
  const objectPosition = `${posX}% ${posY}%`;

  // Image styles per mode
  const imageStyle = displayMode === 'wrap'
    ? { width: '100%', height: '100%', objectFit: 'cover', objectPosition }
    : displayMode === 'letterbox'
    ? { width: '100%', height: '100%', objectFit: 'cover', objectPosition }
    : { maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto', objectFit: 'contain' };

  return (
    <div
      className={`image-display ${className}`}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 1,
        backgroundColor: isLetterbox ? '#000' : '#1a1a2e',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
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

      {/* Letterbox mode: aspect-ratio container sized to fit within viewport.
          Wide ratios (2.39:1) fill full width with top/bottom bars.
          Narrow ratios (4:3, 1:1) fill full height with left/right bars.
          width: min(100%, 100vh * ratio) picks the right constraint automatically. */}
      {isLetterbox ? (
        <div style={{
          width: `min(100%, ${(cineRatio || 2.39) * 100}vh)`,
          aspectRatio: cineRatio ? `${cineRatio}` : '2.39 / 1',
          overflow: 'hidden',
          position: 'relative',
          zIndex: 1,
        }}>
          <img
            ref={imageRef}
            src={activeImage.file_path}
            alt={activeImage.original_filename || activeImage.filename || 'Game image'}
            style={{
              ...imageStyle,
              pointerEvents: 'none',
              userSelect: 'none',
            }}
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageLoaded(false)}
          />
          {/* z-5 through z-15: Reserved for future overlay layers */}
        </div>
      ) : (
        <img
          ref={imageRef}
          src={activeImage.file_path}
          alt={activeImage.original_filename || activeImage.filename || 'Game image'}
          style={{
            ...imageStyle,
            pointerEvents: 'none',
            userSelect: 'none',
            zIndex: 1,
          }}
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageLoaded(false)}
        />
      )}
    </div>
  );
};

export default React.memo(ImageDisplay);
