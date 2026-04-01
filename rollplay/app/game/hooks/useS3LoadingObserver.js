/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useState, useEffect, useRef } from 'react';

const S3_PATTERN = 'amazonaws.com';

/**
 * Observes all <img> elements in the DOM for S3 asset downloads.
 *
 * Uses MutationObserver to detect new images or src changes.
 * Tracks only genuine network fetches (img.complete === false at detection time).
 * Returns { loading, loaded, total } — resets 2s after all pending images finish.
 */
export function useS3LoadingObserver() {
  const [state, setState] = useState({ loading: false, loaded: 0, total: 0 });
  const pendingRef = useRef(new Map());
  const completedRef = useRef(new Set());
  const idleTimerRef = useRef(null);

  useEffect(() => {
    const pending = pendingRef.current;
    const completed = completedRef.current;

    const update = () => {
      setState({
        loading: pending.size > 0,
        loaded: completed.size,
        total: pending.size + completed.size,
      });
    };

    const resetBatch = () => {
      pending.clear();
      completed.clear();
      setState({ loading: false, loaded: 0, total: 0 });
    };

    const trackImg = (img) => {
      const src = img.src;
      if (!src || !src.includes(S3_PATTERN)) return;
      if (img.complete || pending.has(src) || completed.has(src)) return;

      pending.set(src, img);

      const onDone = () => {
        if (!pending.has(src)) return;
        pending.delete(src);
        completed.add(src);
        update();

        clearTimeout(idleTimerRef.current);
        if (pending.size === 0) {
          idleTimerRef.current = setTimeout(resetBatch, 2000);
        }
      };

      img.addEventListener('load', onDone, { once: true });
      img.addEventListener('error', onDone, { once: true });
      update();
    };

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeName === 'IMG') trackImg(node);
          if (node.querySelectorAll) {
            node.querySelectorAll('img').forEach(trackImg);
          }
        }
        if (mutation.type === 'attributes' && mutation.target.nodeName === 'IMG') {
          trackImg(mutation.target);
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src'],
    });

    return () => {
      observer.disconnect();
      clearTimeout(idleTimerRef.current);
    };
  }, []);

  return state;
}
