/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useState, useEffect, useRef } from 'react'
import { useAssetProgress, useAssetManager } from '@/app/shared/providers/AssetDownloadManager'
import { CINE_ASSETS } from '../cineManifest'

const AUDIO_SYNC_TIMEOUT_MS = 3000

/**
 * Aggregates readiness signals for the game loading gate.
 *
 * Two-phase progress:
 *  Phase 1 (0–90%): S3 asset downloads via AssetDownloadManager
 *  Phase 2 (90–100%): Audio sync — buffers decoded and playback state restored
 *
 * Falls back after 3s if audio sync doesn't complete (e.g. decode failure),
 * so users are never permanently blocked.
 *
 * Components that mount later (MapDisplay, ImageDisplay, syncAudioState) call
 * assetManager.download() and get instant cache hits from the batch.
 */
export function useGatePreload({
  campaignMeta, initialDataLoaded, wsInitialStateReceived, isAudioUnlocked,
  activeMap, activeImage, rawAudioState, audioSyncComplete
}) {
  const progress = useAssetProgress()
  const assetManager = useAssetManager()
  const [batchFired, setBatchFired] = useState(false)
  const [audioReady, setAudioReady] = useState(false)
  const [ctaReady, setCtaReady] = useState(false)
  const ctaTimerRef = useRef(null)
  const audioTimeoutRef = useRef(null)

  const dataSourcesReady = !isAudioUnlocked && !!campaignMeta && initialDataLoaded && wsInitialStateReceived
  const downloadsComplete = batchFired && !progress.loading
  const ready = downloadsComplete && audioReady

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

  // Phase 2: Audio sync — wait for syncAudioState to complete, or timeout after 3s
  useEffect(() => {
    if (!downloadsComplete || audioReady) return

    if (audioSyncComplete) {
      setAudioReady(true)
      console.log('🔊 Gate: audio sync complete — proceeding')
      return
    }

    audioTimeoutRef.current = setTimeout(() => {
      setAudioReady(true)
      console.log('⏱️ Gate: audio sync timeout — proceeding without full sync')
    }, AUDIO_SYNC_TIMEOUT_MS)

    return () => clearTimeout(audioTimeoutRef.current)
  }, [downloadsComplete, audioSyncComplete, audioReady])

  // CTA ready — 500ms after fully ready
  useEffect(() => {
    if (!ready || ctaReady) return
    ctaTimerRef.current = setTimeout(() => setCtaReady(true), 500)
    return () => clearTimeout(ctaTimerRef.current)
  }, [ready, ctaReady])

  // Scaled progress: downloads = 0-90%, audio sync = 90-100%
  let percent = 0
  if (batchFired) {
    const downloadPct = progress.totalBytes > 0
      ? (progress.loadedBytes / progress.totalBytes)
      : (progress.loading ? 0 : 1)
    percent = Math.round(downloadPct * 90)
  }
  if (downloadsComplete) percent = 90
  if (ready) percent = 100

  // Once past the gate, readiness is irrelevant
  if (isAudioUnlocked) return { ready: true, ctaReady: true, batchFired: true, percent: 100 }

  return {
    ready,
    ctaReady,
    batchFired,
    percent,
  }
}
