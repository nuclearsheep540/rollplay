/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useAssetDownload } from '@/app/shared/providers/AssetDownloadManager';
import { useCameraMotion } from '@/app/map_management/hooks/useCameraMotion';

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
const GRAIN_STYLE_ASSETS = {
  vintage: '/cine/overlay/film-grain.gif',
  grain: '/cine/overlay/grain_noisy.gif',
  light_particles: '/cine/overlay/phys_light_particles.gif',
  lens_flare_leak: '/cine/overlay/lens_flare_leak.gif',
  bokeh_light_glow: '/cine/overlay/bokeh_light_glow.gif',
  sun_glow: '/cine/overlay/sun_glow.gif',
};

function renderVisualOverlays(cineConfig) {
  const overlays = cineConfig?.visual_overlays;
  if (!overlays?.length) return null;
  return overlays.filter(o => o.enabled).map((overlay, i) => {
    const base = {
      position: 'absolute',
      top: 0, left: 0, width: '100%', height: '100%',
      pointerEvents: 'none',
      zIndex: 10 + i,
      opacity: overlay.opacity,
    };
    if (overlay.type === 'film_grain') {
      return (
        <div key={i} style={{
          ...base,
          backgroundImage: `url(${GRAIN_STYLE_ASSETS[overlay.style] || GRAIN_STYLE_ASSETS.vintage})`,
          backgroundSize: 'cover',
          mixBlendMode: overlay.blend_mode || 'overlay',
        }} />
      );
    }
    if (overlay.type === 'color_filter') {
      return (
        <div key={i} style={{
          ...base,
          backgroundColor: overlay.color || '#000000',
          mixBlendMode: overlay.blend_mode || 'multiply',
        }} />
      );
    }
    return null;
  });
}

const ImageDisplay = ({
  activeImage = null,
  className = "",
}) => {
  const [sceneReady, setSceneReady] = useState(false);
  const imageRef = useRef(null);

  const ic = activeImage?.image_config;
  const displayMode = ic?.display_mode || 'float';
  const cineRatio = useMemo(
    () => parseAspectRatio(ic?.aspect_ratio),
    [ic?.aspect_ratio]
  );

  // Hand-held camera motion (transforms the image + overlays together as one scene)
  const handHeld = displayMode === 'cine' ? ic?.cine_config?.motion?.hand_held : null;
  const { style: motionStyle } = useCameraMotion(handHeld);

  // Download the main image through the asset manager (progressive byte tracking)
  const { blobUrl: imageBlobUrl, ready: imageReady } = useAssetDownload(ic?.file_path, ic?.file_size, ic?.asset_id);

  // Collect local overlay URLs that still need preloading (film grain GIFs — not S3)
  const overlayUrls = useMemo(() => {
    if (displayMode !== 'cine' || !ic?.cine_config?.visual_overlays) return [];
    const urls = new Set();
    for (const overlay of ic.cine_config.visual_overlays) {
      if (overlay.enabled && overlay.type === 'film_grain') {
        urls.add(GRAIN_STYLE_ASSETS[overlay.style] || GRAIN_STYLE_ASSETS.vintage);
      }
    }
    return [...urls];
  }, [displayMode, ic?.cine_config?.visual_overlays]);

  // Preload local overlay GIFs — these are small and local, just need cache priming
  const overlayKey = overlayUrls.join('|');
  const [overlaysReady, setOverlaysReady] = useState(overlayUrls.length === 0);
  useEffect(() => {
    if (!overlayUrls.length) { setOverlaysReady(true); return; }
    setOverlaysReady(false);
    let cancelled = false;

    Promise.all(
      overlayUrls.map(url => new Promise(resolve => {
        const img = new Image();
        img.onload = resolve;
        img.onerror = resolve;
        img.src = url;
      }))
    ).then(() => { if (!cancelled) setOverlaysReady(true); });

    return () => { cancelled = true; };
  }, [overlayKey]);

  // Scene is ready when both the main image blob and overlays are loaded
  useEffect(() => {
    setSceneReady(imageReady && overlaysReady);
  }, [imageReady, overlaysReady]);

  if (!activeImage) {
    return null;
  }

  const isLetterbox = displayMode === 'letterbox' || displayMode === 'cine';

  // Image position within frame (object-position) — only meaningful for cover modes
  const posX = ic?.image_position_x ?? 50;
  const posY = ic?.image_position_y ?? 50;
  const objectPosition = `${posX}% ${posY}%`;

  // Image styles per mode
  const imageStyle = displayMode === 'wrap' || isLetterbox
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
      }}
    >
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
          opacity: sceneReady ? 1 : 0,
          transition: 'opacity 0.3s ease',
        }}>
          <div style={{
            width: '100%',
            height: '100%',
            position: 'relative',
            ...motionStyle,
          }}>
            <img
              ref={imageRef}
              src={imageBlobUrl}
              alt={ic?.original_filename || ic?.filename || 'Game image'}
              style={{
                ...imageStyle,
                pointerEvents: 'none',
                userSelect: 'none',
              }}
            />
            {displayMode === 'cine' && renderVisualOverlays(ic?.cine_config)}
          </div>
        </div>
      ) : (
        <>
          <img
            ref={imageRef}
            src={imageBlobUrl}
            alt={ic?.original_filename || ic?.filename || 'Game image'}
            style={{
              ...imageStyle,
              pointerEvents: 'none',
              userSelect: 'none',
              zIndex: 1,
              opacity: sceneReady ? 1 : 0,
              transition: 'opacity 0.3s ease',
            }}
          />
          {displayMode === 'cine' && renderVisualOverlays(ic?.cine_config)}
        </>
      )}
    </div>
  );
};

export default React.memo(ImageDisplay);
