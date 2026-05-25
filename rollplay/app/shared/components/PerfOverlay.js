/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client';

import React, { useEffect, useRef, useState } from 'react';

import { readRenderStats, resetRenderStats } from '../utils/renderTracker';

/**
 * PerfOverlay — dev-only floating panel showing live FPS, frame time,
 * and per-component render counts (1s + 10s windows).
 *
 * Driven by an internal rAF loop for FPS measurement. The display
 * itself only re-renders ~4× per second (setInterval) so reading the
 * panel doesn't pollute the very render counts it shows.
 *
 * Mount once at the runtime root and toggle via the `visible` prop.
 */

const REFRESH_HZ = 4; // overlay re-render rate

export default function PerfOverlay({ visible = false }) {
  const [, forceTick] = useState(0);
  const fps1sRef = useRef(0);
  const fps10sRef = useRef(0);
  const fps1LowRef = useRef(0); // average fps across the worst 1% of frames in the 10s window
  const dtMsRef = useRef(0);
  const domNodeCountRef = useRef(0);
  const compositedCountRef = useRef(0); // approx count of GPU-promoted elements

  useEffect(() => {
    if (!visible) return undefined;
    if (process.env.NODE_ENV === 'production') return undefined;

    let lastFrameTs = performance.now();
    // frames[]: { ts, dt }. Kept trimmed to last 10s.
    let frames = [];
    let rafId;

    const tick = (now) => {
      const dt = now - lastFrameTs;
      lastFrameTs = now;

      frames.push({ ts: now, dt });
      const cutoff10s = now - 10_000;
      while (frames.length && frames[0].ts < cutoff10s) frames.shift();

      // 1s fps — count of frames within the last second.
      const cutoff1s = now - 1000;
      let count1s = 0;
      for (let i = frames.length - 1; i >= 0; i--) {
        if (frames[i].ts >= cutoff1s) count1s++;
        else break;
      }
      fps1sRef.current = count1s;

      // 10s fps — count / window seconds (use actual elapsed window so
      // ramp-up doesn't read as "low" for the first ~10s of measuring).
      if (frames.length > 1) {
        const elapsed = (frames[frames.length - 1].ts - frames[0].ts) / 1000;
        fps10sRef.current = elapsed > 0 ? frames.length / elapsed : 0;
      } else {
        fps10sRef.current = 0;
      }

      // 1% low — sort dt values descending, take the worst 1%, average
      // their dts, convert to fps. Reads as "what is fps like during
      // the worst frames" which is what stutter feels like.
      if (frames.length >= 100) {
        const dts = frames.map((f) => f.dt).sort((a, b) => b - a);
        const sliceLen = Math.max(1, Math.floor(dts.length * 0.01));
        let sum = 0;
        for (let i = 0; i < sliceLen; i++) sum += dts[i];
        const avgWorstDt = sum / sliceLen;
        fps1LowRef.current = avgWorstDt > 0 ? 1000 / avgWorstDt : 0;
      } else {
        fps1LowRef.current = 0;
      }

      dtMsRef.current = dt;

      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    // Refresh the UI 4×/sec — refs are mutated above; this triggers
    // the React re-render that surfaces the latest values.
    const intervalId = setInterval(
      () => forceTick((n) => (n + 1) & 0xfff),
      Math.round(1000 / REFRESH_HZ)
    );

    // DOM node count is cheap (just counts elements). The compositor-
    // promoted scan was very expensive (getComputedStyle on every node)
    // — see Performance trace 2026-05-06: it ran 5×/sec when overlay
    // visible and consumed ~9.7% of self-time during 5s recordings,
    // polluting the very measurements we were taking. Now: dom count
    // every 2s, gpu-promoted scan only when explicitly requested via
    // window.__rollplayScanGpuLayers().
    const domScan = () => {
      try {
        domNodeCountRef.current = document.getElementsByTagName('*').length;
      } catch {
        /* noop */
      }
    };
    domScan();
    const domScanIntervalId = setInterval(domScan, 2000);

    // Expose a manual trigger so the user can run the GPU-promoted
    // scan on demand from the browser console without the overlay
    // running it every second. Result lands in the overlay on next
    // refresh tick.
    if (typeof window !== 'undefined') {
      window.__rollplayScanGpuLayers = () => {
        try {
          const nodes = document.getElementsByTagName('*');
          let composited = 0;
          for (let i = 0; i < nodes.length; i++) {
            const cs = window.getComputedStyle(nodes[i]);
            if (
              (cs.transform && cs.transform !== 'none') ||
              (cs.filter && cs.filter !== 'none') ||
              (cs.mixBlendMode && cs.mixBlendMode !== 'normal') ||
              (cs.willChange && cs.willChange !== 'auto')
            ) {
              composited++;
            }
          }
          compositedCountRef.current = composited;
          // eslint-disable-next-line no-console
          console.log(`[PerfOverlay] GPU-promoted ~ ${composited}`);
          return composited;
        } catch {
          return -1;
        }
      };
    }

    return () => {
      cancelAnimationFrame(rafId);
      clearInterval(intervalId);
      clearInterval(domScanIntervalId);
      if (typeof window !== 'undefined') {
        delete window.__rollplayScanGpuLayers;
      }
    };
  }, [visible]);

  if (!visible) return null;
  if (process.env.NODE_ENV === 'production') return null;

  const stats = readRenderStats();
  const componentNames = Object.keys(stats).sort();

  const fps1s = fps1sRef.current;
  const fps10s = fps10sRef.current;
  const fps1Low = fps1LowRef.current;
  const dt = dtMsRef.current;
  const domNodes = domNodeCountRef.current;
  const composited = compositedCountRef.current;
  const fpsColor = (v) => (v >= 55 ? '#4ade80' : v >= 40 ? '#fbbf24' : '#f87171');

  return (
    <div
      style={{
        position: 'fixed',
        top: 'calc(var(--nav-height, 56px) + 8px)',
        right: '8px',
        zIndex: 9999,
        background: 'rgba(15, 15, 20, 0.92)',
        color: '#e5e7eb',
        fontFamily: 'ui-monospace, SFMono-Regular, monospace',
        fontSize: '11px',
        lineHeight: 1.4,
        padding: '8px 10px',
        borderRadius: '6px',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
        pointerEvents: 'auto',
        minWidth: '220px',
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
        <strong style={{ fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9ca3af' }}>
          Perf
        </strong>
        <button
          type="button"
          onClick={resetRenderStats}
          style={{
            background: 'transparent',
            color: '#9ca3af',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '3px',
            padding: '1px 6px',
            fontSize: '10px',
            cursor: 'pointer',
          }}
          title="Reset render counters"
        >
          reset
        </button>
      </div>
      <div style={{ display: 'flex', gap: '12px', marginBottom: '4px', flexWrap: 'wrap' }}>
        <span><span style={{ color: '#9ca3af' }}>fps 1s</span>{' '}<span style={{ color: fpsColor(fps1s), fontWeight: 600 }}>{fps1s}</span></span>
        <span><span style={{ color: '#9ca3af' }}>10s avg</span>{' '}<span style={{ color: fpsColor(fps10s), fontWeight: 600 }}>{fps10s.toFixed(0)}</span></span>
        <span><span style={{ color: '#9ca3af' }}>1% low</span>{' '}<span style={{ color: fpsColor(fps1Low), fontWeight: 600 }}>{fps1Low > 0 ? fps1Low.toFixed(0) : '—'}</span></span>
        <span><span style={{ color: '#9ca3af' }}>dt</span>{' '}{dt.toFixed(1)}ms</span>
      </div>
      <div
        style={{ display: 'flex', gap: '12px', marginBottom: '6px', flexWrap: 'wrap' }}
        title="dom nodes — total <element> count in the document. Updated every 2s.

gpu (manual) — APPROXIMATE count of elements likely promoted to their own GPU layer. Run window.__rollplayScanGpuLayers() in console to refresh. Disabled from auto-update because the getComputedStyle walk over thousands of nodes was costing ~9.7% of self-time and polluting the very perf measurements we're taking. For real layer count: DevTools → More Tools → Layers."
      >
        <span><span style={{ color: '#9ca3af' }}>dom nodes</span>{' '}{domNodes}</span>
        <span style={{ color: composited === 0 ? '#6b7280' : undefined }}>
          <span style={{ color: '#9ca3af' }}>gpu (manual)</span>{' '}
          {composited === 0 ? '— run __rollplayScanGpuLayers()' : composited}
        </span>
      </div>
      {componentNames.length === 0 ? (
        <div style={{ color: '#6b7280', fontStyle: 'italic' }}>
          No tracked components yet.
        </div>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr style={{ color: '#9ca3af', fontSize: '10px' }}>
              <th style={{ textAlign: 'left', fontWeight: 'normal', paddingBottom: '2px' }}>component</th>
              <th style={{ textAlign: 'right', fontWeight: 'normal', paddingBottom: '2px', paddingLeft: '8px' }}>1s</th>
              <th style={{ textAlign: 'right', fontWeight: 'normal', paddingBottom: '2px', paddingLeft: '8px' }}>10s</th>
            </tr>
          </thead>
          <tbody>
            {componentNames.map((name) => {
              const s = stats[name];
              const hot = s.count1s >= 30;
              const warm = s.count1s >= 10;
              const color = hot ? '#f87171' : warm ? '#fbbf24' : '#e5e7eb';
              return (
                <tr key={name} style={{ color }}>
                  <td style={{ paddingRight: '8px' }}>{name}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', paddingLeft: '8px' }}>{s.count1s}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', paddingLeft: '8px' }}>{s.count10s}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
