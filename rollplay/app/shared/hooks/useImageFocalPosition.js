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
export function useImageFocalPosition(url, area = null) {
  const [naturalDims, setNaturalDims] = useState(null);

  useEffect(() => {
    setNaturalDims(null);
    if (!url || !area || !area.size) return undefined;
    let cancelled = false;
    const probe = new Image();
    probe.onload = () => {
      if (!cancelled && probe.naturalWidth && probe.naturalHeight) {
        setNaturalDims({ width: probe.naturalWidth, height: probe.naturalHeight });
      }
    };
    probe.src = url;
    return () => { cancelled = true; };
  }, [url, area?.x, area?.y, area?.size]);

  if (!url || !area || !area.size || !naturalDims) return undefined;

  const clampPercent = (value) => Math.max(0, Math.min(100, value));
  const centerX = clampPercent(((area.x + area.size / 2) / naturalDims.width) * 100);
  const centerY = clampPercent(((area.y + area.size / 2) / naturalDims.height) * 100);
  return `${centerX.toFixed(2)}% ${centerY.toFixed(2)}%`;
}
