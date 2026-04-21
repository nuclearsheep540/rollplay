/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import React, { createContext, useContext, useRef, useState, useEffect, useCallback } from 'react';

const AssetDownloadContext = createContext(null);

/**
 * Central download manager for S3 assets.
 *
 * Downloads via fetch + ReadableStream for byte-level progress tracking.
 * Deduplicates concurrent requests for the same URL.
 * Caches completed blobs so repeat requests resolve instantly.
 *
 * Components use:
 *   useAssetDownload(url, fileSize, assetId)  → { blobUrl, ready }
 *   useAssetProgress()               → { loading, lingering, loadedBytes, totalBytes, completedCount, totalCount, cachedCount, cachedSize }
 *
 * Audio can call imperatively:
 *   manager.download(url, fileSize, assetId)  → Promise<Blob>
 */
export function AssetDownloadProvider({ children }) {
  const [progress, setProgress] = useState({
    loading: false,
    lingering: false,
    loadedBytes: 0,
    totalBytes: 0,
    completedCount: 0,
    totalCount: 0,
    cachedCount: 0,
    cachedSize: 0,
  });

  // Stable refs — survive re-renders without causing effect churn
  const cacheRef = useRef(new Map());       // url → Blob (completed downloads)
  const inflightRef = useRef(new Map());    // url → { promise, loadedBytes, totalBytes }
  const completedBytesRef = useRef(0);      // bytes from finished downloads in current batch
  const cachedSizeRef = useRef(0);          // total bytes of all cached blobs
  const idleTimerRef = useRef(null);
  const rafRef = useRef(null);              // animation frame for throttled byte updates

  // Core state reader — always reads latest from refs
  const readProgress = useCallback(() => {
    const inflight = inflightRef.current;
    const cached = cacheRef.current.size;
    let inflightTotal = 0;
    let inflightLoaded = 0;

    // Per-cacheKey snapshot for components that want to show progress on
    // a specific asset (e.g. a mixer channel strip showing 34% while its
    // track is being downloaded). Frozen snapshot — consumers compare
    // by reference-identity across renders, so we rebuild each tick.
    const byKey = {};
    for (const [key, entry] of inflight.entries()) {
      inflightTotal += entry.totalBytes;
      inflightLoaded += entry.loadedBytes;
      byKey[key] = { loadedBytes: entry.loadedBytes, totalBytes: entry.totalBytes };
    }

    return {
      loading: inflight.size > 0,
      lingering: false,
      loadedBytes: completedBytesRef.current + inflightLoaded,
      totalBytes: completedBytesRef.current + inflightTotal,
      completedCount: cached,
      totalCount: cached + inflight.size,
      cachedCount: cached,
      cachedSize: cachedSizeRef.current,
      byKey,
    };
  }, []);

  // Throttled update — for byte-level chunk progress (max once per frame)
  const scheduleProgressUpdate = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setProgress(readProgress());
    });
  }, [readProgress]);

  // Immediate update — for completions so the count renders without delay
  const flushProgressUpdate = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setProgress(readProgress());
  }, [readProgress]);

  const scheduleReset = useCallback(() => {
    clearTimeout(idleTimerRef.current);
    if (inflightRef.current.size === 0) {
      // Show completed state (lingering) for 2s before resetting to idle
      setProgress(prev => ({ ...prev, lingering: true }));
      idleTimerRef.current = setTimeout(() => {
        completedBytesRef.current = 0;
        setProgress({
          loading: false,
          lingering: false,
          loadedBytes: 0,
          totalBytes: 0,
          completedCount: cacheRef.current.size,
          totalCount: cacheRef.current.size,
          cachedCount: cacheRef.current.size,
          cachedSize: cachedSizeRef.current,
        });
      }, 2000);
    }
  }, []);

  const download = useCallback(async (url, fileSize, assetId) => {
    if (!url) return null;

    // Cache by asset ID when available (presigned URLs change on every API call
    // but the underlying asset is the same). Fall back to full URL for non-asset fetches.
    const cacheKey = assetId || url;

    // Return cached blob immediately
    if (cacheRef.current.has(cacheKey)) {
      return cacheRef.current.get(cacheKey);
    }

    // Deduplicate — if already downloading this asset, piggyback on the existing promise
    if (inflightRef.current.has(cacheKey)) {
      return inflightRef.current.get(cacheKey).promise;
    }

    const entry = {
      loadedBytes: 0,
      totalBytes: fileSize || 0,
      promise: null,
    };

    entry.promise = (async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Download failed: ${response.status}`);

        // Use Content-Length if we didn't get fileSize from the asset data
        if (!entry.totalBytes) {
          const cl = response.headers.get('content-length');
          if (cl) {
            const parsed = parseInt(cl, 10);
            if (Number.isFinite(parsed) && parsed > 0) {
              entry.totalBytes = parsed;
            }
          }
          scheduleProgressUpdate();
        }

        let blob;

        // Some environments / responses do not provide a streaming body.
        // Fall back to response.blob() so downloads still work (without chunk progress).
        if (!response.body || typeof response.body.getReader !== 'function') {
          blob = await response.blob();
          if (!entry.totalBytes) entry.totalBytes = blob.size;
          entry.loadedBytes = entry.totalBytes;
          scheduleProgressUpdate();
        } else {
          const reader = response.body.getReader();
          const chunks = [];

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            entry.loadedBytes += value.length;
            scheduleProgressUpdate();
          }

          blob = new Blob(chunks, {
            type: response.headers.get('content-type') || 'application/octet-stream',
          });
        }

        // Move bytes to completed bucket so ratio stays monotonic.
        // If totalBytes was unknown (no fileSize and no Content-Length), fall back to blob.size.
        const completedBytesDelta = entry.totalBytes > 0 ? entry.totalBytes : blob.size;
        completedBytesRef.current += completedBytesDelta;
        cachedSizeRef.current += blob.size;
        cacheRef.current.set(cacheKey, blob);
        inflightRef.current.delete(cacheKey);
        flushProgressUpdate();
        scheduleReset();

        return blob;
      } catch (err) {
        inflightRef.current.delete(cacheKey);
        flushProgressUpdate();
        scheduleReset();
        throw err;
      }
    })();

    // Reset byte counters when starting a fresh batch — otherwise previous
    // completed bytes dwarf new inflight bytes and the bar stays near 100%.
    if (inflightRef.current.size === 0) {
      completedBytesRef.current = 0;
    }
    inflightRef.current.set(cacheKey, entry);
    clearTimeout(idleTimerRef.current);
    flushProgressUpdate();

    return entry.promise;
  }, [scheduleProgressUpdate, flushProgressUpdate, scheduleReset]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimeout(idleTimerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const manager = useRef({ download }).current;
  manager.download = download;

  return (
    <AssetDownloadContext.Provider value={{ manager, progress }}>
      {children}
    </AssetDownloadContext.Provider>
  );
}

/**
 * Hook for components that display an S3 asset (images, maps).
 * Returns a blob URL suitable for <img src={blobUrl}>.
 * Cleans up the object URL on unmount or URL change.
 */
export function useAssetDownload(url, fileSize, assetId) {
  const ctx = useContext(AssetDownloadContext);
  if (!ctx) throw new Error('useAssetDownload must be used within <AssetDownloadProvider>');
  const { manager } = ctx;
  const [blobUrl, setBlobUrl] = useState(null);
  const [ready, setReady] = useState(false);

  // Use assetId as the stable dependency when available — the URL changes
  // (presigned signature) but the asset doesn't, so we don't re-download.
  const stableKey = assetId || url;

  useEffect(() => {
    if (!url || !manager) return;

    let revoke = null;
    let cancelled = false;

    manager.download(url, fileSize, assetId).then((blob) => {
      if (cancelled || !blob) return;
      const objectUrl = URL.createObjectURL(blob);
      revoke = objectUrl;
      setBlobUrl(objectUrl);
      setReady(true);
    }).catch(() => {
      if (!cancelled) setReady(false);
    });

    return () => {
      cancelled = true;
      if (revoke) URL.revokeObjectURL(revoke);
      setBlobUrl(null);
      setReady(false);
    };
  }, [stableKey, manager]);

  return { blobUrl, ready };
}

/**
 * Hook for the nav indicator — reads aggregate download progress.
 */
export function useAssetProgress() {
  const ctx = useContext(AssetDownloadContext);
  if (!ctx) throw new Error('useAssetProgress must be used within <AssetDownloadProvider>');
  return ctx.progress;
}

/**
 * Hook for per-asset progress (byte-level).
 *
 * Pass the same `cacheKey` used when calling `manager.download(...)` — in
 * practice, this is the `assetId` everywhere in the codebase. Returns the
 * current `{ loadedBytes, totalBytes }` for that asset while it's in
 * flight, or `null` when not currently downloading (either idle or
 * already cached).
 *
 * Re-renders are driven by the same rAF-throttled progress state the
 * global indicator uses, so this is cheap even with many subscribers.
 */
export function useAssetDownloadProgress(cacheKey) {
  const ctx = useContext(AssetDownloadContext);
  if (!ctx) throw new Error('useAssetDownloadProgress must be used within <AssetDownloadProvider>');
  if (!cacheKey) return null;
  return ctx.progress.byKey?.[cacheKey] ?? null;
}

/**
 * Hook for imperative access (audio system).
 * Returns the manager's download function directly.
 */
export function useAssetManager() {
  const ctx = useContext(AssetDownloadContext);
  if (!ctx) throw new Error('useAssetManager must be used within <AssetDownloadProvider>');
  return ctx.manager;
}
