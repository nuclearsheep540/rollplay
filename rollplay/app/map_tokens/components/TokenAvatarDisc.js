/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import React, { useEffect, useState } from 'react';

/**
 * TokenAvatarDisc — the image face of a map token (tokens v2, decision 28).
 *
 * Pure CSS crop, no canvas: the circle clips an <img> scaled so the
 * focal square {x, y, size} exactly fills it. Percentages are relative to
 * the container (whose width IS the token diameter), so only the image's
 * natural width is needed — read from the loaded element, never stored.
 * CSS embedding also sidesteps CDN CORS (unlike fetch()).
 *
 * Renders nothing until the image loads; the parent's color disc stays
 * underneath, so a slow or failed URL degrades gracefully to v1 visuals.
 *
 * ringColor (tokens v3, decision 35): the image fully covers the color
 * disc, so the ring is where identity lives — character color for
 * pc/companion tokens, DM-rose for plain npc. Defaults to the old black
 * when a caller doesn't pass one.
 */
export default function TokenAvatarDisc({ url, area = null, ringColor = null }) {
  const [naturalWidth, setNaturalWidth] = useState(0);

  useEffect(() => {
    setNaturalWidth(0);
    if (!url) return undefined;
    let cancelled = false;
    const probe = new Image();
    probe.onload = () => {
      if (!cancelled) setNaturalWidth(probe.naturalWidth);
    };
    probe.src = url;
    return () => { cancelled = true; };
  }, [url]);

  if (!url || !naturalWidth) return null;

  let imageStyle;
  if (area && area.size > 0) {
    // Container width == token diameter D. Scale: image width becomes
    // naturalWidth × (D / size); as a percentage of D that's
    // naturalWidth / size × 100. Offsets shift the square's corner to the
    // container origin — pure ratios, no D needed.
    imageStyle = {
      position: 'absolute',
      width: `${(naturalWidth / area.size) * 100}%`,
      maxWidth: 'none',
      left: `${-(area.x / area.size) * 100}%`,
      top: `${-(area.y / area.size) * 100}%`,
    };
  } else {
    // No focal area chosen: fill the circle, centered (object-fit cover).
    imageStyle = {
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      maxWidth: 'none',
      objectFit: 'cover',
    };
  }

  return (
    <div
      className="absolute inset-0 rounded-full overflow-hidden border-2 pointer-events-none"
      style={{ borderColor: ringColor || 'rgba(0, 0, 0, 0.55)' }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" draggable={false} style={imageStyle} />
    </div>
  );
}
