/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import React, { useState, useRef, useMemo } from 'react';

/**
 * Aspect ratio presets for cine mode letterboxing.
 * Parse "W:H" string into a numeric ratio for CSS.
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
 *   - float: Image centered with contain fit (default, original behavior)
 *   - wrap:  Image fills entire viewport with cover fit, cropping edges
 *   - cine:  Letterboxed image with explicit black bars + z-index layering
 *
 * Z-Index Stack (internal layers, all < z-30 to stay below game UI):
 *   z-25: Letterbox bars (cine only)
 *   z-20: Loading indicator
 *   z-15: [Reserved — text overlays, captions]
 *   z-10: [Reserved — visual overlay effects]
 *   z-5:  [Reserved — additional overlay slot]
 *   z-1:  Image layer
 *   z-0:  Background fill
 */
const ImageDisplay = ({
  activeImage = null,
  className = "",
}) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageDimensions, setImageDimensions] = useState(null);
  const containerRef = useRef(null);
  const imageRef = useRef(null);

  const displayMode = activeImage?.display_mode || 'float';
  const aspectRatioStr = activeImage?.aspect_ratio;
  const cineRatio = useMemo(() => parseAspectRatio(aspectRatioStr), [aspectRatioStr]);

  const baseStyles = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    zIndex: 1,
    backgroundColor: displayMode === 'cine' ? '#000' : '#1a1a2e',
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
      ref={containerRef}
      className={`image-display ${className}`}
      style={{
        ...baseStyles,
        opacity: imageLoaded ? 1 : 0.5,
        transition: 'opacity 0.3s ease',
      }}
    >
      {/* Loading indicator — z-20 */}
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

      {/* === FLOAT MODE === */}
      {displayMode === 'float' && (
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
            zIndex: 1,
          }}
          onLoad={() => {
            setImageLoaded(true);
            const img = imageRef.current;
            if (img) {
              setImageDimensions({ w: img.naturalWidth, h: img.naturalHeight });
            }
          }}
          onError={() => setImageLoaded(false)}
        />
      )}

      {/* === WRAP MODE === */}
      {displayMode === 'wrap' && (
        <img
          ref={imageRef}
          src={activeImage.file_path}
          alt={activeImage.original_filename || activeImage.filename || 'Game image'}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            pointerEvents: 'none',
            userSelect: 'none',
            zIndex: 1,
          }}
          onLoad={() => {
            setImageLoaded(true);
            const img = imageRef.current;
            if (img) {
              setImageDimensions({ w: img.naturalWidth, h: img.naturalHeight });
            }
          }}
          onError={() => setImageLoaded(false)}
        />
      )}

      {/* === CINE MODE === */}
      {displayMode === 'cine' && (
        <>
          {/* Image in aspect-ratio-constrained container — z-1 */}
          <div style={{
            position: 'relative',
            maxWidth: '100%',
            maxHeight: '100%',
            aspectRatio: cineRatio ? `${cineRatio}` : '2.39 / 1',
            overflow: 'hidden',
            zIndex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <img
              ref={imageRef}
              src={activeImage.file_path}
              alt={activeImage.original_filename || activeImage.filename || 'Game image'}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                pointerEvents: 'none',
                userSelect: 'none',
              }}
              onLoad={() => {
                setImageLoaded(true);
                const img = imageRef.current;
                if (img) {
                  setImageDimensions({ w: img.naturalWidth, h: img.naturalHeight });
                }
              }}
              onError={() => setImageLoaded(false)}
            />

            {/* z-5 through z-15: Reserved for future overlay layers */}
            {/* Workshop-configured overlays will be inserted here */}
          </div>

          {/* Letterbox bars — z-25, rendered as overlay on top of everything inside ImageDisplay */}
          {/* These use pointer-events: none so they don't block interaction with overlays below */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 25,
              pointerEvents: 'none',
            }}
          >
            {/* Top bar */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 'calc((100% - min(100%, 100vw / ' + (cineRatio || 2.39) + ')) / 2)',
              backgroundColor: '#000',
            }} />
            {/* Bottom bar */}
            <div style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: 'calc((100% - min(100%, 100vw / ' + (cineRatio || 2.39) + ')) / 2)',
              backgroundColor: '#000',
            }} />
            {/* Left bar */}
            <div style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              width: 'calc((100% - min(100%, 100vh * ' + (cineRatio || 2.39) + ')) / 2)',
              backgroundColor: '#000',
            }} />
            {/* Right bar */}
            <div style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              right: 0,
              width: 'calc((100% - min(100%, 100vh * ' + (cineRatio || 2.39) + ')) / 2)',
              backgroundColor: '#000',
            }} />
          </div>
        </>
      )}
    </div>
  );
};

export default React.memo(ImageDisplay);
