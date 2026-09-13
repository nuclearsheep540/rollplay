/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useEffect, useState } from 'react';

/**
 * useImageFocalPosition — bias a cover-fit image toward its "token" focal
 * area (tokens v3, decision 36).
 *
 * The percentage focal-point mapping: `background-position: X% Y%` aligns
 * the X% point of the IMAGE with the X% point of the container, so placing
 * the focal center at its own image-fraction guarantees it lands inside
 * the container on whichever axis cover overflows — percentages pin at the
 * image edges (0/100%), so no bias can ever expose a gap. Not a crop: the
 * image still cover-fills; only the surviving slice changes.
 *
 * Converting the native-px area to fractions needs the image's natural
 * dimensions — probed from a detached Image exactly like TokenAvatarDisc
 * (browser cache makes this near-instant for an already-rendered URL).
 *
 * Returns a `background-position` string, or undefined while the probe is
 * pending / when there is no area — callers keep their `bg-center` class
 * as the fallback, which is byte-identical to the pre-crop rendering.
 */
/**
 * Either focal shape's extent — a square's one side, or a region's two. Mirrors
 * shared_contracts.image.focal_center; the centre is the one thing both shapes agree on.
 */
function focalExtent(area) {
  if (!area) return null;
  if (area.size) return { width: area.size, height: area.size };
  if (area.width && area.height) return { width: area.width, height: area.height };
  return null;
}

export function useImageFocalPosition(url, area = null) {
  const [naturalDims, setNaturalDims] = useState(null);
  const extent = focalExtent(area);

  useEffect(() => {
    setNaturalDims(null);
    if (!url || !extent) return undefined;
    let cancelled = false;
    const probe = new Image();
    probe.onload = () => {
      if (!cancelled && probe.naturalWidth && probe.naturalHeight) {
        setNaturalDims({ width: probe.naturalWidth, height: probe.naturalHeight });
      }
    };
    probe.src = url;
    return () => { cancelled = true; };
  }, [url, area?.x, area?.y, extent?.width, extent?.height]);

  if (!url || !extent || !naturalDims) return undefined;

  const clampPercent = (value) => Math.max(0, Math.min(100, value));
  const centerX = clampPercent(((area.x + extent.width / 2) / naturalDims.width) * 100);
  const centerY = clampPercent(((area.y + extent.height / 2) / naturalDims.height) * 100);
  return `${centerX.toFixed(2)}% ${centerY.toFixed(2)}%`;
}
