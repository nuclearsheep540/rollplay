/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { authFetch } from './authFetch';

/**
 * Fetch one library asset by id — the GET /api/library/{id} response
 * (includes s3_url and, for images, focal_areas). Returns null on any
 * non-OK status; callers treat missing assets as absent, not fatal.
 */
export async function fetchAssetById(assetId) {
  const response = await authFetch(`/api/library/${assetId}`, { method: 'GET' });
  if (!response.ok) return null;
  return response.json();
}
