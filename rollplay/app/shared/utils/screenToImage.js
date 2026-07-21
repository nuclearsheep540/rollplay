/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

/**
 * Screen→element coordinate conversion shared by map overlays.
 *
 * Overlays never read the camera transform. They convert pointer positions
 * through their own element's on-screen bounding rect, which already includes
 * the pan/zoom transform — the rect-ratio pattern fog painting established
 * (FogRegionStack.screenToMask). Extracted on its second consumer (map
 * tokens); lives in shared/ because multiple slices consume it (the
 * no-circular-slice-deps rule).
 */

/**
 * Convert a client (screen) point to 0–1 ratios within an element's
 * on-screen bounding rect. Returns null when the element is missing or
 * has no size (not laid out yet).
 */
export function screenPointToElementRatio(element, clientX, clientY) {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  return {
    xRatio: (clientX - rect.left) / rect.width,
    yRatio: (clientY - rect.top) / rect.height,
    insideElement: clientX >= rect.left && clientX <= rect.right
      && clientY >= rect.top && clientY <= rect.bottom,
  };
}

/**
 * Convert a client (screen) point to a target coordinate space spanned by
 * the element (e.g. map-image-native pixels, fog engine mask pixels).
 * Result is clamped to the space's bounds. Returns null when unresolvable.
 */
export function screenPointToSpace(element, clientX, clientY, spaceWidth, spaceHeight) {
  const ratio = screenPointToElementRatio(element, clientX, clientY);
  if (!ratio || !spaceWidth || !spaceHeight) return null;
  return {
    x: Math.max(0, Math.min(spaceWidth, ratio.xRatio * spaceWidth)),
    y: Math.max(0, Math.min(spaceHeight, ratio.yRatio * spaceHeight)),
    insideElement: ratio.insideElement,
  };
}
