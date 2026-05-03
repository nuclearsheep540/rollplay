/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

/**
 * Render a fog engine canvas into a destination canvas with a
 * blur+contrast pass — the standard "soft brush" treatment used
 * everywhere fog alpha is converted into a mask source.
 *
 * Blur extends alpha outward and softens the falloff; contrast then
 * steepens it back up so the interior stays near peak alpha. Tweaking
 * blurPx changes how far the mask extends past the painted area.
 *
 * Returns the destination canvas (caller can pass it to drawImage,
 * call toDataURL, etc.) or null if the source isn't paintable yet.
 *
 * The destination canvas is owned by the caller via the `dstRef` ref
 * — this lets callers reuse a single offscreen canvas across renders
 * instead of allocating a new one each frame.
 */
export function renderMaskCanvas(srcCanvas, dstRef, blurPx, contrast = 2) {
  if (!srcCanvas) return null;
  let dst = dstRef.current;
  if (!dst) {
    dst = document.createElement('canvas');
    dstRef.current = dst;
  }
  if (dst.width !== srcCanvas.width) dst.width = srcCanvas.width;
  if (dst.height !== srcCanvas.height) dst.height = srcCanvas.height;
  const ctx = dst.getContext('2d');
  ctx.clearRect(0, 0, dst.width, dst.height);
  ctx.filter = `blur(${blurPx}px) contrast(${contrast})`;
  ctx.drawImage(srcCanvas, 0, 0);
  ctx.filter = 'none';
  return dst;
}

/**
 * Convenience wrapper: render the mask and return a CSS `url(...)`
 * data-URL string ready to assign to `style.maskImage`.
 */
export function renderMaskUrl(srcCanvas, dstRef, blurPx, contrast = 2) {
  const dst = renderMaskCanvas(srcCanvas, dstRef, blurPx, contrast);
  if (!dst) return null;
  return `url(${dst.toDataURL('image/png')})`;
}
