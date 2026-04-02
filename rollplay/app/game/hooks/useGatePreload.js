/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useState, useEffect, useRef } from 'react'
import { useAssetProgress, useAssetManager } from '@/app/shared/providers/AssetDownloadManager'
import { CINE_ASSETS } from '../cineManifest'

/**
 * Aggregates readiness signals for the game loading gate.
 *
 * Waits for all data sources (REST, campaign metadata, WebSocket initial_state)
 * to arrive, then builds a manifest of every asset URL and fires a single batch
 * through AssetDownloadManager. This gives the progress bar a stable totalBytes
 * from the start — no mid-progress jumps as new downloads trickle in.
 *
 * Components that mount later (MapDisplay, ImageDisplay, syncAudioState) call
 * assetManager.download() and get instant cache hits from the batch.
 *
 * Timing windows:
 *  1. Batch fire — all data sources ready → build manifest → download all at once
 *  2. Ready hold (500ms) — after all downloads complete, holds at 100% before
 *     enabling the CTA. Gives a clean visual beat.
 */
export function useGatePreload({
  campaignMeta, initialDataLoaded, wsInitialStateReceived, isAudioUnlocked,
  activeMap, activeImage, rawAudioState
}) {
  const progress = useAssetProgress()
  const assetManager = useAssetManager()
  const [batchFired, setBatchFired] = useState(false)
  const [ctaReady, setCtaReady] = useState(false)
  const ctaTimerRef = useRef(null)

  const dataSourcesReady = !isAudioUnlocked && !!campaignMeta && initialDataLoaded && wsInitialStateReceived
  const downloadsComplete = batchFired && !progress.loading

  // Build manifest and fire single batch when all data sources are ready
  const batchStartedRef = useRef(false)
  useEffect(() => {
    if (!dataSourcesReady || batchStartedRef.current) return
    batchStartedRef.current = true

    const run = async () => {
      // Phase 1: Warm browser cache with local cine assets (not tracked in progress)
      await Promise.all(CINE_ASSETS.map(url =>
        fetch(url).catch(() => {})
      ))

      // Phase 2: Build S3 manifest and fire batch (tracked in progress bar)
      const manifest = []

      // Map
      const mc = activeMap?.map_config
      if (mc?.file_path) manifest.push({ url: mc.file_path, fileSize: mc.file_size, assetId: mc.asset_id })

      // Image
      const ic = activeImage?.image_config
      if (ic?.file_path) manifest.push({ url: ic.file_path, fileSize: ic.file_size, assetId: ic.asset_id })

      // Hero image (S3-backed)
      const hero = campaignMeta?.heroImageAsset
      if (hero?.s3_url) manifest.push({ url: hero.s3_url, fileSize: hero.file_size, assetId: hero.asset_id })

      // Audio tracks (BGM + SFX slots)
      if (rawAudioState) {
        for (const [channelId, state] of Object.entries(rawAudioState)) {
          if (channelId === '__master_volume') continue
          if (state?.s3_url) manifest.push({ url: state.s3_url, fileSize: state.file_size, assetId: state.asset_id })
        }
      }

      // Fire all downloads simultaneously — AssetDownloadManager deduplicates by assetId
      for (const asset of manifest) {
        assetManager.download(asset.url, asset.fileSize, asset.assetId)
      }

      // Signal batch is queued — only now can downloadsComplete evaluate truthfully
      setBatchFired(true)
      console.log(`🔄 Gate preload: fired batch of ${manifest.length} assets (cine: ${CINE_ASSETS.length} cached)`)
    }
    run()
  }, [dataSourcesReady]) // eslint-disable-line react-hooks/exhaustive-deps

  // CTA ready — 500ms after downloads complete
  useEffect(() => {
    if (!downloadsComplete || ctaReady) return
    ctaTimerRef.current = setTimeout(() => setCtaReady(true), 500)
    return () => clearTimeout(ctaTimerRef.current)
  }, [downloadsComplete, ctaReady])

  // Once past the gate, readiness is irrelevant
  if (isAudioUnlocked) return { ready: true, ctaReady: true, batchFired: true, ...progress }

  return {
    ready: downloadsComplete,
    ctaReady,
    batchFired,
    ...progress,
  }
}
