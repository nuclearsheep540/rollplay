/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useAssetProgress } from '@/app/shared/providers/AssetDownloadManager'

/**
 * Aggregates readiness signals for the game loading gate.
 *
 * Does NOT trigger downloads — those already happen via MapDisplay, ImageDisplay,
 * and syncAudioState while the gate overlay is visible. This hook just answers
 * "is everything loaded?" by combining:
 *
 *  1. Data sources ready — REST and WebSocket have responded, so all active assets
 *     have been queued for download. Without this check, useAssetProgress would
 *     report loading=false before any downloads are queued (false positive).
 *  2. Downloads complete — useAssetProgress reports no active downloads.
 */
export function useGatePreload({ campaignMeta, initialDataLoaded, wsInitialStateReceived, isAudioUnlocked }) {
  const progress = useAssetProgress()

  // Once past the gate, readiness is irrelevant
  if (isAudioUnlocked) return { ready: true, ...progress }

  // All data sources must have arrived and had a chance to queue downloads
  const dataSourcesReady = !!campaignMeta && initialDataLoaded && wsInitialStateReceived

  // All queued downloads are complete (loading=false and not in lingering state)
  const downloadsComplete = dataSourcesReady && !progress.loading

  return { ready: downloadsComplete, ...progress }
}
