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
 *   useAssetDownload(url, fileSize)  → { blobUrl, ready, progress }
 *   useAssetProgress()               → { loading, loadedBytes, totalBytes }
 *
 * Audio can call imperatively:
 *   manager.download(url, fileSize)  → Promise<Blob>
 */
export function AssetDownloadProvider({ children }) {
  // Aggregate progress state for the nav indicator
  const [progress, setProgress] = useState({ loading: false, loadedBytes: 0, totalBytes: 0 });

  // Stable refs — survive re-renders without causing effect churn
  const cacheRef = useRef(new Map());       // url → Blob (completed downloads)
  const inflightRef = useRef(new Map());    // url → { promise, loadedBytes, totalBytes }
  const idleTimerRef = useRef(null);

  const updateProgress = useCallback(() => {
    const inflight = inflightRef.current;
    let totalBytes = 0;
    let loadedBytes = 0;

    for (const entry of inflight.values()) {
      totalBytes += entry.totalBytes;
      loadedBytes += entry.loadedBytes;
    }

    setProgress({
      loading: inflight.size > 0,
      loadedBytes,
      totalBytes,
    });
  }, []);

  const scheduleReset = useCallback(() => {
    clearTimeout(idleTimerRef.current);
    if (inflightRef.current.size === 0) {
      idleTimerRef.current = setTimeout(() => {
        setProgress({ loading: false, loadedBytes: 0, totalBytes: 0 });
      }, 2000);
    }
  }, []);

  const download = useCallback(async (url, fileSize) => {
    if (!url) return null;

    // Return cached blob immediately
    if (cacheRef.current.has(url)) {
      return cacheRef.current.get(url);
    }

    // Deduplicate — if already downloading this URL, piggyback on the existing promise
    if (inflightRef.current.has(url)) {
      return inflightRef.current.get(url).promise;
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
          if (cl) entry.totalBytes = parseInt(cl, 10);
        }

        const reader = response.body.getReader();
        const chunks = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          entry.loadedBytes += value.length;
          updateProgress();
        }

        const blob = new Blob(chunks, {
          type: response.headers.get('content-type') || 'application/octet-stream',
        });

        // Cache and clean up
        cacheRef.current.set(url, blob);
        inflightRef.current.delete(url);
        updateProgress();
        scheduleReset();

        return blob;
      } catch (err) {
        inflightRef.current.delete(url);
        updateProgress();
        scheduleReset();
        throw err;
      }
    })();

    inflightRef.current.set(url, entry);
    clearTimeout(idleTimerRef.current);
    updateProgress();

    return entry.promise;
  }, [updateProgress, scheduleReset]);

  // Cleanup on unmount
  useEffect(() => {
    return () => clearTimeout(idleTimerRef.current);
  }, []);

  const manager = useRef({ download }).current;
  // Keep the download function current without breaking ref identity
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
export function useAssetDownload(url, fileSize) {
  const { manager } = useContext(AssetDownloadContext);
  const [blobUrl, setBlobUrl] = useState(null);
  const [ready, setReady] = useState(false);
  const [progress, setLocalProgress] = useState(0);

  useEffect(() => {
    if (!url || !manager) return;

    let revoke = null;
    let cancelled = false;

    manager.download(url, fileSize).then((blob) => {
      if (cancelled || !blob) return;
      const objectUrl = URL.createObjectURL(blob);
      revoke = objectUrl;
      setBlobUrl(objectUrl);
      setReady(true);
      setLocalProgress(1);
    }).catch(() => {
      if (!cancelled) setReady(false);
    });

    return () => {
      cancelled = true;
      if (revoke) URL.revokeObjectURL(revoke);
      setBlobUrl(null);
      setReady(false);
      setLocalProgress(0);
    };
  }, [url, fileSize, manager]);

  return { blobUrl, ready, progress };
}

/**
 * Hook for the nav indicator — reads aggregate download progress.
 */
export function useAssetProgress() {
  const { progress } = useContext(AssetDownloadContext);
  return progress;
}

/**
 * Hook for imperative access (audio system).
 * Returns the manager's download function directly.
 */
export function useAssetManager() {
  const { manager } = useContext(AssetDownloadContext);
  return manager;
}
