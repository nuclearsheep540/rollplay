/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { authFetch } from './authFetch';

/**
 * Fetch one library asset by id — the GET /api/library/{id} response
 * (includes s3_url and, for images, focal_areas). Returns null on ANY
 * failure — non-OK status, network error, malformed body — so callers
 * treat missing assets as absent, not fatal (a rejection here would kill
 * batch resolves like the workshop's Promise.all over image ids).
 */
export async function fetchAssetById(assetId) {
  try {
    const response = await authFetch(`/api/library/${assetId}`, { method: 'GET' });
    if (!response.ok) return null;
    return await response.json();
  } catch (fetchError) {
    console.warn(`[fetchAssetById] failed for asset ${assetId}:`, fetchError);
    return null;
  }
}
