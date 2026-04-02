/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

/**
 * Static manifest of all assets in /public/cine/.
 *
 * These are fetched during gate preload to warm the browser cache before
 * components mount. Extend this array as the cine folder grows (fonts,
 * shaders, etc.).
 */
export const CINE_ASSETS = [
  '/cine/overlay/film-grain.gif',
  '/cine/overlay/grain_noisy.gif',
];
